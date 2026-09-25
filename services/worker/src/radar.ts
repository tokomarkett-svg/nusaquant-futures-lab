import type { Candle } from '@nusaquant/core';
import { BinancePublicMarketDataClient, DEFAULT_BINANCE_BASE_URL } from './market-data.ts';
import { createWorkerSupabaseClient } from './supabase.ts';

// Universe pra-registrasi (docs/24): 80 perpetual likuid; fallback bila ticker 24h tak terjangkau.
export const RADAR_UNIVERSE_FALLBACK = [
  'BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'SOLUSDT', 'XRPUSDT', 'ADAUSDT', 'DOGEUSDT', 'AVAXUSDT',
  'LINKUSDT', 'LTCUSDT', 'BCHUSDT', 'ATOMUSDT', 'DOTUSDT', 'TRXUSDT', 'ETCUSDT', 'XLMUSDT',
  'ALGOUSDT', 'VETUSDT', 'ICPUSDT', 'FILUSDT', 'NEARUSDT', 'APTUSDT', 'ARBUSDT', 'OPUSDT',
  'SUIUSDT', 'SEIUSDT', 'TIAUSDT', 'INJUSDT', 'UNIUSDT', 'AAVEUSDT', 'CRVUSDT', 'SNXUSDT',
  'COMPUSDT', 'DYDXUSDT', 'LDOUSDT', 'ENAUSDT', 'JUPUSDT', 'PYTHUSDT', 'STRKUSDT', 'WLDUSDT',
  'ORDIUSDT', 'JTOUSDT', 'GALAUSDT', 'SANDUSDT', 'MANAUSDT', 'AXSUSDT', 'CHZUSDT', 'ENSUSDT',
  'STXUSDT', 'HBARUSDT', 'RUNEUSDT', 'GRTUSDT', 'IMXUSDT', 'APEUSDT', 'RENDERUSDT', 'FETUSDT',
  'TONUSDT', 'TRUMPUSDT', 'PENGUUSDT', 'HYPEUSDT', 'VIRTUALUSDT', 'KASUSDT', 'TAOUSDT', 'ONDOUSDT',
  'PENDLEUSDT', 'CAKEUSDT', 'POLUSDT', 'RAYUSDT', 'ZECUSDT', 'DASHUSDT', 'XMRUSDT', 'EOSUSDT',
  'THETAUSDT', 'PEPEUSDT', 'SHIBUSDT', 'WIFUSDT', 'BONKUSDT', 'FLOKIUSDT', 'SUSDT', 'ASTERUSDT',
] as const;

// Stablecoin / pegged / RWA saham: bukan target strategi breakout.
const PEGGED = new Set([
  'USDTUSDT', 'USDCUSDT', 'DAIUSDT', 'FDUSDUSDT', 'USDEUSDT', 'PYUSDUSDT', 'TUSDUSDT', 'BUSDUSDT',
  'USDSUSDT', 'USD1USDT', 'USDGUSDT', 'RLUSDUSDT', 'EURUSDT', 'XAUTUSDT', 'PAXGUSDT', 'USDGOUSDT',
]);

export interface RadarReading {
  symbol: string;
  regime: 'UP' | 'DOWN' | 'FLAT';
  dayOpen: number;
  prevRangePct: number;
  lastPrice: number;
  distLongPct: number;
  distShortPct: number;
  touched: 'LONG' | 'SHORT' | null;
}

/** Murni & testable: klines harian (termasuk candle berjalan) -> pembacaan radar. */
export function computeRadar(symbol: string, dailyKlines: Candle[], now: number): RadarReading | null {
  if (dailyKlines.length < 47) return null;
  const dayMs = 86_400_000;
  const forming = dailyKlines.at(-1)!;
  if (!(now >= forming.time && now < forming.time + dayMs)) return null;
  const closed = dailyKlines.slice(0, -1);
  if (closed.length < 46) return null;

  const closes = closed.map((candle) => candle.close);
  const sma = (period: number): number => {
    let sum = 0;
    for (let index = closes.length - period; index < closes.length; index += 1) sum += closes[index];
    return sum / period;
  };
  const sma5 = sma(5);
  const sma45 = sma(45);
  const regime: RadarReading['regime'] = sma5 > sma45 ? 'UP' : sma5 < sma45 ? 'DOWN' : 'FLAT';

  const prev = closed.at(-1)!;
  const prevRange = prev.high - prev.low;
  if (!(prevRange > 0)) return null;
  const dayOpen = forming.open;
  const last = forming.close;
  const gate = 0.5 * prevRange;
  const distLongPct = ((dayOpen + gate - last) / last) * 100;
  const distShortPct = ((last - (dayOpen - gate)) / last) * 100;
  const touched = last >= dayOpen + gate ? 'LONG' : last <= dayOpen - gate ? 'SHORT' : null;
  return {
    symbol,
    regime,
    dayOpen,
    prevRangePct: (prevRange / dayOpen) * 100,
    lastPrice: last,
    distLongPct,
    distShortPct,
    touched,
  };
}

export async function resolveRadarUniverse(client: BinancePublicMarketDataClient): Promise<string[]> {
  const fromEnv = (process.env.RADAR_SYMBOLS ?? '')
    .split(',').map((item) => item.trim().toUpperCase()).filter(Boolean);
  if (fromEnv.length > 0) return [...new Set(fromEnv)];
  try {
    const tickers = await client.get24hTickers();
    tickers.sort((a, b) => b.quoteVolume - a.quoteVolume);
    const top = tickers
      .filter((ticker) => !PEGGED.has(ticker.symbol))
      .slice(0, 80)
      .map((ticker) => ticker.symbol);
    if (top.length >= 20) return top;
  } catch (error) {
    console.error('[radar] ticker 24h gagal; pakai universe fallback.', error);
  }
  return [...RADAR_UNIVERSE_FALLBACK];
}

export async function scanRadarOnce(client: BinancePublicMarketDataClient, universe: string[], now = Date.now()): Promise<RadarReading[]> {
  const readings: RadarReading[] = [];
  for (const symbol of universe) {
    try {
      const klines = await client.getKlines({ symbol, interval: '1d', limit: 60 });
      const reading = computeRadar(symbol, klines, now);
      if (reading) readings.push(reading);
    } catch {
      // simbol tak tersedia / rate-limited: lewati siklus ini, coba lagi berikutnya.
    }
  }
  return readings;
}

export async function persistRadar(readings: RadarReading[]): Promise<void> {
  if (readings.length === 0) return;
  const client = createWorkerSupabaseClient();
  const rows = readings.map((reading) => ({
    symbol: reading.symbol,
    regime: reading.regime,
    day_open: reading.dayOpen,
    prev_range_pct: Number(reading.prevRangePct.toFixed(4)),
    last_price: reading.lastPrice,
    dist_long_pct: Number(reading.distLongPct.toFixed(4)),
    dist_short_pct: Number(reading.distShortPct.toFixed(4)),
    touched: reading.touched,
    updated_at: new Date().toISOString(),
  }));
  const result = await client.from('market_radar').upsert(rows, { onConflict: 'symbol' });
  if (result.error) throw new Error(`Gagal menyimpan radar: ${result.error.message}`);
}

export async function watchRadar(): Promise<void> {
  const client = new BinancePublicMarketDataClient({ baseUrl: process.env.BINANCE_BASE_URL ?? DEFAULT_BINANCE_BASE_URL });
  const universe = await resolveRadarUniverse(client);
  console.log(JSON.stringify({ radar: true, universe: universe.length, at: new Date().toISOString() }));
  const pollMs = Math.max(Number(process.env.RADAR_POLL_MS ?? 300_000), 60_000);
  for (;;) {
    try {
      const readings = await scanRadarOnce(client, universe);
      await persistRadar(readings);
      const hot = readings.filter((reading) => reading.touched !== null).map((reading) => `${reading.symbol}:${reading.touched}`);
      console.log(JSON.stringify({ radar: true, scanned: readings.length, hot, at: new Date().toISOString() }));
    } catch (error) {
      console.error('[radar]', error);
    }
    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }
}
