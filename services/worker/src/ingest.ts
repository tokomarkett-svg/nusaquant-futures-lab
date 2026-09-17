import type { Candle } from '@nusaquant/core';
import { BinancePublicMarketDataClient } from './market-data.ts';
import { PaperSessionController, resolveBotSessionIds } from './session-control.ts';
import { createWorkerSupabaseClient } from './supabase.ts';
import { watchResearchJobs } from './research-jobs.ts';

export interface MarketCandleRow {
  symbol: string;
  interval: string;
  open_time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  quote_volume?: number;
  taker_buy_volume?: number;
  taker_buy_quote_volume?: number;
  trade_count?: number;
  source: string;
}

export function toLegacyMarketCandleRows(rows: MarketCandleRow[]): Array<Omit<MarketCandleRow, 'quote_volume' | 'taker_buy_volume' | 'taker_buy_quote_volume' | 'trade_count'>> {
  return rows.map(({ quote_volume: _quoteVolume, taker_buy_volume: _takerBuyVolume, taker_buy_quote_volume: _takerBuyQuoteVolume, trade_count: _tradeCount, ...legacy }) => legacy);
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
    ...(Number.isFinite(candle.quoteVolume) ? { quote_volume: candle.quoteVolume } : {}),
    ...(Number.isFinite(candle.takerBuyVolume) ? { taker_buy_volume: candle.takerBuyVolume } : {}),
    ...(Number.isFinite(candle.takerBuyQuoteVolume) ? { taker_buy_quote_volume: candle.takerBuyQuoteVolume } : {}),
    ...(Number.isFinite(candle.tradeCount) ? { trade_count: candle.tradeCount } : {}),
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
    let result = await client.from('market_candles').upsert(rows, {
      onConflict: 'symbol,interval,open_time',
      ignoreDuplicates: false,
    });
    if (result.error && ['42703', 'PGRST204'].includes(result.error.code ?? '')) {
      result = await client.from('market_candles').upsert(toLegacyMarketCandleRows(rows), {
        onConflict: 'symbol,interval,open_time',
        ignoreDuplicates: false,
      });
    }
    if (result.error) throw new Error(`Gagal menyimpan ${symbol} ${interval}: ${result.error.message}`);
    counts[interval] = rows.length;
  }

  return counts;
}

async function main(): Promise<void> {
  const symbols = (process.env.SYMBOLS ?? 'BTCUSDT,ETHUSDT').split(',').map((symbol) => symbol.trim()).filter(Boolean);
  const intervals = (process.env.INGEST_INTERVALS ?? '15m,1h').split(',').map((interval) => interval.trim()).filter(Boolean);
  const configuredLimit = Number(process.env.INGEST_KLINE_LIMIT ?? 500);
  const limit = Number.isFinite(configuredLimit) && configuredLimit >= 1 && configuredLimit <= 1500 ? configuredLimit : 500;
  const result: Record<string, Record<string, number>> = {};
  for (const symbol of symbols) result[symbol] = await ingestSymbol({ symbol, intervals, limit });
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
  const sessionIds = resolveBotSessionIds(process.env.BOT_SESSION_IDS);
  console.log(JSON.stringify({ control: true, watch: true, sessionIds, at: new Date().toISOString() }));
  const controllers = sessionIds.map((sessionId) => new PaperSessionController(sessionId));
  const tasks = [watchIngestion(), ...controllers.map((controller) => controller.watch())];
  if (process.env.RUN_RESEARCH_JOBS === 'true') tasks.push(watchResearchJobs());
  await Promise.all(tasks);
}

if (process.env.RUN_MARKET_INGEST === 'true') {
  const task = process.env.RUN_MARKET_WATCH === 'true' ? watch() : main();
  task.catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
