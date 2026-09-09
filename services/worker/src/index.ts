import {
  createDailyMarketPlan,
  evaluateIntelligentSignal,
  type Candle,
  type DailyMarketPlan,
  type IntelligentSignal,
  type WindowProfile,
} from '@nusaquant/core';

export type BotStatus = 'IDLE' | 'STARTING' | 'RUNNING' | 'WAITING_APPROVAL' | 'POSITION_OPEN' | 'PAUSED' | 'COOLDOWN' | 'EMERGENCY';
export type ExecutionMode = 'PAPER_APPROVAL' | 'PAPER_AUTO';
export type PositionSide = 'LONG' | 'SHORT';

export interface PaperPosition {
  id: string;
  symbol: string;
  side: PositionSide;
  entry: number;
  quantity: number;
  stopLoss: number;
  takeProfit: number;
  openedAt: string;
  closedAt?: string;
  exit?: number;
  realizedPnl?: number;
  closeReason?: string;
}

export interface WorkerSnapshot {
  status: BotStatus;
  mode: ExecutionMode;
  plan: DailyMarketPlan | null;
  latestSignal: IntelligentSignal | null;
  pendingSignal: IntelligentSignal | null;
  position: PaperPosition | null;
  lastClosedPosition: PaperPosition | null;
  equity: number;
  realizedPnl: number;
  lastEvent: string | null;
}

export interface WorkerEvent {
  type: 'STATUS' | 'PLAN' | 'SIGNAL' | 'ORDER' | 'POSITION' | 'ERROR';
  message: string;
  snapshot: WorkerSnapshot;
}

class PaperBroker {
  private position: PaperPosition | null = null;
  private sequence = 0;

  getPosition(): PaperPosition | null {
    return this.position;
  }

  open(symbol: string, signal: IntelligentSignal, now: Date): PaperPosition {
    if (this.position) throw new Error('Paper broker menolak order: posisi sudah terbuka.');
    if (signal.decision === 'NO_TRADE' || signal.entry === null || signal.stopLoss === null || signal.takeProfit === null) {
      throw new Error('Paper broker menolak order: signal belum valid.');
    }
    this.sequence += 1;
    this.position = {
      id: `paper-${this.sequence}`,
      symbol,
      side: signal.decision,
      entry: signal.entry,
      quantity: signal.quantity,
      stopLoss: signal.stopLoss,
      takeProfit: signal.takeProfit,
      openedAt: now.toISOString(),
    };
    return this.position;
  }

  mark(price: number, now: Date): PaperPosition | null {
    if (!this.position) return null;
    const position = this.position;
    const stopHit = position.side === 'LONG' ? price <= position.stopLoss : price >= position.stopLoss;
    const targetHit = position.side === 'LONG' ? price >= position.takeProfit : price <= position.takeProfit;
    if (!stopHit && !targetHit) return null;

    const exit = stopHit ? position.stopLoss : position.takeProfit;
    const grossPnl = position.side === 'LONG'
      ? (exit - position.entry) * position.quantity
      : (position.entry - exit) * position.quantity;
    this.position = {
      ...position,
      closedAt: now.toISOString(),
      exit,
      realizedPnl: grossPnl,
      closeReason: stopHit ? 'STOP_LOSS' : 'TAKE_PROFIT',
    };
    return this.position;
  }

  restore(position: PaperPosition): void {
    if (this.position) throw new Error('Paper broker tidak dapat restore: posisi sudah tersedia.');
    this.position = { ...position };
    const sequence = Number(position.id.replace('paper-', ''));
    if (Number.isFinite(sequence)) this.sequence = Math.max(this.sequence, sequence);
  }

  clearClosedPosition(): void {
    if (this.position?.closedAt) this.position = null;
  }
}

export class PaperBotEngine {
  private readonly equityStart: number;
  private readonly profiles: WindowProfile[];
  private readonly symbol: string;
  private readonly riskFraction: number;
  private status: BotStatus = 'IDLE';
  private readonly mode: ExecutionMode;
  private plan: DailyMarketPlan | null = null;
  private latestSignal: IntelligentSignal | null = null;
  private pendingSignal: IntelligentSignal | null = null;
  private readonly broker = new PaperBroker();
  private realizedPnl = 0;
  private cooldownUntil = 0;
  private lastClosedPosition: PaperPosition | null = null;
  private lastEvent: string | null = null;
  private listeners = new Set<(event: WorkerEvent) => void>();

  constructor({
    equity = 10_000,
    symbol = 'BTCUSDT',
    riskFraction = 0.0025,
    mode = 'PAPER_APPROVAL',
    profiles = [],
  }: {
    equity?: number;
    symbol?: string;
    riskFraction?: number;
    mode?: ExecutionMode;
    profiles?: WindowProfile[];
  } = {}) {
    this.equityStart = equity;
    this.symbol = symbol;
    this.riskFraction = riskFraction;
    this.mode = mode;
    this.profiles = profiles;
  }

  subscribe(listener: (event: WorkerEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  snapshot(): WorkerSnapshot {
    return {
      status: this.status,
      mode: this.mode,
      plan: this.plan,
      latestSignal: this.latestSignal,
      pendingSignal: this.pendingSignal,
      position: this.broker.getPosition(),
      lastClosedPosition: this.lastClosedPosition,
      equity: this.equityStart + this.realizedPnl,
      realizedPnl: this.realizedPnl,
      lastEvent: this.lastEvent,
    };
  }

  start(now = new Date()): WorkerSnapshot {
    if (this.status === 'RUNNING' || this.status === 'POSITION_OPEN') return this.snapshot();
    this.status = 'STARTING';
    this.emit('STATUS', 'Bot mulai sinkronisasi dan membuat market plan.');
    this.plan = createDailyMarketPlan({
      now,
      regime: 'UNCERTAIN',
      profiles: this.profiles,
    });
    this.status = 'RUNNING';
    this.emit('PLAN', 'Market plan dibuat; bot mulai observasi.');
    return this.snapshot();
  }

  pause(): WorkerSnapshot {
    if (this.status !== 'EMERGENCY') this.status = 'PAUSED';
    this.pendingSignal = null;
    this.emit('STATUS', 'Entry baru dihentikan. Posisi terbuka tetap dipantau.');
    return this.snapshot();
  }

  emergencyStop(): WorkerSnapshot {
    this.status = 'EMERGENCY';
    this.pendingSignal = null;
    this.emit('STATUS', 'Emergency stop aktif; tidak ada entry baru.');
    return this.snapshot();
  }

  onPriceTick(price: number, now = new Date()): WorkerSnapshot {
    const closed = this.broker.mark(price, now);
    if (closed) {
      this.realizedPnl += closed.realizedPnl ?? 0;
      this.lastClosedPosition = closed;
      this.status = 'COOLDOWN';
      this.cooldownUntil = now.getTime() + 3 * 15 * 60 * 1000;
      this.emit('POSITION', `${closed.closeReason} pada ${closed.exit}. P/L kotor ${closed.realizedPnl?.toFixed(2)} USDT.`);
      this.broker.clearClosedPosition();
    }
    return this.snapshot();
  }

  onClosedCandle({ higherTimeframe, entryTimeframe, now = new Date() }: {
    higherTimeframe: Candle[];
    entryTimeframe: Candle[];
    now?: Date;
  }): WorkerSnapshot {
    if (this.status === 'PAUSED' || this.status === 'EMERGENCY' || this.status === 'IDLE') return this.snapshot();
    if (this.status === 'COOLDOWN' && now.getTime() < this.cooldownUntil) return this.snapshot();
    if (this.status === 'COOLDOWN') this.status = 'RUNNING';
    if (this.broker.getPosition()) return this.snapshot();

    const signal = evaluateIntelligentSignal({
      higherTimeframe,
      entryTimeframe,
      equity: this.equityStart + this.realizedPnl,
      riskFraction: this.riskFraction,
    });
    this.latestSignal = signal;
    this.emit('SIGNAL', `${signal.decision} · ${signal.stage} · score ${signal.qualityScore}/100.`);

    if (signal.decision === 'NO_TRADE') {
      this.pendingSignal = null;
      this.status = 'RUNNING';
      return this.snapshot();
    }

    this.pendingSignal = signal;
    if (this.mode === 'PAPER_APPROVAL') {
      this.status = 'WAITING_APPROVAL';
      this.emit('STATUS', 'Entry siap tetapi menunggu persetujuan pengguna.');
      return this.snapshot();
    }

    this.openPending(now);
    return this.snapshot();
  }

  restorePosition(position: PaperPosition): WorkerSnapshot {
    if (this.broker.getPosition()) return this.snapshot();
    this.broker.restore(position);
    this.status = 'POSITION_OPEN';
    this.emit('POSITION', `Paper position ${position.id} dipulihkan dari Supabase.`);
    return this.snapshot();
  }

  restorePendingSignal(signal: IntelligentSignal): WorkerSnapshot {
    if (this.broker.getPosition() || this.pendingSignal) return this.snapshot();
    this.latestSignal = signal;
    this.pendingSignal = signal;
    this.status = 'WAITING_APPROVAL';
    this.emit('SIGNAL', 'Pending paper signal dipulihkan dari Supabase.');
    return this.snapshot();
  }

  approvePending(now = new Date()): WorkerSnapshot {
    if (this.status !== 'WAITING_APPROVAL' || !this.pendingSignal) {
      this.emit('ERROR', 'Tidak ada entry valid yang menunggu persetujuan.');
      return this.snapshot();
    }
    this.openPending(now);
    return this.snapshot();
  }

  private openPending(now: Date): void {
    if (!this.pendingSignal) return;
    const position = this.broker.open(this.symbol, this.pendingSignal, now);
    this.lastClosedPosition = null;
    this.pendingSignal = null;
    this.status = 'POSITION_OPEN';
    this.emit('ORDER', `Paper order ${position.side} ${position.quantity} ${position.symbol} dibuka.`);
  }

  private emit(type: WorkerEvent['type'], message: string): void {
    this.lastEvent = message;
    const event: WorkerEvent = { type, message, snapshot: this.snapshot() };
    this.listeners.forEach((listener) => listener(event));
  }
}
