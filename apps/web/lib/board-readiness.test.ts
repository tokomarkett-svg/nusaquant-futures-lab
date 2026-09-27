import test from 'node:test';
import assert from 'node:assert/strict';
import { markDemoReadiness } from './board-readiness';
import type { Board } from './binance';

function fixture(): Board {
  const candle2 = Math.floor(Date.now() / 900_000) * 900_000 - 900_000;
  return { market: 'FUTURES', at: new Date().toISOString(),
    funnel: { scanned: 1, liquid: 1, rangeOk: 1, board: 1, staleDropped: 0 },
    rows: [{ symbol: 'BTCUSDT', side: 'LONG', status: 'MENYALA', gateAlign: true, dataAgeMin: 1,
      setup: { x: candle2 - 2 * 900_000, candle1: candle2 - 900_000, candle2, valid: true, note: null },
      ticket: { actionable: true, entry: 101, stop: 99, target: 105 } } as Board['rows'][number]],
  };
}

test('app SIAP hanya jika pemeriksaan Demo kanonis memvalidasi setup dan harga identik', async () => {
  const board = fixture();
  const row = board.rows[0];
  const ready = async () => ({ symbol: row.symbol, side: row.side, setupKey: `${row.symbol}:${row.side}:${row.setup.candle2}`,
    expiresAt: new Date(Date.now() + 900_000).toISOString(), entry: 101, stop: 99, target: 105, qty: .31, riskUsdt: .31 });
  await markDemoReadiness(board, ready);
  assert.equal(row.demoReady, true);
  await markDemoReadiness(board, async () => ({ ...await ready(), setupKey: 'stale' }));
  assert.equal(row.demoReady, false);
  await markDemoReadiness(board, async () => ({ ...await ready(), stop: 98 }));
  assert.equal(row.demoReady, false);
  await markDemoReadiness(board, async () => { throw new Error('Testnet PENDING_TRADING / tidak tersedia'); });
  assert.equal(row.demoReady, false);
  board.market = 'SPOT';
  await markDemoReadiness(board, ready);
  assert.equal(row.demoReady, false);
});
