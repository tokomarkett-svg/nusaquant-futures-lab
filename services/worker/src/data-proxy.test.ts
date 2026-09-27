import assert from 'node:assert/strict';
import test from 'node:test';
import { papanPayload } from './data-proxy.ts';
import type { AlertScanRow } from './alerts.ts';

test('papan lama tidak membocorkan tiket PMB walaupun snapshot cached berisi SIAP', () => {
  const candle2 = Date.now() - 900_000;
  const row = {
    symbol: 'TESTUSDT', side: 'LONG', priceNow: 100, gate: 'HIJAU', gateAlign: true,
    market: 'FUTURES', setup: { candle2, valid: true }, ticket: { actionable: true }, dataAgeMin: 0, scannedAt: Date.now(),
  } as AlertScanRow;
  const snapshot = { at: Date.now(), rows: [row], market: 'FUTURES' };
  assert.deepEqual(papanPayload(snapshot).rows, []);
  assert.equal(papanPayload(snapshot).replacement, '/data/champion-json');
});
