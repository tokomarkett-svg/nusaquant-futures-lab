import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveExitPrice, runBacktest, runTemporalValidation, runWalkForwardValidation, type Candle } from './backtest.ts';

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
  const diagnosticGroups = Object.values(report.diagnostics);
  assert.equal(diagnosticGroups.flat().reduce((sum, bucket) => sum + bucket.trades, 0) / diagnosticGroups.length, report.totalTrades);
  report.trades.forEach((trade) => {
    assert.equal(Number.isFinite(trade.costs), true);
    assert.equal(Number.isFinite(trade.rMultiple), true);
    assert.equal(Number.isFinite(trade.barsHeld), true);
    assert.equal(Number.isFinite(trade.triggerRangeAtr), true);
    assert.equal(Number.isFinite(trade.entryDistanceToEmaAtr), true);
    assert.equal(Number.isFinite(trade.stopDistanceAtr), true);
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
  assert.ok(hypothesis.totalTrades <= baseline.totalTrades);
  assert.ok(retestHypothesis.totalTrades <= baseline.totalTrades);
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
