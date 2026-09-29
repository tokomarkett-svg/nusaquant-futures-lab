import type { Candle, IntelligentSignal } from '@nusaquant/core';
import type { BotSessionRow, MarketCandleRow, PaperPositionRow, SignalEvaluationRow } from '@nusaquant/db';
import { PaperBotEngine, type BotStatus, type ExecutionMode, type PaperPosition, type PaperStrategy, type WorkerSnapshot } from './index.ts';
import { getWorkerDb } from './db.ts';

export function resolvePaperStrategy(raw: string | undefined): PaperStrategy {
  return raw === 'WILLIAMS_VOLATILITY_BREAKOUT' ? 'WILLIAMS_VOLATILITY_BREAKOUT' : 'BASELINE_INTELLIGENCE';
}

// Williams butuh >= 46 hari close harian untuk SMA45; 1.200 candle 1H menutup itu dengan margin.
export const WILLIAMS_ENTRY_INTERVAL = '1h';
export const WILLIAMS_ENTRY_CANDLE_LIMIT = 1200;

export const DEFAULT_BOT_SESSION_ID = '00000000-0000-4000-8000-000000000001';
export const ETH_BOT_SESSION_ID = '00000000-0000-4000-8000-000000000002';
export const ADA_BOT_SESSION_ID = '00000000-0000-4000-8000-000000000003';
export const ZEC_BOT_SESSION_ID = '00000000-0000-4000-8000-000000000004';
export const UNI_BOT_SESSION_ID = '00000000-0000-4000-8000-000000000005';
export const RUNE_BOT_SESSION_ID = '00000000-0000-4000-8000-000000000006';

export const DEFAULT_BOT_SESSION_IDS = [DEFAULT_BOT_SESSION_ID, ETH_BOT_SESSION_ID, ADA_BOT_SESSION_ID, ZEC_BOT_SESSION_ID, UNI_BOT_SESSION_ID, RUNE_BOT_SESSION_ID] as const;
export const DEFAULT_MARKET_DATA_MAX_AGE_MS = 45 * 60 * 1000;
// Yang diperiksa adalah OPEN_TIME candle entry. Candle 1H yang baru ditutup punya
// open_time 60-120 menit lalu, jadi ambang stale Williams harus > 2 jam, bukan patokan 15M.
export const WILLIAMS_MARKET_DATA_MAX_AGE_MS = 2 * 60 * 60 * 1000 + 15 * 60 * 1000;

export function resolveBotSessionIds(configured?: string): string[] {
  const extra = (configured ?? '').split(',').map((id) => id.trim()).filter(Boolean);
  // BTC + ETH adalah baseline aman. Sesi ADA/ZEC/UNI/RUNE hanya dijalankan bila
  // disebut eksplisit di BOT_SESSION_IDS; sebelumnya keenam sesi selalu dipoll
  // walau env hanya berisi dua, sehingga database ditulis tanpa manfaat.
  return [...new Set([DEFAULT_BOT_SESSION_ID, ETH_BOT_SESSION_ID, ...extra])];
}

export function isFreshMarketCandle(openTime: string, now = Date.now(), maxAgeMs = DEFAULT_MARKET_DATA_MAX_AGE_MS): boolean {
  const timestamp = Date.parse(openTime);
  const age = now - timestamp;
  return Number.isFinite(timestamp) && Number.isFinite(age) && age >= 0 && age <= maxAgeMs;
}

type SessionRecord = {
  id: string;
  status: BotStatus;
  mode: ExecutionMode | 'OBSERVATION' | 'TESTNET' | 'LIVE';
  symbol: string;
  risk_fraction: number;
  daily_loss_limit: number;
  updated_at: string;
};

type CandleRow = MarketCandleRow;

type StoredPosition = PaperPositionRow;

type StoredSignal = SignalEvaluationRow;

export function desiredStatusAction(status: BotStatus): 'START' | 'PAUSE' | 'EMERGENCY' | 'APPROVE' | 'IDLE' {
  if (status === 'POSITION_OPEN') return 'APPROVE';
  if (status === 'RUNNING' || status === 'STARTING' || status === 'WAITING_APPROVAL' || status === 'COOLDOWN') return 'START';
  if (status === 'PAUSED') return 'PAUSE';
  if (status === 'EMERGENCY') return 'EMERGENCY';
  return 'IDLE';
}

function mapCandle(row: CandleRow): Candle {
  return {
    time: new Date(row.open_time).getTime(),
    open: Number(row.open),
    high: Number(row.high),
    low: Number(row.low),
    close: Number(row.close),
    volume: Number(row.volume),
    ...(row.quote_volume !== null && row.quote_volume !== undefined ? { quoteVolume: Number(row.quote_volume) } : {}),
    ...(row.taker_buy_volume !== null && row.taker_buy_volume !== undefined ? { takerBuyVolume: Number(row.taker_buy_volume) } : {}),
    ...(row.taker_buy_quote_volume !== null && row.taker_buy_quote_volume !== undefined ? { takerBuyQuoteVolume: Number(row.taker_buy_quote_volume) } : {}),
    ...(row.trade_count !== null && row.trade_count !== undefined ? { tradeCount: Number(row.trade_count) } : {}),
  };
}

function mapStoredPosition(row: StoredPosition): PaperPosition {
  const metadata = (row.metadata ?? {}) as Record<string, unknown>;
  const engineId = typeof metadata.engine_position_id === 'string'
    ? metadata.engine_position_id
    : `db-${row.id}`;
  return {
    id: engineId,
    symbol: row.symbol,
    side: row.side === 'SHORT' ? 'SHORT' : 'LONG',
    entry: Number(row.entry_price),
    quantity: Number(row.quantity),
    stopLoss: Number(row.stop_loss),
    takeProfit: Number(row.take_profit),
    openedAt: row.opened_at,
    riskAmount: typeof metadata.risk_amount === 'number' ? metadata.risk_amount : undefined,
    entryCosts: typeof metadata.entry_costs === 'number' ? metadata.entry_costs : undefined,
    totalCosts: typeof metadata.total_costs === 'number' ? metadata.total_costs : undefined,
    barsHeld: typeof metadata.bars_held === 'number' ? metadata.bars_held : undefined,
  };
}

function mapStoredSignal(row: StoredSignal): IntelligentSignal {
  const structure = (row.structure ?? {}) as IntelligentSignal['structure'] & { candle_open_time?: string };
  return {
    decision: row.decision as IntelligentSignal['decision'],
    candidate: row.candidate as IntelligentSignal['candidate'],
    stage: row.stage as IntelligentSignal['stage'],
    timing: row.timing as IntelligentSignal['timing'],
    regime: row.regime as IntelligentSignal['regime'],
    qualityScore: Number(row.quality_score),
    scoreMax: 100,
    entry: row.entry,
    triggerPrice: row.trigger_price,
    stopLoss: row.stop_loss,
    takeProfit: row.take_profit,
    quantity: Number(row.quantity),
    riskAmount: Number(row.risk_amount),
    riskReward: row.risk_reward,
    maxChaseDistance: null,
    patterns: (row.patterns ?? []) as IntelligentSignal['patterns'],
    structure,
    evidence: (row.evidence ?? []) as IntelligentSignal['evidence'],
    blockers: (row.blockers ?? []) as string[],
    explanation: 'Signal dipulihkan dari signal_evaluations untuk paper approval.',
  };
}

function toSessionRecord(row: BotSessionRow): SessionRecord {
  return {
    id: row.id,
    status: row.status as BotStatus,
    mode: row.mode as SessionRecord['mode'],
    symbol: row.symbol,
    risk_fraction: row.risk_fraction,
    daily_loss_limit: row.daily_loss_limit,
    updated_at: row.updated_at,
  };
}

export class PaperSessionController {
  private readonly db = getWorkerDb();
  private readonly sessionId: string;

  constructor(sessionId = process.env.BOT_SESSION_ID ?? DEFAULT_BOT_SESSION_ID) {
    this.sessionId = sessionId;
  }
  private engine: PaperBotEngine | null = null;
  private lastDesiredStatus: BotStatus | null = null;
  private lastEngineStatus: BotStatus | null = null;
  private lastEvaluatedCandleTime: string | null = null;
  private lastStaleMarketCandleTime: string | null = null;
  private lastSignalId: string | null = null;
  private lastPersistedOpenId: string | null = null;
  private lastPersistedClosedId: string | null = null;
  private lastMarkedCandleTime: string | null = null;
  private lastEquitySnapshotAt = 0;
  private lastHeartbeatAt = 0;

  async sync(): Promise<WorkerSnapshot | null> {
    const sessionId = this.sessionId;
    const stored = await this.db.getBotSession(sessionId);

    if (!stored) {
      this.logOnce(`Session ${sessionId} belum dibuat; worker tetap mengumpulkan market data.`);
      return null;
    }
    const data = toSessionRecord(stored);

    if (data.mode !== 'PAPER_APPROVAL' && data.mode !== 'PAPER_AUTO' && data.mode !== 'OBSERVATION') {
      this.logState(data.status, 'Mode non-paper ditolak oleh worker; belum ada live/testnet execution.');
      return null;
    }

    await this.ensureEngine(sessionId, data);
    if (!this.engine) return null;

    // A worker restart can restore an old WAITING_APPROVAL signal. Expire it
    // before command handling so the session cannot remain stuck indefinitely.
    this.engine.expirePendingApproval(new Date());
    const action = desiredStatusAction(data.status);
    const before = this.engine.snapshot().status;
    if (action === 'START' && data.status === 'RUNNING' && before === 'WAITING_APPROVAL') {
      this.engine.resumeObservation();
    } else if (action === 'START' && before !== 'RUNNING' && before !== 'WAITING_APPROVAL' && before !== 'POSITION_OPEN') {
      this.engine.start();
    } else if (action === 'PAUSE' && before !== 'PAUSED') {
      this.engine.pause();
    } else if (action === 'EMERGENCY' && before !== 'EMERGENCY') {
      this.engine.emergencyStop();
    } else if (action === 'APPROVE' && before === 'WAITING_APPROVAL') {
      this.engine.approvePending();
    }

    let snapshot = this.engine.snapshot();
    if (snapshot.status === 'RUNNING') {
      snapshot = await this.evaluateLatestCandles(sessionId, data, snapshot);
    }
    if (snapshot.status === 'POSITION_OPEN') {
      snapshot = await this.markLatestPrice(data, snapshot);
    }
    await this.persistPaperState(sessionId, data, snapshot);
    await this.persistDerivedStatus(sessionId, data.status, snapshot.status);
    await this.touchHeartbeat(sessionId);
    this.logState(data.status, `Command ${action}; engine ${snapshot.status}.`);
    this.lastEngineStatus = snapshot.status;
    return snapshot;
  }

  async watch(): Promise<void> {
    // Respons tombol tetap cepat, tetapi tidak lagi membuat enam query per menit
    // per sesi saat strategi hanya berubah pada penutupan candle 15m/1h.
    const intervalMs = Math.max(Number(process.env.CONTROL_POLL_INTERVAL_MS ?? 30_000), 10_000);
    for (;;) {
      try {
        await this.sync();
      } catch (error) {
        console.error('[control]', error);
      }
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
  }

  private async ensureEngine(sessionId: string, session: SessionRecord): Promise<void> {
    const mode = session.mode === 'PAPER_AUTO' ? 'PAPER_AUTO' : 'PAPER_APPROVAL';
    if (this.engine && this.engine.snapshot().mode === mode) return;

    const strategy = resolvePaperStrategy(process.env.BOT_STRATEGY);
    const configuredLock = Number(process.env.DAILY_PROFIT_LOCK_USDT);
    this.engine = new PaperBotEngine({
      symbol: session.symbol,
      riskFraction: Number(session.risk_fraction),
      dailyLossFraction: Number(session.daily_loss_limit),
      dailyProfitLockUsdt: Number.isFinite(configuredLock) && configuredLock > 0 ? configuredLock : null,
      mode,
      strategy,
      entryIntervalMs: strategy === 'WILLIAMS_VOLATILITY_BREAKOUT' ? 60 * 60 * 1000 : 15 * 60 * 1000,
    });

    const openPosition = await this.db.getOpenPosition(sessionId, session.symbol);
    if (openPosition) {
      const restored = mapStoredPosition(openPosition);
      this.engine.restorePosition(restored);
      this.lastPersistedOpenId = restored.id;
    }

    if ((session.status === 'WAITING_APPROVAL' || session.status === 'POSITION_OPEN') && !openPosition) {
      const pending = await this.db.latestSignal(sessionId, {
        symbol: session.symbol,
        stage: 'TRIGGERED',
        decisionIn: ['LONG', 'SHORT'],
      });
      if (pending) {
        this.lastSignalId = pending.id;
        this.engine.restorePendingSignal(mapStoredSignal(pending));
      }
    }
  }

  private async evaluateLatestCandles(sessionId: string, session: SessionRecord, current: WorkerSnapshot): Promise<WorkerSnapshot> {
    const strategy = resolvePaperStrategy(process.env.BOT_STRATEGY);
    const entryInterval = strategy === 'WILLIAMS_VOLATILITY_BREAKOUT' ? WILLIAMS_ENTRY_INTERVAL : '15m';
    const entryLimit = strategy === 'WILLIAMS_VOLATILITY_BREAKOUT' ? WILLIAMS_ENTRY_CANDLE_LIMIT : 500;
    // Cek satu timestamp dulu. Versi lama mengunduh 500–1.200 candle pada SETIAP
    // poll 10 detik, lalu baru menyadari candle belum berubah. Riwayat penuh kini
    // hanya dibaca sekali ketika benar-benar ada candle baru.
    const latestOpenTime = await this.db.latestCandleOpenTime(session.symbol, entryInterval);
    if (!latestOpenTime) return current;
    const defaultMaxAge = strategy === 'WILLIAMS_VOLATILITY_BREAKOUT'
      ? WILLIAMS_MARKET_DATA_MAX_AGE_MS
      : DEFAULT_MARKET_DATA_MAX_AGE_MS;
    const configuredMaxAge = Number(process.env.MARKET_DATA_MAX_AGE_MS ?? defaultMaxAge);
    const maxAgeMs = Number.isFinite(configuredMaxAge) && configuredMaxAge >= defaultMaxAge
      ? configuredMaxAge
      : defaultMaxAge;
    if (!isFreshMarketCandle(latestOpenTime, Date.now(), maxAgeMs)) {
      if (this.lastStaleMarketCandleTime !== latestOpenTime) {
        console.error(JSON.stringify({
          control: true,
          staleMarketData: true,
          sessionId,
          symbol: session.symbol,
          latestCandle: latestOpenTime,
          maxAgeMs,
          at: new Date().toISOString(),
        }));
        this.lastStaleMarketCandleTime = latestOpenTime;
      }
      return current;
    }
    this.lastStaleMarketCandleTime = null;
    if (this.lastEvaluatedCandleTime === latestOpenTime) return current;

    const persistedStructure = await this.db.latestSignalStructure(sessionId, session.symbol, entryInterval);
    const persistedCandleTime = (persistedStructure as { candle_open_time?: string } | null)?.candle_open_time;
    if (persistedCandleTime === latestOpenTime) {
      this.lastEvaluatedCandleTime = latestOpenTime;
      return current;
    }

    const [higherRows, entryRows] = await Promise.all([
      this.db.latestCandles(session.symbol, '1h', 500),
      this.db.latestCandles(session.symbol, entryInterval, entryLimit),
    ]);
    const higherTimeframe = higherRows.reverse().map(mapCandle);
    const entryTimeframe = entryRows.reverse().map(mapCandle);
    const snapshot = this.engine?.onClosedCandle({ higherTimeframe, entryTimeframe }) ?? current;
    const signal = snapshot.latestSignal;
    if (!signal) return snapshot;

    const signalId = await this.db.insertSignalEvaluation({
      bot_session_id: sessionId,
      symbol: session.symbol,
      timeframe: entryInterval,
      evaluated_at: new Date().toISOString(),
      decision: signal.decision,
      candidate: signal.candidate,
      stage: signal.stage,
      timing: signal.timing,
      regime: signal.regime,
      quality_score: signal.qualityScore,
      entry: signal.entry,
      trigger_price: signal.triggerPrice,
      stop_loss: signal.stopLoss,
      take_profit: signal.takeProfit,
      quantity: signal.quantity,
      risk_amount: signal.riskAmount,
      risk_reward: signal.riskReward,
      evidence: signal.evidence,
      blockers: signal.blockers,
      patterns: signal.patterns,
      structure: { ...signal.structure, candle_open_time: latestOpenTime },
    });

    this.lastSignalId = signalId;
    this.lastEvaluatedCandleTime = latestOpenTime;
    console.log(JSON.stringify({
      signal: true,
      sessionId,
      symbol: session.symbol,
      candle: latestOpenTime,
      decision: signal.decision,
      stage: signal.stage,
      qualityScore: signal.qualityScore,
      at: new Date().toISOString(),
    }));
    return snapshot;
  }

  private async markLatestPrice(session: SessionRecord, current: WorkerSnapshot): Promise<WorkerSnapshot> {
    const rows = await this.db.latestCandles(session.symbol, '15m', 1);
    const latest = rows[0];
    if (!latest) return current;
    // Satu candle hanya boleh dihitung sekali. Pemrosesan ulang tiap poll dapat
    // menambah barsHeld dan memicu time-exit paper terlalu cepat.
    if (this.lastMarkedCandleTime === latest.open_time) return current;
    this.lastMarkedCandleTime = latest.open_time;
    return this.engine?.onCandle({
      high: Number(latest.high),
      low: Number(latest.low),
      close: Number(latest.close),
      now: new Date(latest.open_time),
    }) ?? current;
  }

  private async persistPaperState(sessionId: string, session: SessionRecord, snapshot: WorkerSnapshot): Promise<void> {
    if (snapshot.position && snapshot.position.id !== this.lastPersistedOpenId) {
      const existing = await this.db.getOpenPosition(sessionId, session.symbol);
      if (!existing) {
        await this.db.upsertPaperOrder({
          bot_session_id: sessionId,
          signal_id: this.lastSignalId,
          client_order_id: snapshot.position.id,
          symbol: snapshot.position.symbol,
          side: snapshot.position.side,
          order_type: 'SIMULATED_MARKET',
          status: 'FILLED',
          quantity: snapshot.position.quantity,
          requested_price: snapshot.position.entry,
          filled_price: snapshot.position.entry,
          metadata: { mode: snapshot.mode, source: 'PAPER_APPROVAL', estimated_entry_costs: snapshot.position.entryCosts ?? 0 },
        });

        await this.db.insertPaperPosition({
          bot_session_id: sessionId,
          symbol: snapshot.position.symbol,
          side: snapshot.position.side,
          status: 'OPEN',
          quantity: snapshot.position.quantity,
          entry_price: snapshot.position.entry,
          stop_loss: snapshot.position.stopLoss,
          take_profit: snapshot.position.takeProfit,
          opened_at: snapshot.position.openedAt,
          metadata: {
            engine_position_id: snapshot.position.id,
            mode: snapshot.mode,
            risk_amount: snapshot.position.riskAmount ?? null,
            entry_costs: snapshot.position.entryCosts ?? 0,
          },
        });
        await this.writeJournal(sessionId, snapshot.position.symbol, 'PAPER_OPEN', 'Paper approval disetujui dan position dibuat.', snapshot);
      }
      this.lastPersistedOpenId = snapshot.position.id;
    }

    const closed = snapshot.lastClosedPosition;
    const closedIsNew = Boolean(closed && closed.id !== this.lastPersistedClosedId);
    if (closed && closedIsNew) {
      await this.db.closeOpenPosition(sessionId, session.symbol, {
        exit_price: closed.exit,
        realized_pnl: closed.realizedPnl,
        close_reason: closed.closeReason,
        closed_at: closed.closedAt,
        metadata: {
          engine_position_id: closed.id,
          risk_amount: closed.riskAmount ?? null,
          entry_costs: closed.entryCosts ?? 0,
          total_costs: closed.totalCosts ?? 0,
          bars_held: closed.barsHeld ?? null,
        },
      });
      await this.writeJournal(sessionId, closed.symbol, 'PAPER_CLOSE', `${closed.closeReason ?? 'EXIT'} pada ${closed.exit}.`, snapshot);
      this.lastPersistedClosedId = closed.id;
      this.lastPersistedOpenId = null;
    }

    const now = Date.now();
    // Grafik equity cukup satu titik per candle 15m. Penutupan baru tetap disimpan
    // segera; posisi closed lama tidak lagi menyebabkan insert pada setiap poll.
    if (now - this.lastEquitySnapshotAt >= 15 * 60_000 || closedIsNew) {
      await this.db.insertEquitySnapshot({
        bot_session_id: sessionId,
        equity: snapshot.equity,
        realized_pnl: snapshot.realizedPnl,
        unrealized_pnl: 0,
        drawdown: 0,
        daily_loss: Math.max(0, -snapshot.dailyRealizedPnl),
      });
      this.lastEquitySnapshotAt = now;
    }
  }

  private async writeJournal(sessionId: string, symbol: string, action: string, reason: string, snapshot: WorkerSnapshot): Promise<void> {
    await this.db.insertJournal({
      bot_session_id: sessionId,
      symbol,
      action,
      reason,
      quality_score: snapshot.latestSignal?.qualityScore ?? null,
      payload: { status: snapshot.status, mode: snapshot.mode, position: snapshot.position, lastClosedPosition: snapshot.lastClosedPosition },
    });
  }

  private async touchHeartbeat(sessionId: string): Promise<void> {
    const now = Date.now();
    // Heartbeat operasional, bukan bagian rumus trading; lima menit cukup untuk
    // membuktikan worker hidup tanpa menulis database dua kali per menit.
    if (now - this.lastHeartbeatAt < 5 * 60_000) return;
    await this.db.touchBotSession(sessionId, new Date(now).toISOString());
    this.lastHeartbeatAt = now;
  }

  private async persistDerivedStatus(sessionId: string, requestedStatus: BotStatus, actualStatus: BotStatus): Promise<void> {
    const derivedStatus = actualStatus === 'RUNNING' && requestedStatus === 'COOLDOWN' ? 'RUNNING' : actualStatus;
    const riskPause = derivedStatus === 'PAUSED' && requestedStatus !== 'PAUSED';
    // A stale restored approval may be cleared back to observation from either persisted status.
    const staleApprovalRecovery = derivedStatus === 'RUNNING' && (requestedStatus === 'POSITION_OPEN' || requestedStatus === 'WAITING_APPROVAL');
    if (derivedStatus !== 'WAITING_APPROVAL' && derivedStatus !== 'POSITION_OPEN' && derivedStatus !== 'COOLDOWN' && !riskPause && !(requestedStatus === 'COOLDOWN' && derivedStatus === 'RUNNING') && !staleApprovalRecovery) return;
    if (requestedStatus === derivedStatus) return;
    await this.db.updateBotSessionStatus(sessionId, derivedStatus, requestedStatus);
  }

  private logState(desired: BotStatus, message: string): void {
    const engineStatus = this.engine?.snapshot().status ?? 'IDLE';
    if (desired !== this.lastDesiredStatus || engineStatus !== this.lastEngineStatus) {
      console.log(JSON.stringify({ control: true, desired, engine: engineStatus, message, at: new Date().toISOString() }));
      this.lastDesiredStatus = desired;
      this.lastEngineStatus = engineStatus;
    }
  }

  private logOnce(message: string): void {
    if (this.lastDesiredStatus !== null) return;
    console.log(JSON.stringify({ control: true, desired: 'NO_SESSION', engine: 'IDLE', message, at: new Date().toISOString() }));
    this.lastDesiredStatus = 'IDLE';
  }
}
