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

export class BinancePublicMarketDataClient {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor(options: MarketDataClientOptions = {}) {
    this.baseUrl = options.baseUrl ?? 'https://fapi.binance.com';
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.timeoutMs = options.timeoutMs ?? 8_000;
  }

  async getKlines({ symbol, interval, limit = 500, endTime, closedOnly = true }: {
    symbol: string;
    interval: string;
    limit?: number;
    endTime?: number;
    closedOnly?: boolean;
  }): Promise<Candle[]> {
    const duration = getIntervalMs(interval);
    const url = new URL('/fapi/v1/klines', this.baseUrl);
    url.searchParams.set('symbol', symbol.toUpperCase());
    url.searchParams.set('interval', interval);
    url.searchParams.set('limit', String(Math.min(Math.max(limit, 1), 1500)));
    if (endTime !== undefined) url.searchParams.set('endTime', String(Math.floor(endTime)));

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetchImpl(url, { signal: controller.signal });
      if (!response.ok) throw new Error(`Binance market data error: HTTP ${response.status}`);
      const payload = await response.json() as unknown;
      if (!Array.isArray(payload)) throw new Error('Binance market data payload bukan array.');
      const now = Date.now();
      return payload.map((row): Candle => {
        if (!Array.isArray(row) || row.length < 7) throw new Error('Format kline Binance tidak valid.');
        return {
          time: assertPositive(Number(row[0]), 'open time'),
          open: assertPositive(Number(row[1]), 'open'),
          high: assertPositive(Number(row[2]), 'high'),
          low: assertPositive(Number(row[3]), 'low'),
          close: assertPositive(Number(row[4]), 'close'),
          volume: assertNonNegative(Number(row[5]), 'volume'),
        };
      }).filter((candle) => !closedOnly || candle.time + duration <= now)
        .sort((left, right) => left.time - right.time);
    } finally {
      clearTimeout(timeout);
    }
  }

  async getMarkPrice(symbol: string): Promise<number> {
    const url = new URL('/fapi/v1/premiumIndex', this.baseUrl);
    url.searchParams.set('symbol', symbol.toUpperCase());
    const response = await this.fetchImpl(url);
    if (!response.ok) throw new Error(`Binance mark price error: HTTP ${response.status}`);
    const payload = await response.json() as { markPrice?: string };
    return assertPositive(Number(payload.markPrice), 'mark price');
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
