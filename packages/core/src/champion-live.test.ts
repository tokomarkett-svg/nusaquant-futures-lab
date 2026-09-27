import assert from 'node:assert/strict';
import test from 'node:test';
import { decideChrisC2 } from './champion-live.ts';
import type { ChampionCandidate } from './champion-sequence.ts';
import type { Candle } from './index.ts';
const q = 900_000;
const t = Math.floor(Date.now() / q) * q - 3 * q;
const bar = (time: number, open: number, high: number, low: number, close: number): Candle =>
  ({ time, open, high, low, close, volume: 20 });
const c1 = bar(t, 99, 100, 96, 99);
const candidate: ChampionCandidate = { symbol: 'BTCUSDT', side: 'LONG', absorptionAt: t, retestAt: t + 300_000,
  flipAt: t + 600_000, entry: 99, stop: 95, target: 115, gammaRegime: 'UNKNOWN' };
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
  const short = { ...candidate, side: 'SHORT' as const, stop: 105, target: 85 };
  const c = bar(t, 101, 104, 100, 101);
  const base = { candidate: short, c1: c, now: t + 2 * q };
  assert.equal(decideChrisC2({ ...base, priceNow: 99, c2: bar(t + q, 101, 102, 98, 100) })?.stage, 'BATAL');
  assert.equal(decideChrisC2({ ...base, priceNow: 98.9, c2: bar(t + q, 101, 102, 98, 99) })?.stage, 'SIAP');
  assert.equal(decideChrisC2({ ...base, priceNow: 101, c2: bar(t + q, 101, 102, 98, 99) })?.stage, 'BASI');
  assert.equal(decideChrisC2({ ...base, priceNow: 98.9, c2: bar(t + q, 101, 102, 98, 99), now: t + 6 * q })?.stage, 'BASI');
});
