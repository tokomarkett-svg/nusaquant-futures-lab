import assert from 'node:assert/strict';
import test from 'node:test';
import { atr, detectCandlePatterns, ema, evaluateIntelligentSignal, evaluateSignal, type Candle } from './index.ts';

function makeCandles(count: number, start: number, trend: number): Candle[] {
  const candles: Candle[] = [];
  let previousClose = start;
  for (let index = 0; index < count; index += 1) {
    const close = previousClose + trend + Math.sin(index / 5) * 0.2;
    candles.push({
      time: index,
      open: previousClose,
      high: Math.max(previousClose, close) + 2,
      low: Math.min(previousClose, close) - 2,
      close,
      volume: 1000 + (index % 5) * 20,
    });
    previousClose = close;
  }
  return candles;
}

test('EMA returns a stable value after its warmup period', () => {
  const values = ema([1, 2, 3, 4, 5], 3);
  assert.equal(Number.isNaN(values[0]), true);
  assert.equal(Number.isNaN(values[1]), true);
  assert.equal(Number.isFinite(values[4]), true);
  assert.equal(values[4] > values[2], true);
});

test('ATR is non-negative after its warmup period', () => {
  const values = atr(makeCandles(40, 100, 0.2), 14);
  const validValues = values.filter(Number.isFinite);
  assert.ok(validValues.length > 0);
  assert.ok(validValues.every((value) => value >= 0));
});

test('signal engine does not produce a trade without enough data', () => {
  const evaluation = evaluateSignal({
    higherTimeframe: makeCandles(20, 100, 0.2),
    entryTimeframe: makeCandles(20, 100, 0.2),
    equity: 10_000,
  });
  assert.equal(evaluation.direction, 'NO_TRADE');
  assert.equal(evaluation.quantity, 0);
});

test('signal engine returns a bounded decision and valid risk amount', () => {
  const evaluation = evaluateSignal({
    higherTimeframe: makeCandles(260, 100, 0.2),
    entryTimeframe: makeCandles(260, 100, 0.08),
    equity: 10_000,
  });
  assert.ok(['LONG', 'SHORT', 'NO_TRADE'].includes(evaluation.direction));
  assert.ok(evaluation.score >= 0 && evaluation.score <= evaluation.scoreMax);
  assert.ok(evaluation.riskAmount >= 0);
  if (evaluation.direction !== 'NO_TRADE') {
    assert.ok(evaluation.entry !== null);
    assert.ok(evaluation.stopLoss !== null);
    assert.ok(evaluation.takeProfit !== null);
    assert.ok(evaluation.quantity > 0);
  }
});


test('candle pattern detector identifies a closed bullish engulfing', () => {
  const patterns = detectCandlePatterns([
    { time: 1, open: 105, high: 106, low: 99, close: 100, volume: 1000 },
    { time: 2, open: 99.5, high: 108, low: 98, close: 107, volume: 1400 },
  ]);
  assert.ok(patterns.some((pattern) => pattern.name === 'BULLISH_ENGULFING'));
});

test('intelligence layer separates candidate setup from confirmed trigger', () => {
  const evaluation = evaluateIntelligentSignal({
    higherTimeframe: makeCandles(260, 100, 0.2),
    entryTimeframe: makeCandles(260, 100, 0.08),
    equity: 10_000,
  });
  assert.ok(['LONG', 'SHORT', 'NO_TRADE'].includes(evaluation.decision));
  assert.ok(['TRIGGERED', 'SETUP', 'NO_TRADE'].includes(evaluation.stage));
  assert.ok(evaluation.qualityScore >= 0 && evaluation.qualityScore <= 100);
  if (evaluation.decision === 'NO_TRADE') assert.equal(evaluation.quantity, 0);
});
