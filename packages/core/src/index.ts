export type Direction = 'LONG' | 'SHORT' | 'NO_TRADE';
export type Regime = 'TREND_UP' | 'TREND_DOWN' | 'RANGE' | 'UNCERTAIN';

export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface SignalEvaluation {
  direction: Direction;
  regime: Regime;
  score: number;
  scoreMax: number;
  entry: number | null;
  stopLoss: number | null;
  takeProfit: number | null;
  quantity: number;
  riskAmount: number;
  riskReward: number | null;
  qualityLabel: 'HIGH' | 'MEDIUM' | 'LOW' | 'WAIT';
  reasons: string[];
  blockers: string[];
  indicators: {
    ema20: number | null;
    ema50: number | null;
    ema200: number | null;
    rsi: number | null;
    atr: number | null;
    adx: number | null;
    volumeRatio: number | null;
  };
}

const finite = (value: number | undefined): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const lastValue = (values: number[]): number | null => {
  for (let index = values.length - 1; index >= 0; index -= 1) {
    if (finite(values[index])) return values[index];
  }
  return null;
};

export function sma(values: number[], period: number): number[] {
  const output = values.map(() => Number.NaN);
  if (period <= 0 || values.length < period) return output;

  let sum = 0;
  for (let index = 0; index < values.length; index += 1) {
    sum += values[index];
    if (index >= period) sum -= values[index - period];
    if (index >= period - 1) output[index] = sum / period;
  }
  return output;
}

export function ema(values: number[], period: number): number[] {
  const output = values.map(() => Number.NaN);
  if (period <= 0 || values.length < period) return output;

  let previous = values.slice(0, period).reduce((sum, value) => sum + value, 0) / period;
  output[period - 1] = previous;
  const multiplier = 2 / (period + 1);

  for (let index = period; index < values.length; index += 1) {
    previous = (values[index] - previous) * multiplier + previous;
    output[index] = previous;
  }
  return output;
}

export function trueRanges(candles: Candle[]): number[] {
  return candles.map((candle, index) => {
    if (index === 0) return candle.high - candle.low;
    const previousClose = candles[index - 1].close;
    return Math.max(
      candle.high - candle.low,
      Math.abs(candle.high - previousClose),
      Math.abs(candle.low - previousClose),
    );
  });
}

export function atr(candles: Candle[], period = 14): number[] {
  return ema(trueRanges(candles), period);
}

export function rsi(candles: Candle[], period = 14): number[] {
  const output = candles.map(() => Number.NaN);
  if (candles.length <= period) return output;

  let gains = 0;
  let losses = 0;
  for (let index = 1; index <= period; index += 1) {
    const change = candles[index].close - candles[index - 1].close;
    if (change >= 0) gains += change;
    else losses += Math.abs(change);
  }

  let averageGain = gains / period;
  let averageLoss = losses / period;
  output[period] = averageLoss === 0 ? 100 : 100 - 100 / (1 + averageGain / averageLoss);

  for (let index = period + 1; index < candles.length; index += 1) {
    const change = candles[index].close - candles[index - 1].close;
    const gain = Math.max(change, 0);
    const loss = Math.max(-change, 0);
    averageGain = (averageGain * (period - 1) + gain) / period;
    averageLoss = (averageLoss * (period - 1) + loss) / period;
    output[index] = averageLoss === 0 ? 100 : 100 - 100 / (1 + averageGain / averageLoss);
  }
  return output;
}

export function adx(candles: Candle[], period = 14): number[] {
  const output = candles.map(() => Number.NaN);
  if (candles.length < period * 2 + 1) return output;

  const ranges = trueRanges(candles);
  const plusDm = candles.map(() => 0);
  const minusDm = candles.map(() => 0);

  for (let index = 1; index < candles.length; index += 1) {
    const upMove = candles[index].high - candles[index - 1].high;
    const downMove = candles[index - 1].low - candles[index].low;
    plusDm[index] = upMove > downMove && upMove > 0 ? upMove : 0;
    minusDm[index] = downMove > upMove && downMove > 0 ? downMove : 0;
  }

  let smoothedTr = ranges.slice(1, period + 1).reduce((sum, value) => sum + value, 0);
  let smoothedPlus = plusDm.slice(1, period + 1).reduce((sum, value) => sum + value, 0);
  let smoothedMinus = minusDm.slice(1, period + 1).reduce((sum, value) => sum + value, 0);
  const dx: number[] = candles.map(() => Number.NaN);

  for (let index = period; index < candles.length; index += 1) {
    if (index > period) {
      smoothedTr = smoothedTr - smoothedTr / period + ranges[index];
      smoothedPlus = smoothedPlus - smoothedPlus / period + plusDm[index];
      smoothedMinus = smoothedMinus - smoothedMinus / period + minusDm[index];
    }

    const plusDi = smoothedTr === 0 ? 0 : (100 * smoothedPlus) / smoothedTr;
    const minusDi = smoothedTr === 0 ? 0 : (100 * smoothedMinus) / smoothedTr;
    const denominator = plusDi + minusDi;
    dx[index] = denominator === 0 ? 0 : (100 * Math.abs(plusDi - minusDi)) / denominator;
  }

  const firstAdxIndex = period * 2 - 1;
  if (firstAdxIndex >= candles.length) return output;
  let adxValue = 0;
  for (let index = period; index <= firstAdxIndex; index += 1) adxValue += dx[index] || 0;
  adxValue /= period;
  output[firstAdxIndex] = adxValue;

  for (let index = firstAdxIndex + 1; index < candles.length; index += 1) {
    adxValue = (adxValue * (period - 1) + (dx[index] || 0)) / period;
    output[index] = adxValue;
  }
  return output;
}

function round(value: number, decimals = 4): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

export function evaluateSignal({
  higherTimeframe,
  entryTimeframe,
  equity,
  riskFraction = 0.0025,
  minimumScore = 7,
}: {
  higherTimeframe: Candle[];
  entryTimeframe: Candle[];
  equity: number;
  riskFraction?: number;
  minimumScore?: number;
}): SignalEvaluation {
  const emptyIndicators = {
    ema20: null,
    ema50: null,
    ema200: null,
    rsi: null,
    atr: null,
    adx: null,
    volumeRatio: null,
  };

  if (higherTimeframe.length < 220 || entryTimeframe.length < 60 || equity <= 0) {
    return {
      direction: 'NO_TRADE',
      regime: 'UNCERTAIN',
      score: 0,
      scoreMax: 10,
      entry: null,
      stopLoss: null,
      takeProfit: null,
      quantity: 0,
      riskAmount: 0,
      riskReward: null,
      qualityLabel: 'WAIT',
      reasons: [],
      blockers: ['Data belum cukup untuk evaluasi.'],
      indicators: emptyIndicators,
    };
  }

  const higherCloses = higherTimeframe.map((candle) => candle.close);
  const entryCloses = entryTimeframe.map((candle) => candle.close);
  const higherEma50 = lastValue(ema(higherCloses, 50));
  const higherEma200 = lastValue(ema(higherCloses, 200));
  const higherAdx = lastValue(adx(higherTimeframe));
  const entryEma20 = lastValue(ema(entryCloses, 20));
  const entryEma50 = lastValue(ema(entryCloses, 50));
  const entryRsi = lastValue(rsi(entryTimeframe));
  const entryAtr = lastValue(atr(entryTimeframe));
  const entryAdx = lastValue(adx(entryTimeframe));
  const volumeAverage = lastValue(sma(entryTimeframe.map((candle) => candle.volume), 20));
  const lastCandle = entryTimeframe[entryTimeframe.length - 1];
  const previousCandle = entryTimeframe[entryTimeframe.length - 2];
  const volumeRatio = volumeAverage ? lastCandle.volume / volumeAverage : null;
  const effectiveAdx = entryAdx ?? higherAdx;

  const indicators = {
    ema20: entryEma20 === null ? null : round(entryEma20, 2),
    ema50: entryEma50 === null ? null : round(entryEma50, 2),
    ema200: higherEma200 === null ? null : round(higherEma200, 2),
    rsi: entryRsi === null ? null : round(entryRsi, 2),
    atr: entryAtr === null ? null : round(entryAtr, 2),
    adx: effectiveAdx === null ? null : round(effectiveAdx, 2),
    volumeRatio: volumeRatio === null ? null : round(volumeRatio, 2),
  };

  if (!higherEma50 || !higherEma200 || effectiveAdx === null || !entryEma20 || !entryEma50 || !entryRsi || !entryAtr) {
    return {
      direction: 'NO_TRADE',
      regime: 'UNCERTAIN',
      score: 0,
      scoreMax: 10,
      entry: null,
      stopLoss: null,
      takeProfit: null,
      quantity: 0,
      riskAmount: 0,
      riskReward: null,
      qualityLabel: 'WAIT',
      reasons: [],
      blockers: ['Indikator belum memiliki cukup data valid.'],
      indicators,
    };
  }

  const regime: Regime = higherEma50 > higherEma200 && effectiveAdx >= 18
    ? 'TREND_UP'
    : higherEma50 < higherEma200 && effectiveAdx >= 18
      ? 'TREND_DOWN'
      : effectiveAdx < 18
        ? 'RANGE'
        : 'UNCERTAIN';

  const longReasons: string[] = [];
  const shortReasons: string[] = [];
  const blockers: string[] = [];
  let longScore = 0;
  let shortScore = 0;

  if (regime === 'TREND_UP') {
    longScore += 2;
    longReasons.push('Tren timeframe besar bullish.');
  }
  if (regime === 'TREND_DOWN') {
    shortScore += 2;
    shortReasons.push('Tren timeframe besar bearish.');
  }

  const longPullback = lastCandle.close >= entryEma50 * 0.985 && lastCandle.close <= entryEma20 * 1.012;
  const shortPullback = lastCandle.close <= entryEma50 * 1.015 && lastCandle.close >= entryEma20 * 0.988;
  if (longPullback) {
    longScore += 1;
    longReasons.push('Harga berada di area pullback long.');
  }
  if (shortPullback) {
    shortScore += 1;
    shortReasons.push('Harga berada di area pullback short.');
  }

  if (lastCandle.close > previousCandle.close && lastCandle.close > lastCandle.open) {
    longScore += 2;
    longReasons.push('Candle konfirmasi bullish sudah ditutup.');
  }
  if (lastCandle.close < previousCandle.close && lastCandle.close < lastCandle.open) {
    shortScore += 2;
    shortReasons.push('Candle konfirmasi bearish sudah ditutup.');
  }

  if (entryRsi >= 45 && entryRsi <= 68) {
    longScore += 1;
    longReasons.push('Momentum RSI long masih berada di area sehat.');
  }
  if (entryRsi >= 32 && entryRsi <= 55) {
    shortScore += 1;
    shortReasons.push('Momentum RSI short mendukung pelemahan.');
  }

  if (volumeRatio !== null && volumeRatio >= 0.8) {
    longScore += 1;
    shortScore += 1;
    longReasons.push('Volume tidak berada di bawah rata-rata minimum.');
    shortReasons.push('Volume tidak berada di bawah rata-rata minimum.');
  }

  if (effectiveAdx >= 20) {
    longScore += 1;
    shortScore += 1;
    longReasons.push('Kekuatan tren memenuhi ambang minimum.');
    shortReasons.push('Kekuatan tren memenuhi ambang minimum.');
  }

  const direction: Direction = longScore >= minimumScore && longScore > shortScore
    ? 'LONG'
    : shortScore >= minimumScore && shortScore > longScore
      ? 'SHORT'
      : 'NO_TRADE';

  if (direction === 'NO_TRADE') {
    blockers.push(regime === 'RANGE' ? 'Market terdeteksi sideways.' : 'Belum ada setup dengan skor yang cukup.');
    if (volumeRatio !== null && volumeRatio < 0.8) blockers.push('Volume di bawah rata-rata minimum.');
    if (effectiveAdx < 20) blockers.push('Kekuatan tren belum cukup.');
  }

  const score = direction === 'LONG' ? longScore : direction === 'SHORT' ? shortScore : Math.max(longScore, shortScore);
  if (direction === 'NO_TRADE') {
    return {
      direction,
      regime,
      score,
      scoreMax: 10,
      entry: null,
      stopLoss: null,
      takeProfit: null,
      quantity: 0,
      riskAmount: 0,
      riskReward: null,
      qualityLabel: 'WAIT',
      reasons: score > 0 ? (longScore >= shortScore ? longReasons : shortReasons) : [],
      blockers,
      indicators,
    };
  }

  const entry = lastCandle.close;
  const riskAmount = equity * riskFraction;
  const rawStop = direction === 'LONG'
    ? Math.min(lastCandle.low, entry - entryAtr * 1.4)
    : Math.max(lastCandle.high, entry + entryAtr * 1.4);
  const stopDistance = Math.max(Math.abs(entry - rawStop), entryAtr * 1.2);
  const stopLoss = direction === 'LONG' ? entry - stopDistance : entry + stopDistance;
  const takeProfit = direction === 'LONG' ? entry + stopDistance * 2 : entry - stopDistance * 2;
  const quantity = riskAmount / stopDistance;

  return {
    direction,
    regime,
    score,
    scoreMax: 10,
    entry: round(entry, 2),
    stopLoss: round(stopLoss, 2),
    takeProfit: round(takeProfit, 2),
    quantity: round(quantity, 6),
    riskAmount: round(riskAmount, 2),
    riskReward: 2,
    qualityLabel: score >= 9 ? 'HIGH' : 'MEDIUM',
    reasons: direction === 'LONG' ? longReasons : shortReasons,
    blockers: [],
    indicators,
  };
}

export * from './intelligence';
