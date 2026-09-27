import test from 'node:test';
import assert from 'node:assert/strict';
import { appSeesReady, appSeesDecision, championMessage } from './champion-live.ts';
import type { ChrisDecision } from '@nusaquant/core';
const decision: ChrisDecision = { symbol: 'BTCUSDT', side: 'LONG', stage: 'SIAP', c1: 900000,
  c2: 1800000, trigger: 0.06637, x: 0, fib: { shallow705: .067, mid788: .0665, invalid886: .065 }, priceNow: 0.067, entry: 0.067, stop: 0.065,
  target: 0.071, sizeCoin: 155, riskUsdt: .31, reason: 'ok', gammaRegime: 'UNKNOWN' };
test('Telegram Chris C1 bukan tiket; tiket mensyaratkan konfirmasi keputusan sama dari app', async () => {
  const pending: ChrisDecision = { ...decision, stage: 'C1', c2: null, entry: null, target: null, sizeCoin: null };
  assert.match(championMessage(pending), /DI ATAS 0\.06637/);
  assert.doesNotMatch(championMessage(pending), /SIAP ENTRI/);
  assert.match(championMessage(decision), /SIAP ENTRI/);
  const response = (entry: number) => (async () => ({ ok: true, json: async () => ({ ok: true,
    rows: [{ symbol: decision.symbol, decision: { ...decision, entry } }],
  }) }) as Response) as typeof fetch;
  assert.equal(await appSeesReady(decision, response(0.067)), true);
  assert.equal(await appSeesReady(decision, response(0.068)), false);
  const missing = (async () => ({ ok: false }) as Response) as typeof fetch;
  assert.equal(await appSeesReady(decision, missing), false);
});

test('worker Testnet path rejects PMB ticket and modified or stale Chris ticket', async () => {
  const { championOrderMatches } = await import('./champion-live.ts');
  const q = 900_000;
  const c2 = Math.floor(Date.now() / q) * q - q;
  const d: ChrisDecision = { ...decision, c1: c2 - q, c2, x: c2 - 3 * q };
  const input = { symbol: d.symbol, side: d.side, setupKey: `${d.symbol}:${d.side}:${c2}`,
    expectedEntry: d.entry!, stop: d.stop, target: d.target!, qty: d.sizeCoin! };
  const state = { at: Date.now(), decision: d };
  assert.equal(championOrderMatches(input, Date.now(), state), true);
  assert.equal(championOrderMatches({ ...input, expectedEntry: d.entry! * 1.001 }, Date.now(), state), false);
  assert.equal(championOrderMatches({ ...input, setupKey: `${d.symbol}:${d.side}:${c2 - q}` }, Date.now(), state), false);
  assert.equal(championOrderMatches(input, Date.now(), { ...state, at: Date.now() - 200_000 }), false);
  assert.equal(championOrderMatches(input, Date.now(), { ...state, decision: { ...d, stage: 'BATAL' } }), false);
});

test('Binance aggTrades order terkompresi bisa beda sedikit dari kline di batas 5m; sumber utama tetap trade asli', async () => {
  const { footprintMatchesKline } = await import('./champion-live.ts');
  const reference = { low: 2688.23, high: 2694, volume: 6988.096 };
  const profile = { levels: [{ price: 2688.23 }, { price: 2694 }], totalVolume: 6988.418,
    firstTradePrice: 2688.23, lastTradePrice: 2693 };
  assert.equal(footprintMatchesKline(reference, profile, .01), true);
  assert.equal(footprintMatchesKline(reference, { ...profile, totalVolume: 7000 }, .01), false);
  assert.equal(footprintMatchesKline(reference, { ...profile, levels: [{ price: 2688.22 }, { price: 2694 }] }, .01), false);
  assert.equal(footprintMatchesKline(undefined, profile, .01), false);
});

test('Telegram hanya ketika C2 mulai terbentuk; BATAL/BASI follow-up wajib, tidak pernah hidup lagi', async () => {
  const { eligibleChampionNotification: allowed, settleChampionDecision } = await import('./champion-live.ts');
  const q = 900_000;
  const c1 = Math.floor(Date.now() / q) * q - q;
  const start = c1 + q;
  const c1Notice: ChrisDecision = { ...decision, c1, c2: null, stage: 'C1', entry: null, target: null, sizeCoin: null };
  const seen = new Set<string>();
  assert.equal(allowed(c1Notice, start, false, seen), false, 'C1 close saja belum boleh dikabarkan');
  assert.equal(allowed(c1Notice, start, true, seen), true, 'Futures C2 partial dengan volume >0 memicu pantau');
  assert.equal(await appSeesDecision(c1Notice, (async () => ({ ok: true, json: async () => ({ ok: true, rows: [
    { symbol: c1Notice.symbol, decision: c1Notice, c2Started: false },
  ] }) }) as Response) as typeof fetch), false);
  assert.equal(await appSeesDecision(c1Notice, (async () => ({ ok: true, json: async () => ({ ok: true, rows: [
    { symbol: c1Notice.symbol, decision: c1Notice, c2Started: true },
  ] }) }) as Response) as typeof fetch), true);
  seen.add(`${decision.symbol}:${decision.side}:C1:${c1}:`);
  assert.equal(allowed(c1Notice, start, true, seen), false, 'tidak spam C1');
  const failed: ChrisDecision = { ...c1Notice, stage: 'BATAL', c2: c1 + q };
  assert.equal(allowed(failed, start + q, true, seen), true);
  const stale: ChrisDecision = { ...c1Notice, stage: 'BASI', c2: c1 + q };
  assert.equal(allowed(stale, start + q, true, seen), true, 'basi jika close C2 tidak layak setelah pantau');
  const revived: ChrisDecision = { ...decision, c1, c2: c1 + q };
  assert.equal(settleChampionDecision(failed, revived), failed, 'gagal tidak boleh menjadi SIAP sesudah harga kembali');
  assert.equal(settleChampionDecision(failed, null), failed, 'respons sementara kosong juga tidak menghidupkan tiket');
  assert.equal(settleChampionDecision(stale, revived), stale, 'BASI juga terminal');
  const noPrior = new Set<string>();
  assert.equal(allowed(failed, start + q, true, noPrior), false);
  assert.equal(allowed(revived, start, true, noPrior), false, 'Siap hanya setelah C2 closed');
});

test('harga Futures terkini diperiksa lagi sebelum telegram SIAP, bukan hanya snapshot lama', async () => {
  const { stillReadyAtPrice } = await import('./champion-live.ts');
  const q = 900_000;
  const c2 = Math.floor(Date.now() / q) * q - q;
  const d = { ...decision, c1: c2 - q, c2 };
  assert.equal(stillReadyAtPrice(d, .067, Date.now()), true);
  assert.equal(stillReadyAtPrice(d, .06637, Date.now()), false);
  assert.equal(stillReadyAtPrice(d, .069, Date.now()), false);
  assert.equal(stillReadyAtPrice(d, .067, c2 + 5 * q), false);
});
