import test from 'node:test';
import assert from 'node:assert/strict';
import { appSeesReady, championMessage } from './champion-live.ts';
import type { ChrisDecision } from '@nusaquant/core';
const decision: ChrisDecision = { symbol: 'BTCUSDT', side: 'LONG', stage: 'SIAP', c1: 900000,
  c2: 1800000, trigger: 0.06637, priceNow: 0.067, entry: 0.067, stop: 0.065,
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
