import type { Candle } from '@nusaquant/core';

export interface MarketDataClientOptions {
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

export interface ClosedCandleBatch {
  higherTimeframe: Candle[];
  entryTimeframe: Candle[];
  closedAt: number;
}

const intervalMs: Record<string, number> = {
  '1m': 60_000,
  '3m': 180_000,
  '5m': 300_000,
  '15m': 900_000,
  '30m': 1_800_000,
  '1h': 3_600_000,
  '4h': 14_400_000,
  '1d': 86_400_000,
};

function getIntervalMs(interval: string): number {
  const value = intervalMs[interval];
  if (!value) throw new Error(`Interval tidak didukung: ${interval}`);
  return value;
}

function assertPositive(value: number, label: string): number {
  if (!Number.isFinite(value) || value <= 0) throw new Error(`Data Binance tidak valid: ${label}`);
  return value;
}

function assertNonNegative(value: number, label: string): number {
  if (!Number.isFinite(value) || value < 0) throw new Error(`Data Binance tidak valid: ${label}`);
  return value;
}

/**
 * Default sumber data: mirror publik Binance (spot klines ≈ perp untuk lab riset paper).
 * Host futures asli (fapi.binance.com) mengembalikan HTTP 451 untuk IP server sejak
 * pertengahan September 2026, membuat ingest stale; mirror /api/v3 tidak diblokir.
 * Set BINANCE_BASE_URL ke fapi secara eksplisit bila jaringan memungkinkan.
 */
export const DEFAULT_BINANCE_BASE_URL = 'https://data-api.binance.vision';

export class BinancePublicMarketDataClient {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;
  private readonly fallbackBaseUrl: string | null;
  private fallbackAnnounced = false;

  constructor(options: MarketDataClientOptions = {}) {
    this.baseUrl = options.baseUrl ?? DEFAULT_BINANCE_BASE_URL;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.timeoutMs = options.timeoutMs ?? 8_000;
    // Kalau env masih menunjuk host futures yang diblokir (HTTP 451), lompat otomatis ke mirror.
    this.fallbackBaseUrl = /fapi\.binance\./.test(this.baseUrl) && this.baseUrl !== DEFAULT_BINANCE_BASE_URL
      ? DEFAULT_BINANCE_BASE_URL
      : null;
  }

  /** Deskripsi sumber data untuk log startup (tanpa rahasia). */
  describeSource(): { baseUrl: string; fallbackBaseUrl: string | null } {
    return { baseUrl: this.baseUrl, fallbackBaseUrl: this.fallbackBaseUrl };
  }

  private pathsFor(base: string): { klines: string; markPrice: string; tickers: string } {
    return /fapi\.binance\./.test(base)
      ? { klines: '/fapi/v1/klines', markPrice: '/fapi/v1/premiumIndex', tickers: '/fapi/v1/ticker/24hr' }
      : { klines: '/api/v3/klines', markPrice: '/api/v3/ticker/price', tickers: '/api/v3/ticker/24hr' };
  }

  private async attempt(base: string, path: string, params: Record<string, string>): Promise<unknown> {
    const url = new URL(path, base);
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetchImpl(url, { signal: controller.signal });
      if (!response.ok) {
        const error = new Error(`Binance HTTP ${response.status} (${new URL(base).host})`) as Error & { retryable?: boolean };
        // Kalau host diblokir/di-rate-limit berat, coba sumber cadangan; error lain (mis. 400) langsung dilempar.
        error.retryable = response.status === 451 || response.status === 403 || response.status >= 500;
        throw error;
      }
      return await response.json();
    } finally {
      clearTimeout(timeout);
    }
  }

  private async fetchJson(
    pickPath: (paths: ReturnType<BinancePublicMarketDataClient['pathsFor']>) => string,
    params: Record<string, string>,
  ): Promise<unknown> {
    const bases = [this.baseUrl, ...(this.fallbackBaseUrl ? [this.fallbackBaseUrl] : [])];
    let lastError: unknown = new Error('Binance request gagal tanpa percobaan.');
    for (const base of bases) {
      try {
        const payload = await this.attempt(base, pickPath(this.pathsFor(base)), params);
        if (base !== this.baseUrl && !this.fallbackAnnounced) {
          this.fallbackAnnounced = true;
          console.warn(`[market-data] host utama ${new URL(this.baseUrl).host} tidak dapat dipakai — memakai mirror ${new URL(base).host}`);
        }
        return payload;
      } catch (error) {
        lastError = error;
        const retryable = (error as { retryable?: boolean }).retryable ?? true; // error jaringan/timeout → boleh coba cadangan
        if (!retryable) throw error;
      }
    }
    throw lastError instanceof Error ? lastError : new Error(String(lastError));
  }

  async getKlines({ symbol, interval, limit = 500, endTime, closedOnly = true }: {
    symbol: string;
    interval: string;
    limit?: number;
    endTime?: number;
    closedOnly?: boolean;
  }): Promise<Candle[]> {
    const duration = getIntervalMs(interval);
    const params: Record<string, string> = {
      symbol: symbol.toUpperCase(),
      interval,
      limit: String(Math.min(Math.max(limit, 1), 1500)),
    };
    if (endTime !== undefined) params.endTime = String(Math.floor(endTime));

    const payload = await this.fetchJson((paths) => paths.klines, params);
    if (!Array.isArray(payload)) throw new Error('Binance market data payload bukan array.');
    const now = Date.now();
    return payload.map((row): Candle => {
      if (!Array.isArray(row) || row.length < 7) throw new Error('Format kline Binance tidak valid.');
      const candle: Candle = {
        time: assertPositive(Number(row[0]), 'open time'),
        open: assertPositive(Number(row[1]), 'open'),
        high: assertPositive(Number(row[2]), 'high'),
        low: assertPositive(Number(row[3]), 'low'),
        close: assertPositive(Number(row[4]), 'close'),
        volume: assertNonNegative(Number(row[5]), 'volume'),
      };
      if (row.length >= 11) {
        candle.quoteVolume = assertNonNegative(Number(row[7]), 'quote volume');
        candle.tradeCount = assertNonNegative(Number(row[8]), 'trade count');
        candle.takerBuyVolume = assertNonNegative(Number(row[9]), 'taker buy volume');
        candle.takerBuyQuoteVolume = assertNonNegative(Number(row[10]), 'taker buy quote volume');
      }
      return candle;
    }).filter((candle) => !closedOnly || candle.time + duration <= now)
      .sort((left, right) => left.time - right.time);
  }

  async getMarkPrice(symbol: string): Promise<number> {
    // Mirror spot tidak punya premiumIndex; proksi mark = harga terakhir spot (lab paper).
    const payload = await this.fetchJson((paths) => paths.markPrice, { symbol: symbol.toUpperCase() }) as { markPrice?: string; price?: string };
    return assertPositive(Number(payload.markPrice ?? payload.price), 'mark price');
  }

  async get24hTickerDetails(): Promise<Array<{ symbol: string; last: number; high: number; low: number; quoteVolume: number }>> {
    const payload = await this.fetchJson((paths) => paths.tickers, {}) as Array<Record<string, unknown>>;
    if (!Array.isArray(payload)) throw new Error('Binance ticker payload bukan array.');
    const rows: Array<{ symbol: string; last: number; high: number; low: number; quoteVolume: number }> = [];
    for (const row of payload) {
      const symbol = typeof row.symbol === 'string' ? row.symbol : '';
      const last = Number(row.lastPrice);
      const high = Number(row.highPrice);
      const low = Number(row.lowPrice);
      const quoteVolume = Number(row.quoteVolume);
      if (!symbol || !(last > 0) || !(high > 0) || !(low >= 0) || !(quoteVolume > 0)) continue;
      rows.push({ symbol, last, high, low, quoteVolume });
    }
    return rows;
  }

  async get24hTickers(): Promise<Array<{ symbol: string; quoteVolume: number }>> {
    const payload = await this.fetchJson((paths) => paths.tickers, {}) as Array<{ symbol?: string; quoteVolume?: string }>;
    if (!Array.isArray(payload)) throw new Error('Binance ticker payload bukan array.');
    return payload
      .filter((row) => typeof row.symbol === 'string' && row.symbol.endsWith('USDT'))
      .map((row) => ({ symbol: row.symbol as string, quoteVolume: Number(row.quoteVolume ?? 0) }))
      .filter((row) => Number.isFinite(row.quoteVolume) && row.quoteVolume > 0);
  }
}

export class CandlePollingLoop {
  private timer: ReturnType<typeof setInterval> | null = null;
  private lastClosedAt = 0;

  constructor(
    private readonly client: BinancePublicMarketDataClient,
    private readonly options: {
      symbol: string;
      higherInterval: string;
      entryInterval: string;
      limit?: number;
      pollMs?: number;
      onClosedBatch: (batch: ClosedCandleBatch) => Promise<void> | void;
      onError?: (error: Error) => void;
    },
  ) {}

  async pollOnce(): Promise<void> {
    const [higherTimeframe, entryTimeframe] = await Promise.all([
      this.client.getKlines({ symbol: this.options.symbol, interval: this.options.higherInterval, limit: this.options.limit ?? 500 }),
      this.client.getKlines({ symbol: this.options.symbol, interval: this.options.entryInterval, limit: this.options.limit ?? 500 }),
    ]);
    const latestEntry = entryTimeframe.at(-1);
    if (!latestEntry || latestEntry.time <= this.lastClosedAt) return;
    this.lastClosedAt = latestEntry.time;
    await this.options.onClosedBatch({
      higherTimeframe,
      entryTimeframe,
      closedAt: latestEntry.time,
    });
  }

  async start(): Promise<void> {
    await this.pollOnce();
    const pollMs = Math.max(this.options.pollMs ?? 15_000, 5_000);
    this.timer = setInterval(() => {
      this.pollOnce().catch((error: unknown) => {
        this.options.onError?.(error instanceof Error ? error : new Error(String(error)));
      });
    }, pollMs);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}
