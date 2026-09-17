import { adx, atr, ema, type Candle } from './index';
import type { FundingPoint, MarketMetricsPoint } from './backtest';

/**
 * Candidate condition funnel.
 *
 * A candidate that returns zero trades is ambiguous: it can mean "the rule is wrong" or "the rule
 * can never fire on this data". Those two need opposite responses, so the funnel counts how many
 * candles survive each condition independently and cumulatively, and reports the observed
 * distribution of every threshold the rule uses.
 *
 * This is diagnostics only. It never changes an entry rule and never feeds the promotion gate.
 */

export type FunnelStage = {
  label: string;
  passed: number;
  /** Share of evaluated candles, 0..1. */
  share: number;
};

export type DistributionStats = {
  count: number;
  min: number;
  p01: number;
  p10: number;
  median: number;
  p90: number;
  p99: number;
  max: number;
};

export type CandidateFunnel = {
  name: string;
  evaluated: number;
  longStages: FunnelStage[];
  shortStages: FunnelStage[];
  distributions: Record<string, DistributionStats>;
  /** Human-readable explanation of the binding constraint when the candidate cannot fire. */
  diagnosis: string | null;
};

export const FUNDING_EXTREME_THRESHOLD_FOR_DIAGNOSTICS = 0.0001;

function quantile(sorted: number[], fraction: number): number {
  if (sorted.length === 0) return Number.NaN;
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor(fraction * sorted.length)))];
}

function describe(values: number[]): DistributionStats {
  const sorted = [...values].sort((left, right) => left - right);
  return {
    count: sorted.length,
    min: sorted[0] ?? Number.NaN,
    p01: quantile(sorted, 0.01),
    p10: quantile(sorted, 0.1),
    median: quantile(sorted, 0.5),
    p90: quantile(sorted, 0.9),
    p99: quantile(sorted, 0.99),
    max: sorted.at(-1) ?? Number.NaN,
  };
}

/** Mirrors runBacktest: the latest observation strictly known once the entry candle has closed. */
export function alignSeriesToEntryCandles<T extends { time: number }>(
  entryTimeframe: Candle[],
  series: T[],
  entryIntervalMs = 15 * 60 * 1000,
): Array<T | undefined> {
  const aligned: Array<T | undefined> = new Array(entryTimeframe.length).fill(undefined);
  let cursor = 0;
  let latest: T | undefined;
  for (let index = 0; index < entryTimeframe.length; index += 1) {
    const closeTime = entryTimeframe[index].time + entryIntervalMs;
    while (cursor < series.length && series[cursor].time <= closeTime) {
      latest = series[cursor];
      cursor += 1;
    }
    aligned[index] = latest;
  }
  return aligned;
}

function alignPreviousMetrics(
  entryTimeframe: Candle[],
  metrics: MarketMetricsPoint[],
  lookbackMs: number,
  entryIntervalMs = 15 * 60 * 1000,
): Array<MarketMetricsPoint | undefined> {
  const aligned: Array<MarketMetricsPoint | undefined> = new Array(entryTimeframe.length).fill(undefined);
  let cursor = -1;
  for (let index = 0; index < entryTimeframe.length; index += 1) {
    const cutoff = entryTimeframe[index].time + entryIntervalMs - lookbackMs;
    while (cursor + 1 < metrics.length && metrics[cursor + 1].time <= cutoff) cursor += 1;
    aligned[index] = cursor >= 0 ? metrics[cursor] : undefined;
  }
  return aligned;
}

function lastIndexAtOrBefore(times: number[], value: number): number {
  for (let index = times.length - 1; index >= 0; index -= 1) {
    if (times[index] <= value) return index;
  }
  return -1;
}

function stage(label: string, passed: number, evaluated: number): FunnelStage {
  return { label, passed, share: evaluated === 0 ? 0 : passed / evaluated };
}

/**
 * Reports the condition that structurally blocks a side. A side whose funnel never reaches zero is
 * reachable-but-thin, which is a different statement from a threshold the instrument never visits, so
 * only the latter is reported as a binding constraint.
 */
function bindingConstraint(stages: FunnelStage[], side: 'long' | 'short', evaluated: number): string | null {
  if (evaluated === 0) return 'Tidak ada candle yang bisa dievaluasi pada periode ini.';
  const drop = stages.find((item) => item.passed === 0);
  if (!drop) return null;
  const previous = stages[stages.indexOf(drop) - 1];
  return `Sisi ${side} mati pada kondisi "${drop.label}"`
    + (previous ? ` (dari ${previous.passed} candle yang lolos kondisi sebelumnya)` : ' (kondisi pertama)')
    + '. Threshold ini tidak pernah terpenuhi pada data periode ini.';
}

export function buildLiquidationReclaimFunnel({
  entryTimeframe,
  higherTimeframe,
  metricsTimeframe,
  entryIntervalMs = 15 * 60 * 1000,
}: {
  entryTimeframe: Candle[];
  higherTimeframe: Candle[];
  metricsTimeframe: MarketMetricsPoint[];
  entryIntervalMs?: number;
}): CandidateFunnel {
  const evaluated = Math.max(0, entryTimeframe.length - 80);
  const alignedMetrics = alignSeriesToEntryCandles(entryTimeframe, metricsTimeframe, entryIntervalMs);
  const previousMetrics = alignPreviousMetrics(entryTimeframe, metricsTimeframe, 60 * 60 * 1000, entryIntervalMs);
  const higherAdx = adx(higherTimeframe);
  const higherTimes = higherTimeframe.map((candle) => candle.time);
  let longFinal = 0;
  let shortFinal = 0;

  const openInterestChanges: number[] = [];
  const takerVolumeRatios: number[] = [];
  const accountRatios: number[] = [];
  const positionRatios: number[] = [];
  const allAccountRatios: number[] = [];
  const candleFlows: number[] = [];

  const longCounts = [0, 0, 0, 0, 0, 0, 0];
  const shortCounts = [0, 0, 0, 0, 0, 0, 0];

  for (let index = 80; index < entryTimeframe.length; index += 1) {
    const candle = entryTimeframe[index];
    const metric = alignedMetrics[index];
    const previous = previousMetrics[index];
    if (!metric || !previous || previous.openInterestValue <= 0) continue;

    const openInterestChange = metric.openInterestValue / previous.openInterestValue - 1;
    const priceMove = index >= 4 ? candle.close / entryTimeframe[index - 4].close - 1 : Number.NaN;
    const candleFlow = candle.volume > 0 && candle.takerBuyVolume !== undefined
      ? candle.takerBuyVolume / candle.volume
      : Number.NaN;

    openInterestChanges.push(openInterestChange);
    takerVolumeRatios.push(metric.takerLongShortVolumeRatio);
    accountRatios.push(metric.longShortRatio);
    positionRatios.push(metric.topTraderLongShortPositionRatio);
    allAccountRatios.push(metric.topTraderLongShortRatio);
    if (Number.isFinite(candleFlow)) candleFlows.push(candleFlow);

    const crowdedLong = metric.topTraderLongShortRatio >= 1.5
      && metric.topTraderLongShortPositionRatio >= 1.5
      && metric.longShortRatio >= 1.5;
    const crowdedShort = metric.topTraderLongShortRatio <= 1 / 1.5
      && metric.topTraderLongShortPositionRatio <= 1 / 1.5
      && metric.longShortRatio <= 1 / 1.5;
    const openInterestFlush = openInterestChange <= -0.003;
    const takerSupportsLong = metric.takerLongShortVolumeRatio <= 0.75;
    const takerSupportsShort = metric.takerLongShortVolumeRatio >= 1 / 0.75;
    const flowSupportsLong = !Number.isFinite(candleFlow) || candleFlow <= 0.45;
    const flowSupportsShort = !Number.isFinite(candleFlow) || candleFlow >= 0.55;

    const longChain = [
      crowdedLong,
      openInterestFlush,
      takerSupportsLong,
      flowSupportsLong,
      Number.isFinite(priceMove) && priceMove <= -0.002,
      candle.close > candle.open,
    ];
    const shortChain = [
      crowdedShort,
      openInterestFlush,
      takerSupportsShort,
      flowSupportsShort,
      Number.isFinite(priceMove) && priceMove >= 0.002,
      candle.close < candle.open,
    ];

    for (let step = 0; step < longChain.length; step += 1) {
      if (longChain.slice(0, step + 1).every(Boolean)) longCounts[step] += 1;
      if (shortChain.slice(0, step + 1).every(Boolean)) shortCounts[step] += 1;
    }
    const higherIndex = lastIndexAtOrBefore(higherTimes, candle.time);
    const adxValue = higherIndex >= 0 ? higherAdx[higherIndex] : Number.NaN;
    const calmHigherTimeframe = Number.isFinite(adxValue) && adxValue <= 28;
    if (longChain.every(Boolean) && calmHigherTimeframe) longFinal += 1;
    if (shortChain.every(Boolean) && calmHigherTimeframe) shortFinal += 1;
  }

  const longStages = [
    stage('Crowding long (3 ratio >= 1.5)', longCounts[0], evaluated),
    stage('Open interest value turun >= 0.3% / 1 jam', longCounts[1], evaluated),
    stage('Taker long/short volume ratio <= 0.75', longCounts[2], evaluated),
    stage('Candle taker flow <= 0.45', longCounts[3], evaluated),
    stage('Price move 4 candle <= -0.2%', longCounts[4], evaluated),
    stage('Candle close bullish (reclaim)', longCounts[5], evaluated),
    stage('ADX 1H <= 28', longFinal, evaluated),
  ];
  const shortStages = [
    stage('Crowding short (3 ratio <= 0.667)', shortCounts[0], evaluated),
    stage('Open interest value turun >= 0.3% / 1 jam', shortCounts[1], evaluated),
    stage('Taker long/short volume ratio >= 1.333', shortCounts[2], evaluated),
    stage('Candle taker flow >= 0.55', shortCounts[3], evaluated),
    stage('Price move 4 candle >= +0.2%', shortCounts[4], evaluated),
    stage('Candle close bearish (reclaim)', shortCounts[5], evaluated),
    stage('ADX 1H <= 28', shortFinal, evaluated),
  ];

  return {
    name: 'LIQUIDATION_RECLAIM_HYPOTHESIS',
    evaluated,
    longStages,
    shortStages,
    distributions: {
      openInterestChange1h: describe(openInterestChanges),
      takerLongShortVolumeRatio: describe(takerVolumeRatios),
      allAccountLongShortRatio: describe(allAccountRatios),
      allPositionLongShortRatio: describe(positionRatios),
      accountLongShortRatio: describe(accountRatios),
      candleTakerBuyRatio: describe(candleFlows),
    },
    diagnosis: [bindingConstraint(longStages, 'long', evaluated), bindingConstraint(shortStages, 'short', evaluated)]
      .filter((item): item is string => item !== null)
      .join(' ') || null,
  };
}

export function buildTakerFlowFunnel({
  entryTimeframe,
  higherTimeframe,
}: {
  entryTimeframe: Candle[];
  higherTimeframe: Candle[];
}): CandidateFunnel {
  const evaluated = Math.max(0, entryTimeframe.length - 80);
  const flowRatios: number[] = [];
  const longCounts = [0, 0, 0, 0, 0];
  const shortCounts = [0, 0, 0, 0, 0];

  const higherAdx = adx(higherTimeframe);
  const higherTimes = higherTimeframe.map((candle) => candle.time);
  const entryAtr = atr(entryTimeframe);
  const averageVolume = entryTimeframe.map((candle) => candle.volume);

  for (let index = 80; index < entryTimeframe.length; index += 1) {
    const candle = entryTimeframe[index];
    if (candle.takerBuyVolume === undefined || candle.volume <= 0) continue;
    const previous = entryTimeframe.slice(index - 3, index);
    if (previous.length < 3) continue;
    const flowRatio = candle.takerBuyVolume / candle.volume;
    flowRatios.push(flowRatio);

    const range = Math.max(candle.high - candle.low, Number.EPSILON);
    const body = Math.abs(candle.close - candle.open);
    const atrValue = entryAtr[index] ?? Number.NaN;
    if (!Number.isFinite(atrValue) || atrValue <= Number.EPSILON) continue;
    const volumeAverage = averageVolume.slice(index - 19, index + 1).reduce((sum, value) => sum + value, 0) / 20;
    const higherIndex = lastIndexAtOrBefore(higherTimes, candle.time);
    const adxValue = higherIndex >= 0 ? higherAdx[higherIndex] : Number.NaN;

    const orderlyRange = range <= atrValue * 2.2 && body >= range * 0.12;
    const usableVolume = volumeAverage > 0 && candle.volume / volumeAverage >= 0.8;
    const calmHigherTimeframe = Number.isFinite(adxValue) && adxValue <= 28;
    const priorMoveDown = previous[0].close > previous[1].close && previous[1].close > previous[2].close;
    const priorMoveUp = previous[0].close < previous[1].close && previous[1].close < previous[2].close;
    const bullishRejection = candle.close > candle.open
      && candle.close >= candle.low + range * 0.65
      && candle.close - candle.low >= range * 0.45;
    const bearishRejection = candle.close < candle.open
      && candle.close <= candle.low + range * 0.35
      && candle.high - candle.close >= range * 0.45;

    const longChain = [flowRatio <= 0.38, priorMoveDown, bullishRejection, orderlyRange && usableVolume, calmHigherTimeframe];
    const shortChain = [flowRatio >= 0.62, priorMoveUp, bearishRejection, orderlyRange && usableVolume, calmHigherTimeframe];
    for (let step = 0; step < longChain.length; step += 1) {
      if (longChain.slice(0, step + 1).every(Boolean)) longCounts[step] += 1;
      if (shortChain.slice(0, step + 1).every(Boolean)) shortCounts[step] += 1;
    }
  }

  const longStages = [
    stage('Taker buy ratio <= 0.38', longCounts[0], evaluated),
    stage('Tiga candle sebelumnya turun', longCounts[1], evaluated),
    stage('Bullish rejection candle', longCounts[2], evaluated),
    stage('Range <= 2.2 ATR dan volume >= 0.8x', longCounts[3], evaluated),
    stage('ADX 1H <= 28', longCounts[4], evaluated),
  ];
  const shortStages = [
    stage('Taker buy ratio >= 0.62', shortCounts[0], evaluated),
    stage('Tiga candle sebelumnya naik', shortCounts[1], evaluated),
    stage('Bearish rejection candle', shortCounts[2], evaluated),
    stage('Range <= 2.2 ATR dan volume >= 0.8x', shortCounts[3], evaluated),
    stage('ADX 1H <= 28', shortCounts[4], evaluated),
  ];

  return {
    name: 'TAKER_FLOW_REJECTION_HYPOTHESIS',
    evaluated,
    longStages,
    shortStages,
    distributions: { candleTakerBuyRatio: describe(flowRatios) },
    diagnosis: [
      bindingConstraint(longStages, 'long', evaluated),
      bindingConstraint(shortStages, 'short', evaluated),
    ].filter((item): item is string => item !== null).join(' ') || null,
  };
}

export function buildFundingDistribution({
  entryTimeframe,
  fundingTimeframe,
  entryEma20Closes,
  entryIntervalMs = 15 * 60 * 1000,
}: {
  entryTimeframe: Candle[];
  fundingTimeframe: FundingPoint[];
  entryEma20Closes?: number[];
  entryIntervalMs?: number;
}): CandidateFunnel {
  const evaluated = Math.max(0, entryTimeframe.length - 80);
  const aligned = alignSeriesToEntryCandles(entryTimeframe, fundingTimeframe, entryIntervalMs);
  const rates: number[] = [];
  const ema20 = entryEma20Closes ?? ema(entryTimeframe.map((candle) => candle.close), 20);
  const atrValues = atr(entryTimeframe);

  let atCap = 0;
  let longChain = 0;
  let shortChain = 0;
  for (let index = 80; index < entryTimeframe.length; index += 1) {
    const point = aligned[index];
    if (!point || !Number.isFinite(point.fundingRate)) continue;
    rates.push(point.fundingRate);
    if (Math.abs(point.fundingRate) < FUNDING_EXTREME_THRESHOLD_FOR_DIAGNOSTICS) continue;
    atCap += 1;
    const candle = entryTimeframe[index];
    const range = Math.max(candle.high - candle.low, Number.EPSILON);
    const stopDistance = (atrValues[index] ?? Number.NaN) * 1.2;
    const meanTargetDistance = Math.abs((ema20[index] ?? Number.NaN) - candle.close);
    const targetFarEnough = Number.isFinite(stopDistance) && Number.isFinite(meanTargetDistance)
      && meanTargetDistance >= stopDistance * 1.2;
    const bullishRejection = candle.close > candle.open && candle.close >= candle.low + range * 0.65;
    const bearishRejection = candle.close < candle.open && candle.close <= candle.high - range * 0.65;
    if (point.fundingRate <= -FUNDING_EXTREME_THRESHOLD_FOR_DIAGNOSTICS && bullishRejection && targetFarEnough) longChain += 1;
    if (point.fundingRate >= FUNDING_EXTREME_THRESHOLD_FOR_DIAGNOSTICS && bearishRejection && targetFarEnough) shortChain += 1;
  }

  return {
    name: 'FUNDING_CROWDING_REVERSION_HYPOTHESIS',
    evaluated,
    longStages: [
      stage('Funding <= -0.01% (cap bawah)', atCap, evaluated),
      stage('Bullish rejection + target EMA20 cukup jauh', longChain, evaluated),
    ],
    shortStages: [
      stage('Funding >= +0.01% (cap atas)', atCap, evaluated),
      stage('Bearish rejection + target EMA20 cukup jauh', shortChain, evaluated),
    ],
    distributions: { fundingRate: describe(rates) },
    diagnosis: null,
  };
}

export function buildChampionAbsorptionFunnel({
  entryTimeframe,
  higherTimeframe,
}: {
  entryTimeframe: Candle[];
  higherTimeframe: Candle[];
}): CandidateFunnel {
  const evaluated = Math.max(0, entryTimeframe.length - 80);
  const higherEma50 = ema(higherTimeframe.map((candle) => candle.close), 50);
  const higherEma200 = ema(higherTimeframe.map((candle) => candle.close), 200);
  const higherTimes = higherTimeframe.map((candle) => candle.time);
  const takerRatios: number[] = [];
  const longCounts = [0, 0, 0];
  const shortCounts = [0, 0, 0];

  for (let index = 80; index < entryTimeframe.length; index += 1) {
    const higherIndex = lastIndexAtOrBefore(higherTimes, entryTimeframe[index].time);
    if (higherIndex < 0) continue;
    const structureUp = higherEma50[higherIndex] > higherEma200[higherIndex];
    const structureDown = higherEma50[higherIndex] < higherEma200[higherIndex];
    if (!structureUp && !structureDown) continue;

    const lookback = entryTimeframe.slice(index - 60, index);
    if (lookback.length < 60) continue;
    const swingLow = Math.min(...lookback.map((candle) => candle.low));
    const swingHigh = Math.max(...lookback.map((candle) => candle.high));
    const range = swingHigh - swingLow;
    if (!(range > Number.EPSILON)) continue;
    let volume = 0;
    let priceVolume = 0;
    for (const candle of lookback) {
      const typical = (candle.high + candle.low + candle.close) / 3;
      volume += candle.volume;
      priceVolume += typical * candle.volume;
    }
    const valueLine = volume > 0 ? priceVolume / volume : Number.NaN;
    if (!Number.isFinite(valueLine)) continue;
    const averageVolume = lookback.slice(0, -1).reduce((sum, candle) => sum + candle.volume, 0) / Math.max(1, lookback.length - 1);

    const absorptionAt = (offset: number) => {
      const candle = lookback.at(offset);
      if (!candle || candle.volume <= 0 || candle.takerBuyVolume === undefined) return null;
      const takerRatio = candle.takerBuyVolume / candle.volume;
      takerRatios.push(takerRatio);
      const candleRange = Math.max(candle.high - candle.low, Number.EPSILON);
      const participation = candle.volume >= averageVolume;
      const inLongZone = candle.close >= swingHigh - range * 0.886 && candle.close <= swingHigh - range * 0.705 && candle.close < valueLine;
      const inShortZone = candle.close <= swingLow + range * 0.886 && candle.close >= swingLow + range * 0.705 && candle.close > valueLine;
      return { candle, takerRatio, participation, inLongZone, inShortZone, candleRange };
    };

    const trigger = entryTimeframe[index];
    const check = (absorption: ReturnType<typeof absorptionAt>, wantLong: boolean) => {
      if (!absorption || !absorption.participation) return { absorption: false, flip: false };
      const absorptionHolds = wantLong
        ? absorption.takerRatio <= 0.4 && absorption.candle.close >= absorption.candle.low + absorption.candleRange * 0.45 && absorption.inLongZone
        : absorption.takerRatio >= 0.6 && absorption.candle.close <= absorption.candle.low + absorption.candleRange * 0.55 && absorption.inShortZone;
      if (!absorptionHolds) return { absorption: false, flip: false };
      const flip = wantLong
        ? trigger.close > trigger.open && trigger.close > absorption.candle.high && trigger.low > absorption.candle.low
        : trigger.close < trigger.open && trigger.close < absorption.candle.low && trigger.high < absorption.candle.high;
      return { absorption: true, flip };
    };

    const longResult = [check(absorptionAt(-1), true), check(absorptionAt(-2), true)];
    const shortResult = [check(absorptionAt(-1), false), check(absorptionAt(-2), false)];
    if (structureUp) longCounts[0] += 1;
    if (structureDown) shortCounts[0] += 1;
    if (structureUp && longResult.some((item) => item.absorption)) longCounts[1] += 1;
    if (structureDown && shortResult.some((item) => item.absorption)) shortCounts[1] += 1;
    if (structureUp && longResult.some((item) => item.flip)) longCounts[2] += 1;
    if (structureDown && shortResult.some((item) => item.flip)) shortCounts[2] += 1;
  }

  const longStages = [
    stage('Struktur 1H (EMA50 vs EMA200)', longCounts[0], evaluated),
    stage('Absorption di zona fib luar value + partisipasi', longCounts[1], evaluated),
    stage('Dominance shift / flip pada trigger', longCounts[2], evaluated),
  ];
  const shortStages = [
    stage('Struktur 1H (EMA50 vs EMA200)', shortCounts[0], evaluated),
    stage('Absorption di zona fib luar value + partisipasi', shortCounts[1], evaluated),
    stage('Dominance shift / flip pada trigger', shortCounts[2], evaluated),
  ];
  return {
    name: 'CHAMPION_ABSORPTION_REVERSION_HYPOTHESIS',
    evaluated,
    longStages,
    shortStages,
    distributions: { candleTakerBuyRatio: describe(takerRatios) },
    diagnosis: [bindingConstraint(longStages, 'long', evaluated), bindingConstraint(shortStages, 'short', evaluated)]
      .filter((item): item is string => item !== null).join(' ') || null,
  };
}

export function buildWilliamsBreakoutFunnel({
  entryTimeframe,
}: {
  entryTimeframe: Candle[];
}): CandidateFunnel {
  const evaluated = Math.max(0, entryTimeframe.length - 80);
  const dayKey = (time: number) => Math.floor(time / 86_400_000);
  const longCounts = [0, 0];
  const shortCounts = [0, 0];
  const gates: number[] = [];

  const dailyCloses: number[] = [];
  let scanningDay = -1;
  let runningClose = Number.NaN;
  let previousDayHigh = Number.NaN;
  let previousDayLow = Number.NaN;
  let currentDayOpen = Number.NaN;

  const smaLast = (values: number[], period: number) => {
    if (values.length < period) return Number.NaN;
    let sum = 0;
    for (let index = values.length - period; index < values.length; index += 1) sum += values[index];
    return sum / period;
  };

  for (let index = 80; index < entryTimeframe.length; index += 1) {
    const candle = entryTimeframe[index];
    const day = dayKey(candle.time);
    if (day !== scanningDay) {
      if (scanningDay !== -1) dailyCloses.push(runningClose);
      scanningDay = day;
      runningClose = candle.close;
      currentDayOpen = candle.open;
      previousDayHigh = Number.NaN;
      previousDayLow = Number.NaN;
      for (let back = index - 1; back >= 0; back -= 1) {
        const priorDay = dayKey(entryTimeframe[back].time);
        if (priorDay === day - 1) {
          previousDayHigh = Number.isFinite(previousDayHigh) ? Math.max(previousDayHigh, entryTimeframe[back].high) : entryTimeframe[back].high;
          previousDayLow = Number.isFinite(previousDayLow) ? Math.min(previousDayLow, entryTimeframe[back].low) : entryTimeframe[back].low;
        } else if (priorDay < day - 1) break;
      }
    } else {
      runningClose = candle.close;
    }
    const previousDayRange = previousDayHigh - previousDayLow;
    if (!Number.isFinite(previousDayRange) || !(previousDayRange > Number.EPSILON)) continue;
    const gate = 0.5 * previousDayRange;
    gates.push(gate);
    const sma5 = smaLast(dailyCloses, 5);
    const sma45 = smaLast(dailyCloses, 45);
    if (!Number.isFinite(sma5) || !Number.isFinite(sma45)) continue;
    if (sma5 > sma45) {
      longCounts[0] += 1;
      if (candle.close >= currentDayOpen + gate) longCounts[1] += 1;
    }
    if (sma5 < sma45) {
      shortCounts[0] += 1;
      if (candle.close <= currentDayOpen - gate) shortCounts[1] += 1;
    }
  }

  const longStages = [
    stage('Regime SMA5 > SMA45 harian', longCounts[0], evaluated),
    stage('Close >= open + 0.5 x range hari sebelumnya', longCounts[1], evaluated),
  ];
  const shortStages = [
    stage('Regime SMA5 < SMA45 harian', shortCounts[0], evaluated),
    stage('Close <= open - 0.5 x range hari sebelumnya', shortCounts[1], evaluated),
  ];
  return {
    name: 'WILLIAMS_VOLATILITY_BREAKOUT_HYPOTHESIS',
    evaluated,
    longStages,
    shortStages,
    distributions: { previousDayRangeGate: describe(gates) },
    diagnosis: [bindingConstraint(longStages, 'long', evaluated), bindingConstraint(shortStages, 'short', evaluated)]
      .filter((item): item is string => item !== null).join(' ') || null,
  };
}
