import assert from 'node:assert/strict';
import test from 'node:test';
import { papanPayload } from './data-proxy.ts';
import type { AlertScanRow } from './alerts.ts';

test('papan cached tidak pernah menunjukkan SIAP setelah tiket kedaluwarsa', () => {
  const candle2 = 2_000_000_000_000;
  const row = {
    symbol: 'TESTUSDT', side: 'LONG', priceNow: 100, gate: 'HIJAU', gateAlign: true,
    market: 'FUTURES', setup: { candle2, valid: true }, ticket: { actionable: true }, dataAgeMin: 5, scannedAt: candle2 + 16 * 60_000,
  } as AlertScanRow;
  const snapshot = { at: candle2 + 16 * 60_000, rows: [row], market: 'FUTURES' };
  assert.equal(papanPayload(snapshot, snapshot.at).rows[0].siap, true);
  assert.equal(papanPayload(snapshot, candle2 + 5 * 3_600_000).rows[0].siap, false);
  assert.equal(papanPayload(snapshot, candle2 + 5 * 3_600_000).rows[0].basi, true);
});
