import assert from 'node:assert/strict';
import test from 'node:test';
import {
  passesPromotionGate,
  RESEARCH_BASE_CONFIG,
  RESEARCH_VARIANTS,
  summarizeReport,
  variantDataStatus,
} from './research-evaluation.ts';
import { parseFundingCsv, parseKlineCsv, parseMetricsCsv, monthKeys, dayKeys } from './binance-archive.ts';

function metrics(totalTrades: number, profitFactor: number | null, expectancyR: number) {
  return { totalTrades, profitFactor, expectancyR };
}

test('promotion gate rejects a candidate that only looks good on the full sample', () => {
  const gate = passesPromotionGate(
    metrics(200, 1.4, 0.2),
    metrics(12, 1.9, 0.4),
    metrics(200, 1.4, 0.2),
  );
  assert.equal(gate.pass, false);
  assert.equal(gate.requirements.fullHistory, true);
  assert.equal(gate.requirements.outOfSample, false, 'OOS di bawah 30 trade tidak boleh lolos');
});

test('promotion gate rejects a profitable but fragile margin below PF 1.10', () => {
  const gate = passesPromotionGate(
    metrics(200, 1.04, 0.01),
    metrics(80, 1.05, 0.02),
    metrics(90, 1.03, 0.01),
  );
  assert.equal(gate.pass, false, 'PF di dalam noise biaya tidak boleh dipromosikan');
});

test('promotion gate accepts only when all three slices survive costs', () => {
  const gate = passesPromotionGate(
    metrics(200, 1.4, 0.2),
    metrics(80, 1.3, 0.15),
    metrics(120, 1.25, 0.12),
  );
  assert.equal(gate.pass, true);
  assert.deepEqual(gate.requirements, { fullHistory: true, outOfSample: true, walkForward: true });
});

test('promotion gate treats a null profit factor as unproven, not as infinite', () => {
  const gate = passesPromotionGate(
    metrics(0, null, 0),
    metrics(0, null, 0),
    metrics(0, null, 0),
  );
  assert.equal(gate.pass, false);
});

test('summarizeReport flags a small sample before judging direction', () => {
  const candles = [{ time: 1, open: 1, high: 1, low: 1, close: 1, volume: 1 }];
  const report = {
    totalTrades: 5,
    winningTrades: 5,
    losingTrades: 0,
    winRate: 1,
    profitFactor: null,
    expectancyR: 1,
    netPnl: 10,
    maxDrawdown: 0,
    maxDrawdownPct: 0,
  } as never;
  const summary = summarizeReport(report, candles);
  assert.equal(summary.gate, 'NOT_READY_SAMPLE');
});

test('a candidate is marked MISSING_DATA instead of silently returning zero trades', () => {
  const liquidation = RESEARCH_VARIANTS.find((variant) => variant.name === 'LIQUIDATION_RECLAIM_HYPOTHESIS');
  const funding = RESEARCH_VARIANTS.find((variant) => variant.name === 'FUNDING_CROWDING_REVERSION_HYPOTHESIS');
  const taker = RESEARCH_VARIANTS.find((variant) => variant.name === 'TAKER_FLOW_REJECTION_HYPOTHESIS');
  assert.ok(liquidation && funding && taker);
  assert.equal(variantDataStatus(liquidation, { fundingPoints: 10, metricsPoints: 0, takerFlowCandles: 10 }), 'MISSING_DATA');
  assert.equal(variantDataStatus(liquidation, { fundingPoints: 10, metricsPoints: 10, takerFlowCandles: 10 }), 'READY');
  assert.equal(variantDataStatus(funding, { fundingPoints: 0, metricsPoints: 10, takerFlowCandles: 10 }), 'MISSING_DATA');
  assert.equal(variantDataStatus(taker, { fundingPoints: 10, metricsPoints: 10, takerFlowCandles: 0 }), 'MISSING_DATA');
});

test('every research variant keeps a distinct entry or exit policy', () => {
  const keys = RESEARCH_VARIANTS.map((variant) => JSON.stringify(variant.config));
  assert.equal(new Set(keys).size, RESEARCH_VARIANTS.length);
  assert.ok(RESEARCH_VARIANTS.length >= 9);
});

test('research base config keeps the conservative documented cost model', () => {
  assert.equal(RESEARCH_BASE_CONFIG.feeRate, 0.0004);
  assert.equal(RESEARCH_BASE_CONFIG.slippageRate, 0.0002);
  assert.equal(RESEARCH_BASE_CONFIG.fundingRatePerBar, 0.00001);
  assert.equal(RESEARCH_BASE_CONFIG.riskFraction, 0.0025);
  assert.equal(RESEARCH_BASE_CONFIG.timezone, 'Asia/Jakarta');
});

test('kline CSV parser keeps Binance taker-flow columns', () => {
  const candles = parseKlineCsv([
    'header',
    '1767225600000,100,102,99,101,10,1767226499999,1010,42,6,606,0',
  ]);
  assert.equal(candles.length, 1);
  assert.equal(candles[0].takerBuyVolume, 6);
  assert.equal(candles[0].takerBuyQuoteVolume, 606);
  assert.equal(candles[0].quoteVolume, 1010);
  assert.equal(candles[0].tradeCount, 42);
});

test('kline CSV parser rejects a malformed row instead of storing NaN', () => {
  assert.throws(() => parseKlineCsv(['header', 'not,a,candle,x,y,z']));
});

test('funding CSV parser floors Binance stray millisecond timestamps', () => {
  const points = parseFundingCsv([
    'calc_time,funding_interval_hours,last_funding_rate',
    '1785542400001,8,0.00004123',
    '1785571200000,8,0.00003163',
  ]);
  assert.equal(points[0].time, 1785542400000);
  assert.equal(points[1].time, 1785571200000);
  assert.equal(points[0].fundingRate, 0.00004123);
});

test('metrics CSV parser keeps both account and position ratio columns', () => {
  const points = parseMetricsCsv([
    'create_time,symbol,sum_open_interest,sum_open_interest_value,count_toptrader_long_short_ratio,sum_toptrader_long_short_ratio,count_long_short_ratio,sum_taker_long_short_vol_ratio',
    '2026-08-20 00:35:00,BTCUSDT,107623.133,7497622895.4992,1.12763794,1.49445800,1.07922842,2.45605600',
  ]);
  assert.equal(points[0].topTraderLongShortRatio, 1.12763794);
  assert.equal(points[0].topTraderLongShortPositionRatio, 1.494458);
  assert.equal(points[0].longShortRatio, 1.07922842);
  assert.equal(points[0].takerLongShortVolumeRatio, 2.456056);
  assert.equal(points[0].time, Date.parse('2026-08-20T00:35:00Z'));
});

test('month and day key generators cover the inclusive range', () => {
  assert.deepEqual(monthKeys('2025-11', '2026-02'), ['2025-11', '2025-12', '2026-01', '2026-02']);
  assert.equal(dayKeys(Date.parse('2026-01-01T00:00:00Z'), Date.parse('2026-01-03T00:00:00Z')).length, 3);
  assert.throws(() => monthKeys('bad', '2026-02'));
});
