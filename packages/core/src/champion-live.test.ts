import assert from 'node:assert/strict';
import test from 'node:test';
import { decideChrisC2 } from './champion-live.ts';
import type { ChampionCandidate } from './champion-sequence.ts';
import type { Candle } from './index.ts';
const q = 900_000;
const t = Math.floor(Date.now() / q) * q - 3 * q;
const bar = (time: number, open: number, high: number, low: number, close: number): Candle =>
  ({ time, open, high, low, close, volume: 20 });
const c1 = bar(t, 98, 100, 96, 99);
const candidate: ChampionCandidate = { symbol: 'BTCUSDT', side: 'LONG', absorptionAt: t, retestAt: t + 300_000,
  flipAt: t + 600_000, xAt: t, fib: { shallow705: 98, mid788: 96, invalid886: 95 }, entry: 99, stop: 95, target: 115, gammaRegime: 'UNKNOWN' };
test('Chris: C1 hanya pantau; C2 harus close di atas high C1, tidak bisa wick atau candle ketiga', () => {
  const base = { candidate, c1, priceNow: 100.3 };
  assert.equal(decideChrisC2({ ...base, c2: null, now: t + q })?.stage, 'C1');
  assert.equal(decideChrisC2({ ...base, c2: bar(t + q, 99, 101, 98, 100), now: t + 2 * q })?.stage, 'BATAL');
  assert.equal(decideChrisC2({ ...base, c2: bar(t + 2 * q, 100, 102, 99, 101), now: t + 3 * q }), null);
  const ok = decideChrisC2({ ...base, c2: bar(t + q, 99, 102, 99, 101), now: t + 2 * q });
  assert.equal(ok?.stage, 'SIAP'); assert.equal(ok?.trigger, 100); assert.equal(ok?.entry, 101);
  assert.equal(decideChrisC2({ ...base, priceNow: 99.9, c2: bar(t + q, 99, 102, 99, 101), now: t + 2 * q })?.stage, 'BASI');
});
test('Chris: SHORT simetris, close tepat batas ditolak, stale/wrong-side ditahan', () => {
  const short = { ...candidate, side: 'SHORT' as const, stop: 105, target: 85, fib: { shallow705: 101, mid788: 103, invalid886: 106 } };
  const c = bar(t, 102, 104, 100, 101);
  const base = { candidate: short, c1: c, now: t + 2 * q };
  assert.equal(decideChrisC2({ ...base, priceNow: 99, c2: bar(t + q, 101, 102, 98, 100) })?.stage, 'BATAL');
  assert.equal(decideChrisC2({ ...base, priceNow: 98.9, c2: bar(t + q, 101, 102, 98, 99) })?.stage, 'SIAP');
  assert.equal(decideChrisC2({ ...base, priceNow: 101, c2: bar(t + q, 101, 102, 98, 99) })?.stage, 'BASI');
  assert.equal(decideChrisC2({ ...base, priceNow: 98.9, c2: bar(t + q, 101, 102, 98, 99), now: t + 6 * q })?.stage, 'BASI');
});

test('X fib 0.705 dari luar; 0.788 angka tengah; 0.886 invalid, long/short terpisah tanpa MA', async () => {
  const { detectChrisX } = await import('./champion-live.ts');
  const prev = bar(t - 300_000, 104, 105, 101, 103);
  const base = { context: { h1: 'UP' as const, h4: 'UP' as const, swingLow: 90, swingHigh: 120 },
    valueAreaLow: 105, valueAreaHigh: 115, previous: prev,
    current: bar(t, 100, 102, 98, 100) };
  const result = detectChrisX(base);
  assert.equal(result?.side, 'LONG');
  assert.equal(result?.fib.mid788, 120 - .788 * 30);
  assert.equal(detectChrisX({ ...base, current: bar(t, 96, 100, 92, 96) }), null);
  assert.equal(detectChrisX({ ...base, context: { ...base.context, h4: 'DOWN' } }), null);
  const short = detectChrisX({ context: { h1: 'DOWN', h4: 'DOWN', swingLow: 80, swingHigh: 110 },
    valueAreaLow: 86, valueAreaHigh: 100, previous: bar(t - 300_000, 99, 100, 98, 99),
    current: bar(t, 102, 104, 101, 103) });
  assert.equal(short?.side, 'SHORT');
  assert.equal(short?.fib.invalid886, 80 + .886 * 30);
});
