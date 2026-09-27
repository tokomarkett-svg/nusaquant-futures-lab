/** Closed-candle swing context shared by research and live Futures monitor.
 * No MA, no fabricated gamma. HH/HL vs LH/LL need confirmed pivots. */
import type { Candle } from './index.ts';
import type { ChampionInput } from './champion-sequence.ts';

type Bias = ChampionInput['context']['h1'];
type Context = ChampionInput['context'];
function validated(candles: Candle[], period: number, asOf: number, min: number): boolean {
  if (candles.length < min || !Number.isSafeInteger(asOf)) return false;
  for (let i = 0; i < candles.length; i += 1) {
    const c = candles[i];
    if (!Number.isSafeInteger(c.time) || c.time % period !== 0 || c.time + period > asOf
      || c.high < c.low || !(c.low > 0) || c.open < c.low || c.open > c.high
      || c.close < c.low || c.close > c.high || (i && c.time !== candles[i - 1].time + period)) return false;
  }
  const age = asOf - (candles.at(-1)!.time + period);
  return age >= 0 && age < period;
}
function swingBias(candles: Candle[]): Bias {
  const highs: number[] = [];
  const lows: number[] = [];
  for (let i = 2; i < candles.length - 2; i += 1) {
    if ([i - 2, i - 1, i + 1, i + 2].every((j) => candles[i].high > candles[j].high)) highs.push(candles[i].high);
    if ([i - 2, i - 1, i + 1, i + 2].every((j) => candles[i].low < candles[j].low)) lows.push(candles[i].low);
  }
  if (highs.length < 2 || lows.length < 2) return 'BALANCED';
  const rising = highs.at(-1)! > highs.at(-2)! && lows.at(-1)! > lows.at(-2)!;
  const falling = highs.at(-1)! < highs.at(-2)! && lows.at(-1)! < lows.at(-2)!;
  return rising ? 'UP' : falling ? 'DOWN' : 'BALANCED';
}

export function buildChampionContext(input: { h1: Candle[]; h4: Candle[]; m5: Candle[]; asOf: number }): Context | null {
  const { h1, h4, m5, asOf } = input;
  if (!validated(h1, 3_600_000, asOf, 36) || !validated(h4, 14_400_000, asOf, 24)
    || !validated(m5, 300_000, asOf, 60)) return null;
  const recent = m5.slice(-60);
  return { h1: swingBias(h1), h4: swingBias(h4), asOf,
    swingLow: Math.min(...recent.map((c) => c.low)),
    swingHigh: Math.max(...recent.map((c) => c.high)) };
}
