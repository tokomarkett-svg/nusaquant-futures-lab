import test from 'node:test';
import assert from 'node:assert/strict';
import { markDemoReadiness } from './board-readiness';
import type { Board } from './binance';

function fixture(): Board {
  const candle2 = Math.floor(Date.now() / 900_000) * 900_000 - 900_000;
  return { market: 'FUTURES', at: new Date().toISOString(),
    funnel: { scanned: 700, liquid: 500, rangeOk: 160, board: 700, staleDropped: 0 },
    rows: [{ symbol: 'PHAROSUSDT', side: 'LONG', status: 'MENYALA', gate: 'HIJAU', gateAlign: true, dataAgeMin: 1,
      setup: { x: candle2 - 2 * 900_000, candle1: candle2 - 900_000, candle2, valid: true, note: null },
      technicalReady: true, ticket: { actionable: true, entry: 101, stop: 99, target: 105 } } as Board['rows'][number]],
  };
}

test('aplikasi menampilkan seluruh Futures: tiket teknik sah tanpa Testnet tetap SIAP tapi Demo tidak', async () => {
  const board = fixture(); const row = board.rows[0];
  const ready = async () => ({ symbol: row.symbol, side: row.side, setupKey: `${row.symbol}:${row.side}:${row.setup.candle2}`,
    expiresAt: new Date(Date.now() + 900_000).toISOString(), entry: 101, stop: 99, target: 105, qty: .31, riskUsdt: .31 });
  await markDemoReadiness(board, ready, async () => new Set(['BTCUSDT']));
  assert.equal(row.technicalReady, true);
  assert.equal(row.demoReady, false, 'PHAROS tidak boleh ditawarkan sebagai order Demo');
  row.technicalReady = true;
  await markDemoReadiness(board, ready, async () => new Set(['PHAROSUSDT']));
  assert.equal(row.demoReady, true);
  row.technicalReady = true;
  await markDemoReadiness(board, async () => ({ ...await ready(), setupKey: 'old' }), async () => new Set(['PHAROSUSDT']));
  assert.equal(row.technicalReady, false);
  assert.equal(row.demoReady, false);
  row.technicalReady = true;
  await markDemoReadiness(board, async () => ({ ...await ready(), stop: 98 }), async () => new Set(['PHAROSUSDT']));
  assert.equal(row.technicalReady, false);
  row.technicalReady = true; board.market = 'SPOT';
  await markDemoReadiness(board, ready, async () => new Set(['PHAROSUSDT']));
  assert.equal(row.technicalReady, false);
});

test('app menolak SIAP bila gate KUNING meskipun flag gateAlign dari cache lama true', async () => {
  const board = fixture();
  board.rows[0].gate = 'KUNING';
  await markDemoReadiness(board, async () => { throw new Error('gerbang tidak boleh dipanggil'); }, async () => new Set());
  assert.equal(board.rows[0].technicalReady, false);
});
