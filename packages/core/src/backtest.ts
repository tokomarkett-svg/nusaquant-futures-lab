import { evaluateIntelligentSignal, type IntelligentSignal } from './intelligence';
import { adx, atr, ema, rsi, sma, type Candle, type Regime } from './index';
import type { WindowProfile } from './opportunity';

export interface FundingPoint {
  time: number;
  fundingRate: number;
}

export interface MarketMetricsPoint {
  time: number;
  openInterest: number;
  openInterestValue: number;
  topTraderLongShortRatio: number;
  topTraderLongShortPositionRatio: number;
  longShortRatio: number;
  takerLongShortVolumeRatio: number;
}

export interface BacktestConfig {
  initialEquity?: number;
  riskFraction?: number;
  feeRate?: number;
  slippageRate?: number;
  fundingRatePerBar?: number;
  maxBarsInTrade?: number;
  timezone?: string;
  entryPolicy?: 'BASELINE' | 'TRIAD_TIMING_HYPOTHESIS' | 'TRIAD_RETEST_HYPOTHESIS' | 'TRIAD_FOLLOW_THROUGH_HYPOTHESIS' | 'MEAN_REVERSION_REJECTION_HYPOTHESIS' | 'VOLATILITY_EXPANSION_BREAKOUT_HYPOTHESIS' | 'FUNDING_CROWDING_REVERSION_HYPOTHESIS' | 'TAKER_FLOW_REJECTION_HYPOTHESIS' | 'LIQUIDATION_RECLAIM_HYPOTHESIS';
  exitPolicy?: 'BASELINE' | 'MFE_PROFIT_PROTECTION_HYPOTHESIS';
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
  riskAmount: number;
  grossPnl: number;
  costs: number;
  netPnl: number;
  rMultiple: number;
  exitReason: 'STOP_LOSS' | 'TAKE_PROFIT' | 'TIME_EXIT';
  qualityScore: number;
  regime: Regime;
  barsHeld: number;
  triggerRangeAtr: number;
  entryDistanceToEmaAtr: number;
  stopDistanceAtr: number;
  maxFavorableExcursionR: number;
  maxAdverseExcursionR: number;
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
  byTriggerRange: BacktestDiagnosticBucket[];
  byEntryDistance: BacktestDiagnosticBucket[];
  byPeriod: BacktestDiagnosticBucket[];
}

export interface BacktestExecutionAudit {
  grossPnlBeforeCosts: number;
  totalCosts: number;
  netPnlAfterCosts: number;
  costImpactPctOfGross: number;
  averageGrossPnlPerTrade: number;
  averageCostPerTrade: number;
  grossProfitFactor: number | null;
  grossExpectancyR: number;
  stopLossTrades: number;
  takeProfitTrades: number;
  timeExitTrades: number;
  stopLossRate: number;
  takeProfitRate: number;
  timeExitRate: number;
}

export interface BacktestExcursionAudit {
  averageMfeR: number;
  averageMaeR: number;
  stopLossTradesWithMfeAtLeastHalfR: number;
  stopLossTradesWithMfeAtLeastOneR: number;
  stopLossPositiveMfeRate: number;
  averageStopLossMfeR: number;
  averageStopLossMaeR: number;
  averageTakeProfitMfeR: number;
  averageTimeExitMfeR: number;
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
  grossWins: number;
  grossLosses: number;
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

export interface WalkForwardFold {
  index: number;
  trainCandles: number;
  testCandles: number;
  testStart: number | null;
  testEnd: number | null;
  summary: BacktestSummary;
}

export interface WalkForwardValidation {
  foldCount: number;
  warmupBars: number;
  aggregate: BacktestSummary;
  folds: WalkForwardFold[];
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
  executionAudit: BacktestExecutionAudit;
  excursionAudit: BacktestExcursionAudit;
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

function findExit({ signal, futureCandles, maxBars, exitPolicy }: {
  signal: IntelligentSignal;
  futureCandles: Candle[];
  maxBars: number;
  exitPolicy: BacktestConfig['exitPolicy'];
}): { candle: Candle; reason: BacktestTrade['exitReason']; stopLoss: number } | null {
  if (signal.entry === null || signal.stopLoss === null || signal.takeProfit === null) return null;
  const candles = futureCandles.slice(0, maxBars);
  const initialStopLoss = signal.stopLoss;
  const riskPerUnit = Math.max(Math.abs(signal.entry - initialStopLoss), Number.EPSILON);
  let activeStopLoss = initialStopLoss;
  let protectionActive = false;
  for (const candle of candles) {
    const stopHit = signal.decision === 'LONG' ? candle.low <= activeStopLoss : candle.high >= activeStopLoss;
    const targetHit = signal.decision === 'LONG' ? candle.high >= signal.takeProfit : candle.low <= signal.takeProfit;
    // Conservative assumption: if both are touched in the same candle, stop loss occurs first.
    if (stopHit) return { candle, reason: 'STOP_LOSS', stopLoss: activeStopLoss };
    if (targetHit) return { candle, reason: 'TAKE_PROFIT', stopLoss: activeStopLoss };

    if (exitPolicy === 'MFE_PROFIT_PROTECTION_HYPOTHESIS' && !protectionActive) {
      const favorableR = signal.decision === 'LONG'
        ? Math.max(0, candle.high - signal.entry) / riskPerUnit
        : Math.max(0, signal.entry - candle.low) / riskPerUnit;
      if (favorableR >= 0.5) {
        // Activate only after the candle closes; never infer intrabar order.
        activeStopLoss = signal.entry;
        protectionActive = true;
      }
    }
  }
  const last = candles.at(-1);
  return last ? { candle: last, reason: 'TIME_EXIT', stopLoss: activeStopLoss } : null;
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

function rangeBucket(value: number): string {
  if (value < 0.8) return '<0.8 ATR';
  if (value < 1.2) return '0.8-1.2 ATR';
  if (value < 1.8) return '1.2-1.8 ATR';
  return '>=1.8 ATR';
}

function entryDistanceBucket(value: number): string {
  if (value < 0.25) return '<0.25 ATR';
  if (value < 0.5) return '0.25-0.5 ATR';
  if (value < 0.75) return '0.5-0.75 ATR';
  return '>=0.75 ATR';
}

function buildDiagnostics(trades: BacktestTrade[], timezone: string): BacktestDiagnostics {
  return {
    bySide: groupedDiagnostics(trades, (trade) => trade.side, ['LONG', 'SHORT']),
    byQualityScore: groupedDiagnostics(trades, (trade) => qualityBucket(trade.qualityScore), ['<60', '60-71', '72-79', '80-89', '90-100']),
    byExitReason: groupedDiagnostics(trades, (trade) => trade.exitReason, ['STOP_LOSS', 'TAKE_PROFIT', 'TIME_EXIT']),
    byRegime: groupedDiagnostics(trades, (trade) => trade.regime, ['TREND_UP', 'TREND_DOWN', 'RANGE', 'UNCERTAIN']),
    byTriggerRange: groupedDiagnostics(trades, (trade) => rangeBucket(trade.triggerRangeAtr), ['<0.8 ATR', '0.8-1.2 ATR', '1.2-1.8 ATR', '>=1.8 ATR']),
    byEntryDistance: groupedDiagnostics(trades, (trade) => entryDistanceBucket(trade.entryDistanceToEmaAtr), ['<0.25 ATR', '0.25-0.5 ATR', '0.5-0.75 ATR', '>=0.75 ATR']),
    byPeriod: groupedDiagnostics(trades, (trade) => localPeriod(trade.entryTime, timezone), []),
  };
}

function buildExecutionAudit(trades: BacktestTrade[]): BacktestExecutionAudit {
  const totalTrades = trades.length;
  const grossPnlBeforeCosts = trades.reduce((sum, trade) => sum + trade.grossPnl, 0);
  const totalCosts = trades.reduce((sum, trade) => sum + trade.costs, 0);
  const grossWins = trades.filter((trade) => trade.grossPnl > 0).reduce((sum, trade) => sum + trade.grossPnl, 0);
  const grossLosses = Math.abs(trades.filter((trade) => trade.grossPnl < 0).reduce((sum, trade) => sum + trade.grossPnl, 0));
  const grossExpectancyR = totalTrades === 0 ? 0 : trades.reduce((sum, trade) => sum + trade.grossPnl / Math.max(trade.riskAmount, Number.EPSILON), 0) / totalTrades;
  const stopLossTrades = trades.filter((trade) => trade.exitReason === 'STOP_LOSS').length;
  const takeProfitTrades = trades.filter((trade) => trade.exitReason === 'TAKE_PROFIT').length;
  const timeExitTrades = trades.filter((trade) => trade.exitReason === 'TIME_EXIT').length;
  return {
    grossPnlBeforeCosts,
    totalCosts,
    netPnlAfterCosts: grossPnlBeforeCosts - totalCosts,
    costImpactPctOfGross: Math.abs(grossPnlBeforeCosts) <= Number.EPSILON ? 0 : totalCosts / Math.abs(grossPnlBeforeCosts),
    averageGrossPnlPerTrade: totalTrades === 0 ? 0 : grossPnlBeforeCosts / totalTrades,
    averageCostPerTrade: totalTrades === 0 ? 0 : totalCosts / totalTrades,
    grossProfitFactor: grossLosses === 0 ? (grossWins > 0 ? Number.POSITIVE_INFINITY : null) : grossWins / grossLosses,
    grossExpectancyR,
    stopLossTrades,
    takeProfitTrades,
    timeExitTrades,
    stopLossRate: totalTrades === 0 ? 0 : stopLossTrades / totalTrades,
    takeProfitRate: totalTrades === 0 ? 0 : takeProfitTrades / totalTrades,
    timeExitRate: totalTrades === 0 ? 0 : timeExitTrades / totalTrades,
  };
}

function buildExcursionAudit(trades: BacktestTrade[]): BacktestExcursionAudit {
  const average = (items: BacktestTrade[], selector: (trade: BacktestTrade) => number): number => (
    items.length === 0 ? 0 : items.reduce((sum, trade) => sum + selector(trade), 0) / items.length
  );
  const stopLossTrades = trades.filter((trade) => trade.exitReason === 'STOP_LOSS');
  const takeProfitTrades = trades.filter((trade) => trade.exitReason === 'TAKE_PROFIT');
  const timeExitTrades = trades.filter((trade) => trade.exitReason === 'TIME_EXIT');
  const stopLossTradesWithMfeAtLeastHalfR = stopLossTrades.filter((trade) => trade.maxFavorableExcursionR >= 0.5).length;
  const stopLossTradesWithMfeAtLeastOneR = stopLossTrades.filter((trade) => trade.maxFavorableExcursionR >= 1).length;
  return {
    averageMfeR: average(trades, (trade) => trade.maxFavorableExcursionR),
    averageMaeR: average(trades, (trade) => trade.maxAdverseExcursionR),
    stopLossTradesWithMfeAtLeastHalfR,
    stopLossTradesWithMfeAtLeastOneR,
    stopLossPositiveMfeRate: stopLossTrades.length === 0 ? 0 : stopLossTradesWithMfeAtLeastHalfR / stopLossTrades.length,
    averageStopLossMfeR: average(stopLossTrades, (trade) => trade.maxFavorableExcursionR),
    averageStopLossMaeR: average(stopLossTrades, (trade) => trade.maxAdverseExcursionR),
    averageTakeProfitMfeR: average(takeProfitTrades, (trade) => trade.maxFavorableExcursionR),
    averageTimeExitMfeR: average(timeExitTrades, (trade) => trade.maxFavorableExcursionR),
  };
}

function findRetestEntry({
  signal,
  previousCandle,
  futureCandles,
}: {
  signal: IntelligentSignal;
  previousCandle: Candle;
  futureCandles: Array<{ candle: Candle; index: number }>;
}): { candle: Candle; index: number } | null {
  if (signal.decision === 'NO_TRADE') return null;
  const retestLevel = signal.decision === 'LONG' ? previousCandle.high : previousCandle.low;
  for (const candidate of futureCandles.slice(0, 3)) {
    const bullishHold = candidate.candle.low <= retestLevel
      && candidate.candle.close > retestLevel
      && candidate.candle.close > candidate.candle.open;
    const bearishHold = candidate.candle.high >= retestLevel
      && candidate.candle.close < retestLevel
      && candidate.candle.close < candidate.candle.open;
    if ((signal.decision === 'LONG' && bullishHold) || (signal.decision === 'SHORT' && bearishHold)) return candidate;
  }
  return null;
}

function findFollowThroughEntry({
  signal,
  triggerCandle,
  futureCandles,
}: {
  signal: IntelligentSignal;
  triggerCandle: Candle;
  futureCandles: Array<{ candle: Candle; index: number }>;
}): { candle: Candle; index: number } | null {
  const candidate = futureCandles[0];
  if (!candidate || signal.decision === 'NO_TRADE') return null;
  const bullishFollowThrough = candidate.candle.low >= triggerCandle.low
    && candidate.candle.close > triggerCandle.close
    && candidate.candle.close > candidate.candle.open;
  const bearishFollowThrough = candidate.candle.high <= triggerCandle.high
    && candidate.candle.close < triggerCandle.close
    && candidate.candle.close < candidate.candle.open;
  return (signal.decision === 'LONG' && bullishFollowThrough) || (signal.decision === 'SHORT' && bearishFollowThrough)
    ? candidate
    : null;
}

function rebaseRetestSignal({
  signal,
  entryCandle,
  atrValue,
  equity,
  riskFraction,
  feeRate,
  slippageRate,
  fundingRatePerBar,
  maxBarsInTrade,
}: {
  signal: IntelligentSignal;
  entryCandle: Candle;
  atrValue: number;
  equity: number;
  riskFraction: number;
  feeRate: number;
  slippageRate: number;
  fundingRatePerBar: number;
  maxBarsInTrade: number;
}): IntelligentSignal {
  const safeAtr = Number.isFinite(atrValue) && atrValue > Number.EPSILON ? atrValue : Number.EPSILON;
  const minimumStopDistance = safeAtr * 1.2;
  const originalStopDistance = signal.stopLoss === null ? minimumStopDistance : Math.abs(entryCandle.close - signal.stopLoss);
  const stopDistance = Math.max(originalStopDistance, minimumStopDistance);
  const stopLoss = signal.decision === 'LONG' ? entryCandle.close - stopDistance : entryCandle.close + stopDistance;
  const takeProfit = signal.decision === 'LONG' ? entryCandle.close + stopDistance * 2 : entryCandle.close - stopDistance * 2;
  const riskAmount = equity * riskFraction;
  const roundTripCostRate = feeRate + slippageRate;
  const estimatedCostPerUnit = (entryCandle.close + stopLoss) * roundTripCostRate
    + entryCandle.close * fundingRatePerBar * maxBarsInTrade;
  const quantity = riskAmount / Math.max(stopDistance + estimatedCostPerUnit, Number.EPSILON);
  return {
    ...signal,
    entry: entryCandle.close,
    stopLoss,
    takeProfit,
    quantity,
    riskAmount,
    riskReward: 2,
    triggerPrice: entryCandle.close,
  };
}

function buildMeanReversionRejectionSignal({
  higherTimeframe,
  entryTimeframe,
  equity,
  riskFraction,
  feeRate,
  slippageRate,
  fundingRatePerBar,
  maxBarsInTrade,
}: {
  higherTimeframe: Candle[];
  entryTimeframe: Candle[];
  equity: number;
  riskFraction: number;
  feeRate: number;
  slippageRate: number;
  fundingRatePerBar: number;
  maxBarsInTrade: number;
}): IntelligentSignal | null {
  const higherAdx = adx(higherTimeframe).at(-1) ?? Number.NaN;
  const entryAtr = atr(entryTimeframe).at(-1) ?? Number.NaN;
  const entryEma20 = ema(entryTimeframe.map((candle) => candle.close), 20).at(-1) ?? Number.NaN;
  const entryRsi = rsi(entryTimeframe).at(-1) ?? Number.NaN;
  const entryCandle = entryTimeframe.at(-1);
  if (!entryCandle || !Number.isFinite(higherAdx) || !Number.isFinite(entryAtr) || !Number.isFinite(entryEma20) || !Number.isFinite(entryRsi) || entryAtr <= Number.EPSILON) return null;

  const range = Math.max(entryCandle.high - entryCandle.low, Number.EPSILON);
  const bullishRejection = entryCandle.close > entryCandle.open && entryCandle.close >= entryCandle.low + range * 0.65;
  const bearishRejection = entryCandle.close < entryCandle.open && entryCandle.close <= entryCandle.high - range * 0.65;
  const stretchedLong = entryCandle.close <= entryEma20 - entryAtr * 1.2;
  const stretchedShort = entryCandle.close >= entryEma20 + entryAtr * 1.2;
  const longSignal = higherAdx < 18 && stretchedLong && entryRsi <= 35 && bullishRejection;
  const shortSignal = higherAdx < 18 && stretchedShort && entryRsi >= 65 && bearishRejection;
  if (!longSignal && !shortSignal) return null;

  const decision = longSignal ? 'LONG' : 'SHORT';
  const entry = entryCandle.close;
  const stopDistance = longSignal
    ? Math.max(entry - entryCandle.low + entryAtr * 0.5, entryAtr)
    : Math.max(entryCandle.high - entry + entryAtr * 0.5, entryAtr);
  const stopLoss = longSignal ? entry - stopDistance : entry + stopDistance;
  const meanTargetDistance = Math.abs(entryEma20 - entry);
  if (meanTargetDistance < stopDistance * 1.2) return null;
  const takeProfit = entryEma20;
  const riskAmount = equity * riskFraction;
  const estimatedCostPerUnit = (entry + stopLoss) * (feeRate + slippageRate)
    + entry * fundingRatePerBar * maxBarsInTrade;
  const quantity = riskAmount / Math.max(stopDistance + estimatedCostPerUnit, Number.EPSILON);
  const riskReward = meanTargetDistance / stopDistance;
  return {
    decision,
    candidate: decision,
    stage: 'TRIGGERED',
    timing: 'ENTER_NOW',
    regime: 'RANGE',
    qualityScore: 80,
    scoreMax: 100,
    entry,
    triggerPrice: entry,
    stopLoss,
    takeProfit,
    quantity,
    riskAmount,
    riskReward,
    maxChaseDistance: null,
    patterns: [],
    structure: { bias: 'NEUTRAL', lastSwingHigh: null, lastSwingLow: null, breakOfStructure: 'NONE', reason: 'Mean reversion hanya aktif pada higher-timeframe range.' },
    evidence: [
      { label: 'Range context', points: 25, passed: true, explanation: `Higher-timeframe ADX ${higherAdx.toFixed(2)} di bawah 18.` },
      { label: 'Stretch from mean', points: 25, passed: true, explanation: 'Harga berjarak minimal 1.2 ATR dari EMA20.' },
      { label: 'Rejection candle', points: 20, passed: true, explanation: 'Candle close kembali ke arah mean.' },
      { label: 'RSI extreme', points: 10, passed: true, explanation: `RSI ${entryRsi.toFixed(2)} mendukung rejection.` },
    ],
    blockers: [],
    explanation: 'Research-only mean reversion: range, stretch, rejection, dan target mean EMA20.',
  };
}

function buildVolatilityExpansionBreakoutSignal({
  higherTimeframe,
  entryTimeframe,
  equity,
  riskFraction,
  feeRate,
  slippageRate,
  fundingRatePerBar,
  maxBarsInTrade,
}: {
  higherTimeframe: Candle[];
  entryTimeframe: Candle[];
  equity: number;
  riskFraction: number;
  feeRate: number;
  slippageRate: number;
  fundingRatePerBar: number;
  maxBarsInTrade: number;
}): IntelligentSignal | null {
  const entryCandle = entryTimeframe.at(-1);
  if (!entryCandle || entryTimeframe.length < 30) return null;
  const higherCloses = higherTimeframe.map((candle) => candle.close);
  const higherAdx = adx(higherTimeframe).at(-1) ?? Number.NaN;
  const higherEma50 = ema(higherCloses, 50).at(-1) ?? Number.NaN;
  const entryAtr = atr(entryTimeframe).at(-1) ?? Number.NaN;
  const entryAdx = adx(entryTimeframe).at(-1) ?? Number.NaN;
  const volumeAverage = sma(entryTimeframe.map((candle) => candle.volume), 20).at(-1) ?? Number.NaN;
  const priorCandles = entryTimeframe.slice(-21, -1);
  const priorHigh = Math.max(...priorCandles.map((candle) => candle.high));
  const priorLow = Math.min(...priorCandles.map((candle) => candle.low));
  const volumeRatio = Number.isFinite(volumeAverage) && volumeAverage > 0 ? entryCandle.volume / volumeAverage : Number.NaN;
  const candleRange = entryCandle.high - entryCandle.low;
  if (!Number.isFinite(higherAdx) || !Number.isFinite(higherEma50) || !Number.isFinite(entryAtr) || !Number.isFinite(entryAdx) || !Number.isFinite(volumeRatio) || entryAtr <= Number.EPSILON) return null;
  const longSignal = higherAdx >= 20 && entryCandle.close > higherEma50 && entryAdx >= 18
    && entryCandle.close > priorHigh && candleRange >= entryAtr * 1.1 && volumeRatio >= 1.2;
  const shortSignal = higherAdx >= 20 && entryCandle.close < higherEma50 && entryAdx >= 18
    && entryCandle.close < priorLow && candleRange >= entryAtr * 1.1 && volumeRatio >= 1.2;
  if (!longSignal && !shortSignal) return null;

  const decision = longSignal ? 'LONG' : 'SHORT';
  const entry = entryCandle.close;
  const stopDistance = entryAtr * 1.5;
  const stopLoss = longSignal ? entry - stopDistance : entry + stopDistance;
  const takeProfit = longSignal ? entry + stopDistance * 2 : entry - stopDistance * 2;
  const riskAmount = equity * riskFraction;
  const estimatedCostPerUnit = (entry + stopLoss) * (feeRate + slippageRate)
    + entry * fundingRatePerBar * maxBarsInTrade;
  const quantity = riskAmount / Math.max(stopDistance + estimatedCostPerUnit, Number.EPSILON);
  return {
    decision,
    candidate: decision,
    stage: 'TRIGGERED',
    timing: 'ENTER_NOW',
    regime: longSignal ? 'TREND_UP' : 'TREND_DOWN',
    qualityScore: 80,
    scoreMax: 100,
    entry,
    triggerPrice: entry,
    stopLoss,
    takeProfit,
    quantity,
    riskAmount,
    riskReward: 2,
    maxChaseDistance: null,
    patterns: [],
    structure: { bias: longSignal ? 'BULLISH' : 'BEARISH', lastSwingHigh: priorHigh, lastSwingLow: priorLow, breakOfStructure: longSignal ? 'BULLISH' : 'BEARISH', reason: 'Volatility expansion breakout setelah range 20 candle.' },
    evidence: [
      { label: 'Higher-timeframe trend', points: 25, passed: true, explanation: `ADX 1H ${higherAdx.toFixed(2)} dan posisi harga terhadap EMA50 mendukung arah.` },
      { label: 'Donchian breakout', points: 25, passed: true, explanation: 'Close menembus high/low 20 candle sebelumnya.' },
      { label: 'Range expansion', points: 15, passed: true, explanation: `Range candle ${ (candleRange / entryAtr).toFixed(2) } ATR.` },
      { label: 'Volume confirmation', points: 15, passed: true, explanation: `Volume ratio ${volumeRatio.toFixed(2)}x.` },
    ],
    blockers: [],
    explanation: 'Research-only breakout: trend higher timeframe, Donchian break, volatility expansion, dan volume confirmation.',
  };
}

function buildLiquidationReclaimSignal({
  higherTimeframe,
  entryTimeframe,
  metricsValue,
  previousMetricsValue,
  equity,
  riskFraction,
  feeRate,
  slippageRate,
  fundingRatePerBar,
  maxBarsInTrade,
}: {
  higherTimeframe: Candle[];
  entryTimeframe: Candle[];
  metricsValue?: MarketMetricsPoint;
  previousMetricsValue?: MarketMetricsPoint;
  equity: number;
  riskFraction: number;
  feeRate: number;
  slippageRate: number;
  fundingRatePerBar: number;
  maxBarsInTrade: number;
}): IntelligentSignal | null {
  const entryCandle = entryTimeframe.at(-1);
  if (!entryCandle || !metricsValue) return null;
  const previousMetric = previousMetricsValue;
  if (!previousMetric || previousMetric.openInterestValue <= 0) return null;
  const entryAtr = atr(entryTimeframe).at(-1) ?? Number.NaN;
  const higherAdx = adx(higherTimeframe).at(-1) ?? Number.NaN;
  const candleFlow = entryCandle.volume > 0 && entryCandle.takerBuyVolume !== undefined
    ? entryCandle.takerBuyVolume / entryCandle.volume
    : Number.NaN;
  const openInterestChange = metricsValue.openInterestValue / previousMetric.openInterestValue - 1;
  const priceMove = entryTimeframe.length >= 5
    ? entryCandle.close / (entryTimeframe.at(-5)?.close ?? entryCandle.close) - 1
    : Number.NaN;
  if (!Number.isFinite(entryAtr) || !Number.isFinite(higherAdx) || !Number.isFinite(candleFlow) || !Number.isFinite(openInterestChange) || !Number.isFinite(priceMove) || entryAtr <= Number.EPSILON) return null;

  const crowdedLong = metricsValue.topTraderLongShortRatio >= 1.5
    && metricsValue.topTraderLongShortPositionRatio >= 1.5
    && metricsValue.longShortRatio >= 1.5;
  const crowdedShort = metricsValue.topTraderLongShortRatio <= 1 / 1.5
    && metricsValue.topTraderLongShortPositionRatio <= 1 / 1.5
    && metricsValue.longShortRatio <= 1 / 1.5;
  const longReclaim = crowdedLong
    && openInterestChange <= -0.003
    && metricsValue.takerLongShortVolumeRatio <= 0.75
    && candleFlow <= 0.45
    && priceMove <= -0.002
    && entryCandle.close > entryCandle.open
    && higherAdx <= 28;
  const shortReclaim = crowdedShort
    && openInterestChange <= -0.003
    && metricsValue.takerLongShortVolumeRatio >= 1 / 0.75
    && candleFlow >= 0.55
    && priceMove >= 0.002
    && entryCandle.close < entryCandle.open
    && higherAdx <= 28;
  if (!longReclaim && !shortReclaim) return null;

  const decision = longReclaim ? 'LONG' : 'SHORT';
  const entry = entryCandle.close;
  const stopDistance = entryAtr * 1.2;
  const stopLoss = longReclaim ? entry - stopDistance : entry + stopDistance;
  const takeProfit = longReclaim ? entry + stopDistance * 1.5 : entry - stopDistance * 1.5;
  const riskAmount = equity * riskFraction;
  const estimatedCostPerUnit = (entry + stopLoss) * (feeRate + slippageRate)
    + entry * fundingRatePerBar * maxBarsInTrade;
  const quantity = riskAmount / Math.max(stopDistance + estimatedCostPerUnit, Number.EPSILON);
  return {
    decision,
    candidate: decision,
    stage: 'TRIGGERED',
    timing: 'ENTER_NOW',
    regime: 'RANGE',
    qualityScore: 84,
    scoreMax: 100,
    entry,
    triggerPrice: entry,
    stopLoss,
    takeProfit,
    quantity,
    riskAmount,
    riskReward: 1.5,
    maxChaseDistance: null,
    patterns: [],
    structure: { bias: 'NEUTRAL', lastSwingHigh: null, lastSwingLow: null, breakOfStructure: 'NONE', reason: 'Open interest turun saat crowding ekstrem dan candle merebut kembali arah berlawanan.' },
    evidence: [
      { label: 'Crowding ratio', points: 25, passed: true, explanation: `Long/short crowding ${longReclaim ? 'long' : 'short'} ekstrem pada top trader dan akun.` },
      { label: 'Open-interest flush', points: 25, passed: true, explanation: `Open interest value berubah ${(openInterestChange * 100).toFixed(2)}% dalam satu jam.` },
      { label: 'Taker-flow confirmation', points: 20, passed: true, explanation: `Taker long/short ratio ${metricsValue.takerLongShortVolumeRatio.toFixed(2)} dan candle flow mendukung reclaim.` },
      { label: 'Price reclaim', points: 14, passed: true, explanation: 'Harga bergerak melawan crowding lalu candle terakhir closed kembali berlawanan.' },
    ],
    blockers: [],
    explanation: 'Research-only liquidation reclaim: crowding ekstrem, open-interest flush, taker-flow, dan reclaim candle.',
  };
}

function buildTakerFlowRejectionSignal({
  higherTimeframe,
  entryTimeframe,
  equity,
  riskFraction,
  feeRate,
  slippageRate,
  fundingRatePerBar,
  maxBarsInTrade,
}: {
  higherTimeframe: Candle[];
  entryTimeframe: Candle[];
  equity: number;
  riskFraction: number;
  feeRate: number;
  slippageRate: number;
  fundingRatePerBar: number;
  maxBarsInTrade: number;
}): IntelligentSignal | null {
  const entryCandle = entryTimeframe.at(-1);
  const previousCandles = entryTimeframe.slice(-4, -1);
  if (!entryCandle || previousCandles.length < 3) return null;
  const takerBuyVolume = entryCandle.takerBuyVolume;
  if (takerBuyVolume === undefined || !Number.isFinite(takerBuyVolume) || entryCandle.volume <= 0) return null;

  const flowRatio = takerBuyVolume / entryCandle.volume;
  const entryAtr = atr(entryTimeframe).at(-1) ?? Number.NaN;
  const higherAdx = adx(higherTimeframe).at(-1) ?? Number.NaN;
  const higherEma50 = ema(higherTimeframe.map((candle) => candle.close), 50).at(-1) ?? Number.NaN;
  const averageVolume = sma(entryTimeframe.map((candle) => candle.volume), 20).at(-1) ?? Number.NaN;
  if (!Number.isFinite(entryAtr) || !Number.isFinite(higherAdx) || !Number.isFinite(higherEma50) || !Number.isFinite(averageVolume) || entryAtr <= Number.EPSILON || averageVolume <= 0) return null;

  const range = Math.max(entryCandle.high - entryCandle.low, Number.EPSILON);
  const body = Math.abs(entryCandle.close - entryCandle.open);
  const volumeRatio = entryCandle.volume / averageVolume;
  const priorMoveDown = previousCandles[0].close > previousCandles[1].close && previousCandles[1].close > previousCandles[2].close;
  const priorMoveUp = previousCandles[0].close < previousCandles[1].close && previousCandles[1].close < previousCandles[2].close;
  const bullishRejection = entryCandle.close > entryCandle.open
    && entryCandle.close >= entryCandle.low + range * 0.65
    && entryCandle.close - entryCandle.low >= range * 0.45;
  const bearishRejection = entryCandle.close < entryCandle.open
    && entryCandle.close <= entryCandle.low + range * 0.35
    && entryCandle.high - entryCandle.close >= range * 0.45;
  const orderlyRange = range <= entryAtr * 2.2 && body >= range * 0.12;
  const usableVolume = volumeRatio >= 0.8;
  const longSignal = flowRatio <= 0.38 && priorMoveDown && bullishRejection && orderlyRange && usableVolume && higherAdx <= 28;
  const shortSignal = flowRatio >= 0.62 && priorMoveUp && bearishRejection && orderlyRange && usableVolume && higherAdx <= 28;
  if (!longSignal && !shortSignal) return null;

  const decision = longSignal ? 'LONG' : 'SHORT';
  const entry = entryCandle.close;
  const stopDistance = Math.max(entryAtr * 1.15, longSignal ? entry - entryCandle.low + entryAtr * 0.25 : entryCandle.high - entry + entryAtr * 0.25);
  const stopLoss = longSignal ? entry - stopDistance : entry + stopDistance;
  const takeProfit = longSignal ? entry + stopDistance * 1.5 : entry - stopDistance * 1.5;
  const riskAmount = equity * riskFraction;
  const estimatedCostPerUnit = (entry + stopLoss) * (feeRate + slippageRate)
    + entry * fundingRatePerBar * maxBarsInTrade;
  const quantity = riskAmount / Math.max(stopDistance + estimatedCostPerUnit, Number.EPSILON);
  const higherClose = higherTimeframe.at(-1)?.close ?? entry;
  const regime = higherClose >= higherEma50 ? 'TREND_UP' : 'TREND_DOWN';

  return {
    decision,
    candidate: decision,
    stage: 'TRIGGERED',
    timing: 'ENTER_NOW',
    regime,
    qualityScore: 82,
    scoreMax: 100,
    entry,
    triggerPrice: entry,
    stopLoss,
    takeProfit,
    quantity,
    riskAmount,
    riskReward: 1.5,
    maxChaseDistance: null,
    patterns: [],
    structure: { bias: 'NEUTRAL', lastSwingHigh: null, lastSwingLow: null, breakOfStructure: 'NONE', reason: 'Taker-flow satu arah gagal mendorong close dan ditolak kembali.' },
    evidence: [
      { label: 'Taker-flow imbalance', points: 30, passed: true, explanation: `Taker buy ratio ${flowRatio.toFixed(3)} menunjukkan tekanan ${longSignal ? 'jual' : 'beli'} yang ekstrem.` },
      { label: 'Price rejection', points: 25, passed: true, explanation: 'Close berlawanan dengan tekanan taker dan berada dekat sisi rejection candle.' },
      { label: 'Three-candle exhaustion', points: 15, passed: true, explanation: `Harga bergerak ${longSignal ? 'turun' : 'naik'} sebelum rejection.` },
      { label: 'Range regime filter', points: 12, passed: true, explanation: `ADX 1H ${higherAdx.toFixed(2)} tidak menunjukkan trend terlalu kuat.` },
    ],
    blockers: [],
    explanation: 'Research-only taker-flow rejection: aggressive flow, exhaustion tiga candle, rejection close, dan biaya konservatif.',
  };
}

const FUNDING_EXTREME_THRESHOLD = 0.0001;

function buildFundingCrowdingReversionSignal({
  higherTimeframe,
  entryTimeframe,
  fundingTimeframe,
  equity,
  riskFraction,
  feeRate,
  slippageRate,
  fundingRatePerBar,
  maxBarsInTrade,
  fundingRateValue,
}: {
  higherTimeframe: Candle[];
  entryTimeframe: Candle[];
  fundingTimeframe: FundingPoint[];
  equity: number;
  riskFraction: number;
  feeRate: number;
  slippageRate: number;
  fundingRatePerBar: number;
  maxBarsInTrade: number;
  fundingRateValue?: number;
}): IntelligentSignal | null {
  const entryCandle = entryTimeframe.at(-1);
  if (!entryCandle || fundingTimeframe.length === 0) return null;
  const fundingRate = fundingRateValue ?? [...fundingTimeframe].reverse().find((point) => point.time < entryCandle.time)?.fundingRate;
  const safeFundingRate = typeof fundingRate === 'number' && Number.isFinite(fundingRate) ? fundingRate : Number.NaN;
  const entryAtr = atr(entryTimeframe).at(-1) ?? Number.NaN;
  const entryEma20 = ema(entryTimeframe.map((candle) => candle.close), 20).at(-1) ?? Number.NaN;
  if (!Number.isFinite(safeFundingRate) || !Number.isFinite(entryAtr) || !Number.isFinite(entryEma20) || entryAtr <= Number.EPSILON) return null;
  const range = Math.max(entryCandle.high - entryCandle.low, Number.EPSILON);
  const bullishRejection = entryCandle.close > entryCandle.open && entryCandle.close >= entryCandle.low + range * 0.65;
  const bearishRejection = entryCandle.close < entryCandle.open && entryCandle.close <= entryCandle.high - range * 0.65;
  const longSignal = safeFundingRate <= -FUNDING_EXTREME_THRESHOLD && bullishRejection;
  const shortSignal = safeFundingRate >= FUNDING_EXTREME_THRESHOLD && bearishRejection;
  if (!longSignal && !shortSignal) return null;
  const decision = longSignal ? 'LONG' : 'SHORT';
  const entry = entryCandle.close;
  const stopDistance = entryAtr * 1.2;
  const stopLoss = longSignal ? entry - stopDistance : entry + stopDistance;
  const meanTargetDistance = Math.abs(entryEma20 - entry);
  if (meanTargetDistance < stopDistance * 1.2) return null;
  const takeProfit = entryEma20;
  const riskAmount = equity * riskFraction;
  const estimatedCostPerUnit = (entry + stopLoss) * (feeRate + slippageRate)
    + entry * fundingRatePerBar * maxBarsInTrade;
  const quantity = riskAmount / Math.max(stopDistance + estimatedCostPerUnit, Number.EPSILON);
  return {
    decision,
    candidate: decision,
    stage: 'TRIGGERED',
    timing: 'ENTER_NOW',
    regime: 'RANGE',
    qualityScore: 80,
    scoreMax: 100,
    entry,
    triggerPrice: entry,
    stopLoss,
    takeProfit,
    quantity,
    riskAmount,
    riskReward: meanTargetDistance / stopDistance,
    maxChaseDistance: null,
    patterns: [],
    structure: { bias: 'NEUTRAL', lastSwingHigh: null, lastSwingLow: null, breakOfStructure: 'NONE', reason: 'Crowding reversion hanya aktif setelah funding ekstrem dan rejection candle.' },
    evidence: [
      { label: 'Funding crowding', points: 35, passed: true, explanation: `Funding terakhir ${safeFundingRate.toFixed(5)} melewati ambang ekstrem.` },
      { label: 'Rejection candle', points: 25, passed: true, explanation: 'Candle closed menolak arah crowding.' },
      { label: 'Mean target', points: 20, passed: true, explanation: 'EMA20 cukup jauh untuk menutup biaya dan risiko.' },
    ],
    blockers: [],
    explanation: 'Research-only crowding reversal: funding ekstrem, rejection candle, dan target kembali ke EMA20.',
  };
}

export function runBacktest({
  symbol = 'BTCUSDT',
  higherTimeframe,
  entryTimeframe,
  fundingTimeframe = [],
  metricsTimeframe = [],
  config = {},
}: {
  symbol?: string;
  higherTimeframe: Candle[];
  entryTimeframe: Candle[];
  fundingTimeframe?: FundingPoint[];
  metricsTimeframe?: MarketMetricsPoint[];
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
  const fundingRateAtEntry = new Array<number>(entryTimeframe.length).fill(Number.NaN);
  const metricsAtEntry: Array<MarketMetricsPoint | undefined> = new Array(entryTimeframe.length).fill(undefined);
  const previousMetricsAtEntry: Array<MarketMetricsPoint | undefined> = new Array(entryTimeframe.length).fill(undefined);
  let fundingIndex = 0;
  let metricsIndex = 0;
  let previousMetricsIndex = -1;
  let latestFundingRate = Number.NaN;
  let latestMetrics: MarketMetricsPoint | undefined;
  for (let entryIndex = 0; entryIndex < entryTimeframe.length; entryIndex += 1) {
    while (fundingIndex < fundingTimeframe.length && fundingTimeframe[fundingIndex].time < entryTimeframe[entryIndex].time) {
      latestFundingRate = fundingTimeframe[fundingIndex].fundingRate;
      fundingIndex += 1;
    }
    // Entry is evaluated after the 15m candle closes; metrics through that close are allowed.
    const candleCloseTime = entryTimeframe[entryIndex].time + 15 * 60 * 1000;
    while (metricsIndex < metricsTimeframe.length && metricsTimeframe[metricsIndex].time <= candleCloseTime) {
      latestMetrics = metricsTimeframe[metricsIndex];
      metricsIndex += 1;
    }
    const previousMetricsCutoff = candleCloseTime - 60 * 60 * 1000;
    while (previousMetricsIndex + 1 < metricsTimeframe.length && metricsTimeframe[previousMetricsIndex + 1].time <= previousMetricsCutoff) {
      previousMetricsIndex += 1;
    }
    fundingRateAtEntry[entryIndex] = latestFundingRate;
    metricsAtEntry[entryIndex] = latestMetrics;
    previousMetricsAtEntry[entryIndex] = previousMetricsIndex >= 0 ? metricsTimeframe[previousMetricsIndex] : undefined;
  }

  while (index < entryTimeframe.length) {
    const triggerCandle = entryTimeframe[index];
    const higher = higherTimeframe.filter((candle) => candle.time <= triggerCandle.time);
    if (higher.length < 220 || index < 80) {
      index += 1;
      continue;
    }

    const entryPolicy = config.entryPolicy ?? 'BASELINE';
    if (entryPolicy === 'VOLATILITY_EXPANSION_BREAKOUT_HYPOTHESIS' && index >= 20) {
      const priorCandles = entryTimeframe.slice(index - 20, index);
      const priorHigh = Math.max(...priorCandles.map((candle) => candle.high));
      const priorLow = Math.min(...priorCandles.map((candle) => candle.low));
      if (triggerCandle.close <= priorHigh && triggerCandle.close >= priorLow) {
        index += 1;
        continue;
      }
    }
    if (entryPolicy === 'FUNDING_CROWDING_REVERSION_HYPOTHESIS' && (!Number.isFinite(fundingRateAtEntry[index]) || Math.abs(fundingRateAtEntry[index]) < FUNDING_EXTREME_THRESHOLD)) {
      index += 1;
      continue;
    }
    if (entryPolicy === 'LIQUIDATION_RECLAIM_HYPOTHESIS' && (!metricsAtEntry[index] || metricsTimeframe.length === 0)) {
      index += 1;
      continue;
    }
    const baseSignal = entryPolicy === 'MEAN_REVERSION_REJECTION_HYPOTHESIS' || entryPolicy === 'FUNDING_CROWDING_REVERSION_HYPOTHESIS' || entryPolicy === 'TAKER_FLOW_REJECTION_HYPOTHESIS' || entryPolicy === 'LIQUIDATION_RECLAIM_HYPOTHESIS'
      ? null
      : evaluateIntelligentSignal({
        higherTimeframe: higher,
        entryTimeframe: entryTimeframe.slice(0, index + 1),
        equity,
        riskFraction,
        ...signalConfig,
      });
    let executionIndex = index;
    let entryCandle = triggerCandle;
    let signal: IntelligentSignal;
    if (entryPolicy === 'MEAN_REVERSION_REJECTION_HYPOTHESIS') {
      const meanSignal = buildMeanReversionRejectionSignal({
        higherTimeframe: higher,
        entryTimeframe: entryTimeframe.slice(0, index + 1),
        equity,
        riskFraction,
        ...signalConfig,
      });
      if (!meanSignal) {
        index += 1;
        continue;
      }
      signal = meanSignal;
    } else if (entryPolicy === 'FUNDING_CROWDING_REVERSION_HYPOTHESIS') {
      const fundingSignal = buildFundingCrowdingReversionSignal({
        higherTimeframe: higher,
        entryTimeframe: entryTimeframe.slice(0, index + 1),
        fundingTimeframe,
        equity,
        riskFraction,
        fundingRateValue: fundingRateAtEntry[index],
        ...signalConfig,
      });
      if (!fundingSignal) {
        index += 1;
        continue;
      }
      signal = fundingSignal;
    } else if (entryPolicy === 'TAKER_FLOW_REJECTION_HYPOTHESIS') {
      const flowSignal = buildTakerFlowRejectionSignal({
        higherTimeframe: higher,
        entryTimeframe: entryTimeframe.slice(0, index + 1),
        equity,
        riskFraction,
        ...signalConfig,
      });
      if (!flowSignal) {
        index += 1;
        continue;
      }
      signal = flowSignal;
    } else if (entryPolicy === 'LIQUIDATION_RECLAIM_HYPOTHESIS') {
      const liquidationSignal = buildLiquidationReclaimSignal({
        higherTimeframe: higher,
        entryTimeframe: entryTimeframe.slice(0, index + 1),
        metricsValue: metricsAtEntry[index],
        previousMetricsValue: previousMetricsAtEntry[index],
        equity,
        riskFraction,
        ...signalConfig,
      });
      if (!liquidationSignal) {
        index += 1;
        continue;
      }
      signal = liquidationSignal;
    } else if (entryPolicy === 'VOLATILITY_EXPANSION_BREAKOUT_HYPOTHESIS') {
      const breakoutSignal = buildVolatilityExpansionBreakoutSignal({
        higherTimeframe: higher,
        entryTimeframe: entryTimeframe.slice(0, index + 1),
        equity,
        riskFraction,
        ...signalConfig,
      });
      if (!breakoutSignal) {
        index += 1;
        continue;
      }
      signal = breakoutSignal;
    } else {
      if (!baseSignal || baseSignal.decision === 'NO_TRADE' || baseSignal.entry === null || baseSignal.stopLoss === null || baseSignal.takeProfit === null) {
        index += 1;
        continue;
      }
      signal = baseSignal;
    }
    if (entryPolicy === 'TRIAD_RETEST_HYPOTHESIS') {
      const previousCandle = entryTimeframe[index - 1];
      if (!previousCandle) {
        index += 1;
        continue;
      }
      const retest = findRetestEntry({
        signal: baseSignal ?? signal,
        previousCandle,
        futureCandles: entryTimeframe.slice(index + 1).map((candle, offset) => ({ candle, index: index + 1 + offset })),
      });
      if (!retest) {
        index += 1;
        continue;
      }
      executionIndex = retest.index;
      entryCandle = retest.candle;
      const retestAtr = atr(entryTimeframe.slice(0, executionIndex + 1)).at(-1) ?? Number.NaN;
      signal = rebaseRetestSignal({
        signal: baseSignal ?? signal,
        entryCandle,
        atrValue: retestAtr,
        equity,
        riskFraction,
        feeRate,
        slippageRate,
        fundingRatePerBar,
        maxBarsInTrade,
      });
    }
    if (entryPolicy === 'TRIAD_FOLLOW_THROUGH_HYPOTHESIS') {
      const followThrough = findFollowThroughEntry({
        signal: baseSignal ?? signal,
        triggerCandle,
        futureCandles: entryTimeframe.slice(index + 1).map((candle, offset) => ({ candle, index: index + 1 + offset })),
      });
      if (!followThrough) {
        index += 1;
        continue;
      }
      executionIndex = followThrough.index;
      entryCandle = followThrough.candle;
      const followThroughAtr = atr(entryTimeframe.slice(0, executionIndex + 1)).at(-1) ?? Number.NaN;
      signal = rebaseRetestSignal({
        signal: baseSignal ?? signal,
        entryCandle,
        atrValue: followThroughAtr,
        equity,
        riskFraction,
        feeRate,
        slippageRate,
        fundingRatePerBar,
        maxBarsInTrade,
      });
    }

    if (signal.decision === 'NO_TRADE' || signal.entry === null || signal.stopLoss === null || signal.takeProfit === null) {
      index = executionIndex + 1;
      continue;
    }

    const auditCandles = entryTimeframe.slice(0, executionIndex + 1);
    const currentAtr = atr(auditCandles).at(-1) ?? Number.NaN;
    const currentEma20 = ema(auditCandles.map((candle) => candle.close), 20).at(-1) ?? Number.NaN;
    const safeAtr = Number.isFinite(currentAtr) && currentAtr > Number.EPSILON ? currentAtr : Number.EPSILON;
    const triggerRangeAtr = (entryCandle.high - entryCandle.low) / safeAtr;
    const entryDistanceToEmaAtr = Number.isFinite(currentEma20)
      ? Math.abs(signal.entry - currentEma20) / safeAtr
      : Number.POSITIVE_INFINITY;
    const stopDistanceAtr = Math.abs(signal.entry - signal.stopLoss) / safeAtr;
    const triadTimingPasses = triggerRangeAtr < 1.2 && entryDistanceToEmaAtr >= 0.25;
    if (entryPolicy === 'TRIAD_TIMING_HYPOTHESIS' && !triadTimingPasses) {
      index += 1;
      continue;
    }

    const exit = findExit({
      signal,
      futureCandles: entryTimeframe.slice(executionIndex + 1),
      maxBars: maxBarsInTrade,
      exitPolicy: config.exitPolicy ?? 'BASELINE',
    });
    if (!exit) {
      index = executionIndex + 1;
      continue;
    }

    const entryPrice = signal.entry as number;
    const quantity = signal.quantity;
    const exitPrice = resolveExitPrice({
      reason: exit.reason,
      stopLoss: exit.stopLoss,
      takeProfit: signal.takeProfit,
      candleClose: exit.candle.close,
    });
    const entryNotional = signal.entry * quantity;
    const exitNotional = exitPrice * quantity;
    const grossPnl = signal.decision === 'LONG'
      ? (exitPrice - signal.entry) * quantity
      : (signal.entry - exitPrice) * quantity;
    const exitIndex = entryTimeframe.findIndex((candle) => candle.time === exit.candle.time);
    const barsHeld = Math.max(1, exitIndex > executionIndex ? exitIndex - executionIndex : 1);
    const costs = (entryNotional + exitNotional) * (feeRate + slippageRate) + entryNotional * fundingRatePerBar * barsHeld;
    const netPnl = grossPnl - costs;
    const riskAmount = Math.max(signal.riskAmount, Number.EPSILON);
    const riskPerUnit = Math.max(Math.abs(signal.entry - signal.stopLoss), Number.EPSILON);
    const candlesBeforeExit = entryTimeframe.slice(executionIndex + 1, Math.max(exitIndex, executionIndex + 1));
    const candlesThroughExit = entryTimeframe.slice(executionIndex + 1, Math.max(exitIndex + 1, executionIndex + 2));
    const favorableExcursion = (candle: Candle): number => signal.decision === 'LONG'
      ? Math.max(0, candle.high - entryPrice) / riskPerUnit
      : Math.max(0, entryPrice - candle.low) / riskPerUnit;
    const adverseExcursion = (candle: Candle): number => signal.decision === 'LONG'
      ? Math.max(0, entryPrice - candle.low) / riskPerUnit
      : Math.max(0, candle.high - entryPrice) / riskPerUnit;
    const maxFavorableExcursionR = candlesBeforeExit.length === 0
      ? 0
      : Math.max(...candlesBeforeExit.map(favorableExcursion));
    const maxAdverseExcursionR = candlesThroughExit.length === 0
      ? 0
      : Math.max(...candlesThroughExit.map(adverseExcursion));
    const rMultiple = netPnl / riskAmount;
    const trade: BacktestTrade = {
      symbol,
      side: signal.decision,
      entryTime: entryCandle.time,
      exitTime: exit.candle.time,
      entry: signal.entry,
      exit: exitPrice,
      stopLoss: exit.stopLoss,
      takeProfit: signal.takeProfit,
      quantity,
      riskAmount: signal.riskAmount,
      grossPnl,
      costs,
      netPnl,
      rMultiple,
      exitReason: exit.reason,
      qualityScore: signal.qualityScore,
      regime: signal.regime,
      barsHeld,
      triggerRangeAtr,
      entryDistanceToEmaAtr,
      stopDistanceAtr,
      maxFavorableExcursionR,
      maxAdverseExcursionR,
    };
    trades.push(trade);
    equity += netPnl;
    peakEquity = Math.max(peakEquity, equity);
    maxDrawdown = Math.max(maxDrawdown, peakEquity - equity);
    index = exitIndex >= executionIndex ? exitIndex + 1 : executionIndex + 1;
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
    executionAudit: buildExecutionAudit(trades),
    excursionAudit: buildExcursionAudit(trades),
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
    grossWins: report.trades.filter((trade) => trade.netPnl > 0).reduce((sum, trade) => sum + trade.netPnl, 0),
    grossLosses: Math.abs(report.trades.filter((trade) => trade.netPnl < 0).reduce((sum, trade) => sum + trade.netPnl, 0)),
    maxDrawdown: report.maxDrawdown,
    maxDrawdownPct: report.maxDrawdownPct,
    gate: backtestGate(report),
  };
}

export function runTemporalValidation({
  symbol = 'BTCUSDT',
  higherTimeframe,
  entryTimeframe,
  fundingTimeframe = [],
  metricsTimeframe = [],
  config = {},
  trainFraction = 0.7,
  warmupBars = 80,
}: {
  symbol?: string;
  higherTimeframe: Candle[];
  entryTimeframe: Candle[];
  fundingTimeframe?: FundingPoint[];
  metricsTimeframe?: MarketMetricsPoint[];
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
  const inSampleReport = runBacktest({ symbol, higherTimeframe, entryTimeframe: inSampleCandles, fundingTimeframe, metricsTimeframe, config });
  const outOfSampleReport = runBacktest({ symbol, higherTimeframe, entryTimeframe: outOfSampleCandles, fundingTimeframe, metricsTimeframe, config });
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

function combineSummaries(summaries: BacktestSummary[], periodCandles: Candle[]): BacktestSummary {
  const totalTrades = summaries.reduce((sum, summary) => sum + summary.totalTrades, 0);
  const winningTrades = summaries.reduce((sum, summary) => sum + summary.winningTrades, 0);
  const losingTrades = summaries.reduce((sum, summary) => sum + summary.losingTrades, 0);
  const grossWins = summaries.reduce((sum, summary) => sum + summary.grossWins, 0);
  const grossLosses = summaries.reduce((sum, summary) => sum + summary.grossLosses, 0);
  const totalR = summaries.reduce((sum, summary) => sum + summary.expectancyR * summary.totalTrades, 0);
  const maxDrawdown = Math.max(...summaries.map((summary) => summary.maxDrawdown), 0);
  return {
    periodStart: periodCandles[0]?.time ?? null,
    periodEnd: periodCandles.at(-1)?.time ?? null,
    sampleCandles: periodCandles.length,
    totalTrades,
    winningTrades,
    losingTrades,
    winRate: totalTrades === 0 ? 0 : winningTrades / totalTrades,
    profitFactor: grossLosses === 0 ? (grossWins > 0 ? Number.POSITIVE_INFINITY : null) : grossWins / grossLosses,
    expectancyR: totalTrades === 0 ? 0 : totalR / totalTrades,
    netPnl: summaries.reduce((sum, summary) => sum + summary.netPnl, 0),
    grossWins,
    grossLosses,
    maxDrawdown,
    maxDrawdownPct: summaries.length === 0 ? 0 : Math.max(...summaries.map((summary) => summary.maxDrawdownPct)),
    gate: totalTrades < 30
      ? 'NOT_READY_SAMPLE'
      : grossLosses > 0 && grossWins / grossLosses > 1 && totalR / totalTrades > 0
        ? 'PASS_RESEARCH_GATE'
        : 'FAIL_NEGATIVE_EXPECTANCY',
  };
}

export function runWalkForwardValidation({
  symbol = 'BTCUSDT',
  higherTimeframe,
  entryTimeframe,
  fundingTimeframe = [],
  metricsTimeframe = [],
  config = {},
  foldCount = 3,
  warmupBars = 80,
}: {
  symbol?: string;
  higherTimeframe: Candle[];
  entryTimeframe: Candle[];
  fundingTimeframe?: FundingPoint[];
  metricsTimeframe?: MarketMetricsPoint[];
  config?: BacktestConfig;
  foldCount?: number;
  warmupBars?: number;
}): WalkForwardValidation {
  const safeFoldCount = Math.max(1, Math.min(Math.floor(foldCount), 5));
  const testBars = Math.max(Math.floor(entryTimeframe.length / (safeFoldCount + 2)), 1);
  const firstTestStart = Math.max(entryTimeframe.length - testBars * safeFoldCount, 1);
  const folds: WalkForwardFold[] = [];

  for (let index = 0; index < safeFoldCount; index += 1) {
    const testStartIndex = Math.min(firstTestStart + index * testBars, Math.max(entryTimeframe.length - 1, 0));
    const testEndIndex = Math.min(testStartIndex + testBars, entryTimeframe.length);
    const contextStart = Math.max(0, testStartIndex - Math.max(warmupBars, 0));
    const testInput = entryTimeframe.slice(contextStart, testEndIndex);
    const testPeriod = entryTimeframe.slice(testStartIndex, testEndIndex);
    const report = runBacktest({ symbol, higherTimeframe, entryTimeframe: testInput, fundingTimeframe, metricsTimeframe, config });
    folds.push({
      index: index + 1,
      trainCandles: testStartIndex,
      testCandles: testPeriod.length,
      testStart: testPeriod[0]?.time ?? null,
      testEnd: testPeriod.at(-1)?.time ?? null,
      summary: summarizeBacktest(report, testPeriod),
    });
  }

  const aggregate = combineSummaries(folds.map((fold) => fold.summary), entryTimeframe.slice(firstTestStart));
  const notes = [
    `${safeFoldCount} forward fold; setiap test window berjalan setelah periode train sebelumnya dan memakai ${Math.max(warmupBars, 0)} candle warmup.`,
    'Rule dan parameter tetap sama di semua fold; tidak ada fitting atau tuning menggunakan data test.',
    'Aggregate fold tidak dipakai sebagai equity curve gabungan; gunakan untuk melihat konsistensi generalisasi antarperiode.',
  ];
  if (folds.some((fold) => fold.summary.totalTrades < 30)) notes.push('Sebagian fold memiliki kurang dari 30 trade; baca hasil per fold dengan hati-hati.');
  return { foldCount: safeFoldCount, warmupBars: Math.max(warmupBars, 0), aggregate, folds, notes };
}
