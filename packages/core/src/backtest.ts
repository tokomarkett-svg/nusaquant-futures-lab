import { evaluateIntelligentSignal, type IntelligentSignal } from './intelligence';
import type { Candle, Regime } from './index';
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
  regime: Regime;
}

export interface BacktestDiagnosticBucket {
  label: string;
  trades: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number;
  netPnl: number;
  expectancyR: number;
  profitFactor: number | null;
  averageCosts: number;
}

export interface BacktestDiagnostics {
  bySide: BacktestDiagnosticBucket[];
  byQualityScore: BacktestDiagnosticBucket[];
  byExitReason: BacktestDiagnosticBucket[];
  byRegime: BacktestDiagnosticBucket[];
  byPeriod: BacktestDiagnosticBucket[];
}

export interface BacktestSummary {
  periodStart: number | null;
  periodEnd: number | null;
  sampleCandles: number;
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number;
  profitFactor: number | null;
  expectancyR: number;
  netPnl: number;
  maxDrawdown: number;
  maxDrawdownPct: number;
  gate: 'NOT_READY_SAMPLE' | 'PASS_RESEARCH_GATE' | 'FAIL_NEGATIVE_EXPECTANCY';
}

export interface TemporalValidation {
  trainFraction: number;
  warmupBars: number;
  splitTime: number | null;
  inSample: BacktestSummary;
  outOfSample: BacktestSummary;
  notes: string[];
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
  diagnostics: BacktestDiagnostics;
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

export function resolveExitPrice({
  reason,
  stopLoss,
  takeProfit,
  candleClose,
}: {
  reason: BacktestTrade['exitReason'];
  stopLoss: number;
  takeProfit: number;
  candleClose: number;
}): number {
  if (reason === 'STOP_LOSS') return stopLoss;
  if (reason === 'TAKE_PROFIT') return takeProfit;
  return candleClose;
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

function diagnosticStats(label: string, trades: BacktestTrade[]): BacktestDiagnosticBucket {
  const wins = trades.filter((trade) => trade.netPnl > 0);
  const losses = trades.filter((trade) => trade.netPnl < 0);
  const grossWins = wins.reduce((sum, trade) => sum + trade.netPnl, 0);
  const grossLosses = Math.abs(losses.reduce((sum, trade) => sum + trade.netPnl, 0));
  return {
    label,
    trades: trades.length,
    winningTrades: wins.length,
    losingTrades: losses.length,
    winRate: trades.length === 0 ? 0 : wins.length / trades.length,
    netPnl: trades.reduce((sum, trade) => sum + trade.netPnl, 0),
    expectancyR: trades.length === 0 ? 0 : trades.reduce((sum, trade) => sum + trade.rMultiple, 0) / trades.length,
    profitFactor: grossLosses === 0 ? (grossWins > 0 ? Number.POSITIVE_INFINITY : null) : grossWins / grossLosses,
    averageCosts: trades.length === 0 ? 0 : trades.reduce((sum, trade) => sum + trade.costs, 0) / trades.length,
  };
}

function groupedDiagnostics(
  trades: BacktestTrade[],
  getLabel: (trade: BacktestTrade) => string,
  order: string[],
): BacktestDiagnosticBucket[] {
  const groups = new Map<string, BacktestTrade[]>();
  for (const trade of trades) {
    const label = getLabel(trade);
    const group = groups.get(label) ?? [];
    group.push(trade);
    groups.set(label, group);
  }
  return [...groups.entries()]
    .sort(([left], [right]) => {
      const leftIndex = order.indexOf(left);
      const rightIndex = order.indexOf(right);
      if (leftIndex >= 0 || rightIndex >= 0) return (leftIndex < 0 ? order.length : leftIndex) - (rightIndex < 0 ? order.length : rightIndex);
      return left.localeCompare(right);
    })
    .map(([label, bucket]) => diagnosticStats(label, bucket));
}

function qualityBucket(score: number): string {
  if (score < 60) return '<60';
  if (score < 72) return '60-71';
  if (score < 80) return '72-79';
  if (score < 90) return '80-89';
  return '90-100';
}

function localPeriod(timestamp: number, timezone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(new Date(timestamp));
  const year = parts.find((part) => part.type === 'year')?.value ?? '0000';
  const month = parts.find((part) => part.type === 'month')?.value ?? '00';
  return `${year}-${month}`;
}

function buildDiagnostics(trades: BacktestTrade[], timezone: string): BacktestDiagnostics {
  return {
    bySide: groupedDiagnostics(trades, (trade) => trade.side, ['LONG', 'SHORT']),
    byQualityScore: groupedDiagnostics(trades, (trade) => qualityBucket(trade.qualityScore), ['<60', '60-71', '72-79', '80-89', '90-100']),
    byExitReason: groupedDiagnostics(trades, (trade) => trade.exitReason, ['STOP_LOSS', 'TAKE_PROFIT', 'TIME_EXIT']),
    byRegime: groupedDiagnostics(trades, (trade) => trade.regime, ['TREND_UP', 'TREND_DOWN', 'RANGE', 'UNCERTAIN']),
    byPeriod: groupedDiagnostics(trades, (trade) => localPeriod(trade.entryTime, timezone), []),
  };
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
    const exitPrice = resolveExitPrice({
      reason: exit.reason,
      stopLoss: signal.stopLoss,
      takeProfit: signal.takeProfit,
      candleClose: exit.candle.close,
    });
    const entryNotional = signal.entry * quantity;
    const exitNotional = exitPrice * quantity;
    const grossPnl = signal.decision === 'LONG'
      ? (exitPrice - signal.entry) * quantity
      : (signal.entry - exitPrice) * quantity;
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
      exit: exitPrice,
      stopLoss: signal.stopLoss,
      takeProfit: signal.takeProfit,
      quantity,
      grossPnl,
      costs,
      netPnl,
      rMultiple,
      exitReason: exit.reason,
      qualityScore: signal.qualityScore,
      regime: signal.regime,
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
    diagnostics: buildDiagnostics(trades, timezone),
    windowProfiles: buildWindowProfiles(trades, timezone),
    notes: [
      'Backtest menggunakan asumsi konservatif: stop loss diprioritaskan jika stop dan target tersentuh pada candle yang sama.',
      'Hasil backtest bukan jaminan performa live; gunakan out-of-sample dan walk-forward validation.',
      'Diagnostics dikelompokkan dari trade yang benar-benar dieksekusi; setup yang ditolak belum masuk tabel ini.',
      'Jika total trade nol atau sampel kecil, jangan membuat kesimpulan strategi.',
    ],
  };
}

function backtestGate(report: BacktestReport): BacktestSummary['gate'] {
  if (report.totalTrades < 30) return 'NOT_READY_SAMPLE';
  return report.profitFactor !== null && report.profitFactor > 1 && report.expectancyR > 0
    ? 'PASS_RESEARCH_GATE'
    : 'FAIL_NEGATIVE_EXPECTANCY';
}

function summarizeBacktest(report: BacktestReport, periodCandles: Candle[]): BacktestSummary {
  return {
    periodStart: periodCandles[0]?.time ?? null,
    periodEnd: periodCandles.at(-1)?.time ?? null,
    sampleCandles: periodCandles.length,
    totalTrades: report.totalTrades,
    winningTrades: report.winningTrades,
    losingTrades: report.losingTrades,
    winRate: report.winRate,
    profitFactor: report.profitFactor,
    expectancyR: report.expectancyR,
    netPnl: report.netPnl,
    maxDrawdown: report.maxDrawdown,
    maxDrawdownPct: report.maxDrawdownPct,
    gate: backtestGate(report),
  };
}

export function runTemporalValidation({
  symbol = 'BTCUSDT',
  higherTimeframe,
  entryTimeframe,
  config = {},
  trainFraction = 0.7,
  warmupBars = 80,
}: {
  symbol?: string;
  higherTimeframe: Candle[];
  entryTimeframe: Candle[];
  config?: BacktestConfig;
  trainFraction?: number;
  warmupBars?: number;
}): TemporalValidation {
  const fraction = clamp(trainFraction, 0.5, 0.9);
  const splitIndex = Math.min(
    Math.max(Math.floor(entryTimeframe.length * fraction), 1),
    Math.max(entryTimeframe.length - 1, 1),
  );
  const contextStart = Math.max(0, splitIndex - Math.max(warmupBars, 0));
  const inSampleCandles = entryTimeframe.slice(0, splitIndex);
  const outOfSampleCandles = entryTimeframe.slice(contextStart);
  const outOfSamplePeriod = entryTimeframe.slice(splitIndex);
  const inSampleReport = runBacktest({ symbol, higherTimeframe, entryTimeframe: inSampleCandles, config });
  const outOfSampleReport = runBacktest({ symbol, higherTimeframe, entryTimeframe: outOfSampleCandles, config });
  const notes = [
    `Temporal split ${(fraction * 100).toFixed(0)}/${((1 - fraction) * 100).toFixed(0)}; OOS memakai ${Math.max(splitIndex - contextStart, 0)} candle warmup sebelum titik split.`,
    'Parameter dan rule tidak dituning dari periode OOS; OOS hanya dipakai untuk menguji generalisasi.',
    'Higher-timeframe candle tetap dipotong berdasarkan waktu entry sehingga data setelah titik evaluasi tidak dipakai untuk signal.',
  ];
  if (outOfSampleReport.totalTrades < 30) notes.push('OOS memiliki kurang dari 30 trade; hasilnya belum cukup untuk research gate.');
  return {
    trainFraction: fraction,
    warmupBars: Math.max(warmupBars, 0),
    splitTime: entryTimeframe[splitIndex]?.time ?? null,
    inSample: summarizeBacktest(inSampleReport, inSampleCandles),
    outOfSample: summarizeBacktest(outOfSampleReport, outOfSamplePeriod),
    notes,
  };
}
