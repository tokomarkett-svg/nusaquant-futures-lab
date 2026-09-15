import { unzipSync } from 'fflate';
import { createWorkerSupabaseClient } from './supabase.ts';

const BASE_URL = process.env.RESEARCH_METRICS_ARCHIVE_BASE_URL ?? 'https://data.binance.vision/data/futures/um/daily/metrics';
const SYMBOLS = (process.env.RESEARCH_METRICS_SYMBOLS ?? 'BTCUSDT,ETHUSDT').split(',').map((value) => value.trim().toUpperCase()).filter(Boolean);
const CHUNK_SIZE = 500;

type MetricRow = {
  symbol: string;
  event_time: string;
  open_interest: number;
  open_interest_value: number;
  top_trader_long_short_ratio: number;
  top_trader_long_short_position_ratio: number;
  long_short_ratio: number;
  taker_long_short_volume_ratio: number;
  source: string;
};

function dateKeys(): string[] {
  const start = new Date(process.env.RESEARCH_METRICS_START ?? `${new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)}`);
  const end = new Date(process.env.RESEARCH_METRICS_END ?? new Date().toISOString().slice(0, 10));
  const result: string[] = [];
  for (const date = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate())); date <= end; date.setUTCDate(date.getUTCDate() + 1)) {
    result.push(date.toISOString().slice(0, 10));
  }
  return result;
}

async function downloadDay(symbol: string, day: string): Promise<MetricRow[]> {
  const fileName = `${symbol}-metrics-${day}.zip`;
  const response = await fetch(`${BASE_URL}/${symbol}/${fileName}`);
  if (response.status === 404) return [];
  if (!response.ok) throw new Error(`Metrics archive ${fileName} HTTP ${response.status}`);
  const archive = unzipSync(new Uint8Array(await response.arrayBuffer()));
  const file = Object.values(archive)[0];
  if (!file) throw new Error(`Metrics archive ${fileName} kosong.`);
  const lines = new TextDecoder().decode(file).split(/\r?\n/);
  const result: MetricRow[] = [];
  for (const [index, line] of lines.entries()) {
    if (index === 0 || line.trim() === '') continue;
    const fields = line.split(',');
    if (fields.length < 8) throw new Error(`Metrics CSV ${fileName} baris ${index + 1} tidak lengkap.`);
    const values = fields.slice(2, 8).map(Number);
    if (!values.every(Number.isFinite) || !Number.isFinite(Date.parse(`${fields[0].replace(' ', 'T')}Z`))) {
      throw new Error(`Metrics CSV ${fileName} baris ${index + 1} tidak valid.`);
    }
    result.push({
      symbol,
      event_time: new Date(`${fields[0].replace(' ', 'T')}Z`).toISOString(),
      open_interest: values[0],
      open_interest_value: values[1],
      top_trader_long_short_ratio: values[2],
      top_trader_long_short_position_ratio: values[3],
      long_short_ratio: values[4],
      taker_long_short_volume_ratio: values[5],
      source: 'BINANCE_PUBLIC_METRICS',
    });
  }
  return result;
}

async function main(): Promise<void> {
  const client = createWorkerSupabaseClient();
  const days = dateKeys();
  const counts: Record<string, number> = {};
  for (const symbol of SYMBOLS) {
    const rows = new Map<string, MetricRow>();
    for (const day of days) {
      const page = await downloadDay(symbol, day);
      for (const row of page) rows.set(row.event_time, row);
      console.log(JSON.stringify({ metricsBackfill: true, symbol, day, points: page.length }));
    }
    const ordered = [...rows.values()].sort((left, right) => left.event_time.localeCompare(right.event_time));
    for (let index = 0; index < ordered.length; index += CHUNK_SIZE) {
      const { error } = await client.from('market_metrics').upsert(ordered.slice(index, index + CHUNK_SIZE), {
        onConflict: 'symbol,event_time',
        ignoreDuplicates: false,
      });
      if (error) throw new Error(`Upsert metrics ${symbol} gagal: ${error.message}`);
    }
    counts[symbol] = ordered.length;
    console.log(JSON.stringify({ metricsBackfill: true, symbol, points: ordered.length }));
  }
  console.log(JSON.stringify({ ok: true, source: BASE_URL, days, counts, at: new Date().toISOString() }));
}

if (process.env.RUN_RESEARCH_METRICS_BACKFILL === 'true') {
  main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
