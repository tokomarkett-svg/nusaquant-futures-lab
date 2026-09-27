import assert from 'node:assert/strict';
import test from 'node:test';
import { fetchKlines, gateTeknik, ticketTimeValid, type Candle } from './binance.ts';

const step = 900_000;

function candle(time: number, close = 100): Candle {
  return { time, open: 100, high: Math.max(101, close), low: Math.min(99, close), close, volume: 1 };
}

test('web tidak boleh memakai candle 15m yang sedang berjalan untuk tiket', async () => {
  const currentOpen = Math.floor(Date.now() / step) * step;
  const original = globalThis.fetch;
  globalThis.fetch = (async () => ({
    ok: true, json: async () => [
      [currentOpen - step, '100', '101', '99', '100.5', '1'],
      [currentOpen, '100.5', '105', '100', '104', '1'],
    ],
  }) as Response) as typeof fetch;
  try {
    const bars = await fetchKlines('BTCUSDT', '15m', 2);
    assert.equal(bars.length, 1);
    assert.equal(bars[0].close, 100.5);
  } finally {
    globalThis.fetch = original;
  }
});

test('gate web mengikuti arah hari WIB dan MA99 kedua timeframe, tidak pakai 1H basi/berjalan', () => {
  const now = Date.now();
  const last15 = Math.floor(now / step) * step - step;
  const last1h = Math.floor(now / 3_600_000) * 3_600_000 - 3_600_000;
  const m15 = Array.from({ length: 140 }, (_, i) => candle(last15 - (139 - i) * step));
  const h1 = Array.from({ length: 120 }, (_, i) => candle(last1h - (119 - i) * 3_600_000));
  m15[m15.length - 1].close = 102;
  h1[h1.length - 1].close = 102;
  const midnight = Math.floor((now - 17 * 3_600_000) / 86_400_000) * 86_400_000 + 17 * 3_600_000;
  assert.ok(m15.some((bar) => bar.time === midnight));
  assert.equal(gateTeknik(m15, h1, 102, 'LONG', now).ok, true);
  assert.equal(gateTeknik(m15, h1, 98, 'LONG', now).ok, false, 'arah hari melawan LONG');
  assert.equal(gateTeknik(m15, h1.map((bar) => ({ ...bar, time: bar.time - 3_600_000 * 3 })), 102, 'LONG', now).ok, false);
  assert.equal(gateTeknik(m15.map((bar) => ({ ...bar, time: bar.time + step })), h1, 102, 'LONG', now).ok, false, 'candle belum tutup');
});

test('tombol paper/demo wajib menolak tiket lewat 3 candle sesudah C2 tutup', () => {
  const c2 = 1_800_000_000_000;
  assert.equal(ticketTimeValid(c2, c2 + step), true);
  assert.equal(ticketTimeValid(c2, c2 + 4 * step), true);
  assert.equal(ticketTimeValid(c2, c2 + 4 * step + 1), false);
  assert.equal(ticketTimeValid(null, c2 + step), false);
});
