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
  watch: ReturnType<typeof detectChrisX>;
  tickSize: number; status: string; lastWindow: number | null; at: number };
const states = new Map<string, State>();
let lastPoll = 0;
const delivered = new Set<string>();

/** No winner invented while trade feed is unavailable. Never send an alert from cached/error state. */
export function championSnapshot(now = Date.now()) {
  const rows = [...states].map(([symbol, state]) => ({ symbol, status: state.status,
    windows: state.bars.length, lastWindow: state.lastWindow,
    at: state.at, watch: state.at && now - state.at <= 100_000 && !state.decision ? state.watch : null,
    decision: state.at && now - state.at <= 100_000 ? state.decision : null }));
  return { ok: true, source: 'Binance USD-M aggTrades (executed); 1h rolling trade value area',
    gammaRegime: 'UNKNOWN', at: new Date(lastPoll).toISOString(), rows };
}

export function championMessage(d: ChrisDecision): string {
  if (d.stage === 'BATAL' || d.stage === 'BASI') return `⛔ <b>CHRIS ${d.stage} — ${d.symbol} ${d.side}</b>\n${d.reason}\nC1 ${d.trigger} · C2 ${d.c2 ?? 'belum valid'} · JANGAN entri. Tunggu X → C1 → C2 baru.`;
  if (d.stage === 'C1') return [
    `👀 <b>CHRIS CRYPTO · PANTAU C1 — ${d.symbol} ${d.side}</b>`,
    `X sentuh zona 0,705 pada ${new Date(d.x).toISOString().slice(11,16)} UTC · 0,705: ${d.fib.shallow705} · 0,788: ${d.fib.mid788} · batal 0,886: ${d.fib.invalid886}`,
    `C1 = candle 15m yang memuat absorption → percobaan kedua gagal → flip; high/low pemicu: <b>${d.trigger}</b>`,
    `Siap HANYA bila candle 15m C2 berikutnya TUTUP ${d.side === 'LONG' ? 'DI ATAS' : 'DI BAWAH'} ${d.trigger}. Wick / menyentuh saja GAGAL.`,
    'Ini bukan tiket. Analisis menggunakan transaksi nyata Futures, bukan GEX Nasdaq / MA.',
  ].join('\n');
  return [
    `🎯 <b>CHRIS CRYPTO · SIAP ENTRI — ${d.symbol} ${d.side}</b>`,
    `X 0,705 ${d.fib.shallow705} · tengah 0,788 ${d.fib.mid788} · batal 0,886 ${d.fib.invalid886}`,
    `C1 ${d.trigger} · C2 tutup ${d.entry} melewati batas · harga kini ${d.priceNow}`,
    `Entry (close C2): ${d.entry} · SL: ${d.stop} · TP: ${d.target} · ukuran risiko 0,31 USDT: ${d.sizeCoin}`,
    'Adaptasi footprint Futures; GEX Nasdaq tidak tersedia. Tidak ada bukti profitabilitas.',
    'ALARM BUKAN ORDER. Cek halaman Siap Entri Chris; login dan persetujuan per tiket bila order kelak tersedia. Mainnet dikunci.',
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

/** App displays exactly the same decision; web unavailable means no Telegram SIAP. */
export async function appSeesReady(decision: ChrisDecision, fetchImpl: typeof fetch = fetch): Promise<boolean> {
  const base = process.env.ALERT_CHECK_BASE_URL ?? 'https://web-gray-eta-79.vercel.app';
  if (!base.startsWith('https://')) return false;
  try {
    const res = await fetchImpl(new URL('/api/chris?brief=1', base), { cache: 'no-store', signal: AbortSignal.timeout(12_000) });
    if (!res.ok) return false;
    const data = await res.json() as { rows?: Array<{ symbol: string; decision: ChrisDecision | null }> };
    const found = data.rows?.find((r) => r.symbol === decision.symbol)?.decision;
    return found?.stage === 'SIAP' && found.side === decision.side && found.x === decision.x
      && found.fib.shallow705 === decision.fib.shallow705 && found.fib.mid788 === decision.fib.mid788
      && found.fib.invalid886 === decision.fib.invalid886 && found.c1 === decision.c1
      && found.c2 === decision.c2 && found.trigger === decision.trigger && found.entry === decision.entry
      && found.stop === decision.stop && found.target === decision.target && found.sizeCoin === decision.sizeCoin;
  } catch { return false; }
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

async function processSymbol(symbol: string, now: number) {
  const s = states.get(symbol)!;
  const client = scanMarketClient();
  // Only one most recently closed 5m window. A missed 5m window invalidates the chain.
  const closed = Math.floor((now - 10_000) / FIVE) * FIVE - FIVE;
  if (s.lastWindow !== closed) {
    if (s.lastWindow !== null && closed !== s.lastWindow + FIVE) {
      s.bars = []; s.candidate = null; s.decision = null; s.watch = null;
    }
    const profile = await collectFuturesFootprint({ symbol, start: closed, end: closed + FIVE,
      tickSize: s.tickSize, now, baseUrl: FUTURES, maxPages: 100 });
    if (!profile || (s.bars.length > 0 && (profile.start !== s.bars.at(-1)!.profile.end
      || profile.firstTradeId !== (s.bars.at(-1)!.profile.lastTradeId ?? -2) + 1)))
      throw new Error('aggTrades Futures tidak lengkap/ID antarcandle putus');
    const levels = profile.levels;
    // OHLC must come from the same executed-trades window, not an inferred kline footprint.
    const first = levels[0].price;
    const last = levels.at(-1)!.price;
    // Profile is sorted by price; use 5m Futures kline ONLY for open/close,
    // then cross-check total volume and extremes with executed trades.
    const m5 = await client.getKlines({ symbol, interval: '5m', limit: 3, market: 'FUTURES' });
    const c = m5.find((bar) => bar.time === closed);
    if (!c || client.marketUsed() !== 'FUTURES' || Math.abs(c.low - first) > s.tickSize * .51
      || Math.abs(c.high - last) > s.tickSize * .51
      || Math.abs(c.volume - profile.totalVolume) > Math.max(1e-7, c.volume * 1e-5)) {
      const k = c ? `${c.low}/${c.high}/${c.volume.toPrecision(8)}` : 'missing';
      const p = `${first}/${last}/${profile.totalVolume.toPrecision(8)}`;
      throw new Error(`Futures kline tidak cocok dengan footprint pada ${closed}: kline=${k} trade=${p}; semua sinyal ditahan`);
    }
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
        if (review.candidate) { s.candidate = review.candidate; s.watch = null; }
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
      // lastPrice from Futures ticker, NOT markPrice/Spot. Timestamped at poll time.
      const tickers = await client.get24hTickerDetails();
      if (client.marketUsed() !== 'FUTURES') throw new Error('ticker bukan Futures');
      const priceNow = tickers.find((v) => v.symbol === symbol)?.last;
      s.decision = priceNow ? decideChrisC2({ candidate: s.candidate, c1, c2, now, priceNow }) : null;
    } else s.decision = null;
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
      const c1Key = `${symbol}:${d.side}:C1:${d.c1}:`;
      const readyKey = `${symbol}:${d.side}:SIAP:${d.c1}:${d.c2 ?? ''}`;
      if (d.stage === 'BATAL' && !delivered.has(c1Key)) continue;
      if (d.stage === 'BASI' && !delivered.has(readyKey)) continue;
      const key = `${symbol}:${d.side}:${d.stage}:${d.c1}:${d.c2 ?? ''}`;
      if (delivered.has(key)) continue;
      // Do not send historical C1 after C2 closes; enforce fresh decision from this cycle.
      if (d.stage === 'C1' && now >= d.c1 + 2 * QUARTER) continue;
      if (d.stage === 'SIAP' && !(await appSeesReady(d))) continue;
      if (await sendTelegram(championMessage(d))) {
        delivered.add(key);
        runtimeStatus.alerts.delivered += 1;
        runtimeStatus.alerts.lastDeliveryAt = new Date().toISOString();
      }
    } catch (error) {
      state.at = now; state.decision = null; state.bars = []; state.candidate = null;
      state.lastWindow = null; state.watch = null;
      state.status = `data Futures ditahan: ${error instanceof Error ? error.message : 'gagal'}`;
      runtimeStatus.alerts.lastFailureAt = new Date().toISOString();
      console.warn('[champion-live]', symbol, state.status);
    }
  }
}

export async function watchChampion(): Promise<void> {
  const symbols = (process.env.CHAMPION_SYMBOLS ?? 'BTCUSDT,ETHUSDT').split(',').map((s) => s.trim().toUpperCase())
    .filter((s) => /^[A-Z0-9]{2,24}USDT$/.test(s) && jenisPerp(s) === 'kripto').slice(0, 4);
  for (const symbol of symbols) states.set(symbol, { bars: [], candidate: null, decision: null, watch: null, tickSize: 0,
    status: 'menunggu data transaksi Futures', lastWindow: null, at: 0 });
  // Handshake is a status notice, NOT a trade alert; never fabricate a setup.
  if (process.env.PMB_NOTIF === '1') {
    try { if (await sendTelegram('✅ <b>NusaQuant · otak pertarungan aktif</b>\nPMB/MA lama berhenti mengirim alarm. X 0,705 → 0,788 → batal 0,886; orderflow Futures → C1 pantau → C2 close sah → Siap. Selama data belum lengkap, tidak ada tiket.')) {
      runtimeStatus.alerts.startupDeliveredAt = new Date().toISOString();
    } } catch (error) { console.warn('[champion-live] status Telegram gagal:', error instanceof Error ? error.message : 'gagal'); }
  }
  for (;;) {
    await championCycle();
    await new Promise((resolve) => setTimeout(resolve, 60_000));
  }
}
