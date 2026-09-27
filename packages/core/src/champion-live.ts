import type { Candle } from './index.ts';
import type { ChampionCandidate } from './champion-sequence.ts';

/** Same pure decision for worker Telegram and app snapshot. No MA, no synthetic GEX. */
export type ChrisDecision = {
  symbol: string; side: 'LONG' | 'SHORT'; stage: 'C1' | 'BATAL' | 'SIAP' | 'BASI';
  x: number; c1: number; c2: number | null; trigger: number; priceNow: number;
  fib: ChampionCandidate['fib'];
  entry: number | null; stop: number; target: number | null; sizeCoin: number | null;
  riskUsdt: number; reason: string; gammaRegime: 'UNKNOWN';
};
const QUARTER = 900_000;
export function decideChrisC2(input: { candidate: ChampionCandidate; c1: Candle; c2: Candle | null;
  now: number; priceNow: number }): ChrisDecision | null {
  const { candidate: v, c1, c2, now, priceNow } = input;
  const c1Time = Math.floor(v.flipAt / QUARTER) * QUARTER;
  if (c1.time !== c1Time || !Number.isFinite(now) || now < c1.time + QUARTER
    || !Number.isFinite(priceNow) || priceNow <= 0 || !Number.isFinite(v.stop)
    || !Number.isFinite(v.target) || !(c1.low > 0 && c1.high >= c1.low)
    || !Number.isFinite(c1.close) || c1.close < c1.low || c1.close > c1.high
    || !Number.isFinite(v.xAt) || !Number.isFinite(v.fib?.shallow705)
    || !Number.isFinite(v.fib?.mid788) || !Number.isFinite(v.fib?.invalid886)) return null;
  const trigger = v.side === 'LONG' ? c1.high : c1.low;
  const base = { symbol: v.symbol, side: v.side, x: v.xAt, fib: v.fib, c1: c1.time, trigger,
    priceNow, stop: v.stop, riskUsdt: 0.31, gammaRegime: 'UNKNOWN' as const };
  // C1 is a closed 15m dominance candle containing the confirmed 5m flip.
  // Its close must progress in the direction of the flip. A wick ratio alone
  // is NOT evidence of absorption; the 5m executed-trades sequence proved it.
  const c1Shape = v.side === 'LONG'
    ? c1.close > c1.open && c1.close >= c1.low + (c1.high - c1.low) * .5
      && c1.low >= v.fib.invalid886
    : c1.close < c1.open && c1.close <= c1.high - (c1.high - c1.low) * .5
      && c1.high <= v.fib.invalid886;
  if (!c1Shape) return { ...base, stage: 'BATAL', c2: null, entry: null, target: null,
    sizeCoin: null, reason: 'C1 15m tidak menunjukkan flip yang berlanjut / menyapu batas 0,886.' };
  if (!c2 && (v.side === 'LONG' ? priceNow < v.fib.invalid886 : priceNow > v.fib.invalid886)) {
    return { ...base, stage: 'BATAL', c2: null, entry: null, target: null, sizeCoin: null,
      reason: 'Harga sudah melewati level batal 0,886 sebelum C2 selesai; jangan pantau entri.' };
  }
  if (!c2) {
    if (now >= c1.time + 2 * QUARTER) {
      return { ...base, stage: 'BASI', c2: null, entry: null, target: null, sizeCoin: null,
        reason: 'C2 seharusnya sudah tertutup tetapi datanya tidak dapat dipastikan. Tidak ada tiket.' };
    }
    return { ...base, stage: 'C1', c2: null, entry: null, target: null, sizeCoin: null,
      reason: `Pantau: hanya C2 15m berikutnya TUTUP ${v.side === 'LONG' ? 'di atas' : 'di bawah'} ${trigger}. Bukan tiket.` };
  }
  if (c2.time !== c1.time + QUARTER || now < c2.time + QUARTER || !(c2.low > 0)
    || c2.high < c2.low || !Number.isFinite(c2.close) || c2.close < c2.low || c2.close > c2.high) return null;
  const broke = v.side === 'LONG' ? c2.close > trigger && c2.low >= v.fib.invalid886
    : c2.close < trigger && c2.high <= v.fib.invalid886;
  if (!broke) return { ...base, stage: 'BATAL', c2: c2.time, entry: null, target: null,
    sizeCoin: null, reason: `C2 tutup ${c2.close} tidak menembus ${trigger}. Wick/sentuhan tidak sah.` };
  const entry = c2.close;
  const risk = v.side === 'LONG' ? entry - v.stop : v.stop - entry;
  const target = v.side === 'LONG' ? Math.min(v.target, entry + risk * 2) : Math.max(v.target, entry - risk * 2);
  const reward = v.side === 'LONG' ? target - entry : entry - target;
  const correctSide = v.side === 'LONG' ? priceNow > trigger : priceNow < trigger;
  const fresh = now <= c2.time + 4 * QUARTER;
  const closeEnough = risk > 0 && Math.abs(priceNow - entry) <= risk * 0.5;
  if (!fresh || !correctSide || !closeEnough || !(risk > 0 && reward >= risk * 1.5)) {
    return { ...base, stage: 'BASI', c2: c2.time, entry, target, sizeCoin: null,
      reason: !fresh ? 'Tiket kedaluwarsa.' : !correctSide ? 'Harga kembali ke sisi salah batas C1.'
        : !closeEnough ? 'Harga bergerak lebih dari 0,5R dari close C2.' : 'Imbalan ke target swing di bawah 1,5R.' };
  }
  return { ...base, stage: 'SIAP', c2: c2.time, entry, target, sizeCoin: 0.31 / risk,
    reason: 'Close C2 melewati batas C1; konteks 1H/4H, value transaksi, absorption, second failure, dan flip telah lulus. Alarm bukan order.' };
}

/** Non-ticket X marker from a CLOSED 5m Futures bar. Price crosses 0.705 from
 * outside, in discount/premium beyond prior real trade value area; 0.886 hard stop.
 * C1 additionally needs the executed-trades absorption/retest/flip sequence. */
export function detectChrisX(input: {
  context: { h1: 'UP' | 'DOWN' | 'BALANCED'; h4: 'UP' | 'DOWN' | 'BALANCED'; swingLow: number; swingHigh: number };
  valueAreaLow: number; valueAreaHigh: number; previous: Candle; current: Candle;
}): { side: 'LONG' | 'SHORT'; x: number; fib: ChampionCandidate['fib'] } | null {
  const { context: ctx, previous: prev, current: c } = input;
  const side = ctx.h1 === 'UP' && ctx.h4 === 'UP' ? 'LONG'
    : ctx.h1 === 'DOWN' && ctx.h4 === 'DOWN' ? 'SHORT' : null;
  const span = ctx.swingHigh - ctx.swingLow;
  if (!side || !(span > 0) || !(c.low > 0) || !(c.high > c.low)
    || prev.time + 300_000 !== c.time || c.close < c.low || c.close > c.high
    || !(input.valueAreaLow > 0 && input.valueAreaHigh > input.valueAreaLow)) return null;
  const fib = side === 'LONG'
    ? { shallow705: ctx.swingHigh - .705 * span, mid788: ctx.swingHigh - .788 * span, invalid886: ctx.swingHigh - .886 * span }
    : { shallow705: ctx.swingLow + .705 * span, mid788: ctx.swingLow + .788 * span, invalid886: ctx.swingLow + .886 * span };
  const pass = side === 'LONG' ? prev.low > fib.shallow705 && c.low <= fib.shallow705
    && c.low >= fib.invalid886 && c.close < input.valueAreaLow
    : prev.high < fib.shallow705 && c.high >= fib.shallow705
    && c.high <= fib.invalid886 && c.close > input.valueAreaHigh;
  return pass ? { side, x: c.time, fib } : null;
}
