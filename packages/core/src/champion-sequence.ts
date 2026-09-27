/** Riset metode Context→Location→Absorption→Second Failure→Flip tanpa MA.
 * Spesifikasi dibekukan di docs/58-champion-sequence-v0-precommit.md.
 * Ini BUKAN sinyal SIAP, order, atau izin mengirim Telegram. */
import type { Candle } from './index.ts';
import { profileLocation, type TradeVolumeProfile } from './orderflow-profile.ts';

const BAR_MS = 300_000;
type Bias = 'UP' | 'DOWN' | 'BALANCED';
export type FootprintBar = { candle: Candle; profile: TradeVolumeProfile };
export type ChampionCandidate = {
  symbol: string; side: 'LONG' | 'SHORT'; entry: number; stop: number; target: number;
  absorptionAt: number; retestAt: number; flipAt: number;
  /** Informasi GEX crypto belum setara signed dealer GEX NQ/QQQ di video. */
  gammaRegime: 'UNKNOWN';
};
export type ChampionReview = {
  stage: 'DATA_KURANG' | 'KONTEKS' | 'LOKASI' | 'ABSORPSI' | 'TES_ULANG' | 'FLIP' | 'DITOLAK' | 'KANDIDAT_RISET';
  reason: string;
  candidate: ChampionCandidate | null;
  ready: false;
};
export type ChampionInput = {
  symbol: string; now: number; tickSize: number;
  context: { h1: Bias; h4: Bias; asOf: number; swingLow: number; swingHigh: number };
  value: TradeVolumeProfile;
  participation: FootprintBar[];
  absorption: FootprintBar; retest: FootprintBar; flip: FootprintBar;
};

const verdict = (stage: ChampionReview['stage'], reason: string, candidate: ChampionCandidate | null = null): ChampionReview =>
  ({ stage, reason, candidate, ready: false });

function validBar(bar: FootprintBar, symbol: string, at: number, tickSize: number): boolean {
  const { candle: c, profile: p } = bar;
  const lowTrade = p.levels.at(0)?.price;
  const highTrade = p.levels.at(-1)?.price;
  const tolerance = Math.max(tickSize * 0.501, 1e-10);
  return c.time === at && p.symbol === symbol && p.complete && p.start === at && p.end === at + BAR_MS
    && Number.isFinite(c.open) && Number.isFinite(c.close) && Number.isFinite(c.high) && Number.isFinite(c.low)
    && c.low > 0 && c.high > c.low && c.open >= c.low && c.open <= c.high && c.close >= c.low && c.close <= c.high
    && lowTrade !== undefined && highTrade !== undefined
    && Math.abs(c.low - lowTrade) <= tolerance && Math.abs(c.high - highTrade) <= tolerance
    && Math.abs(c.volume - p.totalVolume) <= Math.max(1e-8, p.totalVolume * 1e-9)
    && p.totalVolume > 0 && Number.isFinite(p.totalDelta);
}

export function evaluateChampionSequence(input: ChampionInput): ChampionReview {
  const { symbol, now, tickSize, context, value, participation, absorption, retest, flip } = input;
  const t = absorption.candle.time;
  if (!/^[A-Z0-9]{2,24}USDT$/.test(symbol) || !Number.isFinite(tickSize) || tickSize <= 0
    || !Number.isFinite(now) || !Number.isFinite(t)
    || t % BAR_MS !== 0 || now < t + 3 * BAR_MS || now - (t + 3 * BAR_MS) > 15 * 60_000
    || !validBar(absorption, symbol, t, tickSize) || !validBar(retest, symbol, t + BAR_MS, tickSize)
    || !validBar(flip, symbol, t + 2 * BAR_MS, tickSize)
    || value.symbol !== symbol || !value.complete || value.end > t || value.end < t - 24 * 3_600_000
    || !Number.isFinite(context.asOf) || context.asOf > t || context.asOf < t - 4 * 3_600_000
    || !Number.isFinite(context.swingLow) || !Number.isFinite(context.swingHigh)
    || context.swingLow <= 0 || context.swingHigh <= context.swingLow
    || participation.length !== 20
    || !participation.every((b, i) => validBar(b, symbol, t - (20 - i) * BAR_MS, tickSize))) {
    return verdict('DATA_KURANG', 'Profil Futures lengkap, 20 jendela partisipasi, struktur pra-setup, atau urutan 5m tidak sah/segar.');
  }
  const side = context.h1 === 'UP' && context.h4 === 'UP' ? 'LONG'
    : context.h1 === 'DOWN' && context.h4 === 'DOWN' ? 'SHORT' : null;
  if (!side) return verdict('KONTEKS', 'Struktur swing 1H dan 4H tidak sepakat; tanpa MA fallback.');
  const range = context.swingHigh - context.swingLow;
  const deep = side === 'LONG' ? context.swingHigh - range * 0.886 : context.swingLow + range * 0.886;
  const shallow = side === 'LONG' ? context.swingHigh - range * 0.705 : context.swingLow + range * 0.705;
  const close = absorption.candle.close;
  const wanted = side === 'LONG' ? 'DISCOUNT' : 'PREMIUM';
  const inFib = side === 'LONG' ? close >= deep && close <= shallow : close >= shallow && close <= deep;
  if (profileLocation(value, close) !== wanted || !inFib) {
    return verdict('LOKASI', `Harga absorption harus ${wanted} di luar value area dan dalam pita swing 0,705–0,886.`);
  }
  const averageVolume = participation.reduce((s, b) => s + b.profile.totalVolume, 0) / 20;
  const abs = absorption.candle;
  const inHalf = side === 'LONG' ? abs.close >= abs.low + (abs.high - abs.low) * 0.45
    : abs.close <= abs.low + (abs.high - abs.low) * 0.55;
  const absorbed = side === 'LONG' ? absorption.profile.totalDelta < 0 : absorption.profile.totalDelta > 0;
  if (!(averageVolume > 0) || absorption.profile.totalVolume < averageVolume || !inHalf || !absorbed) {
    return verdict('ABSORPSI', 'Tekanan agresif gagal tertahan di ekstrem atau partisipasi lebih kecil dari baseline.');
  }
  const r = retest.candle;
  const secondFailure = side === 'LONG'
    ? r.low > abs.low && retest.profile.totalDelta < 0
    : r.high < abs.high && retest.profile.totalDelta > 0;
  if (!secondFailure) return verdict('TES_ULANG', 'Percobaan kedua belum gagal pada ekstrem yang lebih baik.');
  const f = flip.candle;
  const shifted = side === 'LONG'
    ? f.close > f.open && f.close > r.high && f.low > abs.low && flip.profile.totalDelta > 0
    : f.close < f.open && f.close < r.low && f.high < abs.high && flip.profile.totalDelta < 0;
  if (!shifted) return verdict('FLIP', 'Harga dan delta belum berbalik bersama pada candle tertutup.');
  const entry = f.close;
  const stop = side === 'LONG' ? abs.low - tickSize : abs.high + tickSize;
  const risk = Math.abs(entry - stop);
  const twoR = side === 'LONG' ? entry + risk * 2 : entry - risk * 2;
  const target = side === 'LONG' ? Math.min(context.swingHigh, twoR) : Math.max(context.swingLow, twoR);
  const reward = side === 'LONG' ? target - entry : entry - target;
  if (!(risk > 0 && reward >= risk * 1.5) || !Number.isFinite(target)
    || (side === 'LONG' ? !(stop < entry && target > entry) : !(stop > entry && target < entry))) {
    return verdict('DITOLAK', 'Stop di balik ekstrem atau target swing memberi imbalan <1,5R.');
  }
  return verdict('KANDIDAT_RISET', 'Urutan harga+flow terukur; GEX/dealer exposure dan edge OOS BELUM terbukti, bukan SIAP.', {
    symbol, side, entry, stop, target, absorptionAt: t, retestAt: t + BAR_MS,
    flipAt: t + 2 * BAR_MS, gammaRegime: 'UNKNOWN',
  });
}
