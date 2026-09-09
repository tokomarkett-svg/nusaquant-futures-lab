import assert from 'node:assert/strict';
import test from 'node:test';
import { runBacktest, type Candle } from './backtest.ts';

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
  report.trades.forEach((trade) => {
    assert.equal(Number.isFinite(trade.costs), true);
    assert.equal(Number.isFinite(trade.rMultiple), true);
  });
});
