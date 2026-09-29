/// <reference path="./better-sqlite3.d.ts" />
/**
 * @nusaquant/db — lapisan persistence SQLite lokal NusaQuant Futures Lab.
 *
 * Pengganti Supabase: satu file database lokal (WAL mode) yang dipakai
 * bersama oleh worker dan web. Lokasi file bisa dikonfigurasi lewat env:
 *   SQLITE_PATH=/var/lib/nusaquant/nusaquant.db
 * Bila env tidak diset, dipakai ./data/nusaquant.db relatif dari cwd proses.
 *
 * Konvensi kolom (lihat src/schema.sql):
 *   UUID        -> TEXT (dibuat di kode via crypto.randomUUID())
 *   timestamptz -> TEXT ISO-8601 UTC
 *   numeric     -> REAL
 *   jsonb       -> TEXT berisi string JSON (lapisan ini yang serialisasi)
 */
import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync } from 'node:fs';
import { SCHEMA_SQL } from './schema-embed.ts';
import { dirname, join, resolve } from 'node:path';

export const DB_ENV_VAR = 'SQLITE_PATH';

export function resolveDbPath(): string {
  const fromEnv = (process.env[DB_ENV_VAR] ?? '').trim();
  if (fromEnv) return resolve(fromEnv);
  return resolve(join(process.cwd(), 'data', 'nusaquant.db'));
}

export function ensureDbDir(dbPath: string): void {
  const dir = dirname(dbPath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

/** Error untuk pelanggaran constraint unik (dipetakan ke HTTP 409 oleh API). */
export class DbConflictError extends Error {
  readonly constraint: string;
  constructor(message: string, constraint = 'unique') {
    super(message);
    this.name = 'DbConflictError';
    this.constraint = constraint;
  }
}

function isUniqueViolation(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code ?? '';
  return code === 'SQLITE_CONSTRAINT_UNIQUE' || code === 'SQLITE_CONSTRAINT_PRIMARYKEY';
}

function toConflict(error: unknown, fallback: string): never {
  if (isUniqueViolation(error)) {
    const code = (error as { code?: string } | null)?.code ?? 'unique';
    throw new DbConflictError(fallback, code);
  }
  throw error;
}

function toJson(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  return JSON.stringify(value);
}

function fromJson<T = unknown>(value: unknown): T | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') return value as T;
  try { return JSON.parse(value) as T; } catch { return null; }
}

// ---------------------------------------------------------------- tipe baris

export interface MarketCandleInput {
  symbol: string; interval: string; open_time: string;
  open: number; high: number; low: number; close: number; volume: number;
  quote_volume?: number | null; taker_buy_volume?: number | null;
  taker_buy_quote_volume?: number | null; trade_count?: number | null;
  source?: string;
}
export interface MarketCandleRow extends MarketCandleInput { id: number; created_at: string }

export interface BotSessionRow {
  id: string; user_id: string | null; name: string; symbol: string; mode: string;
  status: string; timezone: string; risk_fraction: number; daily_loss_limit: number;
  last_signal_at: string | null; created_at: string; updated_at: string;
}
export interface BotSessionInput extends Partial<Omit<BotSessionRow, 'id'>> { id: string }

export interface SignalEvaluationRow {
  id: string; bot_session_id: string; user_id: string | null; symbol: string; timeframe: string;
  decision: string; candidate: string; stage: string; timing: string; regime: string;
  entry: number | null; trigger_price: number | null; quantity: number | null; stop_loss: number | null; take_profit: number | null;
  risk_reward: number | null; quality_score: number | null; position_size: number | null;
  risk_amount: number | null; estimated_costs: number | null;
  evidence: unknown; blockers: unknown; patterns: unknown; structure: unknown;
  evaluated_at: string; expires_at: string | null; source: string;
}
export interface SignalEvaluationInput {
  id?: string; bot_session_id: string; user_id?: string | null; symbol: string; timeframe?: string;
  decision: string; candidate?: string; stage?: string; timing?: string; regime?: string;
  entry?: number | null; trigger_price?: number | null; quantity?: number | null; stop_loss?: number | null; take_profit?: number | null;
  risk_reward?: number | null; quality_score?: number | null; position_size?: number | null;
  risk_amount?: number | null; estimated_costs?: number | null;
  evidence?: unknown; blockers?: unknown; patterns?: unknown; structure?: unknown;
  evaluated_at?: string; expires_at?: string | null; source?: string;
}

export interface PaperOrderInput {
  id?: string; bot_session_id: string; signal_id?: string | null; client_order_id: string;
  symbol: string; side: string; order_type?: string; status?: string;
  quantity: number; requested_price?: number | null; filled_price?: number | null; metadata?: unknown;
}

export interface PaperPositionRow {
  id: string; bot_session_id: string; user_id: string | null; symbol: string; side: string; status: string;
  quantity: number; entry_price: number; stop_loss: number; take_profit: number;
  exit_price: number | null; realized_pnl: number | null; close_reason: string | null;
  opened_at: string; closed_at: string | null; metadata: unknown;
}
export interface PaperPositionInput {
  id?: string; bot_session_id: string; user_id?: string | null; symbol: string; side: string; status?: string;
  quantity: number; entry_price: number; stop_loss: number; take_profit: number;
  exit_price?: number | null; realized_pnl?: number | null; close_reason?: string | null;
  opened_at?: string; closed_at?: string | null; metadata?: unknown;
}

export interface JournalInput {
  id?: string; bot_session_id: string; user_id?: string | null; paper_position_id?: string | null;
  symbol: string; action: string;
  reason?: string | null; regime?: string | null; quality_score?: number | null; payload?: unknown; created_at?: string;
}

export interface EquitySnapshotInput {
  id?: string; bot_session_id: string; equity: number; realized_pnl?: number; unrealized_pnl?: number;
  drawdown?: number; daily_loss?: number; captured_at?: string;
}
export interface EquitySnapshotRow {
  id: string; bot_session_id: string; equity: number; realized_pnl: number; unrealized_pnl: number;
  drawdown: number; daily_loss: number; captured_at: string;
}

export interface ResearchJobRow {
  id: string; symbol: string; status: string; progress: number;
  requested_at: string; started_at: string | null; completed_at: string | null;
  result: unknown; error: string | null; metadata: unknown;
}
export interface ResearchJobInput {
  id?: string; symbol: string; metadata?: unknown;
}

export interface DerivativeInput {
  symbol: string; metric?: string; event_time: string;
  funding_rate?: number | null; open_interest?: number | null; source?: string;
}

export interface MetricInput {
  symbol: string; event_time: string;
  open_interest: number; open_interest_value: number;
  top_trader_long_short_ratio: number; top_trader_long_short_position_ratio: number;
  long_short_ratio: number; taker_long_short_volume_ratio: number;
  source?: string;
}
export interface MetricRow extends MetricInput { id: number; created_at: string }

export interface RadarInput {
  symbol: string; last_price?: number | null; day_open?: number | null; prev_range_pct?: number | null;
  dist_long_pct?: number | null; dist_short_pct?: number | null; touched?: string | null; regime?: string | null;
}
export interface RadarRow {
  symbol: string; last_price: number | null; day_open: number | null; prev_range_pct: number | null;
  dist_long_pct: number | null; dist_short_pct: number | null; touched: string | null; regime: string | null;
  updated_at: string;
}

export interface ApprovalInput {
  id?: string; mode: string; setup_key: string; symbol: string; side: string; status?: string;
  operator_id: string; note?: string | null;
}
export interface ApprovalRow {
  id: string; mode: string; setup_key: string; symbol: string; side: string; status: string;
  operator_id: string; exchange_entry_id: string | null; exchange_sl_id: string | null;
  exchange_tp_id: string | null; note: string | null;
  created_at: string; updated_at: string;
}

// ---------------------------------------------------------------- filter kripto

/**
 * Filter "crypto futures USDT saja".
 * Binance USDⓈ-M futures pada dasarnya sudah kripto, tetapi feed bisa datang
 * dari mirror spot atau upstream lain yang menyelipkan simbol non-kripto
 * (contoh historis: XAU, XAG, SOXL, NVDA, TSLA). Filter ini dipakai di semua
 * pintu masuk feed (worker data-proxy, radar universe, web fetchTickers)
 * supaya simbol non-kripto tidak pernah masuk papan/sinyal.
 */
const NON_CRYPTO_BASES = new Set([
  // komoditas & logam
  'XAU', 'XAG', 'XPT', 'XPD',
  // ETF / saham yang pernah muncul di feed Binance
  'SOXL', 'SOXS', 'TQQQ', 'SQQQ', 'SPY', 'QQQ', 'DIA', 'IWM',
  'NVDA', 'TSLA', 'AAPL', 'MSFT', 'AMZN', 'GOOGL', 'META', 'AMD', 'NFLX', 'COIN', 'MSTR',
]);

export function isCryptoFuturesUsdtSymbol(symbol: string): boolean {
  const upper = (symbol ?? '').toUpperCase().trim();
  if (!upper.endsWith('USDT')) return false;
  if (upper.includes('_') || upper.includes('-') || upper.includes('/')) return false;
  if (!/^[A-Z0-9]{2,30}$/.test(upper)) return false;
  const base = upper.slice(0, -4);
  if (!base || NON_CRYPTO_BASES.has(base)) return false;
  return true;
}

export function filterCryptoFuturesUsdtSymbols(symbols: Iterable<string>): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of symbols) {
    const upper = (raw ?? '').toUpperCase().trim();
    if (!isCryptoFuturesUsdtSymbol(upper) || seen.has(upper)) continue;
    seen.add(upper);
    out.push(upper);
  }
  return out;
}

// ---------------------------------------------------------------- kelas utama

export class NusaQuantDb {
  readonly path: string;
  private readonly db: Database;

  constructor(dbPath?: string) {
    this.path = dbPath ?? resolveDbPath();
    if (this.path !== ':memory:') ensureDbDir(this.path);
    this.db = new Database(this.path);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    this.db.pragma('busy_timeout = 5000');
    this.db.exec(SCHEMA_SQL);
  }

  close(): void { this.db.close(); }

  // ------------------------------------------------------- market_candles

  async upsertMarketCandles(rows: MarketCandleInput[]): Promise<number> {
    if (rows.length === 0) return 0;
    const stmt = this.db.prepare(`
      INSERT INTO market_candles
        (symbol, interval, open_time, open, high, low, close, volume, quote_volume,
         taker_buy_volume, taker_buy_quote_volume, trade_count, source)
      VALUES (@symbol, @interval, @open_time, @open, @high, @low, @close, @volume, @quote_volume,
              @taker_buy_volume, @taker_buy_quote_volume, @trade_count, @source)
      ON CONFLICT (symbol, interval, open_time) DO UPDATE SET
        open=excluded.open, high=excluded.high, low=excluded.low, close=excluded.close,
        volume=excluded.volume, quote_volume=excluded.quote_volume,
        taker_buy_volume=excluded.taker_buy_volume,
        taker_buy_quote_volume=excluded.taker_buy_quote_volume, trade_count=excluded.trade_count,
        source=excluded.source`);
    const run = this.db.transaction((items: MarketCandleInput[]) => {
      let count = 0;
      for (const row of items) {
        stmt.run({
          symbol: row.symbol, interval: row.interval, open_time: row.open_time,
          open: row.open, high: row.high, low: row.low, close: row.close, volume: row.volume,
          quote_volume: row.quote_volume ?? null,
          taker_buy_volume: row.taker_buy_volume ?? null,
          taker_buy_quote_volume: row.taker_buy_quote_volume ?? null,
          trade_count: row.trade_count ?? null,
          source: row.source ?? 'BINANCE',
        });
        count += 1;
      }
      return count;
    });
    return run(rows);
  }

  async latestCandleOpenTime(symbol: string, interval: string): Promise<string | null> {
    const row = this.db.prepare(
      'SELECT open_time FROM market_candles WHERE symbol=? AND interval=? ORDER BY open_time DESC LIMIT 1',
    ).get(symbol, interval) as { open_time: string } | undefined;
    return row?.open_time ?? null;
  }

  async latestCandles(symbol: string, interval: string, limit: number, ascending = false): Promise<MarketCandleRow[]> {
    const rows = this.db.prepare(
      `SELECT * FROM market_candles WHERE symbol=? AND interval=? ORDER BY open_time ${ascending ? 'ASC' : 'DESC'} LIMIT ?`,
    ).all(symbol, interval, limit) as MarketCandleRow[];
    return rows;
  }

  async candlesPage(symbol: string, interval: string, offset: number, limit: number, ascending = true): Promise<MarketCandleRow[]> {
    const rows = this.db.prepare(
      `SELECT * FROM market_candles WHERE symbol=? AND interval=? ORDER BY open_time ${ascending ? 'ASC' : 'DESC'} LIMIT ? OFFSET ?`,
    ).all(symbol, interval, limit, offset) as MarketCandleRow[];
    return rows;
  }

  async countMarketCandles(): Promise<number> {
    const row = this.db.prepare('SELECT COUNT(*) AS n FROM market_candles').get() as { n: number };
    return row.n;
  }

  // ------------------------------------------------------- bot_sessions

  async getBotSession(id: string): Promise<BotSessionRow | null> {
    const row = this.db.prepare('SELECT * FROM bot_sessions WHERE id=?').get(id) as BotSessionRow | undefined;
    return row ?? null;
  }

  async ensureBotSession(input: BotSessionInput): Promise<BotSessionRow> {
    try {
      this.db.prepare(`
        INSERT INTO bot_sessions (id, name, symbol, mode, status, timezone, risk_fraction, daily_loss_limit, user_id)
        VALUES (@id, @name, @symbol, @mode, @status, @timezone, @risk_fraction, @daily_loss_limit, @user_id)`)
        .run({
          id: input.id, name: input.name ?? 'Primary bot', symbol: input.symbol ?? 'BTCUSDT',
          mode: input.mode ?? 'PAPER_APPROVAL', status: input.status ?? 'IDLE',
          timezone: input.timezone ?? 'Asia/Jakarta',
          risk_fraction: input.risk_fraction ?? 0.0025, daily_loss_limit: input.daily_loss_limit ?? 0.01,
          user_id: input.user_id ?? null,
        });
    } catch (error) {
      // Konflik unik = sesi sudah ada (insert-or-ignore); selain itu lempar ulang.
      if (!isUniqueViolation(error)) throw error;
    }
    const row = await this.getBotSession(input.id);
    if (!row) throw new Error(`Gagal memastikan sesi bot ${input.id}.`);
    return row;
  }

  /** Update status kondisional (menggantikan .eq('status', expected) ala Supabase). */
  async updateBotSessionStatus(id: string, next: string, expected: string): Promise<BotSessionRow | null> {
    const row = this.db.prepare(
      'UPDATE bot_sessions SET status=? WHERE id=? AND status=? RETURNING *',
    ).get(next, id, expected) as BotSessionRow | undefined;
    return row ?? null;
  }

  async updateBotSession(id: string, patch: { last_signal_at?: string | null; status?: string; risk_fraction?: number; daily_loss_limit?: number }): Promise<void> {
    const sets: string[] = [];
    const values: unknown[] = [];
    if (patch.last_signal_at !== undefined) { sets.push('last_signal_at=?'); values.push(patch.last_signal_at); }
    if (patch.status !== undefined) { sets.push('status=?'); values.push(patch.status); }
    if (patch.risk_fraction !== undefined) { sets.push('risk_fraction=?'); values.push(patch.risk_fraction); }
    if (patch.daily_loss_limit !== undefined) { sets.push('daily_loss_limit=?'); values.push(patch.daily_loss_limit); }
    if (sets.length === 0) return;
    this.db.prepare(`UPDATE bot_sessions SET ${sets.join(', ')} WHERE id=?`).run(...values, id);
  }

  async touchBotSession(id: string, updatedAt: string): Promise<void> {
    this.db.prepare('UPDATE bot_sessions SET updated_at=? WHERE id=?').run(updatedAt, id);
  }

  // ------------------------------------------------------- signal_evaluations

  async insertSignalEvaluation(input: SignalEvaluationInput): Promise<string> {
    const id = input.id ?? randomUUID();
    try {
      this.db.prepare(`
        INSERT INTO signal_evaluations
          (id, bot_session_id, user_id, symbol, timeframe, decision, candidate, stage, timing, regime,
           entry, trigger_price, quantity, stop_loss, take_profit,
           risk_reward, quality_score, position_size, risk_amount, estimated_costs,
           evidence, blockers, patterns, structure, evaluated_at, expires_at, source)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(
          id, input.bot_session_id, input.user_id ?? null, input.symbol, input.timeframe ?? '15m',
          input.decision, input.candidate ?? 'NO_TRADE', input.stage ?? 'NO_TRADE',
          input.timing ?? 'NO_TRADE', input.regime ?? '',
          input.entry ?? null, input.trigger_price ?? null, input.quantity ?? null, input.stop_loss ?? null, input.take_profit ?? null,
          input.risk_reward ?? null, input.quality_score ?? null, input.position_size ?? null,
          input.risk_amount ?? null, input.estimated_costs ?? null,
          toJson(input.evidence), toJson(input.blockers), toJson(input.patterns), toJson(input.structure),
          input.evaluated_at ?? new Date().toISOString(), input.expires_at ?? null, input.source ?? 'worker',
        );
    } catch (error) {
      toConflict(error, `Evaluasi sinyal ${id} sudah ada.`);
    }
    return id;
  }

  private mapSignal(row: Record<string, unknown>): SignalEvaluationRow {
    return {
      ...(row as unknown as SignalEvaluationRow),
      evidence: fromJson(row.evidence), blockers: fromJson(row.blockers),
      patterns: fromJson(row.patterns), structure: fromJson(row.structure),
    };
  }

  async latestSignal(sessionId: string, opts: { symbol?: string; stage?: string; decisionIn?: string[] } = {}): Promise<SignalEvaluationRow | null> {
    const where: string[] = ['bot_session_id=?'];
    const values: unknown[] = [sessionId];
    if (opts.symbol) { where.push('symbol=?'); values.push(opts.symbol); }
    if (opts.stage) { where.push('stage=?'); values.push(opts.stage); }
    if (opts.decisionIn && opts.decisionIn.length > 0) {
      where.push(`decision IN (${opts.decisionIn.map(() => '?').join(',')})`);
      values.push(...opts.decisionIn);
    }
    const row = this.db.prepare(
      `SELECT * FROM signal_evaluations WHERE ${where.join(' AND ')} ORDER BY evaluated_at DESC LIMIT 1`,
    ).get(...values) as Record<string, unknown> | undefined;
    return row ? this.mapSignal(row) : null;
  }

  async latestSignalStructure(sessionId: string, symbol: string, timeframe: string): Promise<unknown> {
    const row = this.db.prepare(
      'SELECT structure FROM signal_evaluations WHERE bot_session_id=? AND symbol=? AND timeframe=? AND structure IS NOT NULL ORDER BY evaluated_at DESC LIMIT 1',
    ).get(sessionId, symbol, timeframe) as { structure: string } | undefined;
    return fromJson(row?.structure);
  }

  async countSignals(sessionId: string, symbol: string): Promise<number> {
    const row = this.db.prepare(
      'SELECT COUNT(*) AS n FROM signal_evaluations WHERE bot_session_id=? AND symbol=?',
    ).get(sessionId, symbol) as { n: number };
    return row.n;
  }

  // ------------------------------------------------------- paper_orders

  async upsertPaperOrder(input: PaperOrderInput): Promise<void> {
    this.db.prepare(`
      INSERT INTO paper_orders
        (id, bot_session_id, signal_id, client_order_id, symbol, side, order_type, status,
         quantity, requested_price, filled_price, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT (client_order_id) DO NOTHING`)
      .run(
        input.id ?? randomUUID(), input.bot_session_id, input.signal_id ?? null, input.client_order_id,
        input.symbol, input.side, input.order_type ?? 'SIMULATED_MARKET', input.status ?? 'FILLED',
        input.quantity, input.requested_price ?? null, input.filled_price ?? null, toJson(input.metadata),
      );
  }

  // ------------------------------------------------------- paper_positions

  private mapPosition(row: Record<string, unknown>): PaperPositionRow {
    return { ...(row as unknown as PaperPositionRow), metadata: fromJson(row.metadata) ?? {} };
  }

  async insertPaperPosition(input: PaperPositionInput): Promise<PaperPositionRow> {
    const id = input.id ?? randomUUID();
    try {
      this.db.prepare(`
        INSERT INTO paper_positions
          (id, bot_session_id, user_id, symbol, side, status, quantity, entry_price, stop_loss, take_profit,
           exit_price, realized_pnl, close_reason, opened_at, closed_at, metadata)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(
          id, input.bot_session_id, input.user_id ?? null, input.symbol, input.side, input.status ?? 'OPEN',
          input.quantity, input.entry_price, input.stop_loss, input.take_profit,
          input.exit_price ?? null, input.realized_pnl ?? null, input.close_reason ?? null,
          input.opened_at ?? new Date().toISOString(), input.closed_at ?? null, toJson(input.metadata),
        );
    } catch (error) {
      toConflict(error, `Posisi paper ${input.symbol} sudah terbuka di sesi ini.`);
    }
    const row = this.db.prepare('SELECT * FROM paper_positions WHERE id=?').get(id) as Record<string, unknown>;
    return this.mapPosition(row);
  }

  async getOpenPosition(sessionId: string, symbol: string): Promise<PaperPositionRow | null> {
    const row = this.db.prepare(
      "SELECT * FROM paper_positions WHERE bot_session_id=? AND symbol=? AND status='OPEN' LIMIT 1",
    ).get(sessionId, symbol) as Record<string, unknown> | undefined;
    return row ? this.mapPosition(row) : null;
  }

  async listPositions(sessionId: string, opts: {
    status?: string; symbol?: string; since?: string; orderAsc?: boolean; limit?: number;
    orderBy?: 'opened_at' | 'closed_at';
  } = {}): Promise<PaperPositionRow[]> {
    const where: string[] = ['bot_session_id=?'];
    const values: unknown[] = [sessionId];
    if (opts.status) { where.push('status=?'); values.push(opts.status); }
    if (opts.symbol) { where.push('symbol=?'); values.push(opts.symbol); }
    if (opts.since) { where.push('opened_at>=?'); values.push(opts.since); }
    const orderCol = opts.orderBy === 'closed_at' ? 'closed_at' : 'opened_at';
    let sql = `SELECT * FROM paper_positions WHERE ${where.join(' AND ')} ORDER BY ${orderCol} ${opts.orderAsc === false ? 'DESC' : 'ASC'}`;
    if (opts.limit) { sql += ' LIMIT ?'; values.push(opts.limit); }
    const rows = this.db.prepare(sql).all(...values) as Record<string, unknown>[];
    return rows.map((row) => this.mapPosition(row));
  }

  async updatePaperPosition(id: string, patch: {
    status?: string; exit_price?: number | null; realized_pnl?: number | null;
    close_reason?: string | null; closed_at?: string | null; metadata?: unknown;
  }): Promise<void> {
    const sets: string[] = [];
    const values: unknown[] = [];
    if (patch.status !== undefined) { sets.push('status=?'); values.push(patch.status); }
    if (patch.exit_price !== undefined) { sets.push('exit_price=?'); values.push(patch.exit_price); }
    if (patch.realized_pnl !== undefined) { sets.push('realized_pnl=?'); values.push(patch.realized_pnl); }
    if (patch.close_reason !== undefined) { sets.push('close_reason=?'); values.push(patch.close_reason); }
    if (patch.closed_at !== undefined) { sets.push('closed_at=?'); values.push(patch.closed_at); }
    if (patch.metadata !== undefined) { sets.push('metadata=?'); values.push(toJson(patch.metadata)); }
    if (sets.length === 0) return;
    this.db.prepare(`UPDATE paper_positions SET ${sets.join(', ')} WHERE id=?`).run(...values, id);
  }

  async closeOpenPosition(sessionId: string, symbol: string, patch: {
    exit_price?: number | null; realized_pnl?: number | null; close_reason?: string | null;
    closed_at?: string | null; metadata?: unknown;
  }): Promise<void> {
    const sets = ["status='CLOSED'"];
    const values: unknown[] = [];
    if (patch.exit_price !== undefined) { sets.push('exit_price=?'); values.push(patch.exit_price); }
    if (patch.realized_pnl !== undefined) { sets.push('realized_pnl=?'); values.push(patch.realized_pnl); }
    if (patch.close_reason !== undefined) { sets.push('close_reason=?'); values.push(patch.close_reason); }
    if (patch.closed_at !== undefined) { sets.push('closed_at=?'); values.push(patch.closed_at); }
    if (patch.metadata !== undefined) { sets.push('metadata=?'); values.push(toJson(patch.metadata)); }
    this.db.prepare(`UPDATE paper_positions SET ${sets.join(', ')} WHERE bot_session_id=? AND symbol=? AND status='OPEN'`)
      .run(...values, sessionId, symbol);
  }

  // ------------------------------------------------------- trade_journal

  async insertJournal(input: JournalInput): Promise<void> {
    this.db.prepare(`
      INSERT INTO trade_journal (id, bot_session_id, user_id, paper_position_id, symbol, action, reason, regime, quality_score, payload, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(
        input.id ?? randomUUID(), input.bot_session_id, input.user_id ?? null, input.paper_position_id ?? null,
        input.symbol, input.action,
        input.reason ?? null, input.regime ?? null, input.quality_score ?? null, toJson(input.payload),
        input.created_at ?? new Date().toISOString(),
      );
  }

  // ------------------------------------------------------- equity_snapshots

  async insertEquitySnapshot(input: EquitySnapshotInput): Promise<void> {
    this.db.prepare(`
      INSERT INTO equity_snapshots (id, bot_session_id, equity, realized_pnl, unrealized_pnl, drawdown, daily_loss, captured_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(
        input.id ?? randomUUID(), input.bot_session_id, input.equity,
        input.realized_pnl ?? 0, input.unrealized_pnl ?? 0, input.drawdown ?? 0, input.daily_loss ?? 0,
        input.captured_at ?? new Date().toISOString(),
      );
  }

  async latestEquity(sessionId: string): Promise<EquitySnapshotRow | null> {
    const row = this.db.prepare(
      'SELECT * FROM equity_snapshots WHERE bot_session_id=? ORDER BY captured_at DESC LIMIT 1',
    ).get(sessionId) as EquitySnapshotRow | undefined;
    return row ?? null;
  }

  // ------------------------------------------------------- research_backtest_jobs

  private mapJob(row: Record<string, unknown>): ResearchJobRow {
    return {
      ...(row as unknown as ResearchJobRow),
      result: fromJson(row.result), metadata: fromJson(row.metadata),
    };
  }

  async listResearchJobs(limit: number): Promise<ResearchJobRow[]> {
    const rows = this.db.prepare(
      'SELECT * FROM research_backtest_jobs ORDER BY requested_at DESC LIMIT ?',
    ).all(limit) as Record<string, unknown>[];
    return rows.map((row) => this.mapJob(row));
  }

  async findActiveResearchJob(symbol: string): Promise<ResearchJobRow | null> {
    const row = this.db.prepare(
      "SELECT * FROM research_backtest_jobs WHERE symbol=? AND status IN ('QUEUED','RUNNING') ORDER BY requested_at DESC LIMIT 1",
    ).get(symbol) as Record<string, unknown> | undefined;
    return row ? this.mapJob(row) : null;
  }

  async insertResearchJob(input: ResearchJobInput): Promise<ResearchJobRow> {
    const id = input.id ?? randomUUID();
    try {
      this.db.prepare(`
        INSERT INTO research_backtest_jobs (id, symbol, status, progress, metadata)
        VALUES (?, ?, 'QUEUED', 0, ?)`)
        .run(id, input.symbol, toJson(input.metadata));
    } catch (error) {
      toConflict(error, `Job research ${input.symbol} gagal dibuat.`);
    }
    const row = this.db.prepare('SELECT * FROM research_backtest_jobs WHERE id=?').get(id) as Record<string, unknown>;
    return this.mapJob(row);
  }

  /** Klaim job tertua QUEUED/RUNNING menjadi RUNNING (atomik, menggantikan pola update kondisional). */
  async claimNextResearchJob(): Promise<ResearchJobRow | null> {
    const claim = this.db.transaction(() => {
      const next = this.db.prepare(
        "SELECT * FROM research_backtest_jobs WHERE status IN ('QUEUED','RUNNING') ORDER BY requested_at ASC LIMIT 1",
      ).get() as Record<string, unknown> | undefined;
      if (!next) return null;
      const claimed = this.db.prepare(
        `UPDATE research_backtest_jobs
         SET status='RUNNING', started_at=COALESCE(started_at, strftime('%Y-%m-%dT%H:%M:%fZ','now'))
         WHERE id=? AND status IN ('QUEUED','RUNNING') RETURNING *`,
      ).get(next.id) as Record<string, unknown> | undefined;
      return claimed ?? null;
    });
    const row = claim();
    return row ? this.mapJob(row) : null;
  }

  async updateResearchJob(id: string, patch: {
    status?: string; progress?: number; started_at?: string | null;
    completed_at?: string | null; result?: unknown; error?: string | null;
  }): Promise<void> {
    const sets: string[] = [];
    const values: unknown[] = [];
    if (patch.status !== undefined) { sets.push('status=?'); values.push(patch.status); }
    if (patch.progress !== undefined) { sets.push('progress=?'); values.push(patch.progress); }
    if (patch.started_at !== undefined) { sets.push('started_at=?'); values.push(patch.started_at); }
    if (patch.completed_at !== undefined) { sets.push('completed_at=?'); values.push(patch.completed_at); }
    if (patch.result !== undefined) { sets.push('result=?'); values.push(toJson(patch.result)); }
    if (patch.error !== undefined) { sets.push('error=?'); values.push(patch.error); }
    if (sets.length === 0) return;
    this.db.prepare(`UPDATE research_backtest_jobs SET ${sets.join(', ')} WHERE id=?`).run(...values, id);
  }

  // ------------------------------------------------------- market_derivatives

  async upsertDerivatives(rows: DerivativeInput[]): Promise<number> {
    if (rows.length === 0) return 0;
    const stmt = this.db.prepare(`
      INSERT INTO market_derivatives (symbol, metric, event_time, funding_rate, open_interest, source)
      VALUES (@symbol, @metric, @event_time, @funding_rate, @open_interest, @source)
      ON CONFLICT (symbol, metric, event_time) DO UPDATE SET
        funding_rate=excluded.funding_rate, open_interest=excluded.open_interest, source=excluded.source`);
    const run = this.db.transaction((items: DerivativeInput[]) => {
      let count = 0;
      for (const row of items) {
        stmt.run({
          symbol: row.symbol, metric: row.metric ?? 'FUNDING_RATE', event_time: row.event_time,
          funding_rate: row.funding_rate ?? null, open_interest: row.open_interest ?? null,
          source: row.source ?? 'BINANCE_PUBLIC',
        });
        count += 1;
      }
      return count;
    });
    return run(rows);
  }

  async fundingPage(symbol: string, offset: number, limit: number): Promise<Array<{ event_time: string; funding_rate: number | null }>> {
    const rows = this.db.prepare(
      `SELECT event_time, funding_rate FROM market_derivatives
       WHERE symbol=? AND metric='FUNDING_RATE' ORDER BY event_time ASC LIMIT ? OFFSET ?`,
    ).all(symbol, limit, offset) as Array<{ event_time: string; funding_rate: number | null }>;
    return rows;
  }

  // ------------------------------------------------------- market_metrics

  async upsertMetrics(rows: MetricInput[]): Promise<number> {
    if (rows.length === 0) return 0;
    const stmt = this.db.prepare(`
      INSERT INTO market_metrics
        (symbol, event_time, open_interest, open_interest_value,
         top_trader_long_short_ratio, top_trader_long_short_position_ratio,
         long_short_ratio, taker_long_short_volume_ratio, source)
      VALUES (@symbol, @event_time, @open_interest, @open_interest_value,
              @top_trader_long_short_ratio, @top_trader_long_short_position_ratio,
              @long_short_ratio, @taker_long_short_volume_ratio, @source)
      ON CONFLICT (symbol, event_time) DO UPDATE SET
        open_interest=excluded.open_interest, open_interest_value=excluded.open_interest_value,
        top_trader_long_short_ratio=excluded.top_trader_long_short_ratio,
        top_trader_long_short_position_ratio=excluded.top_trader_long_short_position_ratio,
        long_short_ratio=excluded.long_short_ratio,
        taker_long_short_volume_ratio=excluded.taker_long_short_volume_ratio,
        source=excluded.source`);
    const run = this.db.transaction((items: MetricInput[]) => {
      let count = 0;
      for (const row of items) {
        stmt.run({
          symbol: row.symbol, event_time: row.event_time,
          open_interest: row.open_interest, open_interest_value: row.open_interest_value,
          top_trader_long_short_ratio: row.top_trader_long_short_ratio,
          top_trader_long_short_position_ratio: row.top_trader_long_short_position_ratio,
          long_short_ratio: row.long_short_ratio,
          taker_long_short_volume_ratio: row.taker_long_short_volume_ratio,
          source: row.source ?? 'BINANCE_PUBLIC_METRICS',
        });
        count += 1;
      }
      return count;
    });
    return run(rows);
  }

  async metricsPage(symbol: string, offset: number, limit: number): Promise<MetricRow[]> {
    const rows = this.db.prepare(
      'SELECT * FROM market_metrics WHERE symbol=? ORDER BY event_time ASC LIMIT ? OFFSET ?',
    ).all(symbol, limit, offset) as MetricRow[];
    return rows;
  }

  // ------------------------------------------------------- market_radar

  async upsertRadar(rows: RadarInput[]): Promise<void> {
    if (rows.length === 0) return;
    const stmt = this.db.prepare(`
      INSERT INTO market_radar
        (symbol, last_price, day_open, prev_range_pct, dist_long_pct, dist_short_pct, touched, regime)
      VALUES (@symbol, @last_price, @day_open, @prev_range_pct, @dist_long_pct, @dist_short_pct, @touched, @regime)
      ON CONFLICT (symbol) DO UPDATE SET
        last_price=excluded.last_price, day_open=excluded.day_open, prev_range_pct=excluded.prev_range_pct,
        dist_long_pct=excluded.dist_long_pct, dist_short_pct=excluded.dist_short_pct,
        touched=excluded.touched, regime=excluded.regime,
        updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')`);
    const run = this.db.transaction((items: RadarInput[]) => {
      for (const row of items) {
        stmt.run({
          symbol: row.symbol, last_price: row.last_price ?? null, day_open: row.day_open ?? null,
          prev_range_pct: row.prev_range_pct ?? null, dist_long_pct: row.dist_long_pct ?? null,
          dist_short_pct: row.dist_short_pct ?? null, touched: row.touched ?? null, regime: row.regime ?? null,
        });
      }
    });
    run(rows);
  }

  async listRadar(): Promise<RadarRow[]> {
    const rows = this.db.prepare('SELECT * FROM market_radar ORDER BY symbol ASC').all() as RadarRow[];
    return rows;
  }

  // ------------------------------------------------------- manual_execution_approvals

  private mapApproval(row: Record<string, unknown>): ApprovalRow {
    return { ...(row as unknown as ApprovalRow) };
  }

  /** Melempar DbConflictError bila setup_key duplikat ATAU sudah ada approval tak terselesaikan di mode ini. */
  async insertApproval(input: ApprovalInput): Promise<ApprovalRow> {
    const id = input.id ?? randomUUID();
    try {
      this.db.prepare(`
        INSERT INTO manual_execution_approvals
          (id, mode, setup_key, symbol, side, status, operator_id, note)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(
          id, input.mode, input.setup_key, input.symbol, input.side, input.status ?? 'RESERVED',
          input.operator_id, input.note ?? null,
        );
    } catch (error) {
      toConflict(error, `Approval ${input.setup_key} sudah ada atau masih ada approval tak terselesaikan di mode ${input.mode}.`);
    }
    const row = this.db.prepare('SELECT * FROM manual_execution_approvals WHERE id=?').get(id) as Record<string, unknown>;
    return this.mapApproval(row);
  }

  async findUnresolvedApproval(mode: string): Promise<ApprovalRow | null> {
    const row = this.db.prepare(
      "SELECT * FROM manual_execution_approvals WHERE mode=? AND status IN ('RESERVED','REVIEW') LIMIT 1",
    ).get(mode) as Record<string, unknown> | undefined;
    return row ? this.mapApproval(row) : null;
  }

  async updateApproval(id: string, patch: {
    status?: string; note?: string | null;
    exchange_entry_id?: string | null; exchange_sl_id?: string | null; exchange_tp_id?: string | null;
  }): Promise<void> {
    const sets: string[] = [];
    const values: unknown[] = [];
    if (patch.status !== undefined) { sets.push('status=?'); values.push(patch.status); }
    if (patch.note !== undefined) { sets.push('note=?'); values.push(patch.note); }
    if (patch.exchange_entry_id !== undefined) { sets.push('exchange_entry_id=?'); values.push(patch.exchange_entry_id); }
    if (patch.exchange_sl_id !== undefined) { sets.push('exchange_sl_id=?'); values.push(patch.exchange_sl_id); }
    if (patch.exchange_tp_id !== undefined) { sets.push('exchange_tp_id=?'); values.push(patch.exchange_tp_id); }
    if (sets.length === 0) return;
    this.db.prepare(`UPDATE manual_execution_approvals SET ${sets.join(', ')} WHERE id=?`).run(...values, id);
  }
}

// ---------------------------------------------------------------- singleton

let shared: NusaQuantDb | null = null;

/** Koneksi bersama per proses (better-sqlite3 sinkron; dibungkus async oleh method di atas). */
export function getDb(dbPath?: string): NusaQuantDb {
  const path = dbPath ?? resolveDbPath();
  if (!shared || shared.path !== path) {
    shared?.close();
    shared = new NusaQuantDb(path);
  }
  return shared;
}

/** Buka koneksi independen (dipakai tes agar terisolasi). */
export function openDatabase(dbPath?: string): NusaQuantDb {
  return new NusaQuantDb(dbPath);
}

/** Tutup singleton (dipakai tes / shutdown). */
export function closeDb(): void {
  shared?.close();
  shared = null;
}
