import assert from 'node:assert/strict';
import test from 'node:test';
import {
  alignSeriesToEntryCandles,
  buildFundingDistribution,
  buildLiquidationReclaimFunnel,
  buildTakerFlowFunnel,
} from './diagnostics.ts';
import type { Candle, FundingPoint, MarketMetricsPoint } from './index.ts';

function makeCandles(count: number, start = Date.parse('2026-01-01T00:00:00Z'), stepMs = 15 * 60 * 1000): Candle[] {
  const candles: Candle[] = [];
  let price = 100;
  for (let index = 0; index < count; index += 1) {
    price += Math.sin(index / 7) * 0.5;
    candles.push({
      time: start + index * stepMs,
      open: price,
      high: price + 1,
      low: price - 1,
      close: price + 0.2,
      volume: 100,
      takerBuyVolume: 50,
      quoteVolume: 10_000,
      takerBuyQuoteVolume: 5_000,
      tradeCount: 40,
    });
  }
  return candles;
}

function metrics(count: number, start = Date.parse('2026-01-01T00:00:00Z'), stepMs = 5 * 60 * 1000): MarketMetricsPoint[] {
  return Array.from({ length: count }, (_, index) => ({
    time: start + index * stepMs,
    openInterest: 1_000,
    openInterestValue: 1_000_000,
    topTraderLongShortRatio: 1.2,
    topTraderLongShortPositionRatio: 1.2,
    longShortRatio: 1.2,
    takerLongShortVolumeRatio: 1.0,
  }));
}

test('entry-candle alignment never exposes an observation newer than the candle close', () => {
  const entryTimeframe = makeCandles(4);
  const closeOf = (index: number) => entryTimeframe[index].time + 15 * 60 * 1000;
  const series: Array<{ time: number; value: number }> = [
    { time: closeOf(0), value: 1 },
    { time: closeOf(0) + 1, value: 2 },
  ];
  const aligned = alignSeriesToEntryCandles(entryTimeframe, series);
  // The close instant itself is public information once the candle has closed.
  assert.equal(aligned[0]?.value, 1);
  // One millisecond after that close belongs to the next candle, never to the candle before it.
  assert.equal(aligned[1]?.value, 2);
  assert.equal(aligned[2]?.value, 2);

  const futureOnly = alignSeriesToEntryCandles(entryTimeframe, [{ time: closeOf(3) + 1, value: 9 }]);
  assert.deepEqual(futureOnly, [undefined, undefined, undefined, undefined], 'observasi masa depan tidak boleh bocor ke candle mana pun');

  const empty = alignSeriesToEntryCandles(entryTimeframe, [] as Array<{ time: number }>);
  assert.deepEqual(empty, [undefined, undefined, undefined, undefined]);
});

test('liquidation reclaim funnel reports the binding condition instead of a silent zero', () => {
  const entryTimeframe = makeCandles(200);
  const higherTimeframe = makeCandles(240, Date.parse('2026-01-01T00:00:00Z'), 60 * 60 * 1000);
  const funnel = buildLiquidationReclaimFunnel({
    entryTimeframe,
    higherTimeframe,
    metricsTimeframe: metrics(entryTimeframe.length * 3),
  });
  assert.equal(funnel.name, 'LIQUIDATION_RECLAIM_HYPOTHESIS');
  assert.equal(funnel.evaluated, 120);
  // Flat metrics at 1.2 never satisfy the >=1.5 crowding rule on either side.
  assert.equal(funnel.longStages[0].passed, 0);
  assert.equal(funnel.shortStages[0].passed, 0);
  assert.equal(funnel.longStages.at(-1)?.passed, 0);
  assert.match(funnel.diagnosis ?? '', /Crowding/);
  assert.equal(funnel.distributions.openInterestChange1h.count > 0, true);
});

test('liquidation reclaim funnel counts a fully satisfied long chain', () => {
  const entryTimeframe = makeCandles(200);
  const higherTimeframe = makeCandles(240, Date.parse('2026-01-01T00:00:00Z'), 60 * 60 * 1000);
  const metricsTimeframe = metrics(entryTimeframe.length * 3).map((point) => ({
    ...point,
    topTraderLongShortRatio: 2,
    topTraderLongShortPositionRatio: 2,
    longShortRatio: 2,
    takerLongShortVolumeRatio: 0.5,
  }));
  // Force a falling open-interest series and a bearish drift so the long chain can complete.
  metricsTimeframe.forEach((point, index) => {
    point.openInterestValue = 1_000_000 * (1 - index * 0.0005);
  });
  entryTimeframe.forEach((candle, index) => {
    if (index < 80) return;
    candle.close = candle.open - 0.5;
    candle.low = candle.close - 0.1;
    candle.takerBuyVolume = candle.volume * 0.3;
    candle.open = candle.close + 0.6 + index * 0.002;
  });
  const funnel = buildLiquidationReclaimFunnel({ entryTimeframe, higherTimeframe, metricsTimeframe });
  assert.ok(funnel.longStages[0].passed > 0, 'crowding long harus terpenuhi saat semua ratio 2.0');
  assert.ok(funnel.longStages[2].passed > 0, 'taker ratio 0.5 harus lolos filter <= 0.75');
});

test('taker flow funnel exposes how rarely the flow imbalance threshold is met', () => {
  const entryTimeframe = makeCandles(200);
  const higherTimeframe = makeCandles(240, Date.parse('2026-01-01T00:00:00Z'), 60 * 60 * 1000);
  const funnel = buildTakerFlowFunnel({ entryTimeframe, higherTimeframe });
  assert.equal(funnel.evaluated, 120);
  // Every candle has takerBuyVolume/volume = 0.5, which satisfies neither <=0.38 nor >=0.62.
  assert.equal(funnel.longStages[0].passed, 0);
  assert.equal(funnel.shortStages[0].passed, 0);
  assert.equal(funnel.distributions.candleTakerBuyRatio.median, 0.5);
});

test('funding funnel shows when the extreme threshold is the exchange cap rather than a tail', () => {
  const entryTimeframe = makeCandles(200);
  const fundingTimeframe: FundingPoint[] = Array.from({ length: 60 }, (_, index) => ({
    time: entryTimeframe[0].time + index * 8 * 60 * 60 * 1000,
    fundingRate: index % 2 === 0 ? 0.0001 : 0.00002,
  }));
  const funnel = buildFundingDistribution({ entryTimeframe, fundingTimeframe });
  assert.equal(funnel.distributions.fundingRate.max, 0.0001);
  assert.equal(funnel.distributions.fundingRate.median, 0.00002);
  assert.ok(funnel.longStages[0].passed > 0, 'funding di cap harus terhitung sebagai kondisi terpenuhi');
  assert.ok(funnel.evaluated > 0);
});

test('observation alignment honors a non-default entry interval', () => {
  const fiveMinutes = 5 * 60 * 1000;
  const entryTimeframe = makeCandles(4, Date.parse('2026-01-01T00:00:00Z'), fiveMinutes);
  const closeOf = (index: number) => entryTimeframe[index].time + fiveMinutes;
  const series = [
    { time: closeOf(0), value: 1 },
    { time: closeOf(0) + 1, value: 2 },
  ];
  const aligned = alignSeriesToEntryCandles(entryTimeframe, series, fiveMinutes);
  assert.equal(aligned[0]?.value, 1);
  assert.equal(aligned[1]?.value, 2);
  assert.equal(aligned[3]?.value, 2);

  const future = alignSeriesToEntryCandles(entryTimeframe, [{ time: closeOf(3) + 1, value: 9 }], fiveMinutes);
  assert.deepEqual(future, [undefined, undefined, undefined, undefined]);
});
