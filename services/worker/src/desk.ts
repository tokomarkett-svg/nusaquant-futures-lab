/**
 * MEJA PAPAN — eksekutor paper otomatis untuk sistem Pintu–Manis–Batal.
 *
 * Alur: pindai pasar → temukan tiket SIAP (gate searah, harga belum lari) → buka posisi PAPER
 * → awasi candle → tutup di SL/TP → catat jurnal (nilai proses 6/6) → kabari lewat Telegram.
 *
 * Pagar yang dijaga mesin ini (sama dengan buku aturan murid):
 *  · 1 posisi terbuka sekaligus per coin
 *  · maksimal 2 trade per hari
 *  · 2 loss beruntun = meja tutup sampai besok
 *  · risiko 1% (0,31 USDT) per trade, target 2R
 *  · tidak dikejar: hanya tiket yang actionable (harga belum jalan >0,5R)
 *
 * UANG SUNGGUHAN TIDAK PERNAH DISENTUH DI SINI. Semua tulisan hanya ke tabel paper_*.
 */

import {
  detectSetup, computeTicket, gateFromCandles, distanceToPintu, RISK_USDT, TOUCH_EXPIRY_CANDLES,
  type Candle, type SetupMarkers, type Side, type Ticket, type Zones,
} from '@nusaquant/core';
import { BinancePublicMarketDataClient, scanMarketClient } from './market-data.ts';
import { discoverChatFromUpdates, scanAlertCandidates, sendTelegram } from './alerts.ts';
import { tutupDemo } from './exec-demo.ts';
import { createWorkerSupabaseClient } from './supabase.ts';

export const DESK_SESSION_ID = process.env.DESK_SESSION_ID ?? '00000000-0000-4000-8000-000000000010';
export const DESK_SESSION_NAME = 'Meja Papan (Pintu–Manis–Batal)';
export const MAX_TRADES_PER_DAY = 2;
export const MAX_CONSECUTIVE_LOSSES = 2;
/** Posisi yang tidak menyentuh SL/TP dalam 48 jam (192 candle 15m) ditutup di harga terakhir. */
export const TIMEOUT_BARS = 192;

export type DeskPosition = {
  id: string;
  symbol: string;
  side: Side;
  status: 'OPEN' | 'CLOSED';
  quantity: number;
  entry: number;
  stop: number;
  target: number;
  exitPrice: number | null;
  realizedPnl: number | null;
  closeReason: string | null;
  openedAt: string;
  closedAt: string | null;
  metadata: Record<string, unknown>;
};

export type ExitOutcome = 'OPEN' | 'TP' | 'SL' | 'TIMEOUT';
export type ExitEvaluation = { outcome: ExitOutcome; exitPrice: number | null; r: number | null; barsHeld: number; note: string };

// ---------------------------------------------------------------- logika murni (bisa diuji)

export function deskSetupKey(symbol: string, side: Side, candle2Time: number | null): string {
  return candle2Time === null ? `${symbol}:${side}:UNKNOWN` : `${symbol}:${side}:${candle2Time}`;
}

export function processScore(setup: SetupMarkers, gateAlign: boolean): number {
  let score = 0;
  if (gateAlign) score += 1;
  score += 1; // zona: selalu valid kalau anchor High/Low 24 jam terukur
  if (setup.x !== null) score += 1;
  if (setup.candle1 !== null) score += 1;
  if (setup.candle2 !== null) score += 1;
  if (setup.entry !== null && setup.stop !== null && setup.riskDistance) score += 1;
  return score;
}

/**
 * Evaluasi keluar posisi dari candle-candle SESUDAH entry.
 * Konservatif: kalau satu candle menyentuh SL dan TP sekaligus → dianggap SL yang kena lebih dulu.
 */
export function evaluateExit(
  position: Pick<DeskPosition, 'side' | 'entry' | 'stop' | 'target'>,
  candlesAfterEntry: Candle[],
  options: { timeoutBars?: number } = {},
): ExitEvaluation {
  const timeoutBars = options.timeoutBars ?? TIMEOUT_BARS;
  const risk = Math.abs(position.entry - position.stop);
  const direction = position.side === 'LONG' ? 1 : -1;
  if (!(risk > 0)) return { outcome: 'OPEN', exitPrice: null, r: null, barsHeld: 0, note: 'jarak risiko nol — posisi tidak bisa dievaluasi' };

  for (let index = 0; index < candlesAfterEntry.length; index += 1) {
    const candle = candlesAfterEntry[index];
    const hitStop = position.side === 'LONG' ? candle.low <= position.stop : candle.high >= position.stop;
    const hitTarget = position.side === 'LONG' ? candle.high >= position.target : candle.low <= position.target;
    if (hitStop) {
      return { outcome: 'SL', exitPrice: position.stop, r: -1, barsHeld: index + 1, note: 'stop kena lebih dulu (asumsi konservatif bila satu candle menyentuh keduanya)' };
    }
    if (hitTarget) {
      return { outcome: 'TP', exitPrice: position.target, r: (position.target - position.entry) / risk * direction, barsHeld: index + 1, note: 'target kena' };
    }
  }

  if (candlesAfterEntry.length >= timeoutBars) {
    const last = candlesAfterEntry.at(-1)!;
    return {
      outcome: 'TIMEOUT',
      exitPrice: last.close,
      r: ((last.close - position.entry) / risk) * direction,
      barsHeld: candlesAfterEntry.length,
      note: `tidak menyentuh SL/TP dalam ${timeoutBars} candle — ditutup di harga terakhir`,
    };
  }
  return { outcome: 'OPEN', exitPrice: null, r: null, barsHeld: candlesAfterEntry.length, note: 'masih berjalan' };
}

export type DeskGuards = { canOpen: boolean; reason: string | null };
export type DeskLimits = { maxTradesPerDay: number; maxConsecutiveLosses: number };

export function deskGuards(
  input: { openedToday: number; consecutiveLosses: number; openSymbols: string[]; symbol: string },
  limits: DeskLimits = { maxTradesPerDay: MAX_TRADES_PER_DAY, maxConsecutiveLosses: MAX_CONSECUTIVE_LOSSES },
): DeskGuards {
  if (input.openSymbols.includes(input.symbol)) {
    return { canOpen: false, reason: `sudah ada posisi paper terbuka di ${input.symbol}` };
  }
  if (input.consecutiveLosses >= limits.maxConsecutiveLosses) {
    return { canOpen: false, reason: `${limits.maxConsecutiveLosses} loss beruntun hari ini — meja tutup sampai besok` };
  }
  if (input.openedToday >= limits.maxTradesPerDay) {
    return { canOpen: false, reason: `sudah ${limits.maxTradesPerDay} trade hari ini — meja tutup sampai besok` };
  }
  return { canOpen: true, reason: null };
}

/** Awal hari menurut zona waktu WIB (Asia/Jakarta) — pagar harian mengikuti hari murid, bukan UTC. */
export function startOfJakartaDay(now = Date.now()): number {
  const offsetMs = 7 * 3_600_000;
  const local = new Date(now + offsetMs);
  local.setUTCHours(0, 0, 0, 0);
  return local.getTime() - offsetMs;
}

/** Candle yang sepenuhnya terjadi SETELAH entry (candle parsial dilewati, supaya tidak ada fill palsu). */
export function candlesAfterEntry(candles: Candle[], openedAtMs: number, intervalMs = 900_000): Candle[] {
  const startMs = Math.ceil(openedAtMs / intervalMs) * intervalMs;
  return candles.filter((candle) => candle.time >= startMs);
}

export function consecutiveLossesOf(positions: Array<Pick<DeskPosition, 'realizedPnl' | 'status' | 'closedAt'>>): number {
  const closed = positions
    .filter((position) => position.status === 'CLOSED' && position.closedAt !== null)
    .sort((a, b) => String(a.closedAt).localeCompare(String(b.closedAt)));
  let streak = 0;
  for (let index = closed.length - 1; index >= 0; index -= 1) {
    const pnl = closed[index].realizedPnl ?? 0;
    if (pnl < 0) streak += 1;
    else break;
  }
  return streak;
}

// ---------------------------------------------------------------- pesan Telegram

const digitsFor = (price: number) => (price >= 100 ? 2 : price >= 1 ? 4 : price >= 0.01 ? 5 : 7);

export function buildDeskOpenText(input: {
  symbol: string; side: Side; entry: number; stop: number; target: number; sizeCoin: number; processScore: number;
}): string {
  const digits = digitsFor(input.entry);
  return [
    `📄 <b>POSISI PAPER DIBUKA — ${input.symbol}</b>`,
    `${input.side} · gate searah ✔ · nilai proses ${input.processScore}/6`,
    '',
    `Entry  : <b>${input.entry.toFixed(digits)}</b>`,
    `Stop   : ${input.stop.toFixed(digits)}`,
    `Target : ${input.target.toFixed(digits)}  (2R)`,
    `Ukuran : ${input.sizeCoin.toLocaleString('id-ID', { maximumFractionDigits: 4 })} coin`,
    '',
    'Ini posisi PAPER (uang demo). Tidak ada order asli dikirim ke Binance.',
  ].join('\n');
}

export function buildDeskCloseText(input: {
  symbol: string; side: Side; outcome: ExitOutcome; r: number; realizedPnl: number; tradesToday: number; rToday: number;
}): string {
  const emoji = input.outcome === 'TP' ? '✅' : input.outcome === 'SL' ? '❌' : '⏱';
  const label = input.outcome === 'TP' ? 'TARGET KENA (+2R)' : input.outcome === 'SL' ? 'STOP KENA (−1R)' : 'DITUTUP (BATAS WAKTU)';
  return [
    `${emoji} <b>${label} — ${input.symbol}</b>`,
    `${input.side} · hasil ${input.r >= 0 ? '+' : ''}${input.r.toFixed(2)}R (${input.realizedPnl >= 0 ? '+' : ''}${input.realizedPnl.toFixed(2)} USDT paper)`,
    '',
    `Hari ini: ${input.tradesToday} trade · total ${input.rToday >= 0 ? '+' : ''}${input.rToday.toFixed(2)}R`,
    input.rToday <= -2 ? '🛑 Dua loss beruntun tercapai — meja tutup sampai besok.' : 'Jurnal otomatis sudah diperbarui.',
  ].join('\n');
}

export function buildDeskGuardText(reason: string): string {
  return [`🛑 <b>MEJA PAPAN ISTIRAHAT</b>`, reason, '', 'Pagar harian menjaga modal — bukan kerusakan, memang aturannya.'].join('\n');
}

// ---------------------------------------------------------------- store (Supabase / fake untuk tes)

export interface DeskStore {
  ensureSession(): Promise<void>;
  positionsSince(dayStartIso: string): Promise<DeskPosition[]>;
  openPositions(): Promise<DeskPosition[]>;
  openPosition(input: {
    symbol: string; side: Side; entry: number; stop: number; target: number; sizeCoin: number;
    openedAt: string; metadata: Record<string, unknown>;
  }): Promise<DeskPosition>;
  closePosition(id: string, input: { exitPrice: number; realizedPnl: number; closeReason: string; closedAt: string }): Promise<void>;
  journal(input: { symbol: string; action: string; reason: string; qualityScore: number | null; payload: Record<string, unknown> }): Promise<void>;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function mapPosition(row: Record<string, any>): DeskPosition {
  return {
    id: String(row.id),
    symbol: String(row.symbol),
    side: row.side === 'SHORT' ? 'SHORT' : 'LONG',
    status: row.status === 'CLOSED' ? 'CLOSED' : 'OPEN',
    quantity: Number(row.quantity),
    entry: Number(row.entry_price),
    stop: Number(row.stop_loss),
    target: Number(row.take_profit),
    exitPrice: row.exit_price === null || row.exit_price === undefined ? null : Number(row.exit_price),
    realizedPnl: row.realized_pnl === null || row.realized_pnl === undefined ? null : Number(row.realized_pnl),
    closeReason: row.close_reason ?? null,
    openedAt: String(row.opened_at),
    closedAt: row.closed_at ?? null,
    metadata: (row.metadata ?? {}) as Record<string, unknown>,
  };
}

export function createSupabaseDeskStore(client = createWorkerSupabaseClient(), sessionId = DESK_SESSION_ID): DeskStore {
  const positions = () => client.from('paper_positions');
  return {
    async ensureSession() {
      const existing = await client.from('bot_sessions').select('id').eq('id', sessionId).maybeSingle();
      if (existing.error) throw new Error(`Gagal membaca sesi meja: ${existing.error.message}`);
      if (existing.data) return;
      const created = await client.from('bot_sessions').insert({
        id: sessionId,
        name: DESK_SESSION_NAME,
        status: 'RUNNING',
        mode: 'PAPER_AUTO',
        symbol: 'MULTI',
        risk_fraction: RISK_USDT / 31,
        daily_loss_limit: 0.02,
      });
      if (created.error && created.error.code !== '23505') throw new Error(`Gagal membuat sesi meja: ${created.error.message}`);
    },
    async positionsSince(dayStartIso) {
      const result = await positions().select('*').eq('bot_session_id', sessionId).gte('opened_at', dayStartIso).order('opened_at', { ascending: true });
      if (result.error) throw new Error(`Gagal membaca posisi meja: ${result.error.message}`);
      return (result.data ?? []).map(mapPosition);
    },
    async openPositions() {
      const result = await positions().select('*').eq('bot_session_id', sessionId).eq('status', 'OPEN');
      if (result.error) throw new Error(`Gagal membaca posisi terbuka: ${result.error.message}`);
      return (result.data ?? []).map(mapPosition);
    },
    async openPosition(input) {
      const result = await positions().insert({
        bot_session_id: sessionId,
        symbol: input.symbol,
        side: input.side,
        status: 'OPEN',
        quantity: input.sizeCoin,
        entry_price: input.entry,
        stop_loss: input.stop,
        take_profit: input.target,
        opened_at: input.openedAt,
        metadata: input.metadata,
      }).select('*').single();
      if (result.error) throw new Error(`Gagal membuka posisi paper: ${result.error.message}`);
      return mapPosition(result.data as Record<string, unknown>);
    },
    async closePosition(id, input) {
      const result = await positions().update({
        status: 'CLOSED',
        exit_price: input.exitPrice,
        realized_pnl: input.realizedPnl,
        close_reason: input.closeReason,
        closed_at: input.closedAt,
      }).eq('id', id);
      if (result.error) throw new Error(`Gagal menutup posisi paper: ${result.error.message}`);
    },
    async journal(input) {
      const result = await client.from('trade_journal').insert({
        bot_session_id: sessionId,
        symbol: input.symbol,
        action: input.action,
        reason: input.reason,
        quality_score: input.qualityScore,
        payload: input.payload,
      });
      if (result.error) throw new Error(`Gagal menulis jurnal: ${result.error.message}`);
    },
  };
}

// ---------------------------------------------------------------- store memori (dry run & tes)

export function createMemoryDeskStore(seed: DeskPosition[] = [], log: Array<Record<string, unknown>> = []): DeskStore & { positions: DeskPosition[]; log: Array<Record<string, unknown>> } {
  const positions = [...seed];
  let counter = positions.length;
  return {
    positions,
    log,
    async ensureSession() { log.push({ action: 'ENSURE_SESSION' }); },
    async positionsSince(dayStartIso) { return positions.filter((p) => p.openedAt >= dayStartIso); },
    async openPositions() { return positions.filter((p) => p.status === 'OPEN'); },
    async openPosition(input) {
      counter += 1;
      const created: DeskPosition = {
        id: `dry-${counter}`,
        symbol: input.symbol, side: input.side, status: 'OPEN', quantity: input.sizeCoin,
        entry: input.entry, stop: input.stop, target: input.target,
        exitPrice: null, realizedPnl: null, closeReason: null,
        openedAt: input.openedAt, closedAt: null, metadata: input.metadata,
      };
      positions.push(created);
      log.push({ action: 'OPEN', ...created });
      return created;
    },
    async closePosition(id, input) {
      const found = positions.find((p) => p.id === id);
      if (!found) return;
      found.status = 'CLOSED';
      found.exitPrice = input.exitPrice;
      found.realizedPnl = input.realizedPnl;
      found.closeReason = input.closeReason;
      found.closedAt = input.closedAt;
      log.push({ action: 'CLOSE', id, ...input });
    },
    async journal(input) { log.push({ ...input }); },
  };
}

// ---------------------------------------------------------------- siklus

export type DeskCycleDeps = {
  store: DeskStore;
  market: BinancePublicMarketDataClient;
  notify: (text: string) => Promise<unknown>;
  now?: number;
  limits?: DeskLimits;
  /** Batas pengiriman pesan pagar yang sama (anti-spam). */
  announcedGuards?: Set<string>;
};

export type DeskCycleResult = {
  scannedCandidates: number;
  readyTickets: number;
  opened: number;
  closed: number;
  skipped: Array<{ symbol: string; reason: string }>;
};

export async function runDeskCycle(deps: DeskCycleDeps): Promise<DeskCycleResult> {
  const now = deps.now ?? Date.now();
  const store = deps.store;
  const limits = deps.limits ?? { maxTradesPerDay: MAX_TRADES_PER_DAY, maxConsecutiveLosses: MAX_CONSECUTIVE_LOSSES };
  const announced = deps.announcedGuards ?? new Set<string>();
  await store.ensureSession();

  const dayStart = new Date(startOfJakartaDay(now)).toISOString();
  const today = await store.positionsSince(dayStart);
  const open = await store.openPositions();
  const result: DeskCycleResult = { scannedCandidates: 0, readyTickets: 0, opened: 0, closed: 0, skipped: [] };

  // 1) awasi posisi terbuka lebih dulu — inilah bagian yang menjaga modal.
  for (const position of open) {
    let candles: Awaited<ReturnType<typeof deps.market.getKlines>>;
    try {
      candles = await deps.market.getKlines({ symbol: position.symbol, interval: '15m', limit: 300 });
    } catch (error) {
      console.error(`[desk] data ${position.symbol} gagal — posisi dilewati siklus ini:`, error instanceof Error ? error.message : error);
      continue;
    }
    if (!candles.length) { console.error(`[desk] data ${position.symbol} kosong — dilewati`); continue; }
    const after = candlesAfterEntry(candles as Candle[], Date.parse(position.openedAt));
    const evaluation = evaluateExit(position, after);
    if (evaluation.outcome === 'OPEN' || evaluation.r === null || evaluation.exitPrice === null) continue;
    const realizedPnl = evaluation.r * RISK_USDT;
    const closedAt = new Date(now).toISOString();
    await store.closePosition(position.id, {
      exitPrice: evaluation.exitPrice,
      realizedPnl: Number(realizedPnl.toFixed(8)),
      closeReason: evaluation.outcome,
      closedAt,
    });
    if (position.metadata?.via === 'DEMO') {
      try {
        await tutupDemo(position.symbol);
      } catch (error) {
        console.error(`[desk] gagal menutup demo ${position.symbol} di testnet:`, error instanceof Error ? error.message : error);
      }
    }
    const afterClose = [...today.filter((p) => p.id !== position.id), { ...position, status: 'CLOSED' as const, realizedPnl, closedAt }];
    const rToday = afterClose.filter((p) => p.status === 'CLOSED').reduce((sum, p) => sum + (p.realizedPnl ?? 0), 0) / RISK_USDT;
    await store.journal({
      symbol: position.symbol,
      action: 'DESK_CLOSE',
      reason: `${evaluation.outcome} pada ${evaluation.exitPrice} — ${evaluation.r.toFixed(2)}R. ${evaluation.note}`,
      qualityScore: Number(position.metadata.processScore ?? 6),
      payload: {
        positionId: position.id, outcome: evaluation.outcome, exitPrice: evaluation.exitPrice, r: evaluation.r,
        realizedPnl, barsHeld: evaluation.barsHeld, setupKey: position.metadata.setupKey ?? null,
      },
    });
    await deps.notify(buildDeskCloseText({
      symbol: position.symbol, side: position.side, outcome: evaluation.outcome,
      r: evaluation.r, realizedPnl, tradesToday: afterClose.filter((p) => p.status === 'CLOSED').length, rToday,
    }));
    result.closed += 1;
  }

  // 2) cari tiket siap baru.
  const candidates = await scanAlertCandidates(deps.market);
  result.scannedCandidates = candidates.length;
  const ready = candidates.filter((row) => row.ticket !== null && row.ticket.actionable && row.gateAlign);
  result.readyTickets = ready.length;

  const openedTodayBefore = today.filter((p) => p.metadata.source === 'MEJA_PAPAN').length;
  let openedToday = openedTodayBefore;

  for (const candidate of ready) {
    const ticket = candidate.ticket as Ticket;
    const setupKey = deskSetupKey(candidate.symbol, candidate.side, candidate.setup.candle2 ?? null);
    const alreadyToday = today.some((p) => p.metadata.setupKey === setupKey);
    if (alreadyToday) continue;

    const openSymbols = [...open.map((p) => p.symbol)];
    const guards = deskGuards({ openedToday, consecutiveLosses: consecutiveLossesOf(today), openSymbols, symbol: candidate.symbol }, limits);
    if (!guards.canOpen) {
      result.skipped.push({ symbol: candidate.symbol, reason: guards.reason ?? 'ditolak pagar' });
      if (guards.reason && !announced.has(guards.reason)) {
        announced.add(guards.reason);
        await deps.notify(buildDeskGuardText(guards.reason));
      }
      continue;
    }

    const score = processScore(candidate.setup, candidate.gateAlign);
    const position = await store.openPosition({
      symbol: candidate.symbol,
      side: candidate.side,
      entry: ticket.entry,
      stop: ticket.stop,
      target: ticket.target,
      sizeCoin: Number(ticket.sizeCoin.toFixed(10)),
      openedAt: new Date(now).toISOString(),
      metadata: {
        source: 'MEJA_PAPAN',
        setupKey,
        processScore: score,
        gate: candidate.gate,
        gateAlign: candidate.gateAlign,
        riskUsdt: RISK_USDT,
        riskPct: Number(ticket.riskPct.toFixed(4)),
        rangePct: Number(candidate.rangePct.toFixed(3)),
        candle2Time: candidate.setup.candle2,
      },
    });
    await store.journal({
      symbol: candidate.symbol,
      action: 'DESK_OPEN',
      reason: `Tiket siap: ${candidate.side} entry ${ticket.entry} stop ${ticket.stop} target ${ticket.target} (${ticket.rr}R).`,
      qualityScore: score,
      payload: {
        positionId: position.id, setupKey, gate: candidate.gate, gateAlign: candidate.gateAlign,
        xTime: candidate.setup.x, candle1Time: candidate.setup.candle1, candle2Time: candidate.setup.candle2,
        riskDistance: ticket.riskDistance, sizeCoin: ticket.sizeCoin, warnings: ticket.warnings,
      },
    });
    await deps.notify(buildDeskOpenText({
      symbol: candidate.symbol, side: candidate.side, entry: ticket.entry, stop: ticket.stop,
      target: ticket.target, sizeCoin: ticket.sizeCoin, processScore: score,
    }));
    openSymbols.push(candidate.symbol);
    openedToday += 1;
    result.opened += 1;
  }

  return result;
}

export async function watchDesk(): Promise<void> {
  const pollMs = Math.max(Number(process.env.DESK_POLL_MS ?? 120_000), 60_000);
  let store: DeskStore;
  try {
    store = createSupabaseDeskStore();
  } catch (error) {
    console.error('[desk] tidak bisa menyiapkan penyimpanan:', error instanceof Error ? error.message : error);
    return;
  }
  // Futures dulu: posisi paper harus mengikuti pasar yang sama dengan chart murid.
  const market = scanMarketClient();
  let chatId = (process.env.TELEGRAM_CHAT_ID ?? '').trim() || undefined;
  // Sama seperti alerts: pakai chat yang benar-benar menyapa bot kalau token tersedia.
  if (process.env.TELEGRAM_BOT_TOKEN) {
    try {
      const discovered = await discoverChatFromUpdates();
      if (discovered) chatId = discovered.chatId;
    } catch {
      /* biarkan chat id dari env */
    }
  }
  const announcedGuard = new Set<string>();
  console.log(JSON.stringify({ desk: true, watch: true, pollMs, sessionId: DESK_SESSION_ID, maxTradesPerDay: MAX_TRADES_PER_DAY, at: new Date().toISOString() }));

  for (;;) {
    try {
      const result = await runDeskCycle({
        store,
        market,
        notify: async (text) => { await sendTelegram(text, { chatId }); },
        announcedGuards: announcedGuard,
      });
      console.log(JSON.stringify({ desk: true, ...result, at: new Date().toISOString() }));
    } catch (error) {
      console.error('[desk]', error instanceof Error ? error.message : error);
    }
    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }
}

/** Dipakai tes & diagnostik: buat posisi paper lengkap dari satu kandidat siap. */
export function readyTicketInfo(candidate: { symbol: string; side: Side; ticket: Ticket; setup: SetupMarkers; gate: 'HIJAU' | 'MERAH' | 'KUNING'; gateAlign: boolean; rangePct: number }) {
  return {
    symbol: candidate.symbol,
    side: candidate.side,
    setupKey: deskSetupKey(candidate.symbol, candidate.side, candidate.setup.candle2 ?? null),
    processScore: processScore(candidate.setup, candidate.gateAlign),
    ticket: candidate.ticket,
  };
}

export { detectSetup, computeTicket, gateFromCandles, distanceToPintu, TOUCH_EXPIRY_CANDLES };
export type { Candle, SetupMarkers, Side, Ticket, Zones };
