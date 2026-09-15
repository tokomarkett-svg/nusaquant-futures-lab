import { unzipSync } from 'fflate';
import { createWorkerSupabaseClient } from './supabase.ts';

const ARCHIVE_BASE_URL = process.env.RESEARCH_FUNDING_ARCHIVE_BASE_URL ?? 'https://data.binance.vision/data/futures/um/monthly/fundingRate';
const SYMBOLS = (process.env.RESEARCH_FUNDING_SYMBOLS ?? 'BTCUSDT,ETHUSDT').split(',').map((value) => value.trim().toUpperCase()).filter(Boolean);
const startMonthKey = process.env.RESEARCH_FUNDING_START?.slice(0, 7) ?? (() => {
  const date = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
})();
const endMonthKey = process.env.RESEARCH_FUNDING_END?.slice(0, 7) ?? (() => {
  const date = new Date();
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
})();

function monthKeys(): string[] {
  const [startYear, startMonth] = startMonthKey.split('-').map(Number);
  const [endYear, endMonth] = endMonthKey.split('-').map(Number);
  const result: string[] = [];
  let year = startYear;
  let month = startMonth;
  while (year < endYear || (year === endYear && month <= endMonth)) {
    result.push(`${year}-${String(month).padStart(2, '0')}`);
    month += 1;
    if (month === 13) {
      year += 1;
      month = 1;
    }
  }
  return result;
}

async function downloadMonth(symbol: string, month: string): Promise<Array<{ time: number; fundingRate: number }>> {
  const fileName = `${symbol}-fundingRate-${month}.zip`;
  const response = await fetch(`${ARCHIVE_BASE_URL}/${symbol}/${fileName}`);
  if (response.status === 404) return [];
  if (!response.ok) throw new Error(`Funding archive ${fileName} HTTP ${response.status}`);
  const archive = unzipSync(new Uint8Array(await response.arrayBuffer()));
  const file = Object.values(archive)[0];
  if (!file) throw new Error(`Funding archive ${fileName} kosong.`);
  const lines = new TextDecoder().decode(file).split(/\r?\n/);
  const points: Array<{ time: number; fundingRate: number }> = [];
  for (const [index, line] of lines.entries()) {
    if (index === 0 || line.trim() === '') continue;
    const fields = line.split(',');
    const time = Number(fields[0]);
    const fundingRate = Number(fields[2]);
    if (!Number.isFinite(time) || !Number.isFinite(fundingRate)) throw new Error(`Funding CSV ${fileName} baris ${index + 1} tidak valid.`);
    points.push({ time, fundingRate });
  }
  return points;
}

async function main(): Promise<void> {
  const client = createWorkerSupabaseClient();
  const result: Record<string, number> = {};
  const months = monthKeys();
  for (const symbol of SYMBOLS) {
    const points = new Map<number, { time: number; fundingRate: number }>();
    for (const month of months) {
      const page = await downloadMonth(symbol, month);
      for (const point of page) points.set(point.time, point);
      console.log(JSON.stringify({ fundingBackfill: true, symbol, month, points: page.length }));
    }
    const rows = [...points.values()].sort((left, right) => left.time - right.time).map((point) => ({
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
  console.log(JSON.stringify({ ok: true, source: ARCHIVE_BASE_URL, months, result, at: new Date().toISOString() }));
}

if (process.env.RUN_RESEARCH_FUNDING_BACKFILL === 'true') {
  main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
