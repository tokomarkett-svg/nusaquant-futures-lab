import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveExitPrice, runBacktest, runTemporalValidation, runWalkForwardValidation, type Candle, type FundingPoint } from './backtest.ts';

test('backtest resolves stop and target fills at their levels, not candle close', () => {
  assert.equal(resolveExitPrice({ reason: 'STOP_LOSS', stopLoss: 95, takeProfit: 110, candleClose: 104 }), 95);
  assert.equal(resolveExitPrice({ reason: 'TAKE_PROFIT', stopLoss: 95, takeProfit: 110, candleClose: 106 }), 110);
  assert.equal(resolveExitPrice({ reason: 'TIME_EXIT', stopLoss: 95, takeProfit: 110, candleClose: 104 }), 104);
});

function candles(count: number, start: number, interval: number, trend: number, startTime: number): Candle[] {
  const output: Candle[] = [];
  let previous = start;
  for (let index = 0; index < count; index += 1) {
    const close = previous + trend + Math.sin(index / 7) * start * 0.0002;
    output.push({
      time: startTime + index * interval,
      open: previous,
      high: Math.max(previous, close) + start * 0.0005,
      low: Math.min(previous, close) - start * 0.0005,
      close,
      volume: 1000 + (index % 7) * 50,
    });
    previous = close;
  }
  return output;
}

test('backtest always returns auditable metrics and cost-aware trade fields', () => {
  const hour = 60 * 60 * 1000;
  const quarterHour = 15 * 60 * 1000;
  const higher = candles(300, 100, hour, 0.1, 0);
  const entry = candles(320, 140, quarterHour, 0.02, 220 * hour);
  const report = runBacktest({
    higherTimeframe: higher,
    entryTimeframe: entry,
    config: { initialEquity: 10_000 },
  });

  assert.equal(report.initialEquity, 10_000);
  assert.equal(Number.isFinite(report.finalEquity), true);
  assert.equal(report.totalTrades, report.trades.length);
  assert.equal(Number.isFinite(report.maxDrawdownPct), true);
  assert.ok(report.notes.length >= 3);
  assert.ok(report.diagnostics);
  assert.ok(report.executionAudit);
  assert.ok(report.excursionAudit);
  assert.equal(Number.isFinite(report.excursionAudit.averageMfeR), true);
  assert.equal(Number.isFinite(report.excursionAudit.averageMaeR), true);
  assert.equal(Number.isFinite(report.excursionAudit.stopLossPositiveMfeRate), true);
  assert.equal(Number.isFinite(report.executionAudit.grossPnlBeforeCosts), true);
  assert.equal(Number.isFinite(report.executionAudit.totalCosts), true);
  assert.equal(Number.isFinite(report.executionAudit.costImpactPctOfGross), true);
  assert.equal(Number.isFinite(report.executionAudit.averageGrossPnlPerTrade), true);
  assert.equal(Number.isFinite(report.executionAudit.averageCostPerTrade), true);
  assert.equal(report.executionAudit.grossProfitFactor === null || Number.isFinite(report.executionAudit.grossProfitFactor), true);
  assert.equal(Number.isFinite(report.executionAudit.grossExpectancyR), true);
  const diagnosticGroups = Object.values(report.diagnostics);
  assert.equal(diagnosticGroups.flat().reduce((sum, bucket) => sum + bucket.trades, 0) / diagnosticGroups.length, report.totalTrades);
  report.trades.forEach((trade) => {
    assert.equal(Number.isFinite(trade.costs), true);
    assert.equal(Number.isFinite(trade.riskAmount), true);
    assert.equal(Number.isFinite(trade.rMultiple), true);
    assert.equal(Number.isFinite(trade.barsHeld), true);
    assert.equal(Number.isFinite(trade.triggerRangeAtr), true);
    assert.equal(Number.isFinite(trade.entryDistanceToEmaAtr), true);
    assert.equal(Number.isFinite(trade.stopDistanceAtr), true);
    assert.equal(Number.isFinite(trade.maxFavorableExcursionR), true);
    assert.equal(Number.isFinite(trade.maxAdverseExcursionR), true);
    assert.ok(['TREND_UP', 'TREND_DOWN', 'RANGE', 'UNCERTAIN'].includes(trade.regime));
  });
});

test('triad timing hypothesis is a research-only filter and never increases trades', () => {
  const hour = 60 * 60 * 1000;
  const quarterHour = 15 * 60 * 1000;
  const higher = candles(320, 100, hour, 0.1, 0);
  const entry = candles(400, 140, quarterHour, 0.02, 220 * hour);
  const baseline = runBacktest({ higherTimeframe: higher, entryTimeframe: entry });
  const hypothesis = runBacktest({
    higherTimeframe: higher,
    entryTimeframe: entry,
    config: { entryPolicy: 'TRIAD_TIMING_HYPOTHESIS' },
  });
  const retestHypothesis = runBacktest({
    higherTimeframe: higher,
    entryTimeframe: entry,
    config: { entryPolicy: 'TRIAD_RETEST_HYPOTHESIS' },
  });
  const followThroughHypothesis = runBacktest({
    higherTimeframe: higher,
    entryTimeframe: entry,
    config: { entryPolicy: 'TRIAD_FOLLOW_THROUGH_HYPOTHESIS' },
  });
  const profitProtectionHypothesis = runBacktest({
    higherTimeframe: higher,
    entryTimeframe: entry,
    config: { exitPolicy: 'MFE_PROFIT_PROTECTION_HYPOTHESIS' },
  });
  const meanReversionHypothesis = runBacktest({
    higherTimeframe: higher,
    entryTimeframe: entry,
    config: { entryPolicy: 'MEAN_REVERSION_REJECTION_HYPOTHESIS' },
  });
  const breakoutHypothesis = runBacktest({
    higherTimeframe: higher,
    entryTimeframe: entry,
    config: { entryPolicy: 'VOLATILITY_EXPANSION_BREAKOUT_HYPOTHESIS' },
  });
  const funding: FundingPoint[] = entry.filter((_, index) => index % 32 === 0).map((candle, index) => ({ time: candle.time, fundingRate: index % 2 === 0 ? 0.001 : -0.001 }));
  const fundingHypothesis = runBacktest({
    higherTimeframe: higher,
    entryTimeframe: entry,
    fundingTimeframe: funding,
    config: { entryPolicy: 'FUNDING_CROWDING_REVERSION_HYPOTHESIS' },
  });
  assert.ok(hypothesis.totalTrades <= baseline.totalTrades);
  assert.ok(retestHypothesis.totalTrades <= baseline.totalTrades);
  assert.equal(profitProtectionHypothesis.totalTrades > 0, baseline.totalTrades > 0);
  assert.equal(Number.isFinite(meanReversionHypothesis.netPnl), true);
  assert.equal(Number.isFinite(breakoutHypothesis.netPnl), true);
  assert.equal(Number.isFinite(fundingHypothesis.netPnl), true);
  assert.ok(profitProtectionHypothesis.trades.every((trade) => Number.isFinite(trade.stopLoss)));
  assert.ok(followThroughHypothesis.totalTrades <= baseline.totalTrades);
});

test('temporal validation keeps OOS trades after the split and reports both slices', () => {
  const hour = 60 * 60 * 1000;
  const quarterHour = 15 * 60 * 1000;
  const higher = candles(320, 100, hour, 0.1, 0);
  const entry = candles(400, 140, quarterHour, 0.02, 220 * hour);
  const validation = runTemporalValidation({
    higherTimeframe: higher,
    entryTimeframe: entry,
    config: { initialEquity: 10_000 },
    trainFraction: 0.7,
    warmupBars: 80,
  });

  assert.equal(validation.trainFraction, 0.7);
  assert.equal(validation.inSample.sampleCandles, 280);
  assert.equal(validation.outOfSample.sampleCandles, 120);
  assert.equal(validation.splitTime, entry[280].time);
  assert.ok(validation.notes.length >= 3);
});

test('walk-forward validation returns ordered forward folds without tuning', () => {
  const hour = 60 * 60 * 1000;
  const quarterHour = 15 * 60 * 1000;
  const higher = candles(360, 100, hour, 0.1, 0);
  const entry = candles(500, 140, quarterHour, 0.02, 220 * hour);
  const validation = runWalkForwardValidation({
    higherTimeframe: higher,
    entryTimeframe: entry,
    config: { initialEquity: 10_000 },
    foldCount: 3,
    warmupBars: 80,
  });

  assert.equal(validation.folds.length, 3);
  assert.equal(validation.aggregate.sampleCandles, validation.folds.reduce((sum, fold) => sum + fold.testCandles, 0));
  assert.ok(validation.folds.every((fold) => fold.trainCandles > fold.testCandles));
  assert.ok(validation.notes.length >= 3);
});

test('a thin walk-forward aggregate reports an undefined profit factor, never infinity', () => {
  const hour = 60 * 60 * 1000;
  const quarterHour = 15 * 60 * 1000;
  const higher = candles(360, 100, hour, 0.1, 0);
  const entry = candles(500, 140, quarterHour, 0.02, 220 * hour);
  const validation = runWalkForwardValidation({
    higherTimeframe: higher,
    entryTimeframe: entry,
    // A rule that can barely fire: this reproduces the real LIQUIDATION_RECLAIM full-history case
    // where one fold held a single winning trade and the other two held none.
    config: { initialEquity: 10_000, entryPolicy: 'MEAN_REVERSION_REJECTION_HYPOTHESIS' },
    foldCount: 3,
    warmupBars: 80,
  });

  const aggregate = validation.aggregate;
  assert.ok(aggregate.totalTrades < 30, 'test harus memakai sampel tipis agar regresi ini berarti');
  assert.equal(aggregate.profitFactor, null, 'PF tidak boleh Infinity hanya karena belum ada trade kalah');
  assert.notEqual(aggregate.gate, 'PASS_RESEARCH_GATE');
  assert.ok(
    validation.folds.every((fold) => fold.summary.profitFactor === null || Number.isFinite(fold.summary.profitFactor)),
    'setiap fold juga tidak boleh melaporkan PF Infinity',
  );
});

test('champion playbook fires on a documented absorption + dominance shift sequence', () => {
  const hour = 60 * 60 * 1000;
  const quarterHour = 15 * 60 * 1000;
  const triggerTime = 150 * quarterHour;
  const higher: Candle[] = Array.from({ length: 300 }, (_, index) => {
    const price = 100 + index * 0.2;
    return { time: triggerTime - (299 - index) * hour, open: price, high: price + 0.4, low: price - 0.1, close: price + 0.2, volume: 10 };
  });

  const padding: Candle[] = Array.from({ length: 90 }, (_, index) => ({
    time: index * quarterHour, open: 100, high: 100.4, low: 99.7, close: 100.2, volume: 100, takerBuyVolume: 50,
  }));
  const start = 90 * quarterHour;
  const lookback: Candle[] = [];
  for (let index = 0; index < 30; index += 1) {
    const price = 100 + index * (10 / 29);
    lookback.push({ time: start + index * quarterHour, open: price - 0.2, high: price + 0.3, low: price - 0.4, close: price, volume: 100 });
  }
  for (let index = 30; index < 59; index += 1) {
    const price = 110 - (index - 30) * 0.25;
    lookback.push({ time: start + index * quarterHour, open: price + 0.2, high: price + 0.4, low: price - 0.3, close: price, volume: 100 });
  }
  // Absorption candle: heavy taker selling that is not rewarded, inside the fib discount zone.
  lookback.push({ time: start + 59 * quarterHour, open: 102.1, high: 102.2, low: 101.0, close: 101.9, volume: 200, takerBuyVolume: 60 });
  const trigger: Candle = { time: start + 60 * quarterHour, open: 102.0, high: 102.5, low: 101.8, close: 102.4, volume: 150 };
  const aftermath: Candle[] = Array.from({ length: 10 }, (_, index) => ({
    time: start + (61 + index) * quarterHour, open: 102.4, high: 103.0, low: 102.1, close: 102.8, volume: 100,
  }));
  const entry = [...padding, ...lookback, trigger, ...aftermath];

  const report = runBacktest({
    higherTimeframe: higher,
    entryTimeframe: entry,
    config: { entryPolicy: 'CHAMPION_ABSORPTION_REVERSION_HYPOTHESIS', haltAfterConsecutiveLosses: 2 },
  });
  assert.equal(report.totalTrades, 1, 'urutan absorption + flip harus menjadi satu trade riset');
  const trade = report.trades[0];
  assert.equal(trade.side, 'LONG');
  assert.ok(trade.stopLoss < 101.0, 'stop harus di bawah ekstrem absorption yang gagal');
  assert.ok(trade.takeProfit <= trade.entry + 2 * Math.abs(trade.entry - trade.stopLoss) + 1e-9, 'target dibatasi 2R');
});

test('champion playbook hard-invalidates when the discount loses the 0.886 line', () => {
  const hour = 60 * 60 * 1000;
  const quarterHour = 15 * 60 * 1000;
  const triggerTime = 150 * quarterHour;
  const higher: Candle[] = Array.from({ length: 300 }, (_, index) => {
    const price = 100 + index * 0.2;
    return { time: triggerTime - (299 - index) * hour, open: price, high: price + 0.4, low: price - 0.1, close: price + 0.2, volume: 10 };
  });
  const padding: Candle[] = Array.from({ length: 90 }, (_, index) => ({
    time: index * quarterHour, open: 100, high: 100.4, low: 99.7, close: 100.2, volume: 100, takerBuyVolume: 50,
  }));
  const start = 90 * quarterHour;
  const lookback: Candle[] = [];
  for (let index = 0; index < 30; index += 1) {
    const price = 100 + index * (10 / 29);
    lookback.push({ time: start + index * quarterHour, open: price - 0.2, high: price + 0.3, low: price - 0.4, close: price, volume: 100 });
  }
  for (let index = 30; index < 59; index += 1) {
    const price = 110 - (index - 30) * 0.25;
    lookback.push({ time: start + index * quarterHour, open: price + 0.2, high: price + 0.4, low: price - 0.3, close: price, volume: 100 });
  }
  // Absorption close BELOW the 0.886 retracement (101.14): the champion rule says the trade dies.
  lookback.push({ time: start + 59 * quarterHour, open: 101.2, high: 101.3, low: 100.4, close: 100.9, volume: 200, takerBuyVolume: 60 });
  const entry = [...padding, ...lookback, { time: start + 60 * quarterHour, open: 101.0, high: 101.6, low: 100.8, close: 101.5, volume: 150 }];

  const report = runBacktest({
    higherTimeframe: higher,
    entryTimeframe: entry,
    config: { entryPolicy: 'CHAMPION_ABSORPTION_REVERSION_HYPOTHESIS' },
  });
  assert.equal(report.totalTrades, 0, 'tembus 0.886 adalah invalidasi keras');
});

test('the consecutive-loss governor can only remove entries, never add them', () => {
  const hour = 60 * 60 * 1000;
  const quarterHour = 15 * 60 * 1000;
  const higher = candles(360, 100, hour, 0.1, 0);
  const entry = candles(500, 140, quarterHour, 0.02, 220 * hour);
  const withoutGovernor = runBacktest({ higherTimeframe: higher, entryTimeframe: entry, config: { initialEquity: 10_000 } });
  const withGovernor = runBacktest({
    higherTimeframe: higher,
    entryTimeframe: entry,
    config: { initialEquity: 10_000, haltAfterConsecutiveLosses: 1 },
  });
  assert.ok(withGovernor.totalTrades <= withoutGovernor.totalTrades);
});
