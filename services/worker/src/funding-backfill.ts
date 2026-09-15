import { createWorkerSupabaseClient } from './supabase.ts';

const BASE_URL = process.env.RESEARCH_FUNDING_BASE_URL ?? 'https://fapi.binance.com';
const SYMBOLS = (process.env.RESEARCH_FUNDING_SYMBOLS ?? 'BTCUSDT,ETHUSDT').split(',').map((value) => value.trim().toUpperCase()).filter(Boolean);
const startTime = process.env.RESEARCH_FUNDING_START
  ? Date.parse(`${process.env.RESEARCH_FUNDING_START}T00:00:00.000Z`)
  : Date.now() - 365 * 24 * 60 * 60 * 1000;
const endTime = process.env.RESEARCH_FUNDING_END
  ? Date.parse(`${process.env.RESEARCH_FUNDING_END}T23:59:59.999Z`)
  : Date.now();

async function fetchFunding(symbol: string): Promise<Array<{ time: number; fundingRate: number }>> {
  const output: Array<{ time: number; fundingRate: number }> = [];
  let cursor = startTime;
  for (;;) {
    const url = new URL('/fapi/v1/fundingRate', BASE_URL);
    url.searchParams.set('symbol', symbol);
    url.searchParams.set('startTime', String(cursor));
    url.searchParams.set('endTime', String(endTime));
    url.searchParams.set('limit', '1000');
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Funding ${symbol} HTTP ${response.status}`);
    const payload = await response.json() as Array<{ fundingTime?: number; fundingRate?: string }>;
    const page = payload
      .map((row) => ({ time: Number(row.fundingTime), fundingRate: Number(row.fundingRate) }))
      .filter((row) => Number.isFinite(row.time) && Number.isFinite(row.fundingRate) && row.time >= startTime && row.time <= endTime)
      .sort((left, right) => left.time - right.time);
    output.push(...page);
    if (page.length < 1000) break;
    const next = page.at(-1)?.time;
    if (!next || next >= endTime) break;
    cursor = next + 1;
    await new Promise((resolve) => setTimeout(resolve, 120));
  }
  return [...new Map(output.map((row) => [row.time, row])).values()].sort((left, right) => left.time - right.time);
}

async function main(): Promise<void> {
  const client = createWorkerSupabaseClient();
  const result: Record<string, number> = {};
  for (const symbol of SYMBOLS) {
    const points = await fetchFunding(symbol);
    const rows = points.map((point) => ({
      symbol,
      metric: 'FUNDING_RATE',
      event_time: new Date(point.time).toISOString(),
      funding_rate: point.fundingRate,
      open_interest: null,
      source: 'BINANCE_PUBLIC',
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
  console.log(JSON.stringify({ ok: true, source: BASE_URL, startTime: new Date(startTime).toISOString(), endTime: new Date(endTime).toISOString(), result }));
}

if (process.env.RUN_RESEARCH_FUNDING_BACKFILL === 'true') {
  main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
