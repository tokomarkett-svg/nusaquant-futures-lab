import { evaluateIntelligentSignal, type IntelligentSignal } from './intelligence';
import type { Candle } from './index';
import type { WindowProfile } from './opportunity';

export interface BacktestConfig {
  initialEquity?: number;
  riskFraction?: number;
  feeRate?: number;
  slippageRate?: number;
  fundingRatePerBar?: number;
  maxBarsInTrade?: number;
  timezone?: string;
}

export interface BacktestTrade {
  symbol: string;
  side: 'LONG' | 'SHORT';
  entryTime: number;
  exitTime: number;
  entry: number;
  exit: number;
  stopLoss: number;
  takeProfit: number;
  quantity: number;
  grossPnl: number;
  costs: number;
  netPnl: number;
  rMultiple: number;
  exitReason: 'STOP_LOSS' | 'TAKE_PROFIT' | 'TIME_EXIT';
  qualityScore: number;
}

export interface BacktestReport {
  initialEquity: number;
  finalEquity: number;
  netPnl: number;
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number;
  profitFactor: number | null;
  expectancyR: number;
  maxDrawdown: number;
  maxDrawdownPct: number;
  trades: BacktestTrade[];
  windowProfiles: WindowProfile[];
  notes: string[];
}

function localMinute(timestamp: number, timezone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(timestamp));
  const hour = Number(parts.find((part) => part.type === 'hour')?.value ?? 0);
  const minute = Number(parts.find((part) => part.type === 'minute')?.value ?? 0);
  return hour * 60 + minute;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function findExit({ signal, futureCandles, maxBars }: {
  signal: IntelligentSignal;
  futureCandles: Candle[];
  maxBars: number;
}): { candle: Candle; reason: BacktestTrade['exitReason'] } | null {
  if (signal.entry === null || signal.stopLoss === null || signal.takeProfit === null) return null;
  const candles = futureCandles.slice(0, maxBars);
  for (const candle of candles) {
    const stopHit = signal.decision === 'LONG' ? candle.low <= signal.stopLoss : candle.high >= signal.stopLoss;
    const targetHit = signal.decision === 'LONG' ? candle.high >= signal.takeProfit : candle.low <= signal.takeProfit;
    // Conservative assumption: if both are touched in the same candle, stop loss occurs first.
    if (stopHit) return { candle, reason: 'STOP_LOSS' };
    if (targetHit) return { candle, reason: 'TAKE_PROFIT' };
  }
  const last = candles.at(-1);
  return last ? { candle: last, reason: 'TIME_EXIT' } : null;
}

function buildWindowProfiles(trades: BacktestTrade[], timezone: string): WindowProfile[] {
  const buckets = new Map<number, BacktestTrade[]>();
  for (const trade of trades) {
    const hourMinute = localMinute(trade.entryTime, timezone);
    const bucket = Math.floor(hourMinute / 60) * 60;
    const list = buckets.get(bucket) ?? [];
    list.push(trade);
    buckets.set(bucket, list);
  }

  return [...buckets.entries()].sort(([left], [right]) => left - right).map(([startMinute, bucket]) => {
    const wins = bucket.filter((trade) => trade.netPnl > 0).length;
    const totalRisk = bucket.reduce((sum, trade) => sum + trade.rMultiple, 0);
    return {
      id: `backtest-${startMinute}`,
      label: `Backtest ${String(Math.floor(startMinute / 60)).padStart(2, '0')}:00`,
      startMinute,
      endMinute: startMinute + 60,
      preferredRegimes: ['TREND_UP', 'TREND_DOWN'],
      sampleSize: bucket.length,
      setupCount: bucket.length,
      winRate: wins / bucket.length,
      expectancyR: totalRisk / bucket.length,
      notes: 'Profile berasal dari hasil backtest; tetap membutuhkan validasi out-of-sample.',
    } satisfies WindowProfile;
  });
}

export function runBacktest({
  symbol = 'BTCUSDT',
  higherTimeframe,
  entryTimeframe,
  config = {},
}: {
  symbol?: string;
  higherTimeframe: Candle[];
  entryTimeframe: Candle[];
  config?: BacktestConfig;
}): BacktestReport {
  const initialEquity = config.initialEquity ?? 10_000;
  const riskFraction = config.riskFraction ?? 0.0025;
  const feeRate = config.feeRate ?? 0.0004;
  const slippageRate = config.slippageRate ?? 0.0002;
  const fundingRatePerBar = config.fundingRatePerBar ?? 0.00001;
  const maxBarsInTrade = config.maxBarsInTrade ?? 96;
  const timezone = config.timezone ?? 'Asia/Jakarta';
  const trades: BacktestTrade[] = [];
  const signalConfig = { feeRate, slippageRate, fundingRatePerBar, maxBarsInTrade };
  let equity = initialEquity;
  let peakEquity = initialEquity;
  let maxDrawdown = 0;
  let index = 0;

  while (index < entryTimeframe.length) {
    const entryCandle = entryTimeframe[index];
    const higher = higherTimeframe.filter((candle) => candle.time <= entryCandle.time);
    if (higher.length < 220 || index < 80) {
      index += 1;
      continue;
    }

    const signal = evaluateIntelligentSignal({
      higherTimeframe: higher,
      entryTimeframe: entryTimeframe.slice(0, index + 1),
      equity,
      riskFraction,
      ...signalConfig,
    });
    if (signal.decision === 'NO_TRADE' || signal.entry === null || signal.stopLoss === null || signal.takeProfit === null) {
      index += 1;
      continue;
    }

    const exit = findExit({ signal, futureCandles: entryTimeframe.slice(index + 1), maxBars: maxBarsInTrade });
    if (!exit) {
      index += 1;
      continue;
    }

    const quantity = signal.quantity;
    const entryNotional = signal.entry * quantity;
    const exitNotional = exit.candle.close * quantity;
    const grossPnl = signal.decision === 'LONG'
      ? (exit.candle.close - signal.entry) * quantity
      : (signal.entry - exit.candle.close) * quantity;
    const barsHeld = Math.max(1, entryTimeframe.slice(index + 1).findIndex((candle) => candle.time === exit.candle.time) + 1);
    const costs = (entryNotional + exitNotional) * (feeRate + slippageRate) + entryNotional * fundingRatePerBar * barsHeld;
    const netPnl = grossPnl - costs;
    const riskAmount = Math.max(signal.riskAmount, Number.EPSILON);
    const rMultiple = netPnl / riskAmount;
    const trade: BacktestTrade = {
      symbol,
      side: signal.decision,
      entryTime: entryCandle.time,
      exitTime: exit.candle.time,
      entry: signal.entry,
      exit: exit.candle.close,
      stopLoss: signal.stopLoss,
      takeProfit: signal.takeProfit,
      quantity,
      grossPnl,
      costs,
      netPnl,
      rMultiple,
      exitReason: exit.reason,
      qualityScore: signal.qualityScore,
    };
    trades.push(trade);
    equity += netPnl;
    peakEquity = Math.max(peakEquity, equity);
    maxDrawdown = Math.max(maxDrawdown, peakEquity - equity);
    const exitIndex = entryTimeframe.findIndex((candle) => candle.time === exit.candle.time);
    index = exitIndex >= index ? exitIndex + 1 : index + 1;
  }

  const wins = trades.filter((trade) => trade.netPnl > 0);
  const losses = trades.filter((trade) => trade.netPnl < 0);
  const grossWins = wins.reduce((sum, trade) => sum + trade.netPnl, 0);
  const grossLosses = Math.abs(losses.reduce((sum, trade) => sum + trade.netPnl, 0));
  const expectancyR = trades.length === 0 ? 0 : trades.reduce((sum, trade) => sum + trade.rMultiple, 0) / trades.length;

  return {
    initialEquity,
    finalEquity: equity,
    netPnl: equity - initialEquity,
    totalTrades: trades.length,
    winningTrades: wins.length,
    losingTrades: losses.length,
    winRate: trades.length === 0 ? 0 : wins.length / trades.length,
    profitFactor: grossLosses === 0 ? (grossWins > 0 ? Number.POSITIVE_INFINITY : null) : grossWins / grossLosses,
    expectancyR,
    maxDrawdown,
    maxDrawdownPct: initialEquity === 0 ? 0 : clamp(maxDrawdown / initialEquity, 0, 1),
    trades,
    windowProfiles: buildWindowProfiles(trades, timezone),
    notes: [
      'Backtest menggunakan asumsi konservatif: stop loss diprioritaskan jika stop dan target tersentuh pada candle yang sama.',
      'Hasil backtest bukan jaminan performa live; gunakan out-of-sample dan walk-forward validation.',
      'Jika total trade nol atau sampel kecil, jangan membuat kesimpulan strategi.',
    ],
  };
}
