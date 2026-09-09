import {
  adx,
  atr,
  ema,
  evaluateSignal,
  rsi,
  sma,
  type Candle,
  type Direction,
  type Regime,
} from './index';

export type PatternBias = 'BULLISH' | 'BEARISH' | 'NEUTRAL';
export type TimingState = 'ENTER_NOW' | 'WAIT_CONFIRMATION' | 'NO_TRADE';
export type IntelligenceStage = 'TRIGGERED' | 'SETUP' | 'NO_TRADE';

export interface CandlePattern {
  name: string;
  bias: PatternBias;
  strength: number;
  reason: string;
}

export interface MarketStructure {
  bias: PatternBias;
  lastSwingHigh: number | null;
  lastSwingLow: number | null;
  breakOfStructure: 'BULLISH' | 'BEARISH' | 'NONE';
  reason: string;
}

export interface IntelligenceEvidence {
  label: string;
  points: number;
  passed: boolean;
  explanation: string;
}

export interface IntelligentSignal {
  decision: Direction;
  candidate: Direction;
  stage: IntelligenceStage;
  timing: TimingState;
  regime: Regime;
  qualityScore: number;
  scoreMax: 100;
  entry: number | null;
  triggerPrice: number | null;
  stopLoss: number | null;
  takeProfit: number | null;
  quantity: number;
  riskAmount: number;
  riskReward: number | null;
  maxChaseDistance: number | null;
  patterns: CandlePattern[];
  structure: MarketStructure;
  evidence: IntelligenceEvidence[];
  blockers: string[];
  explanation: string;
}

function lastFinite(values: number[]): number | null {
  for (let index = values.length - 1; index >= 0; index -= 1) {
    if (Number.isFinite(values[index])) return values[index];
  }
  return null;
}

function round(value: number, decimals = 4): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function body(candle: Candle): number {
  return Math.abs(candle.close - candle.open);
}

function range(candle: Candle): number {
  return Math.max(candle.high - candle.low, Number.EPSILON);
}

function upperWick(candle: Candle): number {
  return candle.high - Math.max(candle.open, candle.close);
}

function lowerWick(candle: Candle): number {
  return Math.min(candle.open, candle.close) - candle.low;
}

export function detectCandlePatterns(candles: Candle[]): CandlePattern[] {
  if (candles.length < 2) return [];

  const current = candles[candles.length - 1];
  const previous = candles[candles.length - 2];
  const patterns: CandlePattern[] = [];
  const currentBody = body(current);
  const previousBody = body(previous);
  const currentRange = range(current);

  const bullishEngulfing = previous.close < previous.open
    && current.close > current.open
    && current.open <= previous.close
    && current.close >= previous.open
    && currentBody >= previousBody * 0.9;
  const bearishEngulfing = previous.close > previous.open
    && current.close < current.open
    && current.open >= previous.close
    && current.close <= previous.open
    && currentBody >= previousBody * 0.9;

  if (bullishEngulfing) {
    patterns.push({
      name: 'BULLISH_ENGULFING',
      bias: 'BULLISH',
      strength: 3,
      reason: 'Candle bullish menelan body candle bearish sebelumnya.',
    });
  }
  if (bearishEngulfing) {
    patterns.push({
      name: 'BEARISH_ENGULFING',
      bias: 'BEARISH',
      strength: 3,
      reason: 'Candle bearish menelan body candle bullish sebelumnya.',
    });
  }

  const bullishPinBar = lowerWick(current) >= Math.max(currentBody * 2, currentRange * 0.45)
    && upperWick(current) <= currentRange * 0.25
    && current.close >= current.low + currentRange * 0.65;
  const bearishPinBar = upperWick(current) >= Math.max(currentBody * 2, currentRange * 0.45)
    && lowerWick(current) <= currentRange * 0.25
    && current.close <= current.low + currentRange * 0.35;

  if (bullishPinBar) {
    patterns.push({
      name: 'BULLISH_REJECTION',
      bias: 'BULLISH',
      strength: 2,
      reason: 'Lower wick panjang menunjukkan rejection dari harga rendah.',
    });
  }
  if (bearishPinBar) {
    patterns.push({
      name: 'BEARISH_REJECTION',
      bias: 'BEARISH',
      strength: 2,
      reason: 'Upper wick panjang menunjukkan rejection dari harga tinggi.',
    });
  }

  const insideBar = current.high < previous.high && current.low > previous.low;
  if (insideBar) {
    patterns.push({
      name: 'INSIDE_BAR',
      bias: 'NEUTRAL',
      strength: 1,
      reason: 'Range mengecil; menunggu breakout terkonfirmasi, bukan entry langsung.',
    });
  }

  return patterns;
}

function pivotHigh(candles: Candle[], index: number, radius: number): boolean {
  const value = candles[index].high;
  for (let offset = 1; offset <= radius; offset += 1) {
    if (value <= candles[index - offset].high || value <= candles[index + offset].high) return false;
  }
  return true;
}

function pivotLow(candles: Candle[], index: number, radius: number): boolean {
  const value = candles[index].low;
  for (let offset = 1; offset <= radius; offset += 1) {
    if (value >= candles[index - offset].low || value >= candles[index + offset].low) return false;
  }
  return true;
}

export function detectMarketStructure(candles: Candle[], radius = 2): MarketStructure {
  if (candles.length < radius * 2 + 8) {
    return {
      bias: 'NEUTRAL',
      lastSwingHigh: null,
      lastSwingLow: null,
      breakOfStructure: 'NONE',
      reason: 'Data belum cukup untuk mengonfirmasi swing.',
    };
  }

  const highs: Array<{ index: number; value: number }> = [];
  const lows: Array<{ index: number; value: number }> = [];
  const lastConfirmableIndex = candles.length - radius - 1;
  for (let index = radius; index <= lastConfirmableIndex; index += 1) {
    if (pivotHigh(candles, index, radius)) highs.push({ index, value: candles[index].high });
    if (pivotLow(candles, index, radius)) lows.push({ index, value: candles[index].low });
  }

  const recentHighs = highs.slice(-2);
  const recentLows = lows.slice(-2);
  const lastSwingHigh = recentHighs.at(-1)?.value ?? null;
  const lastSwingLow = recentLows.at(-1)?.value ?? null;
  const higherHigh = recentHighs.length === 2 && recentHighs[1].value > recentHighs[0].value;
  const higherLow = recentLows.length === 2 && recentLows[1].value > recentLows[0].value;
  const lowerHigh = recentHighs.length === 2 && recentHighs[1].value < recentHighs[0].value;
  const lowerLow = recentLows.length === 2 && recentLows[1].value < recentLows[0].value;
  const currentClose = candles[candles.length - 1].close;
  const breakOfStructure = lastSwingHigh !== null && currentClose > lastSwingHigh
    ? 'BULLISH'
    : lastSwingLow !== null && currentClose < lastSwingLow
      ? 'BEARISH'
      : 'NONE';

  if (higherHigh && higherLow) {
    return { bias: 'BULLISH', lastSwingHigh, lastSwingLow, breakOfStructure, reason: 'Struktur membentuk higher high dan higher low.' };
  }
  if (lowerHigh && lowerLow) {
    return { bias: 'BEARISH', lastSwingHigh, lastSwingLow, breakOfStructure, reason: 'Struktur membentuk lower high dan lower low.' };
  }
  return { bias: 'NEUTRAL', lastSwingHigh, lastSwingLow, breakOfStructure, reason: 'Struktur belum memiliki rangkaian swing yang searah.' };
}

function patternMatches(patterns: CandlePattern[], direction: Direction): boolean {
  return patterns.some((pattern) => pattern.bias === (direction === 'LONG' ? 'BULLISH' : 'BEARISH'));
}

function emptySignal(reason: string): IntelligentSignal {
  return {
    decision: 'NO_TRADE',
    candidate: 'NO_TRADE',
    stage: 'NO_TRADE',
    timing: 'NO_TRADE',
    regime: 'UNCERTAIN',
    qualityScore: 0,
    scoreMax: 100,
    entry: null,
    triggerPrice: null,
    stopLoss: null,
    takeProfit: null,
    quantity: 0,
    riskAmount: 0,
    riskReward: null,
    maxChaseDistance: null,
    patterns: [],
    structure: { bias: 'NEUTRAL', lastSwingHigh: null, lastSwingLow: null, breakOfStructure: 'NONE', reason },
    evidence: [],
    blockers: [reason],
    explanation: reason,
  };
}

/**
 * Decision layer yang memisahkan context, setup, trigger, dan execution.
 * Tidak menganggap skor sebagai probabilitas menang.
 */
export function evaluateIntelligentSignal({
  higherTimeframe,
  entryTimeframe,
  equity,
  riskFraction = 0.0025,
  minimumScore = 72,
}: {
  higherTimeframe: Candle[];
  entryTimeframe: Candle[];
  equity: number;
  riskFraction?: number;
  minimumScore?: number;
}): IntelligentSignal {
  if (higherTimeframe.length < 220 || entryTimeframe.length < 80 || equity <= 0) {
    return emptySignal('Data belum cukup; bot menolak evaluasi agar tidak mengarang sinyal.');
  }

  const base = evaluateSignal({ higherTimeframe, entryTimeframe, equity, riskFraction, minimumScore: 7 });
  const candidate: Direction = base.regime === 'TREND_UP'
    ? 'LONG'
    : base.regime === 'TREND_DOWN'
      ? 'SHORT'
      : 'NO_TRADE';
  const patterns = detectCandlePatterns(entryTimeframe);
  const structure = detectMarketStructure(entryTimeframe);
  const closes = entryTimeframe.map((candle) => candle.close);
  const ema20 = lastFinite(ema(closes, 20));
  const ema50 = lastFinite(ema(closes, 50));
  const atrValue = lastFinite(atr(entryTimeframe));
  const rsiValue = lastFinite(rsi(entryTimeframe));
  const adxValue = lastFinite(adx(entryTimeframe));
  const volumeAverage = lastFinite(sma(entryTimeframe.map((candle) => candle.volume), 20));
  const latest = entryTimeframe.at(-1);
  const previous = entryTimeframe.at(-2);

  if (!latest || !previous || !ema20 || !ema50 || !atrValue || !rsiValue || !adxValue || !volumeAverage) {
    return emptySignal('Indikator belum valid; bot menunggu data tambahan.');
  }

  const volumeRatio = latest.volume / volumeAverage;
  const isLong = candidate === 'LONG';
  const isShort = candidate === 'SHORT';
  const inLongZone = Math.abs(latest.close - ema50) <= atrValue * 1.25 && latest.close <= ema20 + atrValue * 0.8;
  const inShortZone = Math.abs(latest.close - ema50) <= atrValue * 1.25 && latest.close >= ema20 - atrValue * 0.8;
  const inZone = isLong ? inLongZone : isShort ? inShortZone : false;
  const matchingPattern = candidate !== 'NO_TRADE' && patternMatches(patterns, candidate);
  const structureAligned = (isLong && structure.bias === 'BULLISH') || (isShort && structure.bias === 'BEARISH');
  const momentumAligned = isLong ? rsiValue >= 45 && rsiValue <= 68 : isShort ? rsiValue >= 32 && rsiValue <= 55 : false;
  const volumePassed = volumeRatio >= 0.8;
  const triggerPassed = isLong
    ? latest.close > previous.high && latest.close > latest.open
    : isShort
      ? latest.close < previous.low && latest.close < latest.open
      : false;
  const chaseDistance = isLong ? latest.close - ema20 : isShort ? ema20 - latest.close : 0;
  const maxChaseDistance = atrValue * 0.65;
  const notChasing = chaseDistance <= maxChaseDistance;

  const evidence: IntelligenceEvidence[] = [
    {
      label: 'Higher-timeframe context',
      points: candidate === 'NO_TRADE' ? 0 : 25,
      passed: candidate !== 'NO_TRADE',
      explanation: candidate === 'NO_TRADE' ? 'Tidak ada tren yang cukup jelas.' : `Regime mendukung ${candidate}.`,
    },
    {
      label: 'Market structure',
      points: structureAligned ? 20 : 0,
      passed: structureAligned,
      explanation: structure.reason,
    },
    {
      label: 'Pullback zone',
      points: inZone ? 15 : 0,
      passed: inZone,
      explanation: inZone ? 'Harga berada dekat area value berbasis EMA dan ATR.' : 'Harga tidak berada di zona pullback yang direncanakan.',
    },
    {
      label: 'Candle confirmation',
      points: matchingPattern ? 15 : 0,
      passed: matchingPattern,
      explanation: matchingPattern ? patterns.filter((pattern) => pattern.bias !== 'NEUTRAL').map((pattern) => pattern.name).join(', ') : 'Belum ada pola candle yang searah dengan candidate.',
    },
    {
      label: 'Momentum',
      points: momentumAligned ? 10 : 0,
      passed: momentumAligned,
      explanation: `RSI ${round(rsiValue, 2)} dan ADX ${round(adxValue, 2)}.`,
    },
    {
      label: 'Volume',
      points: volumePassed ? 5 : 0,
      passed: volumePassed,
      explanation: `Volume ${round(volumeRatio, 2)}x dari rata-rata 20 candle.`,
    },
    {
      label: 'Entry timing',
      points: triggerPassed && notChasing ? 10 : 0,
      passed: triggerPassed && notChasing,
      explanation: triggerPassed ? (notChasing ? 'Trigger close terkonfirmasi tanpa mengejar harga.' : 'Trigger ada, tetapi harga sudah terlalu jauh dari zona.') : 'Menunggu candle close menembus trigger level.',
    },
  ];

  const qualityScore = evidence.reduce((sum, item) => sum + item.points, 0);
  const blockers: string[] = [];
  if (candidate === 'NO_TRADE') blockers.push('Regime tidak cukup jelas untuk strategi trend-following.');
  if (candidate !== 'NO_TRADE' && !structureAligned) blockers.push('Struktur market belum searah dengan tren utama.');
  if (candidate !== 'NO_TRADE' && !inZone) blockers.push('Harga belum berada di zona pullback yang direncanakan.');
  if (candidate !== 'NO_TRADE' && !matchingPattern) blockers.push('Belum ada pola candle konfirmasi yang searah.');
  if (candidate !== 'NO_TRADE' && !momentumAligned) blockers.push('Momentum belum mendukung arah setup.');
  if (candidate !== 'NO_TRADE' && !volumePassed) blockers.push('Volume di bawah ambang validasi.');
  if (candidate !== 'NO_TRADE' && !triggerPassed) blockers.push('Belum ada trigger close; bot tidak entry terlalu cepat.');
  if (candidate !== 'NO_TRADE' && triggerPassed && !notChasing) blockers.push('Trigger terlambat; bot menolak mengejar harga.');

  const triggerPrice = candidate === 'LONG'
    ? latest.high + atrValue * 0.02
    : candidate === 'SHORT'
      ? latest.low - atrValue * 0.02
      : null;
  const decision: Direction = candidate !== 'NO_TRADE'
    && qualityScore >= minimumScore
    && triggerPassed
    && notChasing
    ? candidate
    : 'NO_TRADE';
  const timing: TimingState = decision !== 'NO_TRADE'
    ? 'ENTER_NOW'
    : candidate !== 'NO_TRADE' && qualityScore >= minimumScore
      ? 'WAIT_CONFIRMATION'
      : 'NO_TRADE';
  const stage: IntelligenceStage = decision !== 'NO_TRADE'
    ? 'TRIGGERED'
    : candidate !== 'NO_TRADE' && qualityScore >= minimumScore
      ? 'SETUP'
      : 'NO_TRADE';

  if (decision === 'NO_TRADE' && stage === 'SETUP') {
    blockers.push('Setup cukup baik, tetapi entry ditahan sampai trigger close terkonfirmasi.');
  }

  if (decision === 'NO_TRADE') {
    return {
      decision,
      candidate,
      stage,
      timing,
      regime: base.regime,
      qualityScore,
      scoreMax: 100,
      entry: null,
      triggerPrice,
      stopLoss: null,
      takeProfit: null,
      quantity: 0,
      riskAmount: 0,
      riskReward: null,
      maxChaseDistance: round(maxChaseDistance, 2),
      patterns,
      structure,
      evidence,
      blockers,
      explanation: stage === 'SETUP' ? 'Setup terdeteksi, tetapi bot menunggu trigger agar tidak entry terlalu cepat.' : 'Syarat entry kuat belum lengkap; tidak ada order yang dibuat.',
    };
  }

  const riskAmount = equity * riskFraction;
  const rawStop = isLong
    ? Math.min(latest.low, structure.lastSwingLow ?? latest.low, latest.close - atrValue * 1.4)
    : Math.max(latest.high, structure.lastSwingHigh ?? latest.high, latest.close + atrValue * 1.4);
  const stopDistance = Math.max(Math.abs(latest.close - rawStop), atrValue * 1.2);
  const stopLoss = isLong ? latest.close - stopDistance : latest.close + stopDistance;
  const takeProfit = isLong ? latest.close + stopDistance * 2 : latest.close - stopDistance * 2;

  return {
    decision,
    candidate,
    stage,
    timing,
    regime: base.regime,
    qualityScore,
    scoreMax: 100,
    entry: round(latest.close, 2),
    triggerPrice: triggerPrice === null ? null : round(triggerPrice, 2),
    stopLoss: round(stopLoss, 2),
    takeProfit: round(takeProfit, 2),
    quantity: round(riskAmount / stopDistance, 6),
    riskAmount: round(riskAmount, 2),
    riskReward: 2,
    maxChaseDistance: round(maxChaseDistance, 2),
    patterns,
    structure,
    evidence,
    blockers: [],
    explanation: `Entry ${decision} lolos context, structure, candle confirmation, timing, dan risk filter.`,
  };
}
