import { unzipSync } from 'fflate';
import { toMarketCandleRows } from './ingest.ts';
import { createWorkerSupabaseClient } from './supabase.ts';
import type { Candle } from '@nusaquant/core';

const BASE_URL = process.env.RESEARCH_ARCHIVE_BASE_URL ?? 'https://data.binance.vision/data/futures/um/monthly/klines';
const SYMBOLS = (process.env.RESEARCH_ARCHIVE_SYMBOLS ?? 'BTCUSDT,ETHUSDT').split(',').map((value) => value.trim().toUpperCase()).filter(Boolean);
const INTERVALS = (process.env.RESEARCH_ARCHIVE_INTERVALS ?? '15m,1h').split(',').map((value) => value.trim()).filter(Boolean);
const CHUNK_SIZE = 500;

type CsvRow = [string, string, string, string, string, string];

function monthKeys(): string[] {
  const start = process.env.RESEARCH_ARCHIVE_START ?? (() => {
    const date = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
  })();
  const end = process.env.RESEARCH_ARCHIVE_END ?? (() => {
    const date = new Date();
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
  })();
  const [startYear, startMonth] = start.split('-').map(Number);
  const [endYear, endMonth] = end.split('-').map(Number);
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

function parseCsv(text: string): Candle[] {
  const candles: Candle[] = [];
  const lines = text.split(/\r?\n/);
  for (const [index, line] of lines.entries()) {
    if (index === 0 || line.trim() === '') continue;
    const fields = line.split(',') as CsvRow;
    if (fields.length < 6) continue;
    const candle: Candle = {
      time: Number(fields[0]),
      open: Number(fields[1]),
      high: Number(fields[2]),
      low: Number(fields[3]),
      close: Number(fields[4]),
      volume: Number(fields[5]),
    };
    if (![candle.time, candle.open, candle.high, candle.low, candle.close, candle.volume].every(Number.isFinite)) {
      throw new Error(`CSV candle tidak valid pada baris ${index + 1}.`);
    }
    candles.push(candle);
  }
  return candles;
}

async function downloadMonth(symbol: string, interval: string, month: string): Promise<Candle[]> {
  const fileName = `${symbol}-${interval}-${month}.zip`;
  const response = await fetch(`${BASE_URL}/${symbol}/${interval}/${fileName}`);
  if (response.status === 404) return [];
  if (!response.ok) throw new Error(`Download ${fileName} gagal: HTTP ${response.status}`);
  const archive = unzipSync(new Uint8Array(await response.arrayBuffer()));
  const file = Object.values(archive)[0];
  if (!file) throw new Error(`Archive ${fileName} kosong.`);
  return parseCsv(new TextDecoder().decode(file));
}

async function upsertChunks(symbol: string, interval: string, candles: Candle[]): Promise<number> {
  const client = createWorkerSupabaseClient();
  const rows = toMarketCandleRows(symbol, interval, candles).map((row) => ({ ...row, source: 'BINANCE_BULK_ARCHIVE' }));
  for (let index = 0; index < rows.length; index += CHUNK_SIZE) {
    const chunk = rows.slice(index, index + CHUNK_SIZE);
    const { error } = await client.from('market_candles').upsert(chunk, {
      onConflict: 'symbol,interval,open_time',
      ignoreDuplicates: false,
    });
    if (error) throw new Error(`Upsert ${symbol} ${interval} gagal: ${error.message}`);
  }
  return rows.length;
}

async function main(): Promise<void> {
  const months = monthKeys();
  const result: Record<string, Record<string, number>> = {};
  for (const symbol of SYMBOLS) {
    result[symbol] = {};
    for (const interval of INTERVALS) {
      const candles = new Map<number, Candle>();
      for (const month of months) {
        const downloaded = await downloadMonth(symbol, interval, month);
        for (const candle of downloaded) candles.set(candle.time, candle);
        console.log(JSON.stringify({ researchBackfill: true, symbol, interval, month, downloaded: downloaded.length }));
      }
      const ordered = [...candles.values()].sort((left, right) => left.time - right.time);
      result[symbol][interval] = await upsertChunks(symbol, interval, ordered);
    }
  }
  console.log(JSON.stringify({ ok: true, source: BASE_URL, months, result, at: new Date().toISOString() }));
}

if (process.env.RUN_RESEARCH_ARCHIVE_BACKFILL === 'true') {
  main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
