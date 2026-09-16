import { unzipSync } from 'fflate';
import type { Candle, FundingPoint, MarketMetricsPoint } from '@nusaquant/core';

/**
 * Public Binance bulk-data archive access (https://data.binance.vision).
 *
 * Everything here is public market data only. No API key, no private endpoint, no order route.
 * Shared by the one-off Railway backfills and the local research CLI so the parsing rules exist
 * exactly once.
 */

export const KLINE_ARCHIVE_BASE_URL = process.env.RESEARCH_ARCHIVE_BASE_URL
  ?? 'https://data.binance.vision/data/futures/um/monthly/klines';
export const FUNDING_ARCHIVE_BASE_URL = process.env.RESEARCH_FUNDING_ARCHIVE_BASE_URL
  ?? 'https://data.binance.vision/data/futures/um/monthly/fundingRate';
export const METRICS_ARCHIVE_BASE_URL = process.env.RESEARCH_METRICS_ARCHIVE_BASE_URL
  ?? 'https://data.binance.vision/data/futures/um/daily/metrics';

type FetchImpl = typeof fetch;

const DEFAULT_TIMEOUT_MS = 30_000;

async function readArchiveCsv(url: string, fetchImpl: FetchImpl): Promise<string[] | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
  try {
    const response = await fetchImpl(url, { signal: controller.signal });
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`Archive ${url.split('/').at(-1)} HTTP ${response.status}`);
    const archive = unzipSync(new Uint8Array(await response.arrayBuffer()));
    const file = Object.values(archive)[0];
    if (!file) return null;
    return new TextDecoder().decode(file).split(/\r?\n/);
  } finally {
    clearTimeout(timeout);
  }
}

export function monthKeys(startMonth: string, endMonth: string): string[] {
  const [startYear, startMonthNumber] = startMonth.split('-').map(Number);
  const [endYear, endMonthNumber] = endMonth.split('-').map(Number);
  if (![startYear, startMonthNumber, endYear, endMonthNumber].every(Number.isFinite)) {
    throw new Error(`Format bulan tidak valid: ${startMonth} - ${endMonth}.`);
  }
  const result: string[] = [];
  let year = startYear;
  let month = startMonthNumber;
  while (year < endYear || (year === endYear && month <= endMonthNumber)) {
    result.push(`${year}-${String(month).padStart(2, '0')}`);
    month += 1;
    if (month === 13) {
      year += 1;
      month = 1;
    }
  }
  return result;
}

export function dayKeys(startTime: number, endTime: number): string[] {
  const start = new Date(startTime);
  const end = new Date(endTime);
  const result: string[] = [];
  const cursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()));
  const last = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate()));
  while (cursor <= last) {
    result.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return result;
}

export function defaultMonthRange(days = 365): { startMonth: string; endMonth: string } {
  const now = new Date();
  const past = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const key = (date: Date) => `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
  return { startMonth: key(past), endMonth: key(now) };
}

/**
 * USD-M futures klines CSV. Column order is the public Binance layout:
 * 0 open_time, 1 open, 2 high, 3 low, 4 close, 5 volume, 6 close_time, 7 quote_volume,
 * 8 trade_count, 9 taker_buy_volume, 10 taker_buy_quote_volume.
 */
export function parseKlineCsv(lines: string[]): Candle[] {
  const candles: Candle[] = [];
  for (const [index, line] of lines.entries()) {
    if (index === 0 || line.trim() === '') continue;
    const fields = line.split(',');
    if (fields.length < 6) continue;
    const candle: Candle = {
      time: Number(fields[0]),
      open: Number(fields[1]),
      high: Number(fields[2]),
      low: Number(fields[3]),
      close: Number(fields[4]),
      volume: Number(fields[5]),
    };
    if (fields.length >= 11) {
      candle.quoteVolume = Number(fields[7]);
      candle.tradeCount = Number(fields[8]);
      candle.takerBuyVolume = Number(fields[9]);
      candle.takerBuyQuoteVolume = Number(fields[10]);
    }
    const values = [candle.time, candle.open, candle.high, candle.low, candle.close, candle.volume];
    if (!values.every(Number.isFinite)) throw new Error(`CSV candle tidak valid pada baris ${index + 1}.`);
    if (fields.length >= 11
      && ![candle.quoteVolume, candle.tradeCount, candle.takerBuyVolume, candle.takerBuyQuoteVolume].every(Number.isFinite)) {
      throw new Error(`CSV candle flow field tidak valid pada baris ${index + 1}.`);
    }
    candles.push(candle);
  }
  return candles;
}

export async function fetchMonthlyKlines({
  symbol,
  interval,
  months,
  baseUrl = KLINE_ARCHIVE_BASE_URL,
  fetchImpl = fetch,
}: {
  symbol: string;
  interval: string;
  months: string[];
  baseUrl?: string;
  fetchImpl?: FetchImpl;
}): Promise<Candle[]> {
  const merged = new Map<number, Candle>();
  for (const month of months) {
    const fileName = `${symbol}-${interval}-${month}.zip`;
    const lines = await readArchiveCsv(`${baseUrl}/${symbol}/${interval}/${fileName}`, fetchImpl);
    if (!lines) continue;
    for (const candle of parseKlineCsv(lines)) merged.set(candle.time, candle);
  }
  return [...merged.values()].sort((left, right) => left.time - right.time);
}

/**
 * Funding-rate CSV: `calc_time,funding_interval_hours,last_funding_rate`.
 * Binance occasionally writes `calc_time` with a stray extra millisecond (for example
 * `...400001`), so the timestamp is floored to the second before use.
 */
export function parseFundingCsv(lines: string[]): FundingPoint[] {
  const points: FundingPoint[] = [];
  for (const [index, line] of lines.entries()) {
    if (index === 0 || line.trim() === '') continue;
    const fields = line.split(',');
    if (fields.length < 3) throw new Error(`Funding CSV baris ${index + 1} tidak lengkap.`);
    const time = Math.floor(Number(fields[0]) / 1000) * 1000;
    const fundingRate = Number(fields[2]);
    if (!Number.isFinite(time) || !Number.isFinite(fundingRate)) {
      throw new Error(`Funding CSV baris ${index + 1} tidak valid.`);
    }
    points.push({ time, fundingRate });
  }
  return points;
}

export async function fetchMonthlyFunding({
  symbol,
  months,
  baseUrl = FUNDING_ARCHIVE_BASE_URL,
  fetchImpl = fetch,
}: {
  symbol: string;
  months: string[];
  baseUrl?: string;
  fetchImpl?: FetchImpl;
}): Promise<FundingPoint[]> {
  const merged = new Map<number, FundingPoint>();
  for (const month of months) {
    const fileName = `${symbol}-fundingRate-${month}.zip`;
    const lines = await readArchiveCsv(`${baseUrl}/${symbol}/${fileName}`, fetchImpl);
    if (!lines) continue;
    for (const point of parseFundingCsv(lines)) merged.set(point.time, point);
  }
  return [...merged.values()].sort((left, right) => left.time - right.time);
}

/**
 * Metrics CSV columns: create_time, symbol, sum_open_interest, sum_open_interest_value,
 * count_toptrader_long_short_ratio, sum_toptrader_long_short_ratio, count_long_short_ratio,
 * sum_taker_long_short_vol_ratio. The two `count_*` columns are account ratios and the `sum_*`
 * columns are position/volume ratios; both are kept because the crowding rule needs them.
 */
export function parseMetricsCsv(lines: string[]): MarketMetricsPoint[] {
  const points: MarketMetricsPoint[] = [];
  for (const [index, line] of lines.entries()) {
    if (index === 0 || line.trim() === '') continue;
    const fields = line.split(',');
    if (fields.length < 8) throw new Error(`Metrics CSV baris ${index + 1} tidak lengkap.`);
    const time = Date.parse(`${fields[0].replace(' ', 'T')}Z`);
    const values = fields.slice(2, 8).map(Number);
    if (!Number.isFinite(time) || !values.every(Number.isFinite)) {
      throw new Error(`Metrics CSV baris ${index + 1} tidak valid.`);
    }
    points.push({
      time,
      openInterest: values[0],
      openInterestValue: values[1],
      topTraderLongShortRatio: values[2],
      topTraderLongShortPositionRatio: values[3],
      longShortRatio: values[4],
      takerLongShortVolumeRatio: values[5],
    });
  }
  return points;
}

export async function fetchDailyMetrics({
  symbol,
  startTime,
  endTime,
  baseUrl = METRICS_ARCHIVE_BASE_URL,
  fetchImpl = fetch,
  concurrency = 16,
}: {
  symbol: string;
  startTime: number;
  endTime: number;
  baseUrl?: string;
  fetchImpl?: FetchImpl;
  concurrency?: number;
}): Promise<MarketMetricsPoint[]> {
  const dates = dayKeys(startTime, endTime);
  const merged = new Map<number, MarketMetricsPoint>();
  for (let offset = 0; offset < dates.length; offset += concurrency) {
    const batch = await Promise.all(dates.slice(offset, offset + concurrency).map(async (day) => {
      const fileName = `${symbol}-metrics-${day}.zip`;
      const lines = await readArchiveCsv(`${baseUrl}/${symbol}/${fileName}`, fetchImpl);
      if (!lines) return [];
      return parseMetricsCsv(lines);
    }));
    for (const point of batch.flat()) {
      if (point.time >= startTime && point.time <= endTime) merged.set(point.time, point);
    }
  }
  return [...merged.values()].sort((left, right) => left.time - right.time);
}
