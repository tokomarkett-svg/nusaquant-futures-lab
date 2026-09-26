import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPantauanText, formatJarak } from './pantauan.ts';
import type { Candle } from '@nusaquant/core';

const kini = Date.now();
const menit15 = 900_000;
const jam1 = 3_600_000;

/** Deret naik pelan — cukup untuk lolos gerbang internal scan (ungu/gate margin). */
const deretNaik = (jumlah: number, jeda: number): Candle[] =>
  Array.from({ length: jumlah }, (_, i) => {
    const open = 100 * (1 + 0.001 * i);
    return { time: kini - (jumlah - i) * jeda, open, high: open * 1.002, low: open * 0.998, close: open * 1.001, volume: 10 };
  });

const klienPalsu = {
  async get24hTickerDetails() {
    return [{ symbol: 'TAOUSDT', last: 100, high: 104, low: 97, quoteVolume: 9_000_000 }];
  },
  async getKlines({ interval }: { symbol: string; interval: string; limit: number }) {
    return interval === '15m' ? deretNaik(140, menit15) : deretNaik(130, jam1);
  },
};

test('formatJarak: tanda minus untuk yang sudah di dalam zona', () => {
  assert.equal(formatJarak(0.4234), '0.42%');
  assert.equal(formatJarak(-1.25), '−1.25%');
});

test('buildPantauanText: teks berisi status saringan + daftar terdekat ke pintu (dua arah)', async () => {
  const teks = await buildPantauanText(klienPalsu as never, new Date(kini));
  assert.ok(teks.includes('PANTAUAN PMB'), 'judul ada');
  assert.ok(teks.includes('TAOUSDT'), 'koin terdekat ditampilkan');
  assert.ok(teks.includes('L pintu'), 'arah LONG ditampilkan');
  assert.ok(teks.includes('S pintu'), 'arah SHORT ditampilkan');
  assert.ok(teks.includes('fakta posisi, bukan sinyal'), 'label bukan-sinyal ada');
});

test('buildPantauanText: klines error pun teks tetap jadi (near-miss dari tickers saja)', async () => {
  const klienRusak = {
    async get24hTickerDetails() {
      return [{ symbol: 'SOLUSDT', last: 120, high: 130, low: 118, quoteVolume: 20_000_000 }];
    },
    async getKlines() {
      throw new Error('jembatan padam');
    },
  };
  const teks = await buildPantauanText(klienRusak as never, new Date(kini));
  assert.ok(teks.includes('PANTAUAN PMB'));
  assert.ok(teks.includes('SOLUSDT'));
});
