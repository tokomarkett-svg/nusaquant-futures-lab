import type { Candle } from './index.ts';
import type { ChampionCandidate } from './champion-sequence.ts';

/** Same pure decision for worker Telegram and app snapshot. No MA, no synthetic GEX. */
export type ChrisDecision = {
  symbol: string; side: 'LONG' | 'SHORT'; stage: 'C1' | 'BATAL' | 'SIAP' | 'BASI';
  c1: number; c2: number | null; trigger: number; priceNow: number;
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
    || !Number.isFinite(c1.close) || c1.close < c1.low || c1.close > c1.high) return null;
  const trigger = v.side === 'LONG' ? c1.high : c1.low;
  const base = { symbol: v.symbol, side: v.side, c1: c1.time, trigger,
    priceNow, stop: v.stop, riskUsdt: 0.31, gammaRegime: 'UNKNOWN' as const };
  if (!c2) {
    if (now >= c1.time + 2 * QUARTER) return null;
    return { ...base, stage: 'C1', c2: null, entry: null, target: null, sizeCoin: null,
      reason: `Pantau: hanya C2 15m berikutnya TUTUP ${v.side === 'LONG' ? 'di atas' : 'di bawah'} ${trigger}. Bukan tiket.` };
  }
  if (c2.time !== c1.time + QUARTER || now < c2.time + QUARTER || !(c2.low > 0)
    || c2.high < c2.low || !Number.isFinite(c2.close) || c2.close < c2.low || c2.close > c2.high) return null;
  const broke = v.side === 'LONG' ? c2.close > trigger : c2.close < trigger;
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
