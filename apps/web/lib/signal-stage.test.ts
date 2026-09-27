import test from 'node:test';
import assert from 'node:assert/strict';
import type { BoardRow } from './binance';
import { signalStage } from './signal-stage';

const now = 2_000_000_000_000;
const quarter = 900_000;
const base = { symbol: 'PHAROSUSDT', side: 'LONG', status: 'MENYALA', gateAlign: true,
  dataAgeMin: 1, technicalReady: false,
  setup: { x: null, candle1: null, candle2: null, valid: false, note: null },
  ticket: null } as BoardRow;
const at = new Date(now).toISOString();
const stage = (over: Partial<BoardRow> = {}, time = now, snapshot = at) => signalStage({ ...base, ...over }, snapshot, time);

test('menu tahapan X -> C1 -> C2 -> SIAP dan Basi/Batal tak boleh SIAP', () => {
  assert.equal(stage(), 'PANTAU');
  assert.equal(stage({ setup: { x: now - quarter, candle1: null, candle2: null, valid: false, note: null } }), 'PINTU');
  assert.equal(stage({ setup: { x: now - 2 * quarter, candle1: now - quarter, candle2: null, valid: false, note: null } }), 'C1');
  const setup = { x: now - 3 * quarter, candle1: now - 2 * quarter, candle2: now - quarter, valid: true, note: null };
  const ticket = { actionable: true, chaseRisk: false, entryAgeBars: 0 } as BoardRow['ticket'];
  assert.equal(stage({ setup, ticket }), 'C2', 'C2 tidak otomatis menjadi alarm SIAP');
  assert.equal(stage({ setup, ticket, technicalReady: true }), 'SIAP');
  assert.equal(stage({ setup, ticket, technicalReady: true, gateAlign: false }), 'C2');
  assert.equal(stage({ setup, ticket, technicalReady: true }, now + 4 * quarter), 'BASI');
  assert.equal(stage({ setup: { ...setup, valid: false }, ticket, technicalReady: true }), 'BATAL');
  assert.equal(stage({ ...base, status: 'PADAM', setup, ticket, technicalReady: true }), 'BATAL');
  assert.equal(stage({ setup, ticket, technicalReady: true }, now, new Date(now - 3 * 60_000).toISOString()), 'C2');
  assert.equal(stage({ setup, ticket: { ...ticket!, chaseRisk: true }, technicalReady: true }), 'BASI');
});
