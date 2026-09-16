import { createWorkerSupabaseClient } from './supabase.ts';
import { defaultMonthRange, fetchMonthlyFunding, monthKeys } from './binance-archive.ts';

const SYMBOLS = (process.env.RESEARCH_FUNDING_SYMBOLS ?? 'BTCUSDT,ETHUSDT').split(',').map((value) => value.trim().toUpperCase()).filter(Boolean);

const range = defaultMonthRange();
const MONTHS = monthKeys(
  (process.env.RESEARCH_FUNDING_START ?? range.startMonth).slice(0, 7),
  (process.env.RESEARCH_FUNDING_END ?? range.endMonth).slice(0, 7),
);

async function main(): Promise<void> {
  const client = createWorkerSupabaseClient();
  const result: Record<string, number> = {};
  for (const symbol of SYMBOLS) {
    const points = await fetchMonthlyFunding({ symbol, months: MONTHS });
    for (const month of MONTHS) {
      const inMonth = points.filter((point) => new Date(point.time).toISOString().slice(0, 7) === month).length;
      console.log(JSON.stringify({ fundingBackfill: true, symbol, month, points: inMonth }));
    }
    const rows = points.map((point) => ({
      symbol,
      metric: 'FUNDING_RATE',
      event_time: new Date(point.time).toISOString(),
      funding_rate: point.fundingRate,
      open_interest: null,
      source: 'BINANCE_BULK_ARCHIVE',
    }));
    for (let index = 0; index < rows.length; index += 500) {
      const { error } = await client.from('market_derivatives').upsert(rows.slice(index, index + 500), {
        onConflict: 'symbol,metric,event_time',
        ignoreDuplicates: false,
      });
      if (error) throw new Error(`Upsert funding ${symbol} gagal: ${error.message}`);
    }
    result[symbol] = rows.length;
    console.log(JSON.stringify({ fundingBackfill: true, symbol, points: rows.length }));
  }
  console.log(JSON.stringify({ ok: true, months: MONTHS, result, at: new Date().toISOString() }));
}

if (process.env.RUN_RESEARCH_FUNDING_BACKFILL === 'true') {
  main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
