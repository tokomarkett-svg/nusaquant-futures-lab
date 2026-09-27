import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { replayChampionHistory } from './champion-history-replay.ts';

const DAY = 86_400_000;
function fixture(root: string, date: string, tamper = false) {
  const start = Date.parse(`${date}T00:00:00Z`);
  const lines = Array.from({ length: 288 }, (_, i) => JSON.stringify({
    symbol: 'BTCUSDT', start: start + i * 300_000, end: start + (i + 1) * 300_000,
    trades: [{ id: i + 1, time: start + i * 300_000 + 1000, price: 100,
      quantity: 1, buyerIsMaker: true }],
  })).join('\n') + '\n';
  const body = gzipSync(lines);
  const stem = join(root, `BTCUSDT-5m-${date}`);
  writeFileSync(`${stem}.jsonl.gz`, tamper ? Buffer.concat([body, Buffer.from('tamper')]) : body);
  writeFileSync(`${stem}.meta.json`, JSON.stringify({
    source: 'Binance USD-M daily aggTrades SHA256 verified', symbol: 'BTCUSDT', date,
    start, end: start + DAY, windows: 288, trades: 288,
    sha256: createHash('sha256').update(body).digest('hex'),
  }));
}

test('offline runner membaca semua profil hari berurutan; belum ada kandidat tanpa warmup; tamper fail closed', async () => {
  const root = mkdtempSync(join(tmpdir(), 'champion-replay-'));
  try {
    fixture(root, '2026-09-20');
    fixture(root, '2026-09-21');
    const result = await replayChampionHistory({ cache: root, symbol: 'BTCUSDT',
      firstDay: '2026-09-20', lastDay: '2026-09-21', tickSize: 1 });
    assert.equal(result.ready, false);
    assert.equal(result.windows, 576);
    assert.equal(result.candidateCount, 0);
    fixture(root, '2026-09-21', true);
    await assert.rejects(() => replayChampionHistory({ cache: root, symbol: 'BTCUSDT',
      firstDay: '2026-09-20', lastDay: '2026-09-21', tickSize: 1 }), /hash turunan archive/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
