import type { Candle, IntelligentSignal } from '@nusaquant/core';
import { PaperBotEngine, type BotStatus, type ExecutionMode, type PaperPosition, type WorkerSnapshot } from './index.ts';
import { createWorkerSupabaseClient } from './supabase.ts';

export const DEFAULT_BOT_SESSION_ID = '00000000-0000-4000-8000-000000000001';
export const ETH_BOT_SESSION_ID = '00000000-0000-4000-8000-000000000002';

export const DEFAULT_BOT_SESSION_IDS = [DEFAULT_BOT_SESSION_ID, ETH_BOT_SESSION_ID] as const;
export const DEFAULT_MARKET_DATA_MAX_AGE_MS = 45 * 60 * 1000;

export function resolveBotSessionIds(configured?: string): string[] {
  const extra = (configured ?? '').split(',').map((id) => id.trim()).filter(Boolean);
  return [...new Set([...DEFAULT_BOT_SESSION_IDS, ...extra])];
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

type CandleRow = {
  open_time: string;
  open: number | string;
  high: number | string;
  low: number | string;
  close: number | string;
  volume: number | string;
};

type StoredPosition = {
  id: string;
  symbol: string;
  side: 'LONG' | 'SHORT';
  quantity: number | string;
  entry_price: number | string;
  stop_loss: number | string;
  take_profit: number | string;
  opened_at: string;
  metadata: Record<string, unknown> | null;
};

type StoredSignal = {
  id: string;
  decision: 'LONG' | 'SHORT' | 'NO_TRADE';
  candidate: 'LONG' | 'SHORT' | 'NO_TRADE';
  stage: 'TRIGGERED' | 'SETUP' | 'NO_TRADE';
  timing: 'ENTER_NOW' | 'WAIT_CONFIRMATION' | 'NO_TRADE';
  regime: string;
  quality_score: number;
  entry: number | null;
  trigger_price: number | null;
  stop_loss: number | null;
  take_profit: number | null;
  quantity: number;
  risk_amount: number;
  risk_reward: number | null;
  evidence: IntelligentSignal['evidence'];
  blockers: string[];
  patterns: IntelligentSignal['patterns'];
  structure: IntelligentSignal['structure'] & { candle_open_time?: string };
};

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
  };
}

function mapStoredPosition(row: StoredPosition): PaperPosition {
  const engineId = typeof row.metadata?.engine_position_id === 'string'
    ? row.metadata.engine_position_id
    : `db-${row.id}`;
  return {
    id: engineId,
    symbol: row.symbol,
    side: row.side,
    entry: Number(row.entry_price),
    quantity: Number(row.quantity),
    stopLoss: Number(row.stop_loss),
    takeProfit: Number(row.take_profit),
    openedAt: row.opened_at,
    riskAmount: typeof row.metadata?.risk_amount === 'number' ? row.metadata.risk_amount : undefined,
    entryCosts: typeof row.metadata?.entry_costs === 'number' ? row.metadata.entry_costs : undefined,
    totalCosts: typeof row.metadata?.total_costs === 'number' ? row.metadata.total_costs : undefined,
    barsHeld: typeof row.metadata?.bars_held === 'number' ? row.metadata.bars_held : undefined,
  };
}

function mapStoredSignal(row: StoredSignal): IntelligentSignal {
  return {
    decision: row.decision,
    candidate: row.candidate,
    stage: row.stage,
    timing: row.timing,
    regime: row.regime as IntelligentSignal['regime'],
    qualityScore: row.quality_score,
    scoreMax: 100,
    entry: row.entry,
    triggerPrice: row.trigger_price,
    stopLoss: row.stop_loss,
    takeProfit: row.take_profit,
    quantity: Number(row.quantity),
    riskAmount: Number(row.risk_amount),
    riskReward: row.risk_reward,
    maxChaseDistance: null,
    patterns: row.patterns ?? [],
    structure: row.structure,
    evidence: row.evidence ?? [],
    blockers: row.blockers ?? [],
    explanation: 'Signal dipulihkan dari signal_evaluations untuk paper approval.',
  };
}

export class PaperSessionController {
  private readonly client = createWorkerSupabaseClient();
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
  private lastPersistedClosedId: string | null = null;
  private lastEquitySnapshotAt = 0;
  private lastHeartbeatAt = 0;

  async sync(): Promise<WorkerSnapshot | null> {
    const sessionId = this.sessionId;
    const { data, error } = await this.client
      .from('bot_sessions')
      .select('id,status,mode,symbol,risk_fraction,daily_loss_limit,updated_at')
      .eq('id', sessionId)
      .maybeSingle<SessionRecord>();

    if (error) throw new Error(`Gagal membaca bot session: ${error.message}`);
    if (!data) {
      this.logOnce(`Session ${sessionId} belum dibuat; worker tetap mengumpulkan market data.`);
      return null;
    }

    if (data.mode !== 'PAPER_APPROVAL' && data.mode !== 'PAPER_AUTO' && data.mode !== 'OBSERVATION') {
      this.logState(data.status, 'Mode non-paper ditolak oleh worker; belum ada live/testnet execution.');
      return null;
    }

    await this.ensureEngine(sessionId, data);
    if (!this.engine) return null;

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
    const intervalMs = Math.max(Number(process.env.CONTROL_POLL_INTERVAL_MS ?? 10_000), 5_000);
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

    this.engine = new PaperBotEngine({
      symbol: session.symbol,
      riskFraction: Number(session.risk_fraction),
      dailyLossFraction: Number(session.daily_loss_limit),
      mode,
    });

    const openPosition = await this.client
      .from('paper_positions')
      .select('id,symbol,side,quantity,entry_price,stop_loss,take_profit,opened_at,metadata')
      .eq('bot_session_id', sessionId)
      .eq('symbol', session.symbol)
      .eq('status', 'OPEN')
      .maybeSingle<StoredPosition>();
    if (openPosition.error) throw new Error(`Gagal membaca paper position: ${openPosition.error.message}`);
    if (openPosition.data) this.engine.restorePosition(mapStoredPosition(openPosition.data));

    if ((session.status === 'WAITING_APPROVAL' || session.status === 'POSITION_OPEN') && !openPosition.data) {
      const pending = await this.client
        .from('signal_evaluations')
        .select('id,decision,candidate,stage,timing,regime,quality_score,entry,trigger_price,stop_loss,take_profit,quantity,risk_amount,risk_reward,evidence,blockers,patterns,structure')
        .eq('bot_session_id', sessionId)
        .eq('symbol', session.symbol)
        .in('decision', ['LONG', 'SHORT'])
        .eq('stage', 'TRIGGERED')
        .order('evaluated_at', { ascending: false })
        .limit(1)
        .maybeSingle<StoredSignal>();
      if (pending.error) throw new Error(`Gagal membaca pending signal: ${pending.error.message}`);
      if (pending.data) {
        this.lastSignalId = pending.data.id;
        this.engine.restorePendingSignal(mapStoredSignal(pending.data));
      }
    }
  }

  private async evaluateLatestCandles(sessionId: string, session: SessionRecord, current: WorkerSnapshot): Promise<WorkerSnapshot> {
    const [higherResult, entryResult] = await Promise.all([
      this.client.from('market_candles').select('open_time,open,high,low,close,volume').eq('symbol', session.symbol).eq('interval', '1h').order('open_time', { ascending: false }).limit(500),
      this.client.from('market_candles').select('open_time,open,high,low,close,volume').eq('symbol', session.symbol).eq('interval', '15m').order('open_time', { ascending: false }).limit(500),
    ]);
    if (higherResult.error) throw new Error(`Gagal membaca candle 1h: ${higherResult.error.message}`);
    if (entryResult.error) throw new Error(`Gagal membaca candle 15m: ${entryResult.error.message}`);

    const higherRows = (higherResult.data ?? []) as CandleRow[];
    const entryRows = (entryResult.data ?? []) as CandleRow[];
    const latestRow = entryRows[0];
    if (!latestRow) return current;
    const configuredMaxAge = Number(process.env.MARKET_DATA_MAX_AGE_MS ?? DEFAULT_MARKET_DATA_MAX_AGE_MS);
    const maxAgeMs = Number.isFinite(configuredMaxAge) && configuredMaxAge >= 15 * 60 * 1000
      ? configuredMaxAge
      : DEFAULT_MARKET_DATA_MAX_AGE_MS;
    if (!isFreshMarketCandle(latestRow.open_time, Date.now(), maxAgeMs)) {
      if (this.lastStaleMarketCandleTime !== latestRow.open_time) {
        console.error(JSON.stringify({
          control: true,
          staleMarketData: true,
          sessionId,
          symbol: session.symbol,
          latestCandle: latestRow.open_time,
          maxAgeMs,
          at: new Date().toISOString(),
        }));
        this.lastStaleMarketCandleTime = latestRow.open_time;
      }
      return current;
    }
    this.lastStaleMarketCandleTime = null;
    if (this.lastEvaluatedCandleTime === latestRow.open_time) return current;

    const latestPersisted = await this.client
      .from('signal_evaluations')
      .select('structure')
      .eq('bot_session_id', sessionId)
      .eq('symbol', session.symbol)
      .eq('timeframe', '15m')
      .order('evaluated_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (latestPersisted.error) throw new Error(`Gagal membaca signal terakhir: ${latestPersisted.error.message}`);
    const persistedCandleTime = (latestPersisted.data?.structure as { candle_open_time?: string } | null)?.candle_open_time;
    if (persistedCandleTime === latestRow.open_time) {
      this.lastEvaluatedCandleTime = latestRow.open_time;
      return current;
    }

    const higherTimeframe = higherRows.reverse().map(mapCandle);
    const entryTimeframe = entryRows.reverse().map(mapCandle);
    const snapshot = this.engine?.onClosedCandle({ higherTimeframe, entryTimeframe }) ?? current;
    const signal = snapshot.latestSignal;
    if (!signal) return snapshot;

    const inserted = await this.client.from('signal_evaluations').insert({
      bot_session_id: sessionId,
      symbol: session.symbol,
      timeframe: '15m',
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
      structure: { ...signal.structure, candle_open_time: latestRow.open_time },
    }).select('id').single();
    if (inserted.error) throw new Error(`Gagal menyimpan signal evaluation: ${inserted.error.message}`);

    this.lastSignalId = inserted.data.id;
    this.lastEvaluatedCandleTime = latestRow.open_time;
    console.log(JSON.stringify({
      signal: true,
      sessionId,
      symbol: session.symbol,
      candle: latestRow.open_time,
      decision: signal.decision,
      stage: signal.stage,
      qualityScore: signal.qualityScore,
      at: new Date().toISOString(),
    }));
    return snapshot;
  }

  private async markLatestPrice(session: SessionRecord, current: WorkerSnapshot): Promise<WorkerSnapshot> {
    const latest = await this.client
      .from('market_candles')
      .select('close,open_time')
      .eq('symbol', session.symbol)
      .eq('interval', '15m')
      .order('open_time', { ascending: false })
      .limit(1)
      .maybeSingle<{ close: number | string; open_time: string }>();
    if (latest.error) throw new Error(`Gagal membaca harga paper position: ${latest.error.message}`);
    if (!latest.data) return current;
    return this.engine?.onPriceTick(Number(latest.data.close), new Date(latest.data.open_time)) ?? current;
  }

  private async persistPaperState(sessionId: string, session: SessionRecord, snapshot: WorkerSnapshot): Promise<void> {
    if (snapshot.position) {
      const existing = await this.client
        .from('paper_positions')
        .select('id')
        .eq('bot_session_id', sessionId)
        .eq('symbol', session.symbol)
        .eq('status', 'OPEN')
        .maybeSingle();
      if (existing.error) throw new Error(`Gagal membaca paper position aktif: ${existing.error.message}`);
      if (!existing.data) {
        const order = await this.client.from('paper_orders').upsert({
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
        }, { onConflict: 'client_order_id', ignoreDuplicates: true });
        if (order.error) throw new Error(`Gagal menyimpan paper order: ${order.error.message}`);

        const position = await this.client.from('paper_positions').insert({
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
        if (position.error) throw new Error(`Gagal menyimpan paper position: ${position.error.message}`);
        await this.writeJournal(sessionId, snapshot.position.symbol, 'PAPER_OPEN', 'Paper approval disetujui dan position dibuat.', snapshot);
      }
    }

    const closed = snapshot.lastClosedPosition;
    if (closed && closed.id !== this.lastPersistedClosedId) {
      const update = await this.client
        .from('paper_positions')
        .update({
          status: 'CLOSED',
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
        })
        .eq('bot_session_id', sessionId)
        .eq('symbol', session.symbol)
        .eq('status', 'OPEN');
      if (update.error) throw new Error(`Gagal menutup paper position: ${update.error.message}`);
      await this.writeJournal(sessionId, closed.symbol, 'PAPER_CLOSE', `${closed.closeReason ?? 'EXIT'} pada ${closed.exit}.`, snapshot);
      this.lastPersistedClosedId = closed.id;
    }

    const now = Date.now();
    if (now - this.lastEquitySnapshotAt >= 60_000 || snapshot.lastClosedPosition !== null) {
      const equity = await this.client.from('equity_snapshots').insert({
        bot_session_id: sessionId,
        equity: snapshot.equity,
        realized_pnl: snapshot.realizedPnl,
        unrealized_pnl: 0,
        drawdown: 0,
        daily_loss: Math.max(0, -snapshot.dailyRealizedPnl),
      });
      if (equity.error) throw new Error(`Gagal menyimpan equity snapshot: ${equity.error.message}`);
      this.lastEquitySnapshotAt = now;
    }
  }

  private async writeJournal(sessionId: string, symbol: string, action: string, reason: string, snapshot: WorkerSnapshot): Promise<void> {
    const { error } = await this.client.from('trade_journal').insert({
      bot_session_id: sessionId,
      symbol,
      action,
      reason,
      quality_score: snapshot.latestSignal?.qualityScore ?? null,
      payload: { status: snapshot.status, mode: snapshot.mode, position: snapshot.position, lastClosedPosition: snapshot.lastClosedPosition },
    });
    if (error) throw new Error(`Gagal menyimpan trade journal: ${error.message}`);
  }

  private async touchHeartbeat(sessionId: string): Promise<void> {
    const now = Date.now();
    if (now - this.lastHeartbeatAt < 30_000) return;
    const { error } = await this.client
      .from('bot_sessions')
      .update({ updated_at: new Date(now).toISOString() })
      .eq('id', sessionId);
    if (error) throw new Error(`Gagal memperbarui worker heartbeat: ${error.message}`);
    this.lastHeartbeatAt = now;
  }

  private async persistDerivedStatus(sessionId: string, requestedStatus: BotStatus, actualStatus: BotStatus): Promise<void> {
    const derivedStatus = actualStatus === 'RUNNING' && requestedStatus === 'COOLDOWN' ? 'RUNNING' : actualStatus;
    const riskPause = derivedStatus === 'PAUSED' && requestedStatus !== 'PAUSED';
    if (derivedStatus !== 'WAITING_APPROVAL' && derivedStatus !== 'POSITION_OPEN' && derivedStatus !== 'COOLDOWN' && !riskPause && !(requestedStatus === 'COOLDOWN' && derivedStatus === 'RUNNING')) return;
    if (requestedStatus === derivedStatus) return;
    const { error } = await this.client.from('bot_sessions').update({ status: derivedStatus }).eq('id', sessionId).eq('status', requestedStatus);
    if (error) throw new Error(`Gagal memperbarui status worker: ${error.message}`);
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
