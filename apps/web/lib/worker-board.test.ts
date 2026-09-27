import test from 'node:test';
import assert from 'node:assert/strict';
import { scanBoardFromWorker } from './worker-board';
import { markDemoReadiness } from './board-readiness';

test('app menampilkan seluruh ticker Futures tetapi hanya kandidat dari scanner bersama yang siap', async () => {
  const c2 = Math.floor(Date.now() / 900_000) * 900_000 - 900_000;
  const symbol = 'PHAROSUSDT';
  const opts = {
    workerUrl: 'https://worker.example.test',
    getTickers: async () => [
      { symbol, last: 100, high: 140, low: 80, quoteVolume: 8_000_000 },
      { symbol: 'NOMUSDT', last: 1, high: 1.2, low: .9, quoteVolume: 1_000_000 },
      { symbol: 'BTCUSDT', last: 101, high: 111, low: 91, quoteVolume: 30_000_000 },
    ],
    fetchImpl: (async () => ({ ok: true, json: async () => ({ ok: true, market: 'FUTURES', at: new Date().toISOString(),
      rows: [{ symbol, side: 'LONG', price: 100, gate: 'HIJAU', gateAlign: true, siap: true,
        ageMin: 2, scannedAt: Date.now(), zones: { high: 140, low: 80, range: 60, rangePct: 60,
          long: { pintu: 97.7, manis: 92.84, batal: 86.84 }, short: { pintu: 122.3, manis: 127.16, batal: 133.16 } },
        setup: { x: c2 - 2 * 900_000, candle1: c2 - 900_000, candle2: c2, valid: true, notes: [] },
        ticket: { actionable: true, entry: 100, stop: 99, target: 102 }, quoteVolume: 8_000_000,
        rangePct: 60, jenis: 'kripto' }],
    }) }) as Response) as typeof fetch,
  };
  const board = await scanBoardFromWorker(opts);
  assert.equal(board.funnel.scanned, 3);
  assert.equal(board.rows.length, 3, 'low-volume NOM and other futures are still visible');
  assert.equal(board.rows.find((r) => r.symbol === 'NOMUSDT')?.status, 'DISIMAK');
  assert.equal(board.rows.find((r) => r.symbol === symbol)?.technicalReady, false, 'PMB no longer authoritative');
  const row = board.rows.find((r) => r.symbol === symbol)!;
  await markDemoReadiness(board, async () => ({ symbol, side: 'LONG', setupKey: `${symbol}:LONG:${c2}`,
    expiresAt: new Date(Date.now() + 900_000).toISOString(), entry: 100, stop: 99, target: 102,
    qty: .31, riskUsdt: .31 }), async () => new Set(['BTCUSDT']));
  assert.equal(row.technicalReady, false);
  assert.equal(row.demoReady, false, 'sinyal PHAROS tampil tetapi tidak boleh order Demo');
});
