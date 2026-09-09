import type { Candle } from '@nusaquant/core';
import { PaperBotEngine, type BotStatus, type ExecutionMode, type WorkerSnapshot } from './index.ts';
import { createWorkerSupabaseClient } from './supabase.ts';

export const DEFAULT_BOT_SESSION_ID = '00000000-0000-4000-8000-000000000001';

type SessionRecord = {
  id: string;
  status: BotStatus;
  mode: ExecutionMode | 'OBSERVATION' | 'TESTNET' | 'LIVE';
  symbol: string;
  risk_fraction: number;
};

type CandleRow = {
  open_time: string;
  open: number | string;
  high: number | string;
  low: number | string;
  close: number | string;
  volume: number | string;
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

export class PaperSessionController {
  private readonly client = createWorkerSupabaseClient();
  private engine: PaperBotEngine | null = null;
  private lastDesiredStatus: BotStatus | null = null;
  private lastEngineStatus: BotStatus | null = null;
  private lastEvaluatedCandleTime: string | null = null;

  async sync(): Promise<WorkerSnapshot | null> {
    const sessionId = process.env.BOT_SESSION_ID ?? DEFAULT_BOT_SESSION_ID;
    const { data, error } = await this.client
      .from('bot_sessions')
      .select('id,status,mode,symbol,risk_fraction')
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

    if (!this.engine || this.engine.snapshot().mode !== (data.mode === 'PAPER_AUTO' ? 'PAPER_AUTO' : 'PAPER_APPROVAL')) {
      this.engine = new PaperBotEngine({
        symbol: data.symbol,
        riskFraction: Number(data.risk_fraction),
        mode: data.mode === 'PAPER_AUTO' ? 'PAPER_AUTO' : 'PAPER_APPROVAL',
      });
    }

    const action = desiredStatusAction(data.status);
    const before = this.engine.snapshot().status;
    if (action === 'START' && before !== 'RUNNING' && before !== 'WAITING_APPROVAL' && before !== 'POSITION_OPEN') {
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
    await this.persistDerivedStatus(sessionId, data.status, snapshot.status);
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

  private async evaluateLatestCandles(sessionId: string, session: SessionRecord, current: WorkerSnapshot): Promise<WorkerSnapshot> {
    const [higherResult, entryResult] = await Promise.all([
      this.client.from('market_candles').select('open_time,open,high,low,close,volume').eq('symbol', session.symbol).eq('interval', '1h').order('open_time', { ascending: false }).limit(250),
      this.client.from('market_candles').select('open_time,open,high,low,close,volume').eq('symbol', session.symbol).eq('interval', '15m').order('open_time', { ascending: false }).limit(120),
    ]);
    if (higherResult.error) throw new Error(`Gagal membaca candle 1h: ${higherResult.error.message}`);
    if (entryResult.error) throw new Error(`Gagal membaca candle 15m: ${entryResult.error.message}`);

    const higherRows = (higherResult.data ?? []) as CandleRow[];
    const entryRows = (entryResult.data ?? []) as CandleRow[];
    const latestRow = entryRows[0];
    if (!latestRow) return current;
    if (this.lastEvaluatedCandleTime === latestRow.open_time) return current;

    const higherTimeframe = higherRows.reverse().map(mapCandle);
    const entryTimeframe = entryRows.reverse().map(mapCandle);
    const snapshot = this.engine?.onClosedCandle({ higherTimeframe, entryTimeframe }) ?? current;
    const signal = snapshot.latestSignal;
    if (!signal) return snapshot;

    const { error } = await this.client.from('signal_evaluations').insert({
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
    });
    if (error) throw new Error(`Gagal menyimpan signal evaluation: ${error.message}`);

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

  private async persistDerivedStatus(sessionId: string, requestedStatus: BotStatus, actualStatus: BotStatus): Promise<void> {
    if (actualStatus !== 'WAITING_APPROVAL' && actualStatus !== 'POSITION_OPEN' && actualStatus !== 'COOLDOWN') return;
    if (requestedStatus === actualStatus) return;
    const { error } = await this.client.from('bot_sessions').update({ status: actualStatus }).eq('id', sessionId).eq('status', requestedStatus);
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
