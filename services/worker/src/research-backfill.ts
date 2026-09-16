import { toLegacyMarketCandleRows, toMarketCandleRows } from './ingest.ts';
import { createWorkerSupabaseClient } from './supabase.ts';
import { defaultMonthRange, fetchMonthlyKlines, monthKeys } from './binance-archive.ts';

const SYMBOLS = (process.env.RESEARCH_ARCHIVE_SYMBOLS ?? 'BTCUSDT,ETHUSDT').split(',').map((value) => value.trim().toUpperCase()).filter(Boolean);
const INTERVALS = (process.env.RESEARCH_ARCHIVE_INTERVALS ?? '15m,1h').split(',').map((value) => value.trim()).filter(Boolean);
const CHUNK_SIZE = 500;

const range = defaultMonthRange();
const MONTHS = monthKeys(
  process.env.RESEARCH_ARCHIVE_START ?? range.startMonth,
  process.env.RESEARCH_ARCHIVE_END ?? range.endMonth,
);

async function upsertChunks(symbol: string, interval: string, rows: ReturnType<typeof toMarketCandleRows>): Promise<number> {
  const client = createWorkerSupabaseClient();
  const tagged = rows.map((row) => ({ ...row, source: 'BINANCE_BULK_ARCHIVE' }));
  for (let index = 0; index < tagged.length; index += CHUNK_SIZE) {
    const chunk = tagged.slice(index, index + CHUNK_SIZE);
    let result = await client.from('market_candles').upsert(chunk, {
      onConflict: 'symbol,interval,open_time',
      ignoreDuplicates: false,
    });
    if (result.error && ['42703', 'PGRST204'].includes(result.error.code ?? '')) {
      result = await client.from('market_candles').upsert(toLegacyMarketCandleRows(chunk), {
        onConflict: 'symbol,interval,open_time',
        ignoreDuplicates: false,
      });
    }
    if (result.error) throw new Error(`Upsert ${symbol} ${interval} gagal: ${result.error.message}`);
  }
  return tagged.length;
}

async function main(): Promise<void> {
  const result: Record<string, Record<string, number>> = {};
  for (const symbol of SYMBOLS) {
    result[symbol] = {};
    for (const interval of INTERVALS) {
      const candles = await fetchMonthlyKlines({ symbol, interval, months: MONTHS });
      for (const month of MONTHS) {
        const inMonth = candles.filter((candle) => new Date(candle.time).toISOString().slice(0, 7) === month).length;
        console.log(JSON.stringify({ researchBackfill: true, symbol, interval, month, downloaded: inMonth }));
      }
      const ordered = [...candles].sort((left, right) => left.time - right.time);
      result[symbol][interval] = await upsertChunks(symbol, interval, toMarketCandleRows(symbol, interval, ordered));
    }
  }
  console.log(JSON.stringify({ ok: true, months: MONTHS, result, at: new Date().toISOString() }));
}

if (process.env.RUN_RESEARCH_ARCHIVE_BACKFILL === 'true') {
  main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
