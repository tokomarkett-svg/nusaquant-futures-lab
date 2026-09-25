/**
 * Sumber data publik Binance untuk halaman Nominasi (server-side).
 * Host futures asli (fapi.binance.com) mengembalikan HTTP 451 untuk IP server sejak
 * pertengahan September 2026 → pakai mirror publik, dengan cadangan api.binance.com.
 */

const BASES = [
  process.env.BINANCE_BASE_URL_MIRROR ?? 'https://data-api.binance.vision',
  'https://api.binance.com',
];

export const RATIO = { pintu: 0.705, manis: 0.786, batal: 0.886 } as const;
export const MIN_RANGE_PCT = 3;
export const MIN_QUOTE_VOLUME = 5_000_000;
export const STALE_CANDLE_MINUTES = 45;
export const TOUCH_EXPIRY_CANDLES = 12;

const EXCLUDED = /(USDC|FDUSD|TUSD|BUSD|DAI|EUR|TRY|BRL|AEUR|USD1|XUSD|EURI)$/;
const LEVERAGED = /(UP|DOWN|BULL|BEAR)USDT$/;

export type Candle = { time: number; open: number; high: number; low: number; close: number; volume: number };
export type Ticker = { symbol: string; last: number; high: number; low: number; quoteVolume: number };
export type Zone = { pintu: number; manis: number; batal: number };
export type Zones = { high: number; low: number; range: number; rangePct: number; long: Zone; short: Zone };
export type Gate = 'HIJAU' | 'MERAH' | 'KUNING';

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
  return Number.isFinite(n) ? n : NaN;
}

export async function fetchTickers(): Promise<Ticker[]> {
  const payload = await requestJson('/api/v3/ticker/24hr') as Array<Record<string, unknown>>;
  if (!Array.isArray(payload)) throw new Error('Payload ticker bukan array.');
  const rows: Ticker[] = [];
  for (const row of payload) {
    const symbol = String(row.symbol ?? '');
    if (!symbol.endsWith('USDT') || EXCLUDED.test(symbol) || LEVERAGED.test(symbol)) continue;
    const last = toNumber(row.lastPrice), high = toNumber(row.highPrice), low = toNumber(row.lowPrice), quoteVolume = toNumber(row.quoteVolume);
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
  }).filter((c) => Number.isFinite(c.time) && Number.isFinite(c.close) && c.close > 0);
}

/** Zona pintu–manis–batal dari anchor High/Low 24 jam. Long dari High (turun), short dari Low (naik) = cermin. */
export function computeZones(ticker: Ticker): Zones | null {
  const { high, low, last } = ticker;
  const range = high - low;
  if (!(range > 0) || !(last > 0)) return null;
  return {
    high, low, range,
    rangePct: (range / last) * 100,
    long: {
      pintu: high - range * RATIO.pintu,
      manis: high - range * RATIO.manis,
      batal: high - range * RATIO.batal,
    },
    short: {
      pintu: low + range * RATIO.pintu,
      manis: low + range * RATIO.manis,
      batal: low + range * RATIO.batal,
    },
  };
}

export function sma(values: number[], period: number): number {
  if (values.length < period) return NaN;
  let sum = 0;
  for (let i = values.length - period; i < values.length; i += 1) sum += values[i];
  return sum / period;
}

export function gateFromCandles(h1: Candle[]): { gate: Gate; close: number; ma25: number; ma99: number } {
  const closes = h1.map((c) => c.close);
  const ma25 = sma(closes, 25), ma99 = sma(closes, 99), close = closes.at(-1) ?? NaN;
  if (!Number.isFinite(ma25) || !Number.isFinite(ma99) || !Number.isFinite(close)) {
    return { gate: 'KUNING', close, ma25, ma99 };
  }
  if (close > ma99 && ma25 > ma99) return { gate: 'HIJAU', close, ma25, ma99 };
  if (close < ma99 && ma25 < ma99) return { gate: 'MERAH', close, ma25, ma99 };
  return { gate: 'KUNING', close, ma25, ma99 };
}

export type Bucket = '<1 jam' | '1-2 jam' | '2-3 jam' | '>3 jam';
export type Side = 'LONG' | 'SHORT';
export type Status = 'MENYALA' | 'SIMAK' | 'DISIMAK';

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
};

export function bucketOf(minutes: number | null): Bucket | null {
  if (minutes === null) return null;
  if (minutes < 60) return '<1 jam';
  if (minutes < 120) return '1-2 jam';
  if (minutes < 180) return '2-3 jam';
  return '>3 jam';
}

/** Jarak ke pintu: negatif = harga sudah di dalam pita (bel sudah berbunyi). */
export function zoneOf(zones: Zones, side: Side): Zone {
  return side === 'LONG' ? zones.long : zones.short;
}

export function distanceToPintu(zones: Zones, side: Side, last: number): number {
  const pintu = zoneOf(zones, side).pintu;
  return side === 'LONG' ? ((last - pintu) / last) * 100 : ((pintu - last) / last) * 100;
}

export function detectTouchAge(candles15m: Candle[], zones: Zones, side: Side, now = Date.now()): number | null {
  const pintu = zoneOf(zones, side).pintu;
  for (let i = candles15m.length - 1; i >= 0; i -= 1) {
    const candle = candles15m[i];
    const touched = side === 'LONG' ? candle.low <= pintu : candle.high >= pintu;
    if (touched) return (now - (candle.time + 900_000)) / 60_000;
  }
  return null;
}

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
export type SetupMarkers = {
  side: Side;
  x: number | null;
  candle1: number | null;
  candle2: number | null;
  staleBars: number | null;
  valid: boolean;
  notes: string[];
};

function bodyOf(c: Candle): number { return Math.abs(c.close - c.open); }

export function detectSetup(candles: Candle[], zones: Zones, side: Side): SetupMarkers {
  const notes: string[] = [];
  const zone = zoneOf(zones, side);
  const bars = candles.slice(-TOUCH_EXPIRY_CANDLES * 4);
  let xIndex: number | null = null;
  for (let i = bars.length - 1; i >= 1; i -= 1) {
    const c = bars[i];
    const touched = side === 'LONG' ? c.low <= zone.pintu : c.high >= zone.pintu;
    const previousOutside = side === 'LONG' ? bars[i - 1].low > zone.pintu : bars[i - 1].high < zone.pintu;
    if (touched && previousOutside) { xIndex = i; break; }
  }
  if (xIndex === null) {
    notes.push('Belum ada X: harga belum menusuk garis pintu dari luar.');
    return { side, x: null, candle1: null, candle2: null, staleBars: null, valid: false, notes };
  }
  const x = bars[xIndex];
  let c1Index: number | null = null;
  let c1InvalidReason: string | null = null;
  for (let i = xIndex; i < Math.min(bars.length, xIndex + TOUCH_EXPIRY_CANDLES + 1); i += 1) {
    const c = bars[i];
    const inBand = side === 'LONG'
      ? c.low <= zone.pintu && c.low >= zone.batal
      : c.high >= zone.pintu && c.high <= zone.batal;
    const body = bodyOf(c);
    const range = c.high - c.low;
    const wick = side === 'LONG' ? Math.min(c.open, c.close) - c.low : c.high - Math.max(c.open, c.close);
    const wickRatio = body > 0 ? wick / body : Infinity;
    const closeHalfOk = side === 'LONG'
      ? c.close >= c.low + range * 0.5
      : c.close <= c.high - range * 0.5;
    const visibleBody = range > 0 && body / range >= 0.08;
    if (!inBand) { c1InvalidReason = 'tidak ada candle yang low-nya (high-nya) jatuh di dalam pita pintu–batal'; continue; }
    if (wickRatio < 2) { c1InvalidReason = `buntut cuma ${Number.isFinite(wickRatio) ? wickRatio.toFixed(2) : '∞'}× badan (butuh ≥2×) — contoh ONT 17:00 = 1,89×`; continue; }
    if (!visibleBody) { c1InvalidReason = 'badan nyaris nol (doji) — close tak bisa dibaca di paruh atas/bawah'; continue; }
    if (!closeHalfOk) { c1InvalidReason = 'close tidak di paruh atas (long) / bawah (short) — belum ada penolakan'; continue; }
    c1Index = i;
    break;
  }
  if (c1Index === null) {
    notes.push(`X ada (${new Date(x.time).toISOString().slice(11, 16)} UTC) tapi candle 1 belum sah: ${c1InvalidReason ?? 'belum muncul'}.`);
    return { side, x: x.time, candle1: null, candle2: null, staleBars: bars.length - 1 - xIndex, valid: false, notes };
  }
  const c1 = bars[c1Index];
  let c2Index: number | null = null;
  for (let i = c1Index + 1; i <= Math.min(bars.length - 1, c1Index + 3); i += 1) {
    const c = bars[i];
    const broke = side === 'LONG' ? c.close > c1.high : c.close < c1.low;
    if (broke) { c2Index = i; break; }
  }
  const staleBars = bars.length - 1 - xIndex;
  if (c2Index === null) {
    notes.push(`Candle 1 SAH (buntut ${(Math.abs((side === 'LONG' ? Math.min(c1.open, c1.close) - c1.low : c1.high - Math.max(c1.open, c1.close))) / Math.max(bodyOf(c1), 1e-12)).toFixed(2)}× badan). Candle 2 belum lahir: tunggu close di ${side === 'LONG' ? 'atas puncak' : 'bawah dasar'} candle 1 (maks 3 candle).`);
    if (staleBars > TOUCH_EXPIRY_CANDLES) notes.push(`Sudah ${staleBars} candle sejak X → melewati batas ${TOUCH_EXPIRY_CANDLES} candle (kedaluwarsa).`);
    return { side, x: x.time, candle1: c1.time, candle2: null, staleBars, valid: false, notes };
  }
  const c2 = bars[c2Index];
  notes.push(`Paket lengkap: X → candle 1 → candle 2 (close ${side === 'LONG' ? 'di atas puncak' : 'di bawah dasar'} candle 1). Entry ${c2.close}, stop ${side === 'LONG' ? c1.low : c1.high}.`);
  return { side, x: x.time, candle1: c1.time, candle2: c2.time, staleBars, valid: true, notes };
}

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
  const ma = (period: number) => closes.map((_, index) => (index + 1 < period ? NaN : sma(closes.slice(0, index + 1), period)));
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
    last: ticker.last,
    dataAgeMin: Math.round((Date.now() - (newest + intervalMs)) / 60_000),
    at: new Date().toISOString(),
  };
}
