import { BinancePublicMarketDataClient } from './market-data.ts';
import { toMarketCandleRows } from './ingest.ts';
import { createWorkerSupabaseClient } from './supabase.ts';

async function backfillInterval({ symbol, interval, days }: { symbol: string; interval: string; days: number }): Promise<number> {
  const client = createWorkerSupabaseClient();
  const market = new BinancePublicMarketDataClient({ baseUrl: process.env.BINANCE_BASE_URL ?? 'https://testnet.binancefuture.com' });
  const startTime = Date.now() - days * 24 * 60 * 60 * 1000;
  let endTime = Date.now();
  let total = 0;

  for (;;) {
    const candles = await market.getKlines({ symbol, interval, limit: 1500, endTime, closedOnly: true });
    const historical = candles.filter((candle) => candle.time >= startTime && candle.time <= endTime);
    if (historical.length > 0) {
      const rows = toMarketCandleRows(symbol, interval, historical);
      const { error } = await client.from('market_candles').upsert(rows, {
        onConflict: 'symbol,interval,open_time',
        ignoreDuplicates: false,
      });
      if (error) throw new Error(`Gagal backfill ${symbol} ${interval}: ${error.message}`);
      total += rows.length;
    }

    const oldest = candles[0]?.time;
    if (!oldest || oldest <= startTime || candles.length < 2) break;
    endTime = oldest - 1;
    await new Promise((resolve) => setTimeout(resolve, 120));
  }

  return total;
}

async function main(): Promise<void> {
  const symbols = (process.env.SYMBOLS ?? 'BTCUSDT,ETHUSDT').split(',').map((symbol) => symbol.trim().toUpperCase()).filter(Boolean);
  const intervals = (process.env.BACKFILL_INTERVALS ?? '15m,1h').split(',').map((interval) => interval.trim()).filter(Boolean);
  const days = Math.min(Math.max(Number(process.env.BACKFILL_DAYS ?? 90), 1), 365);
  const result: Record<string, Record<string, number>> = {};

  for (const symbol of symbols) {
    result[symbol] = {};
    for (const interval of intervals) {
      result[symbol][interval] = await backfillInterval({ symbol, interval, days });
    }
  }
  console.log(JSON.stringify({ ok: true, days, result, at: new Date().toISOString() }));
}

if (process.env.RUN_MARKET_BACKFILL === 'true') {
  main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
