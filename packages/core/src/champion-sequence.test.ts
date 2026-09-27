import assert from 'node:assert/strict';
import test from 'node:test';
import { buildTradeVolumeProfile, type TradeVolumeProfile } from './orderflow-profile.ts';
import { evaluateChampionSequence, type ChampionInput, type FootprintBar } from './champion-sequence.ts';

const STEP = 300_000;
const T = 1_800_000_000_000;
const symbol = 'BTCUSDT';
function profile(start: number, prices: number[], buy: boolean, quantity = 1): TradeVolumeProfile {
  const found = buildTradeVolumeProfile({ symbol, start, end: start + STEP, tickSize: 0.1,
    complete: true, market: 'FUTURES', trades: prices.map((price, i) => ({
      id: i + 1, time: start + (i + 1) * 1000, price, quantity,
      buyerIsMaker: !buy,
    })) });
  assert.ok(found);
  return found;
}
function bar(time: number, open: number, high: number, low: number, close: number, buy: boolean, quantity = 1): FootprintBar {
  return { candle: { time, open, high, low, close, volume: quantity * 3 },
    profile: profile(time, [low, close, high], buy, quantity) };
}
function longFixture(): ChampionInput {
  return { symbol, now: T + 3 * STEP + 1000, tickSize: 0.1,
    context: { h1: 'UP', h4: 'UP', asOf: T - 21 * STEP, swingLow: 90, swingHigh: 120 },
    value: profile(T - 22 * STEP, [100, 100, 100.1, 101], true),
    participation: Array.from({ length: 20 }, (_, i) => bar(T - (20 - i) * STEP, 100, 100.1, 99.9, 100, true)),
    absorption: bar(T, 96.1, 97, 95, 96.2, false, 2),
    retest: bar(T + STEP, 96.2, 96.9, 95.3, 96.3, false),
    flip: bar(T + 2 * STEP, 96.5, 98.5, 95.4, 97.2, true),
  };
}

test('long: struktur + discount + sell absorption + higher-low retest + buy flip => kandidat RISET, bukan SIAP', () => {
  const result = evaluateChampionSequence(longFixture());
  assert.equal(result.stage, 'KANDIDAT_RISET');
  assert.equal(result.ready, false);
  assert.equal(result.candidate?.side, 'LONG');
  assert.ok((result.candidate?.stop ?? 0) < 95);
  assert.ok((result.candidate?.target ?? 0) > 100);
  assert.equal(result.candidate?.gammaRegime, 'UNKNOWN');
});

test('short: mirrored premium + buy absorption + lower-high retest + sell flip', () => {
  const l = longFixture();
  const p = l.participation;
  const s: ChampionInput = { ...l,
    context: { h1: 'DOWN', h4: 'DOWN', asOf: T - 21 * STEP, swingLow: 80, swingHigh: 110 },
    value: profile(T - 22 * STEP, [100, 100, 100.1, 101], true), participation: p,
    absorption: bar(T, 104, 105, 103, 103.9, true, 2),
    retest: bar(T + STEP, 103.8, 104.7, 103.1, 103.7, true),
    flip: bar(T + 2 * STEP, 103.6, 104.6, 101.5, 102.9, false),
  };
  const result = evaluateChampionSequence(s);
  assert.equal(result.stage, 'KANDIDAT_RISET');
  assert.equal(result.candidate?.side, 'SHORT');
  assert.ok((result.candidate?.stop ?? 0) > 105);
  assert.ok((result.candidate?.target ?? 999) < 100);
  assert.equal(result.ready, false);
});

test('tidak pakai masa depan, simbol campur, data hilang, konteks salah, lokasi di value, atau flip tanpa delta', () => {
  const x = longFixture();
  assert.equal(evaluateChampionSequence({ ...x, value: { ...x.value, end: T + 1 } }).stage, 'DATA_KURANG');
  assert.equal(evaluateChampionSequence({ ...x, participation: x.participation.slice(1) }).stage, 'DATA_KURANG');
  assert.equal(evaluateChampionSequence({ ...x, retest: { ...x.retest, profile: { ...x.retest.profile, symbol: 'ETHUSDT' } } }).stage, 'DATA_KURANG');
  assert.equal(evaluateChampionSequence({ ...x, now: T + 2 * STEP }).stage, 'DATA_KURANG');
  assert.equal(evaluateChampionSequence({ ...x, context: { ...x.context, asOf: T + 1 } }).stage, 'DATA_KURANG');
  assert.equal(evaluateChampionSequence({ ...x, context: { ...x.context, h4: 'DOWN' } }).stage, 'KONTEKS');
  assert.equal(evaluateChampionSequence({ ...x, value: profile(T - 22 * STEP, [95, 96, 97], true) }).stage, 'LOKASI');
  assert.equal(evaluateChampionSequence({ ...x, absorption: { ...x.absorption, profile: { ...x.absorption.profile, totalDelta: 1 } } }).stage, 'ABSORPSI');
  assert.equal(evaluateChampionSequence({ ...x, retest: { ...x.retest, profile: { ...x.retest.profile, totalDelta: 1 } } }).stage, 'TES_ULANG');
  assert.equal(evaluateChampionSequence({ ...x, flip: { ...x.flip, profile: { ...x.flip.profile, totalDelta: -1 } } }).stage, 'FLIP');
});

test('X terlalu jauh dari absorption tidak boleh ditafsirkan sebagai pertarungan yang sama', () => {
  const v = longFixture();
  // X touches 0.705 at t-4x5m; every later 5m bar stays inside, so no newer X.
  for (let i = 16; i < 20; i += 1) {
    const t = v.participation[i].candle.time;
    v.participation[i] = bar(t, 99, 100, 97, 99, true);
  }
  assert.equal(evaluateChampionSequence(v).stage, 'LOKASI');
});
