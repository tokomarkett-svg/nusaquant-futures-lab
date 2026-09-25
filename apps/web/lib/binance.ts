/**
 * Sumber data publik Binance untuk halaman Nominasi (server-side).
 * Host futures asli (fapi.binance.com) mengembalikan HTTP 451 untuk IP server sejak
 * pertengahan September 2026 → pakai mirror publik, dengan cadangan api.binance.com.
 * Logika zona/tiket berasal dari @nusaquant/core (satu sumber kebenaran dengan worker).
 */

const BASES = [
  process.env.BINANCE_BASE_URL_MIRROR ?? 'https://data-api.binance.vision',
  'https://api.binance.com',
];

const EXCLUDED = /(USDC|FDUSD|TUSD|BUSD|DAI|EUR|TRY|BRL|AEUR|USD1|XUSD|EURI)$/;
const LEVERAGED = /(UP|DOWN|BULL|BEAR)USDT$/;

export type Candle = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export type Ticker = { symbol: string; last: number; high: number; low: number; quoteVolume: number };

async function requestJson(path: string, params: Record<string, string | number> = {}, noStore = true): Promise<unknown> {
  let lastError: unknown = new Error('Tidak ada sumber data yang dicoba.');
  for (const base of BASES) {
    const url = new URL(path, base);
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, String(value));
    try {
      const response = await fetch(url, noStore ? { cache: 'no-store' } : { next: { revalidate: 30 } });
      if (!response.ok) {
        lastError = new Error(`Binance HTTP ${response.status} via ${base}`);
        continue;
      }
      return await response.json();
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

function toNumber(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : Number.NaN;
}

export async function fetchTickers(): Promise<Ticker[]> {
  const payload = await requestJson('/api/v3/ticker/24hr') as Array<Record<string, unknown>>;
  if (!Array.isArray(payload)) throw new Error('Payload ticker bukan array.');
  const rows: Ticker[] = [];
  for (const row of payload) {
    const symbol = String(row.symbol ?? '');
    if (!symbol.endsWith('USDT') || EXCLUDED.test(symbol) || LEVERAGED.test(symbol)) continue;
    const last = toNumber(row.lastPrice);
    const high = toNumber(row.highPrice);
    const low = toNumber(row.lowPrice);
    const quoteVolume = toNumber(row.quoteVolume);
    if (!(last > 0) || !(high > 0) || !(low >= 0) || !(quoteVolume > 0)) continue;
    rows.push({ symbol, last, high, low, quoteVolume });
  }
  return rows;
}

export async function fetchPrices(): Promise<Record<string, number>> {
  const payload = await requestJson('/api/v3/ticker/price') as Array<Record<string, unknown>>;
  const out: Record<string, number> = {};
  for (const row of payload) {
    const symbol = String(row.symbol ?? '');
    const price = toNumber(row.price);
    if (symbol.endsWith('USDT') && price > 0) out[symbol] = price;
  }
  return out;
}

export async function fetchKlines(symbol: string, interval: string, limit = 200): Promise<Candle[]> {
  const payload = await requestJson('/api/v3/klines', { symbol: symbol.toUpperCase(), interval, limit }) as unknown[];
  if (!Array.isArray(payload)) throw new Error('Payload kline bukan array.');
  return payload.map((raw) => {
    const row = raw as unknown[];
    return {
      time: Number(row[0]), open: Number(row[1]), high: Number(row[2]),
      low: Number(row[3]), close: Number(row[4]), volume: Number(row[5]),
    };
  }).filter((candle) => Number.isFinite(candle.time) && Number.isFinite(candle.close) && candle.close > 0);
}

export {
  RATIO, MIN_RANGE_PCT, MIN_QUOTE_VOLUME, STALE_CANDLE_MINUTES, TOUCH_EXPIRY_CANDLES, RISK_USDT, TARGET_R,
  zoneOf, computeZones, smaSeries, gateFromCandles, bucketOf, distanceToPintu, detectTouchAge, detectSetup, computeTicket,
} from '@nusaquant/core';
export type {
  Side, Gate, Status, Bucket, Zone, Zones, TickerLike, SetupMarkers, Ticket,
} from '@nusaquant/core';

// dipakai internal berkas ini juga
import {
  MIN_QUOTE_VOLUME, MIN_RANGE_PCT, STALE_CANDLE_MINUTES, TOUCH_EXPIRY_CANDLES,
  computeZones, gateFromCandles, smaSeries, bucketOf, distanceToPintu, detectTouchAge, detectSetup, computeTicket,
} from '@nusaquant/core';
import type { Side, Gate, Status, Bucket, Zones, SetupMarkers, Ticket } from '@nusaquant/core';

export type BoardRow = {
  symbol: string;
  last: number;
  rangePct: number;
  quoteVolume: number;
  zones: Zones;
  side: Side;
  status: Status;
  gate: Gate;
  gateAlign: boolean;
  insideBand: boolean;
  distPct: number;
  touchAgeMin: number | null;
  bucket: Bucket | null;
  dataAgeMin: number;
  volJt: number;
  setup: { x: number | null; candle1: number | null; candle2: number | null; valid: boolean; note: string | null };
  ticket: Ticket | null;
};

export type Funnel = { scanned: number; liquid: number; rangeOk: number; board: number; staleDropped: number };

export type Board = { funnel: Funnel; rows: BoardRow[]; at: string };

const CONCURRENCY = 6;

export async function scanBoard(limit = 40): Promise<Board> {
  const tickers = await fetchTickers();
  const liquid = tickers.filter((t) => t.quoteVolume >= MIN_QUOTE_VOLUME);
  const withZone = liquid
    .map((t) => ({ ticker: t, zones: computeZones(t) }))
    .filter((row): row is { ticker: Ticker; zones: Zones } => row.zones !== null && row.zones.rangePct >= MIN_RANGE_PCT);

  const preRank = withZone.map((row) => {
    const distLong = distanceToPintu(row.zones, 'LONG', row.ticker.last);
    const distShort = distanceToPintu(row.zones, 'SHORT', row.ticker.last);
    const score = (d: number) => (d >= 0 ? d : Math.abs(d) * 0.5);
    return { ...row, score: Math.min(score(distLong), score(distShort)) };
  }).sort((a, b) => a.score - b.score);

  const candidates = preRank.slice(0, Math.max(limit, 10));
  const rows: BoardRow[] = [];
  let staleDropped = 0;
  const now = Date.now();

  for (let i = 0; i < candidates.length; i += CONCURRENCY) {
    const slice = candidates.slice(i, i + CONCURRENCY);
    const enriched = await Promise.all(slice.map(async ({ ticker, zones }) => {
      try {
        const [m15, h1] = await Promise.all([
          fetchKlines(ticker.symbol, '15m', 140),
          fetchKlines(ticker.symbol, '1h', 120),
        ]);
        const newest = m15.at(-1)?.time ?? 0;
        const dataAgeMin = (now - (newest + 900_000)) / 60_000;
        if (m15.length < 20 || h1.length < 99 || dataAgeMin > STALE_CANDLE_DROP_LIMIT) return null;
        const { gate } = gateFromCandles(h1);
        const distLong = distanceToPintu(zones, 'LONG', ticker.last);
        const distShort = distanceToPintu(zones, 'SHORT', ticker.last);
        const insideLong = ticker.last <= zones.long.pintu && ticker.last >= zones.long.batal;
        const insideShort = ticker.last >= zones.short.pintu && ticker.last <= zones.short.batal;
        const longCloser = Math.abs(distLong) <= Math.abs(distShort);
        const side: Side = insideLong || (longCloser && distLong >= -0.5) ? 'LONG' : 'SHORT';
        const insideBand = side === 'LONG' ? insideLong : insideShort;
        const distPct = side === 'LONG' ? distLong : distShort;
        const touchAgeMin = insideBand ? 0 : detectTouchAge(m15, zones, side, now);
        const status: Status = insideBand ? 'MENYALA' : Math.abs(distPct) <= 1.5 ? 'SIMAK' : 'DISIMAK';
        const gateAlign = (side === 'LONG' && gate === 'HIJAU') || (side === 'SHORT' && gate === 'MERAH');
        const setup = detectSetup(m15, zones, side);
        const ticket = computeTicket(m15, zones, side, ticker.last);
        const row: BoardRow = {
          symbol: ticker.symbol,
          last: ticker.last,
          rangePct: zones.rangePct,
          quoteVolume: ticker.quoteVolume,
          zones,
          side,
          status,
          gate,
          gateAlign,
          insideBand,
          distPct,
          touchAgeMin,
          bucket: bucketOf(touchAgeMin),
          dataAgeMin: Math.round(dataAgeMin),
          volJt: Number((ticker.quoteVolume / 1e6).toFixed(1)),
          setup: { x: setup.x, candle1: setup.candle1, candle2: setup.candle2, valid: setup.valid, note: setup.notes.at(-1) ?? null },
          ticket,
        };
        return row;
      } catch {
        return null;
      }
    }));
    for (const row of enriched) {
      if (row) rows.push(row);
      else staleDropped += 1;
    }
  }

  const order: Record<Status, number> = { MENYALA: 0, SIMAK: 1, DISIMAK: 2 };
  rows.sort((a, b) => order[a.status] - order[b.status]
    || (a.touchAgeMin ?? Number.MAX_SAFE_INTEGER) - (b.touchAgeMin ?? Number.MAX_SAFE_INTEGER));

  return {
    funnel: { scanned: tickers.length, liquid: liquid.length, rangeOk: withZone.length, board: rows.length, staleDropped },
    rows,
    at: new Date().toISOString(),
  };
}

const STALE_CANDLE_DROP_LIMIT = STALE_CANDLE_MINUTES + 15;

/** Deteksi X / candle 1 / candle 2 sesuai aturan kita (dua arah, cermin). */
export type CoinDetail = {
  symbol: string;
  interval: string;
  candles: Candle[];
  zones: Zones;
  gate: { gate: Gate; close: number; ma25: number; ma99: number; interval: '1h' };
  ma25: number[];
  ma99: number[];
  setupLong: SetupMarkers;
  setupShort: SetupMarkers;
  ticketLong: Ticket | null;
  ticketShort: Ticket | null;
  last: number;
  dataAgeMin: number;
  at: string;
};

export async function coinDetail(symbol: string, interval: string): Promise<CoinDetail> {
  const upper = symbol.toUpperCase();
  const [tickers, candles, h1] = await Promise.all([
    fetchTickers(),
    fetchKlines(upper, interval, 160),
    fetchKlines(upper, '1h', 120),
  ]);
  const ticker = tickers.find((t) => t.symbol === upper);
  if (!ticker) throw new Error(`Symbol ${upper} tidak ditemukan di daftar publik.`);
  const zones = computeZones(ticker);
  if (!zones) throw new Error(`Data harga ${upper} tidak lengkap.`);
  const closes = candles.map((c) => c.close);
  const ma = (period: number) => smaSeries(closes, period);
  const gateInfo = gateFromCandles(h1);
  const newest = candles.at(-1)?.time ?? 0;
  const intervalMs = interval === '5m' ? 300_000 : interval === '15m' ? 900_000 : interval === '4h' ? 14_400_000 : 3_600_000;
  return {
    symbol: upper,
    interval,
    candles,
    zones,
    gate: { ...gateInfo, interval: '1h' },
    ma25: ma(25),
    ma99: ma(99),
    setupLong: detectSetup(candles, zones, 'LONG'),
    setupShort: detectSetup(candles, zones, 'SHORT'),
    ticketLong: computeTicket(candles, zones, 'LONG', ticker.last),
    ticketShort: computeTicket(candles, zones, 'SHORT', ticker.last),
    last: ticker.last,
    dataAgeMin: Math.round((Date.now() - (newest + intervalMs)) / 60_000),
    at: new Date().toISOString(),
  };
}
