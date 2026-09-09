import type { Candle } from '@nusaquant/core';
import { BinancePublicMarketDataClient } from './market-data.ts';
import { DEFAULT_BOT_SESSION_IDS, PaperSessionController } from './session-control.ts';
import { createWorkerSupabaseClient } from './supabase.ts';

export interface MarketCandleRow {
  symbol: string;
  interval: string;
  open_time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  source: string;
}

export function toMarketCandleRows(symbol: string, interval: string, candles: Candle[]): MarketCandleRow[] {
  return candles.map((candle) => ({
    symbol: symbol.toUpperCase(),
    interval,
    open_time: new Date(candle.time).toISOString(),
    open: candle.open,
    high: candle.high,
    low: candle.low,
    close: candle.close,
    volume: candle.volume,
    source: 'BINANCE_PUBLIC',
  }));
}

export async function ingestSymbol({
  symbol,
  intervals = ['15m', '1h'],
  limit = 500,
}: {
  symbol: string;
  intervals?: string[];
  limit?: number;
}): Promise<Record<string, number>> {
  const client = createWorkerSupabaseClient();
  const market = new BinancePublicMarketDataClient({ baseUrl: process.env.BINANCE_BASE_URL ?? 'https://fapi.binance.com' });
  const counts: Record<string, number> = {};

  for (const interval of intervals) {
    const candles = await market.getKlines({ symbol, interval, limit, closedOnly: true });
    const rows = toMarketCandleRows(symbol, interval, candles);
    const { error } = await client.from('market_candles').upsert(rows, {
      onConflict: 'symbol,interval,open_time',
      ignoreDuplicates: false,
    });
    if (error) throw new Error(`Gagal menyimpan ${symbol} ${interval}: ${error.message}`);
    counts[interval] = rows.length;
  }

  return counts;
}

async function main(): Promise<void> {
  const symbols = (process.env.SYMBOLS ?? 'BTCUSDT,ETHUSDT').split(',').map((symbol) => symbol.trim()).filter(Boolean);
  const result: Record<string, Record<string, number>> = {};
  for (const symbol of symbols) result[symbol] = await ingestSymbol({ symbol });
  console.log(JSON.stringify({ ok: true, result, at: new Date().toISOString() }));
}

async function watchIngestion(): Promise<void> {
  const intervalMs = Math.max(Number(process.env.INGEST_INTERVAL_MS ?? 60_000), 15_000);
  for (;;) {
    try {
      await main();
    } catch (error) {
      console.error('[ingest]', error);
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}

async function watch(): Promise<void> {
  const configuredIds = process.env.BOT_SESSION_IDS?.split(',').map((id) => id.trim()).filter(Boolean);
  const sessionIds = configuredIds?.length ? configuredIds : [...DEFAULT_BOT_SESSION_IDS];
  const controllers = sessionIds.map((sessionId) => new PaperSessionController(sessionId));
  await Promise.all([watchIngestion(), ...controllers.map((controller) => controller.watch())]);
}

if (process.env.RUN_MARKET_INGEST === 'true') {
  const task = process.env.RUN_MARKET_WATCH === 'true' ? watch() : main();
  task.catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
