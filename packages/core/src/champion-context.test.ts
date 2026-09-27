import test from 'node:test';
import assert from 'node:assert/strict';
import { buildChampionContext } from './champion-context.ts';
import type { Candle } from './index.ts';

const AS_OF = 1_800_000_000_000; // aligned 4h/1h/5m? aligned by construction below
const ALIGN = Math.floor(AS_OF / 14_400_000) * 14_400_000;
function bars(n: number, ms: number, direction: 1 | -1 = 1): Candle[] {
  return Array.from({ length: n }, (_, i) => {
    const center = 100 + direction * i * .4 + 4 * Math.sin(i * Math.PI * 2 / 7);
    return { time: ALIGN - (n - i) * ms, open: center, high: center + .8,
      low: center - .8, close: center, volume: 1 };
  });
}

test('pivot HH/HL dan LH/LL dihitung dari candle tertutup 1H+4H tanpa MA', () => {
  const up = buildChampionContext({ h1: bars(42, 3_600_000), h4: bars(28, 14_400_000), m5: bars(60, 300_000), asOf: ALIGN });
  assert.ok(up);
  assert.equal(up.h1, 'UP');
  assert.equal(up.h4, 'UP');
  assert.ok(up.swingHigh > up.swingLow);
  const down = buildChampionContext({ h1: bars(42, 3_600_000, -1), h4: bars(28, 14_400_000, -1), m5: bars(60, 300_000, -1), asOf: ALIGN });
  assert.ok(down);
  assert.equal(down.h1, 'DOWN');
  assert.equal(down.h4, 'DOWN');
});

test('candle 4H berjalan/basi, gap klines, kurang warmup atau swing masa depan ditolak', () => {
  const normal = { h1: bars(42, 3_600_000), h4: bars(28, 14_400_000), m5: bars(60, 300_000), asOf: ALIGN };
  assert.equal(buildChampionContext({ ...normal, h4: normal.h4.map((c) => ({ ...c, time: c.time + 14_400_000 })) }), null);
  assert.equal(buildChampionContext({ ...normal, h1: normal.h1.slice(1).map((c) => ({ ...c, time: c.time - 14_400_000 })) }), null);
  assert.equal(buildChampionContext({ ...normal, h1: normal.h1.slice(0, 20) }), null);
  assert.equal(buildChampionContext({ ...normal, m5: normal.m5.map((c) => ({ ...c, time: c.time + 300_000 })) }), null);
});
