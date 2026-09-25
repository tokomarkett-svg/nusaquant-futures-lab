import assert from 'node:assert/strict';
import test from 'node:test';
import type { Candle } from '@nusaquant/core';
import {
  candlesAfterEntry, consecutiveLossesOf, deskGuards, deskSetupKey, evaluateExit, processScore,
  runDeskCycle, startOfJakartaDay,
  type DeskPosition, type DeskStore,
} from './desk.ts';
import type { BinancePublicMarketDataClient } from './market-data.ts';

// ------------------------------------------------------------------ alat bantu

const STEP = 900_000;
/** Titik waktu candle 15m tertutup terakhir (dunia nyata, supaya pagar data segar lolos). */
const lastClosed = Math.floor(Date.now() / STEP) * STEP - STEP;

function quietCandle(time: number): Candle {
  return { time, open: 96.2, high: 96.4, low: 96.1, close: 96.3, volume: 1 };
}

/**
 * Rangkaian 15m yang menghasilkan paket sah:
 *  X (menusuk pintu 95,9) → candle 1 (buntut 7× badan, low di pita) → candle 2 (close di atas puncak 1).
 * Entry 96,85 · stop 95,00 · target 100,55 (2R).
 */
function seriesWithSetup(extra: Candle[] = []): Candle[] {
  const total = 40;
  const candles: Candle[] = [];
  for (let index = 0; index < total; index += 1) candles.push(quietCandle(lastClosed - (total - 1 - index) * STEP));
  candles[total - 4] = { time: lastClosed - 3 * STEP, open: 96.3, high: 96.4, low: 95.5, close: 96.25, volume: 1 };  // X
  candles[total - 3] = { time: lastClosed - 2 * STEP, open: 96.6, high: 96.8, low: 95.0, close: 96.4, volume: 1 };   // candle 1
  candles[total - 2] = { time: lastClosed - 1 * STEP, open: 96.45, high: 96.9, low: 96.4, close: 96.85, volume: 1 }; // candle 2
  candles[total - 1] = { time: lastClosed, open: 96.85, high: 96.95, low: 96.6, close: 96.8, volume: 1 };
  return [...candles.slice(0, total - 1), ...extra.length ? extra : [candles[total - 1]]];
}

function rising1h(): Candle[] {
  const total = 120;
  const out: Candle[] = [];
  for (let index = 0; index < total; index += 1) {
    const price = 80 + index * 0.15;
    out.push({ time: lastClosed - (total - index) * 3_600_000, open: price, high: price + 0.2, low: price - 0.2, close: price + 0.1, volume: 1 });
  }
  return out;
}

function makeMarket(candles15: Candle[], ticker = { symbol: 'TESTUSDT', last: 96.85, high: 110, low: 90, quoteVolume: 50_000_000 }) {
  return {
    get24hTickerDetails: async () => [ticker],
    getKlines: async ({ interval }: { interval: string }) => (interval === '1h' ? rising1h() : candles15),
  } as unknown as BinancePublicMarketDataClient;
}

function makeStore(initial: DeskPosition[] = []) {
  const positions = [...initial];
  const journalRows: Array<Record<string, unknown>> = [];
  let session = false;
  const store: DeskStore & { positions: DeskPosition[]; journalRows: Array<Record<string, unknown>> } = {
    positions,
    journalRows,
    async ensureSession() { session = true; },
    async positionsSince(dayStartIso) {
      return positions.filter((position) => position.openedAt >= dayStartIso);
    },
    async openPositions() {
      return positions.filter((position) => position.status === 'OPEN');
    },
    async openPosition(input) {
      const created: DeskPosition = {
        id: `p${positions.length + 1}`,
        symbol: input.symbol, side: input.side, status: 'OPEN', quantity: input.sizeCoin,
        entry: input.entry, stop: input.stop, target: input.target,
        exitPrice: null, realizedPnl: null, closeReason: null,
        openedAt: input.openedAt, closedAt: null, metadata: input.metadata,
      };
      positions.push(created);
      assert.ok(session, 'ensureSession harus dipanggil sebelum menulis posisi');
      return created;
    },
    async closePosition(id, input) {
      const found = positions.find((position) => position.id === id);
      if (!found) throw new Error(`posisi ${id} tidak ditemukan`);
      found.status = 'CLOSED';
      found.exitPrice = input.exitPrice;
      found.realizedPnl = input.realizedPnl;
      found.closeReason = input.closeReason;
      found.closedAt = input.closedAt;
    },
    async journal(input) {
      // meniru kolom tabel trade_journal (snake_case) supaya tes mencerminkan isi database
      journalRows.push({
        symbol: input.symbol, action: input.action, reason: input.reason,
        quality_score: input.qualityScore, payload: input.payload,
      });
    },
  };
  return store;
}

function openPositionFixture(overrides: Partial<DeskPosition> = {}): DeskPosition {
  return {
    id: 'p-fix', symbol: 'TESTUSDT', side: 'LONG', status: 'OPEN', quantity: 0.1676,
    entry: 96.85, stop: 95.0, target: 100.55,
    exitPrice: null, realizedPnl: null, closeReason: null,
    openedAt: new Date(lastClosed + STEP).toISOString(), closedAt: null,
    metadata: { source: 'MEJA_PAPAN', setupKey: 'TESTUSDT:LONG:0', processScore: 6 },
    ...overrides,
  };
}

// ------------------------------------------------------------------ logika murni

test('evaluateExit: target kena lebih dulu → +2R', () => {
  const candles: Candle[] = [{ time: lastClosed + STEP, open: 96.9, high: 100.6, low: 96.8, close: 100.0, volume: 1 }];
  const result = evaluateExit(openPositionFixture(), candles);
  assert.equal(result.outcome, 'TP');
  assert.equal(result.exitPrice, 100.55);
  assert.ok(Math.abs((result.r ?? 0) - 2) < 1e-9);
});

test('evaluateExit: stop kena → −1R', () => {
  const candles: Candle[] = [{ time: lastClosed + STEP, open: 96.8, high: 96.9, low: 94.5, close: 95.5, volume: 1 }];
  const result = evaluateExit(openPositionFixture(), candles);
  assert.equal(result.outcome, 'SL');
  assert.equal(result.exitPrice, 95.0);
  assert.equal(result.r, -1);
});

test('evaluateExit: satu candle menyentuh SL & TP → dianggap SL (konservatif)', () => {
  const candles: Candle[] = [{ time: lastClosed + STEP, open: 96.9, high: 100.6, low: 94.5, close: 98.0, volume: 1 }];
  const result = evaluateExit(openPositionFixture(), candles);
  assert.equal(result.outcome, 'SL');
  assert.match(result.note, /konservatif/);
});

test('evaluateExit: tidak menyentuh apa pun sampai batas waktu → TIMEOUT di harga terakhir', () => {
  const candles: Candle[] = [
    { time: lastClosed + STEP, open: 96.9, high: 97.0, low: 96.5, close: 96.8, volume: 1 },
    { time: lastClosed + 2 * STEP, open: 96.8, high: 97.2, low: 96.6, close: 97.0, volume: 1 },
  ];
  const result = evaluateExit(openPositionFixture(), candles, { timeoutBars: 2 });
  assert.equal(result.outcome, 'TIMEOUT');
  assert.equal(result.exitPrice, 97.0);
  assert.ok((result.r ?? 0) > 0);
});

test('candlesAfterEntry melewati candle parsial (tidak ada fill palsu)', () => {
  const openedAt = lastClosed + STEP;
  const candles: Candle[] = [
    { time: lastClosed, open: 96.8, high: 97.0, low: 94.0, close: 95.0, volume: 1 },           // sebelum entry → diabaikan
    { time: lastClosed + STEP, open: 96.9, high: 97.1, low: 96.7, close: 97.0, volume: 1 },    // candle pertama setelah entry
  ];
  const after = candlesAfterEntry(candles, openedAt);
  assert.equal(after.length, 1);
  assert.equal(after[0].time, lastClosed + STEP);
});

test('deskGuards: maksimal 2 trade/hari, 2 loss beruntun, satu posisi per coin', () => {
  assert.equal(deskGuards({ openedToday: 0, consecutiveLosses: 0, openSymbols: [], symbol: 'AAAUSDT' }).canOpen, true);
  assert.match(deskGuards({ openedToday: 2, consecutiveLosses: 0, openSymbols: [], symbol: 'AAAUSDT' }).reason ?? '', /2 trade hari ini/);
  assert.match(deskGuards({ openedToday: 1, consecutiveLosses: 2, openSymbols: [], symbol: 'AAAUSDT' }).reason ?? '', /loss beruntun/);
  assert.match(deskGuards({ openedToday: 1, consecutiveLosses: 0, openSymbols: ['AAAUSDT'], symbol: 'AAAUSDT' }).reason ?? '', /sudah ada posisi/);
});

test('consecutiveLossesOf menghitung rentetan dari yang terakhir', () => {
  const rows = [
    { status: 'CLOSED' as const, realizedPnl: 0.62, closedAt: '2026-09-25T01:00:00Z' },
    { status: 'CLOSED' as const, realizedPnl: -0.31, closedAt: '2026-09-25T02:00:00Z' },
    { status: 'CLOSED' as const, realizedPnl: -0.31, closedAt: '2026-09-25T03:00:00Z' },
    { status: 'OPEN' as const, realizedPnl: null, closedAt: null },
  ];
  assert.equal(consecutiveLossesOf(rows), 2);
});

test('nilai proses: tiket siap gate searah = 6/6', () => {
  const ready = {
    side: 'LONG' as const, x: 1, candle1: 2, candle2: 3, staleBars: 1, valid: true, notes: [],
    entry: 96.85, stop: 95.0, riskDistance: 1.85,
  };
  assert.equal(processScore(ready, true), 6);
  assert.equal(processScore({ ...ready, candle2: null, entry: null, stop: null, riskDistance: null }, true), 4);
  assert.equal(processScore({ ...ready, candle2: null, entry: null, stop: null, riskDistance: null }, false), 3);
});

test('hari Jakarta dimulai 17:00 UTC (tengah malam WIB)', () => {
  const start = startOfJakartaDay(Date.parse('2026-09-25T01:00:00Z'));
  assert.equal(new Date(start).toISOString(), '2026-09-24T17:00:00.000Z');
});

// ------------------------------------------------------------------ siklus penuh (store & pasar palsu)

test('siklus: tiket siap gate searah → posisi paper dibuka + jurnal 6/6 + pesan', async () => {
  const store = makeStore();
  const messages: string[] = [];
  const result = await runDeskCycle({
    store,
    market: makeMarket(seriesWithSetup()),
    notify: async (text) => { messages.push(text); },
  });
  assert.equal(result.opened, 1);
  assert.equal(store.positions.length, 1);
  const position = store.positions[0];
  assert.equal(position.symbol, 'TESTUSDT');
  assert.equal(position.side, 'LONG');
  assert.equal(position.entry, 96.85);
  // profil v3: stop = garis batal zona fixture (bukan lagi buntut candle 1)
  assert.ok(Math.abs(position.stop - 92.28) < 1e-9, `stop v3 meleset: ${position.stop}`);
  assert.ok(Math.abs(position.target - 105.99) < 0.02, `target v3 meleset: ${position.target}`);
  assert.equal(position.metadata.source, 'MEJA_PAPAN');
  assert.equal(position.metadata.processScore, 6);

  const openJournal = store.journalRows.find((row) => row.action === 'DESK_OPEN');
  assert.ok(openJournal, 'jurnal DESK_OPEN harus ada');
  assert.equal(openJournal?.quality_score, 6);
  assert.match(messages.join('\n'), /POSISI PAPER DIBUKA/);

  // siklus kedua dengan setup yang sama → tidak dobel
  const second = await runDeskCycle({
    store,
    market: makeMarket(seriesWithSetup()),
    notify: async (text) => { messages.push(text); },
  });
  assert.equal(second.opened, 0);
  assert.equal(store.positions.length, 1);
});

test('siklus: pagar 2 trade/hari menahan entry ketiga + pesan sekali saja', async () => {
  const day = new Date(Date.now()).toISOString();
  const existing: DeskPosition[] = [1, 2].map((n) => openPositionFixture({
    id: `p${n}`, status: 'CLOSED', realizedPnl: 0.62, closedAt: day,
    metadata: { source: 'MEJA_PAPAN', setupKey: `OLD:LONG:${n}`, processScore: 6 },
  }));
  const store = makeStore(existing);
  const messages: string[] = [];
  const announced = new Set<string>();
  const first = await runDeskCycle({ store, market: makeMarket(seriesWithSetup()), notify: async (t) => { messages.push(t); }, announcedGuards: announced });
  const second = await runDeskCycle({ store, market: makeMarket(seriesWithSetup()), notify: async (t) => { messages.push(t); }, announcedGuards: announced });
  assert.equal(first.opened, 0);
  assert.equal(second.opened, 0);
  assert.match(first.skipped[0].reason ?? '', /2 trade hari ini/);
  assert.equal(messages.filter((m) => m.includes('MEJA PAPAN ISTIRAHAT')).length, 1, 'pesan pagar tidak diulang-ulang');
});

test('siklus: posisi terbuka kena TP → ditutup +2R, jurnal DESK_CLOSE, pesan ✅', async () => {
  const position = openPositionFixture();
  const store = makeStore([position]);
  const messages: string[] = [];
  const tpCandles = seriesWithSetup([{ time: lastClosed + STEP, open: 96.9, high: 100.6, low: 96.8, close: 100.0, volume: 1 }]);
  const result = await runDeskCycle({
    store,
    market: makeMarket(tpCandles),
    notify: async (text) => { messages.push(text); },
  });
  assert.equal(result.closed, 1);
  const closed = store.positions[0];
  assert.equal(closed.status, 'CLOSED');
  assert.equal(closed.closeReason, 'TP');
  assert.ok(Math.abs((closed.realizedPnl ?? 0) - 0.62) < 1e-9);
  assert.match(messages.join('\n'), /TARGET KENA/);
  const closeJournal = store.journalRows.find((row) => row.action === 'DESK_CLOSE');
  assert.ok(closeJournal);
  assert.match(String(closeJournal?.reason), /TP/);
});

test('siklus: posisi terbuka kena SL → −1R dan tercatat di jurnal', async () => {
  const store = makeStore([openPositionFixture()]);
  const messages: string[] = [];
  const slCandles = seriesWithSetup([{ time: lastClosed + STEP, open: 96.8, high: 96.9, low: 94.5, close: 95.5, volume: 1 }]);
  const result = await runDeskCycle({ store, market: makeMarket(slCandles), notify: async (text) => { messages.push(text); } });
  assert.equal(result.closed, 1);
  assert.equal(store.positions[0].closeReason, 'SL');
  assert.ok(Math.abs((store.positions[0].realizedPnl ?? 0) + 0.31) < 1e-9);
  assert.match(messages.join('\n'), /STOP KENA/);
});

test('kunci setup: symbol + arah + waktu candle 2 (tidak ada dobel untuk setup yang sama)', () => {
  assert.equal(deskSetupKey('RUNEUSDT', 'LONG', 1_790_301_600_000), 'RUNEUSDT:LONG:1790301600000');
  assert.notEqual(deskSetupKey('RUNEUSDT', 'LONG', 1), deskSetupKey('RUNEUSDT', 'LONG', 2));
});
