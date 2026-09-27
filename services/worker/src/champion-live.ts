import { buildChampionContext, decideChrisC2, detectChrisX, evaluateChampionSequence, jenisPerp,
  mergeTradeVolumeProfiles, type ChrisDecision, type ChampionCandidate,
  type FootprintBar } from '@nusaquant/core';
import { collectFuturesFootprint } from './champion-footprint-research.ts';
import { scanMarketClient } from './market-data.ts';
import { sendTelegram } from './alerts.ts';
import { runtimeStatus } from './runtime-status.ts';

const FUTURES = 'https://fapi.binance.com';
const FIVE = 300_000;
const QUARTER = 900_000;
type State = { bars: FootprintBar[]; candidate: ChampionCandidate | null; decision: ChrisDecision | null;
  watch: ReturnType<typeof detectChrisX>; c2Started: boolean;
  tickSize: number; status: string; lastWindow: number | null; at: number };
const states = new Map<string, State>();
let lastPoll = 0;
const delivered = new Set<string>();

/** Real Binance Futures aggTrades can differ slightly from kline base volume at
 * compressed-trade window boundaries. Keep a strict discrepancy ceiling and
 * ALWAYS use aggTrade volume in the orderflow evaluator, not candle volume. */
export function footprintMatchesKline(reference: { low: number; high: number; volume: number } | undefined,
  profile: { levels: Array<{ price: number }>; totalVolume: number; firstTradePrice?: number; lastTradePrice?: number }, tickSize: number): boolean {
  const low = profile.levels.at(0)?.price;
  const high = profile.levels.at(-1)?.price;
  return Boolean(reference && low !== undefined && high !== undefined && tickSize > 0
    && profile.firstTradePrice && profile.lastTradePrice && reference.volume > 0
    && Math.abs(reference.low - low) <= tickSize * .51
    && Math.abs(reference.high - high) <= tickSize * .51
    && Math.abs(reference.volume - profile.totalVolume) <= Math.max(1e-7, reference.volume * .0005));
}

/** No winner invented while trade feed is unavailable. Never send an alert from cached/error state. */
export function championSnapshot(now = Date.now()) {
  const rows = [...states].map(([symbol, state]) => ({ symbol, status: state.status,
    windows: state.bars.length, lastWindow: state.lastWindow,
    c2Started: state.at && now - state.at <= 100_000 ? state.c2Started : false,
    at: state.at, watch: state.at && now - state.at <= 100_000 && !state.decision ? state.watch : null,
    decision: state.at && now - state.at <= 100_000 ? state.decision : null }));
  return { ok: true, source: 'Binance USD-M aggTrades (executed); 1h rolling trade value area',
    gammaRegime: 'UNKNOWN', at: new Date(lastPoll).toISOString(), rows };
}

export function championMessage(d: ChrisDecision): string {
  if (d.stage === 'BATAL' || d.stage === 'BASI') return `⛔ <b>CHRIS ${d.stage} — ${d.symbol} ${d.side}</b>\n${d.reason}\nC1 ${d.trigger} · C2 ${d.c2 ?? 'belum valid'} · JANGAN entri. Tunggu X → C1 → C2 baru.`;
  if (d.stage === 'C1') return [
    `👀 <b>CHRIS CRYPTO · C2 MULAI TERBENTUK — ${d.symbol} ${d.side}</b>`,
    `X sentuh zona 0,705 pada ${new Date(d.x).toISOString().slice(11,16)} UTC · 0,705: ${d.fib.shallow705} · 0,788: ${d.fib.mid788} · batal 0,886: ${d.fib.invalid886}`,
    `C1 = candle 15m yang memuat flip sesudah absorption → percobaan kedua gagal; high/low pemicu: <b>${d.trigger}</b>`,
    `Siap HANYA bila candle 15m C2 berikutnya TUTUP ${d.side === 'LONG' ? 'DI ATAS' : 'DI BAWAH'} ${d.trigger}. Wick / menyentuh saja GAGAL.`,
    'Ini bukan tiket. Analisis menggunakan transaksi nyata Futures, bukan GEX Nasdaq / MA.',
  ].join('\n');
  return [
    `🎯 <b>CHRIS CRYPTO · SIAP ENTRI — ${d.symbol} ${d.side}</b>`,
    `X 0,705 ${d.fib.shallow705} · tengah 0,788 ${d.fib.mid788} · batal 0,886 ${d.fib.invalid886}`,
    `C1 ${d.trigger} · C2 tutup ${d.entry} melewati batas · harga kini ${d.priceNow}`,
    `Entry (close C2): ${d.entry} · SL: ${d.stop} · TP: ${d.target} · ukuran risiko 0,31 USDT: ${d.sizeCoin}`,
    'Adaptasi footprint Futures; GEX Nasdaq tidak tersedia. Tidak ada bukti profitabilitas.',
    'ALARM BUKAN ORDER. Cek tiket yang sama di aplikasi; hanya Demo setelah login, verifikasi ulang dan persetujuan per tiket. Mainnet dikunci.',
  ].join('\n');
}

async function tickSizeFor(symbol: string): Promise<number> {
  const url = new URL('/fapi/v1/exchangeInfo', FUTURES);
  url.searchParams.set('symbol', symbol);
  const response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  if (!response.ok) throw new Error(`exchangeInfo futures HTTP ${response.status}`);
  const info = await response.json() as { symbols?: Array<{ symbol?: string; filters?: Array<{ filterType?: string; tickSize?: string }> }> };
  const tick = Number(info.symbols?.find((row) => row.symbol === symbol)?.filters?.find((filter) => filter.filterType === 'PRICE_FILTER')?.tickSize);
  if (!(tick > 0) || !Number.isFinite(tick)) throw new Error('tickSize Futures tidak valid');
  return tick;
}

/** Every trade-related Telegram message must match the same fresh app snapshot.
 * C1 prealert additionally requires evidence that the NEXT 15m C2 has STARTED. */
export async function appSeesDecision(decision: ChrisDecision, fetchImpl: typeof fetch = fetch): Promise<boolean> {
  const base = process.env.ALERT_CHECK_BASE_URL ?? 'https://web-gray-eta-79.vercel.app';
  if (!base.startsWith('https://')) return false;
  try {
    const res = await fetchImpl(new URL('/api/chris?brief=1', base), { cache: 'no-store', signal: AbortSignal.timeout(12_000) });
    if (!res.ok) return false;
    const data = await res.json() as { ok?: boolean; rows?: Array<{ symbol: string; c2Started?: boolean; decision: ChrisDecision | null }> };
    if (data.ok !== true) return false;
    const row = data.rows?.find((r) => r.symbol === decision.symbol);
    const found = row?.decision;
    return Boolean(found && found.stage === decision.stage && found.side === decision.side && found.x === decision.x
      && found.fib.shallow705 === decision.fib.shallow705 && found.fib.mid788 === decision.fib.mid788
      && found.fib.invalid886 === decision.fib.invalid886 && found.c1 === decision.c1
      && found.c2 === decision.c2 && found.trigger === decision.trigger && found.entry === decision.entry
      && found.stop === decision.stop && found.target === decision.target && found.sizeCoin === decision.sizeCoin
      && (decision.stage !== 'C1' || row?.c2Started === true));
  } catch { return false; }
}

/** Backwards-compatible name for the unit-testable SIAP-only preflight. */
export async function appSeesReady(decision: ChrisDecision, fetchImpl: typeof fetch = fetch): Promise<boolean> {
  return decision.stage === 'SIAP' && appSeesDecision(decision, fetchImpl);
}

/** Last worker decision must match the request rechecked by the operator app.
 * Only executed-trade-derived Chris SIAP may reach the Testnet order adapter. */
export function championOrderMatches(input: { symbol: string; side: string; setupKey: string;
  expectedEntry: number; stop: number; target: number; qty: number }, now = Date.now(),
  snapshot?: Pick<State, 'at' | 'decision'>): boolean {
  const state = snapshot ?? states.get(input.symbol);
  const d = state?.decision;
  if (!d || d.stage !== 'SIAP' || d.side !== input.side || d.symbol !== input.symbol
    || d.c2 === null || input.setupKey !== `${d.symbol}:${d.side}:${d.c2}`
    || now - (state?.at ?? 0) > 100_000 || now < d.c2 + QUARTER || now > d.c2 + 4 * QUARTER
    || !Number.isFinite(input.qty) || !(input.qty > 0)) return false;
  const same = (a: number, b: number | null) => b !== null && Number.isFinite(a)
    && Math.abs(a - b) <= Math.max(1e-10, Math.abs(b) * 1e-9);
  return same(input.expectedEntry, d.entry) && same(input.stop, d.stop)
    && same(input.target, d.target) && same(input.qty, d.sizeCoin);
}

/** Pure Telegram gate: the only permitted notifications are C2-start watch,
 * closed-C2 SIAP, and a terminal follow-up to a previously delivered watch/ready. */
export function eligibleChampionNotification(d: ChrisDecision, now: number,
  c2Started: boolean, seen: ReadonlySet<string>): boolean {
  if (d.stage === 'C1' && (!c2Started || d.c2 !== null
    || now < d.c1 + QUARTER || now >= d.c1 + 2 * QUARTER)) return false;
  const c1Key = `${d.symbol}:${d.side}:C1:${d.c1}:`;
  const readyKey = `${d.symbol}:${d.side}:SIAP:${d.c1}:${d.c2 ?? ''}`;
  if (d.stage === 'BATAL' && !seen.has(c1Key)) return false;
  if (d.stage === 'BASI' && !seen.has(c1Key) && !seen.has(readyKey)) return false;
  if (d.stage === 'SIAP' && (d.c2 === null || now < d.c2 + QUARTER
    || now > d.c2 + 4 * QUARTER || d.entry === null || d.sizeCoin === null)) return false;
  return !seen.has(`${d.symbol}:${d.side}:${d.stage}:${d.c1}:${d.c2 ?? ''}`);
}

/** Independent last-price guard immediately before a SIAP Telegram send. */
export function stillReadyAtPrice(d: ChrisDecision, price: number, now: number): boolean {
  if (d.stage !== 'SIAP' || d.entry === null || d.c2 === null || !(d.stop > 0)
    || !(price > 0) || now > d.c2 + 4 * QUARTER || now < d.c2 + QUARTER) return false;
  const risk = Math.abs(d.entry - d.stop);
  return risk > 0 && (d.side === 'LONG' ? price > d.trigger : price < d.trigger)
    && Math.abs(price - d.entry) <= risk * .5;
}

/** No resurrection once a terminal decision was reached on that C1. */
export function settleChampionDecision(previous: ChrisDecision | null, next: ChrisDecision | null): ChrisDecision | null {
  return previous && (previous.stage === 'BATAL' || previous.stage === 'BASI')
    && (!next || previous.c1 === next.c1) ? previous : next;
}

async function processSymbol(symbol: string, now: number) {
  const s = states.get(symbol)!;
  const client = scanMarketClient();
  // Only one most recently closed 5m window. A missed 5m window invalidates the chain.
  const closed = Math.floor((now - 10_000) / FIVE) * FIVE - FIVE;
  if (s.lastWindow !== closed) {
    if (s.lastWindow !== null && closed !== s.lastWindow + FIVE) {
      s.bars = []; s.candidate = null; s.decision = null; s.watch = null; s.c2Started = false;
    }
    const profile = await collectFuturesFootprint({ symbol, start: closed, end: closed + FIVE,
      tickSize: s.tickSize, now, baseUrl: FUTURES, maxPages: 100 });
    if (!profile || (s.bars.length > 0 && (profile.start !== s.bars.at(-1)!.profile.end
      || profile.firstTradeId !== (s.bars.at(-1)!.profile.lastTradeId ?? -2) + 1)))
      throw new Error('aggTrades Futures tidak lengkap/ID antarcandle putus');
    const levels = profile.levels;
    // An aggTrade compressed by taker order may straddle a kline boundary,
    // so sum(q) need not equal the exchange kline volume to the last decimal.
    // Guard price extremes and a bounded 0.05% discrepancy, then use the
    // EXECUTED-trade OHLCV for the entire footprint decision (never synthesize flow).
    const first = profile.levels[0].price;
    const last = profile.levels.at(-1)!.price;
    const m5 = await client.getKlines({ symbol, interval: '5m', limit: 3, market: 'FUTURES' });
    const reference = m5.find((bar) => bar.time === closed);
    if (client.marketUsed() !== 'FUTURES' || !footprintMatchesKline(reference, profile, s.tickSize)) {
      const k = reference ? `${reference.low}/${reference.high}/${reference.volume.toPrecision(8)}` : 'missing';
      const p = `${first}/${last}/${profile.totalVolume.toPrecision(8)}`;
      throw new Error(`Futures kline tidak cocok dengan footprint pada ${closed}: kline=${k} trade=${p}; semua sinyal ditahan`);
    }
    const c = { time: closed, open: profile.firstTradePrice!, high: last, low: first,
      close: profile.lastTradePrice!, volume: profile.totalVolume };
    if (s.bars.length && profile.start !== s.bars.at(-1)!.profile.end) throw new Error('jendela 5m hilang');
    s.bars.push({ candle: c, profile });
    s.bars = s.bars.slice(-26);
    s.lastWindow = closed;
    // Candidate computed only when the three 5m fight candles have all CLOSED.
    if (s.bars.length >= 23 && (!s.candidate || now > Math.floor(s.candidate.flipAt / QUARTER) * QUARTER + 6 * QUARTER)) {
      const i = s.bars.length - 3;
      const absorption = s.bars[i];
      const t = absorption.candle.time;
      const value = mergeTradeVolumeProfiles(s.bars.slice(i - 12, i).map((b) => b.profile), s.tickSize);
      const [h1, h4, recent5] = await Promise.all([
        client.getKlines({ symbol, interval: '1h', limit: 56, market: 'FUTURES' }),
        client.getKlines({ symbol, interval: '4h', limit: 35, market: 'FUTURES' }),
        client.getKlines({ symbol, interval: '5m', limit: 80, market: 'FUTURES' }),
      ]);
      if (client.marketUsed() !== 'FUTURES') throw new Error('struktur swing bukan Futures');
      const context = buildChampionContext({ h1: h1.filter((b) => b.time + 3_600_000 <= t).slice(-50),
        h4: h4.filter((b) => b.time + 14_400_000 <= t).slice(-30),
        m5: recent5.filter((b) => b.time + FIVE <= t).slice(-60), asOf: t });
      // Publish X from the latest 5m trade window (without calling it a ticket).
      const current = s.bars.at(-1)!.candle;
      const previous = s.bars.at(-2)!.candle;
      const currentContext = buildChampionContext({ h1: h1.filter((b) => b.time + 3_600_000 <= current.time).slice(-50),
        h4: h4.filter((b) => b.time + 14_400_000 <= current.time).slice(-30),
        m5: recent5.filter((b) => b.time + FIVE <= current.time).slice(-60), asOf: current.time });
      const priorValue = mergeTradeVolumeProfiles(s.bars.slice(-13, -1).map((b) => b.profile), s.tickSize);
      const x = currentContext && priorValue && priorValue.end <= current.time
        ? detectChrisX({ context: currentContext, valueAreaLow: priorValue.valueAreaLow,
          valueAreaHigh: priorValue.valueAreaHigh, previous, current }) : null;
      if (x) s.watch = x;
      else if (s.watch && (current.time - s.watch.x > 12 * FIVE ||
        (s.watch.side === 'LONG' ? current.low < s.watch.fib.invalid886 : current.high > s.watch.fib.invalid886))) s.watch = null;
      if (value && context) {
        const review = evaluateChampionSequence({ symbol, now: t + 3 * FIVE, tickSize: s.tickSize,
          context, value, participation: s.bars.slice(i - 20, i), absorption,
          retest: s.bars[i + 1], flip: s.bars[i + 2] });
        if (review.candidate) { s.candidate = review.candidate; s.watch = null; s.c2Started = false; }
      }
    }
  }
  if (s.candidate) {
    const m15 = await client.getKlines({ symbol, interval: '15m', limit: 5, market: 'FUTURES' });
    if (client.marketUsed() !== 'FUTURES') throw new Error('C1/C2 bukan Futures');
    const c1At = Math.floor(s.candidate.flipAt / QUARTER) * QUARTER;
    const c1 = m15.find((bar) => bar.time === c1At);
    if (c1) {
      const c2 = m15.find((bar) => bar.time === c1At + QUARTER) ?? null;
      // The C1 price is known on close, but NO Telegram watch message until
      // a genuine FUTURES C2 bar exists and its first trades are visible.
      if (!c2 && now >= c1At + QUARTER && now < c1At + 2 * QUARTER) {
        const ongoing = await client.getKlines({ symbol, interval: '15m', limit: 2,
          closedOnly: false, market: 'FUTURES' });
        s.c2Started = client.marketUsed() === 'FUTURES'
          && ongoing.some((bar) => bar.time === c1At + QUARTER && bar.volume > 0);
      } else s.c2Started = Boolean(c2);
      // lastPrice from Futures ticker, NOT markPrice/Spot. Timestamped at poll time.
      const tickers = await client.get24hTickerDetails();
      if (client.marketUsed() !== 'FUTURES') throw new Error('ticker bukan Futures');
      const priceNow = tickers.find((v) => v.symbol === symbol)?.last;
      const next = priceNow ? decideChrisC2({ candidate: s.candidate, c1, c2, now, priceNow }) : null;
      // Terminal decision is irreversible for this C1, even if price later
      // wanders back across the line. A new X/C1 sequence is needed.
      s.decision = settleChampionDecision(s.decision, next);
    } else { s.decision = null; s.c2Started = false; }
  }
  s.at = now;
  s.status = s.bars.length < 23 ? `pemanasan ${s.bars.length}/23 jendela 5m lengkap` :
    s.decision ? s.decision.reason : 'memantau struktur orderflow; belum ada paket lengkap';
}

export async function championCycle(now = Date.now()): Promise<void> {
  lastPoll = now;
  runtimeStatus.alerts.lastCycleAt = new Date(now).toISOString();
  runtimeStatus.alerts.scanned = states.size;
  for (const [symbol, state] of states) {
    try {
      if (!(state.tickSize > 0)) state.tickSize = await tickSizeFor(symbol);
      await processSymbol(symbol, now);
      const d = state.decision;
      if (!d || now - state.at > 100_000 || jenisPerp(symbol) !== 'kripto') continue;
      if (!eligibleChampionNotification(d, now, state.c2Started, delivered)) continue;
      if (d.stage === 'C1' && Date.now() >= d.c1 + 2 * QUARTER) continue;
      if (d.stage === 'SIAP') {
        const latest = await scanMarketClient().get24hTickerDetails();
        const price = latest.find((t) => t.symbol === symbol)?.last ?? 0;
        if (scanMarketClient().marketUsed() !== 'FUTURES' || !stillReadyAtPrice(d, price, Date.now())) {
          state.decision = { ...d, stage: 'BASI', sizeCoin: null,
            reason: 'Harga Futures berubah ke sisi salah batas / lebih dari 0,5R / tiket kedaluwarsa sebelum alarm; entri ditahan.' };
          continue;
        }
      }
      const key = `${symbol}:${d.side}:${d.stage}:${d.c1}:${d.c2 ?? ''}`;
      if (!(await appSeesDecision(d))) continue;
      if (d.stage === 'C1' && Date.now() >= d.c1 + 2 * QUARTER) continue;
      if (await sendTelegram(championMessage(d))) {
        delivered.add(key);
        runtimeStatus.alerts.delivered += 1;
        runtimeStatus.alerts.lastDeliveryAt = new Date().toISOString();
      }
    } catch (error) {
      state.at = now; state.decision = null; state.bars = []; state.candidate = null;
      state.lastWindow = null; state.watch = null; state.c2Started = false;
      state.status = `data Futures ditahan: ${error instanceof Error ? error.message : 'gagal'}`;
      runtimeStatus.alerts.lastFailureAt = new Date().toISOString();
      console.warn('[champion-live]', symbol, state.status);
    }
  }
}

export async function watchChampion(): Promise<void> {
  const symbols = (process.env.CHAMPION_SYMBOLS ?? 'BTCUSDT,ETHUSDT,SOLUSDT,BNBUSDT,XRPUSDT,DOGEUSDT,ADAUSDT,LINKUSDT,AVAXUSDT,SUIUSDT,LTCUSDT,TRXUSDT').split(',').map((s) => s.trim().toUpperCase())
    .filter((s) => /^[A-Z0-9]{2,24}USDT$/.test(s) && jenisPerp(s) === 'kripto').slice(0, 12);
  for (const symbol of symbols) states.set(symbol, { bars: [], candidate: null, decision: null, watch: null, c2Started: false, tickSize: 0,
    status: 'menunggu data transaksi Futures', lastWindow: null, at: 0 });
  // No Telegram startup broadcast. Trade-related messages only after C2 starts.
  for (;;) {
    await championCycle();
    await new Promise((resolve) => setTimeout(resolve, 60_000));
  }
}
