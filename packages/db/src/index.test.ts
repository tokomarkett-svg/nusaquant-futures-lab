import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DbConflictError,
  NusaQuantDb,
  filterCryptoFuturesUsdtSymbols,
  isCryptoFuturesUsdtSymbol,
} from './index.ts';
import { SCHEMA_SQL } from './schema-embed.ts';

const here = dirname(fileURLToPath(import.meta.url));

test('schema-embed.ts sinkron dengan schema.sql (jalankan npm run embed-schema bila gagal)', () => {
  const sql = readFileSync(join(here, 'schema.sql'), 'utf8');
  assert.equal(SCHEMA_SQL, sql);
});

function freshDb(): NusaQuantDb {
  return new NusaQuantDb(':memory:');
}

test('filter kripto: hanya simbol futures USDT kripto yang lolos', () => {
  assert.equal(isCryptoFuturesUsdtSymbol('BTCUSDT'), true);
  assert.equal(isCryptoFuturesUsdtSymbol('ETHUSDT'), true);
  assert.equal(isCryptoFuturesUsdtSymbol('1000PEPEUSDT'), true);
  assert.equal(isCryptoFuturesUsdtSymbol('btcusdt'), true); // dinormalisasi
  for (const bad of ['XAUUSDT', 'XAGUSDT', 'SOXLUSDT', 'NVDAUSDT', 'TSLAUSDT', 'AAPLUSDT',
    'BTCUSD', 'ETHBUSD', 'BTCUSDT_123', 'BTC-PERP', 'BTC/USDT', 'USDT', '']) {
    assert.equal(isCryptoFuturesUsdtSymbol(bad), false, `harusnya ditolak: ${bad}`);
  }
});

test('filter kripto: dedup + normalisasi daftar', () => {
  const out = filterCryptoFuturesUsdtSymbols(['BTCUSDT', 'btcusdt', 'XAUUSDT', 'ETHUSDT']);
  assert.deepEqual(out, ['BTCUSDT', 'ETHUSDT']);
});

test('market_candles: upsert idempoten dan latestCandleOpenTime', async () => {
  const db = freshDb();
  const rows = [
    { symbol: 'BTCUSDT', interval: '15m', open_time: '2026-09-30T00:00:00.000Z', open: 1, high: 2, low: 0.5, close: 1.5, volume: 10 },
    { symbol: 'BTCUSDT', interval: '15m', open_time: '2026-09-30T00:15:00.000Z', open: 1.5, high: 2.5, low: 1, close: 2, volume: 11 },
  ];
  assert.equal(await db.upsertMarketCandles(rows), 2);
  // upsert ulang dengan close berbeda -> update, bukan duplikat
  assert.equal(await db.upsertMarketCandles([{ ...rows[0], close: 9 }]), 1);
  assert.equal(await db.countMarketCandles(), 2);
  assert.equal(await db.latestCandleOpenTime('BTCUSDT', '15m'), '2026-09-30T00:15:00.000Z');
  const latest = await db.latestCandles('BTCUSDT', '15m', 10);
  assert.equal(latest[0].open_time, '2026-09-30T00:15:00.000Z');
  assert.equal(latest[1].close, 9);
  const asc = await db.latestCandles('BTCUSDT', '15m', 10, true);
  assert.equal(asc[0].open_time, '2026-09-30T00:00:00.000Z');
  db.close();
});

test('bot_sessions: ensure idempoten + update status kondisional', async () => {
  const db = freshDb();
  const first = await db.ensureBotSession({ id: 's1', name: 'meja', status: 'PAUSED' });
  assert.equal(first.status, 'PAUSED');
  const second = await db.ensureBotSession({ id: 's1', name: 'meja', status: 'RUNNING' });
  assert.equal(second.status, 'PAUSED'); // insert diabaikan, status lama dipertahankan
  const updated = await db.updateBotSessionStatus('s1', 'RUNNING', 'PAUSED');
  assert.equal(updated?.status, 'RUNNING');
  const missed = await db.updateBotSessionStatus('s1', 'PAUSED', 'PAUSED'); // ekspektasi salah
  assert.equal(missed, null);
  assert.equal((await db.getBotSession('s1'))?.status, 'RUNNING');
  await db.touchBotSession('s1', '2026-09-30T01:00:00.000Z');
  assert.equal((await db.getBotSession('nope')) , null);
  db.close();
});

test('signal_evaluations: insert + latest + struktur JSON bulat-balik', async () => {
  const db = freshDb();
  await db.ensureBotSession({ id: 's1' });
  const id = await db.insertSignalEvaluation({
    bot_session_id: 's1', symbol: 'BTCUSDT', decision: 'LONG', stage: 'TRIGGERED',
    evidence: { a: 1 }, blockers: ['x'], patterns: { p: true }, structure: { swingHigh: 5 },
    evaluated_at: '2026-09-30T00:10:00.000Z',
  });
  assert.match(id, /^[0-9a-f-]{36}$/);
  const latest = await db.latestSignal('s1', { symbol: 'BTCUSDT', stage: 'TRIGGERED', decisionIn: ['LONG', 'SHORT'] });
  assert.equal(latest?.decision, 'LONG');
  assert.deepEqual(latest?.evidence, { a: 1 });
  assert.deepEqual(latest?.blockers, ['x']);
  assert.equal(await db.countSignals('s1', 'BTCUSDT'), 1);
  assert.deepEqual(await db.latestSignalStructure('s1', 'BTCUSDT', '15m'), { swingHigh: 5 });
  assert.equal(await db.latestSignal('s1', { symbol: 'ETHUSDT' }), null);
  db.close();
});

test('paper_orders: upsert abaikan duplikat client_order_id', async () => {
  const db = freshDb();
  await db.ensureBotSession({ id: 's1' });
  const order = { bot_session_id: 's1', client_order_id: 'c1', symbol: 'BTCUSDT', side: 'LONG', quantity: 1, metadata: { mode: 'x' } };
  await db.upsertPaperOrder(order);
  await db.upsertPaperOrder(order); // tidak melempar, tidak duplikat
  db.close();
});

test('paper_positions: satu OPEN per sesi+simbol, tutup, riwayat', async () => {
  const db = freshDb();
  await db.ensureBotSession({ id: 's1' });
  const pos = await db.insertPaperPosition({
    bot_session_id: 's1', symbol: 'BTCUSDT', side: 'LONG',
    quantity: 1, entry_price: 100, stop_loss: 99, take_profit: 102,
    opened_at: '2026-09-30T00:00:00.000Z', metadata: { k: 'v' },
  });
  assert.match(pos.id, /^[0-9a-f-]{36}$/);
  assert.deepEqual(pos.metadata, { k: 'v' });
  await assert.rejects(
    () => db.insertPaperPosition({
      bot_session_id: 's1', symbol: 'BTCUSDT', side: 'SHORT',
      quantity: 1, entry_price: 100, stop_loss: 101, take_profit: 98,
    }),
    DbConflictError,
  );
  assert.equal((await db.getOpenPosition('s1', 'BTCUSDT'))?.id, pos.id);
  assert.equal((await db.listPositions('s1', { status: 'OPEN' })).length, 1);
  assert.equal((await db.listPositions('s1', { since: '2026-09-29T00:00:00.000Z' })).length, 1);
  await db.closeOpenPosition('s1', 'BTCUSDT', {
    exit_price: 103, realized_pnl: 3, close_reason: 'TP', closed_at: '2026-09-30T01:00:00.000Z',
  });
  assert.equal(await db.getOpenPosition('s1', 'BTCUSDT'), null);
  const closed = await db.listPositions('s1', { status: 'CLOSED' });
  assert.equal(closed.length, 1);
  assert.equal(closed[0].realized_pnl, 3);
  // setelah tutup, boleh buka lagi
  await db.insertPaperPosition({
    bot_session_id: 's1', symbol: 'BTCUSDT', side: 'LONG',
    quantity: 1, entry_price: 104, stop_loss: 103, take_profit: 106,
  });
  assert.equal((await db.listPositions('s1', { status: 'OPEN' })).length, 1);
  db.close();
});

test('equity_snapshots + trade_journal', async () => {
  const db = freshDb();
  await db.ensureBotSession({ id: 's1' });
  await db.insertEquitySnapshot({ bot_session_id: 's1', equity: 1000, realized_pnl: 5 });
  await db.insertEquitySnapshot({ bot_session_id: 's1', equity: 1003, realized_pnl: 8 });
  assert.equal((await db.latestEquity('s1'))?.equity, 1003);
  await db.insertJournal({ bot_session_id: 's1', symbol: 'BTCUSDT', action: 'PAPER_OPEN', payload: { n: 1 } });
  db.close();
});

test('research jobs: insert, klaim atomik, update', async () => {
  const db = freshDb();
  const job = await db.insertResearchJob({ symbol: 'BTCUSDT', metadata: { source: 'dashboard' } });
  assert.equal(job.status, 'QUEUED');
  assert.equal(job.progress, 0);
  assert.deepEqual(job.metadata, { source: 'dashboard' });
  assert.equal((await db.findActiveResearchJob('BTCUSDT'))?.id, job.id);
  assert.equal((await db.listResearchJobs(10)).length, 1);
  const claimed = await db.claimNextResearchJob();
  assert.equal(claimed?.id, job.id);
  assert.equal(claimed?.status, 'RUNNING');
  assert.ok(claimed?.started_at);
  await db.updateResearchJob(job.id, { status: 'COMPLETED', progress: 100, completed_at: new Date().toISOString(), result: { ok: true } });
  assert.equal(await db.claimNextResearchJob(), null);
  assert.equal(await db.findActiveResearchJob('BTCUSDT'), null);
  const done = (await db.listResearchJobs(10))[0];
  assert.equal(done.status, 'COMPLETED');
  assert.deepEqual(done.result, { ok: true });
  // simbol di luar BTC/ETH ditolak constraint
  await assert.rejects(() => db.insertResearchJob({ symbol: 'DOGEUSDT' }));
  db.close();
});

test('market_derivatives + market_metrics: upsert idempoten + paging', async () => {
  const db = freshDb();
  const funding = [
    { symbol: 'BTCUSDT', metric: 'FUNDING_RATE', event_time: '2026-09-30T00:00:00.000Z', funding_rate: 0.0001 },
    { symbol: 'BTCUSDT', metric: 'FUNDING_RATE', event_time: '2026-09-30T08:00:00.000Z', funding_rate: 0.0002 },
  ];
  assert.equal(await db.upsertDerivatives(funding), 2);
  assert.equal(await db.upsertDerivatives([{ ...funding[0], funding_rate: 0.0003 }]), 1);
  const page = await db.fundingPage('BTCUSDT', 0, 10);
  assert.equal(page.length, 2);
  assert.equal(page[0].funding_rate, 0.0003);
  const metric = (event_time: string, long_short_ratio: number) => ({
    symbol: 'BTCUSDT', event_time,
    open_interest: 100, open_interest_value: 200,
    top_trader_long_short_ratio: 1.2, top_trader_long_short_position_ratio: 1.3,
    long_short_ratio, taker_long_short_volume_ratio: 1.1,
  });
  const metrics = [metric('2026-09-30T00:00:00.000Z', 1.5), metric('2026-09-30T00:05:00.000Z', 1.6)];
  assert.equal(await db.upsertMetrics(metrics), 2);
  assert.equal(await db.upsertMetrics([metric('2026-09-30T00:00:00.000Z', 1.7)]), 1);
  const mpage = await db.metricsPage('BTCUSDT', 0, 10);
  assert.equal(mpage.length, 2);
  assert.equal(mpage[0].long_short_ratio, 1.7);
  assert.equal(mpage[0].open_interest, 100);
  db.close();
});

test('market_radar: upsert + list terurut', async () => {
  const db = freshDb();
  await db.upsertRadar([
    { symbol: 'ETHUSDT', last_price: 3000, touched: 'LONG' },
    { symbol: 'BTCUSDT', last_price: 90000, touched: null },
  ]);
  await db.upsertRadar([{ symbol: 'BTCUSDT', last_price: 91000, touched: 'SHORT' }]);
  const rows = await db.listRadar();
  assert.deepEqual(rows.map((r) => r.symbol), ['BTCUSDT', 'ETHUSDT']);
  assert.equal(rows[0].last_price, 91000);
  assert.equal(rows[0].touched, 'SHORT');
  db.close();
});

test('manual approvals: satu tak-terselesaikan per mode + setup_key unik', async () => {
  const db = freshDb();
  const first = await db.insertApproval({
    mode: 'TESTNET', setup_key: 'k1', symbol: 'BTCUSDT', side: 'LONG',
    operator_id: 'operator', note: 'tiket #1',
  });
  assert.equal(first.status, 'RESERVED');
  assert.equal(first.note, 'tiket #1');
  // setup_key sama -> konflik
  await assert.rejects(
    () => db.insertApproval({ mode: 'TESTNET', setup_key: 'k1', symbol: 'ETHUSDT', side: 'SHORT', operator_id: 'operator' }),
    DbConflictError,
  );
  // mode sama masih RESERVED -> konflik walau setup_key beda
  await assert.rejects(
    () => db.insertApproval({ mode: 'TESTNET', setup_key: 'k2', symbol: 'ETHUSDT', side: 'SHORT', operator_id: 'operator' }),
    DbConflictError,
  );
  // mode lain boleh
  await db.insertApproval({ mode: 'LIVE', setup_key: 'k1', symbol: 'BTCUSDT', side: 'LONG', operator_id: 'operator' });
  assert.equal((await db.findUnresolvedApproval('TESTNET'))?.setup_key, 'k1');
  await db.updateApproval(first.id, { status: 'VERIFIED', note: 'ok', exchange_entry_id: 'e1', exchange_sl_id: 's1', exchange_tp_id: 't1' });
  const verified = await db.findUnresolvedApproval('TESTNET');
  assert.equal(verified, null);
  // setelah selesai, setup_key baru boleh lagi
  const second = await db.insertApproval({
    mode: 'TESTNET', setup_key: 'k2', symbol: 'ETHUSDT', side: 'SHORT', operator_id: 'operator',
  });
  assert.equal(second.status, 'RESERVED');
  db.close();
});

test('trigger updated_at berjalan tanpa rekursi', async () => {
  const db = freshDb();
  await db.ensureBotSession({ id: 's1' });
  const before = (await db.getBotSession('s1'))?.updated_at ?? '';
  await new Promise((r) => setTimeout(r, 5));
  await db.updateBotSessionStatus('s1', 'RUNNING', 'PAUSED');
  const after = (await db.getBotSession('s1'))?.updated_at ?? '';
  assert.ok(after >= before);
  db.close();
});
