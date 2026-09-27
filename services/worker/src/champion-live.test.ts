import test from 'node:test';
import assert from 'node:assert/strict';
import { appSeesReady, championMessage } from './champion-live.ts';
import type { ChrisDecision } from '@nusaquant/core';
const decision: ChrisDecision = { symbol: 'BTCUSDT', side: 'LONG', stage: 'SIAP', c1: 900000,
  c2: 1800000, trigger: 0.06637, x: 0, fib: { shallow705: .067, mid788: .0665, invalid886: .065 }, priceNow: 0.067, entry: 0.067, stop: 0.065,
  target: 0.071, sizeCoin: 155, riskUsdt: .31, reason: 'ok', gammaRegime: 'UNKNOWN' };
test('Telegram Chris C1 bukan tiket; tiket mensyaratkan konfirmasi keputusan sama dari app', async () => {
  const pending: ChrisDecision = { ...decision, stage: 'C1', c2: null, entry: null, target: null, sizeCoin: null };
  assert.match(championMessage(pending), /DI ATAS 0\.06637/);
  assert.doesNotMatch(championMessage(pending), /SIAP ENTRI/);
  assert.match(championMessage(decision), /SIAP ENTRI/);
  const response = (entry: number) => (async () => ({ ok: true, json: async () => ({
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
