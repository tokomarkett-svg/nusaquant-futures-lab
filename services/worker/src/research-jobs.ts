import type { Candle, FundingPoint, MarketMetricsPoint } from '@nusaquant/core';
import { Worker } from 'node:worker_threads';
import { fetchDailyMetrics } from './binance-archive.ts';
import { evaluateResearchRun } from './research-evaluation.ts';
import { createWorkerSupabaseClient } from './supabase.ts';

/**
 * Async full-history research queue.
 *
 * Supabase is only the data source and the job store here. All strategy evaluation lives in
 * `research-evaluation.ts` so the local research CLI produces identical numbers.
 */

type CandleRow = {
  open_time: string;
  open: number | string;
  high: number | string;
  low: number | string;
  close: number | string;
  volume: number | string;
  quote_volume?: number | string | null;
  taker_buy_volume?: number | string | null;
  taker_buy_quote_volume?: number | string | null;
  trade_count?: number | string | null;
};

type FundingRow = {
  event_time: string;
  funding_rate: number | string;
};

type MetricsRow = {
  event_time: string;
  open_interest: number | string;
  open_interest_value: number | string;
  top_trader_long_short_ratio: number | string;
  top_trader_long_short_position_ratio: number | string;
  long_short_ratio: number | string;
  taker_long_short_volume_ratio: number | string;
};

export type ResearchJob = {
  id: string;
  symbol: 'BTCUSDT' | 'ETHUSDT';
  status: 'QUEUED' | 'RUNNING' | 'COMPLETED' | 'FAILED';
};

const PAGE_SIZE = 1000;
const MAX_CANDLES = 50_000;
const MAX_METRICS_ROWS = MAX_CANDLES * 5;
const POLL_INTERVAL_MS = 15_000;
let activeResearchWorker: Worker | null = null;

function toCandle(row: CandleRow): Candle {
  return {
    time: Date.parse(row.open_time),
    open: Number(row.open),
    high: Number(row.high),
    low: Number(row.low),
    close: Number(row.close),
    volume: Number(row.volume),
    ...(row.quote_volume !== null && row.quote_volume !== undefined ? { quoteVolume: Number(row.quote_volume) } : {}),
    ...(row.taker_buy_volume !== null && row.taker_buy_volume !== undefined ? { takerBuyVolume: Number(row.taker_buy_volume) } : {}),
    ...(row.taker_buy_quote_volume !== null && row.taker_buy_quote_volume !== undefined ? { takerBuyQuoteVolume: Number(row.taker_buy_quote_volume) } : {}),
    ...(row.trade_count !== null && row.trade_count !== undefined ? { tradeCount: Number(row.trade_count) } : {}),
  };
}

async function readAllCandles(symbol: string, interval: string): Promise<Candle[]> {
  const client = createWorkerSupabaseClient();
  const rows: CandleRow[] = [];
  for (let offset = 0; offset < MAX_CANDLES; offset += PAGE_SIZE) {
    let result = await client
      .from('market_candles')
      .select('open_time,open,high,low,close,volume,quote_volume,taker_buy_volume,taker_buy_quote_volume,trade_count')
      .eq('symbol', symbol)
      .eq('interval', interval)
      .order('open_time', { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);
    if (result.error && ['42703', 'PGRST204'].includes(result.error.code ?? '')) {
      result = await client
        .from('market_candles')
        .select('open_time,open,high,low,close,volume')
        .eq('symbol', symbol)
        .eq('interval', interval)
        .order('open_time', { ascending: true })
        .range(offset, offset + PAGE_SIZE - 1) as unknown as typeof result;
    }
    if (result.error) throw new Error(`Query ${symbol} ${interval} gagal: ${result.error.message}`);
    const page = (result.data ?? []) as CandleRow[];
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
  }
  return rows.map(toCandle);
}

function toMetricPoint(row: MetricsRow): MarketMetricsPoint {
  return {
    time: Date.parse(row.event_time),
    openInterest: Number(row.open_interest),
    openInterestValue: Number(row.open_interest_value),
    topTraderLongShortRatio: Number(row.top_trader_long_short_ratio),
    topTraderLongShortPositionRatio: Number(row.top_trader_long_short_position_ratio),
    longShortRatio: Number(row.long_short_ratio),
    takerLongShortVolumeRatio: Number(row.taker_long_short_volume_ratio),
  };
}

async function readMetricsTable(symbol: string): Promise<{ available: boolean; points: MarketMetricsPoint[] }> {
  const client = createWorkerSupabaseClient();
  const rows: MetricsRow[] = [];
  for (let offset = 0; offset < MAX_METRICS_ROWS; offset += PAGE_SIZE) {
    const result = await client
      .from('market_metrics')
      .select('event_time,open_interest,open_interest_value,top_trader_long_short_ratio,top_trader_long_short_position_ratio,long_short_ratio,taker_long_short_volume_ratio')
      .eq('symbol', symbol)
      .order('event_time', { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);
    if (result.error) return { available: false, points: [] };
    const page = (result.data ?? []) as MetricsRow[];
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
  }
  const points = rows
    .map(toMetricPoint)
    .filter((row) => [
      row.time,
      row.openInterest,
      row.openInterestValue,
      row.topTraderLongShortRatio,
      row.topTraderLongShortPositionRatio,
      row.longShortRatio,
      row.takerLongShortVolumeRatio,
    ].every(Number.isFinite));
  return { available: true, points };
}

/**
 * Metrics come from the local table when it has rows. Both a missing table AND an empty table fall
 * back to the official public archive: an empty table means the backfill was never run, and silently
 * returning zero points would make the liquidation-reclaim candidate look rejected instead of
 * unevaluated.
 */
async function readAllMetrics(symbol: string, startTime?: number, endTime?: number): Promise<MarketMetricsPoint[]> {
  const table = await readMetricsTable(symbol);
  if (table.available && table.points.length > 0) return table.points;
  if (startTime === undefined || endTime === undefined) {
    console.warn(`[research] market_metrics kosong untuk ${symbol} dan tidak ada rentang periode; metrics candidate berstatus MISSING_DATA.`);
    return [];
  }
  console.warn(`[research] market_metrics ${table.available ? 'kosong' : 'belum tersedia'} untuk ${symbol}; memakai arsip resmi Binance sebagai fallback.`);
  return fetchDailyMetrics({ symbol, startTime, endTime });
}

async function readAllFunding(symbol: string): Promise<FundingPoint[]> {
  const client = createWorkerSupabaseClient();
  const rows: FundingRow[] = [];
  for (let offset = 0; offset < MAX_CANDLES; offset += PAGE_SIZE) {
    const result = await client
      .from('market_derivatives')
      .select('event_time,funding_rate')
      .eq('symbol', symbol)
      .eq('metric', 'FUNDING_RATE')
      .order('event_time', { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);
    if (result.error) {
      console.warn(`[research] funding table belum tersedia untuk ${symbol}; funding candidate akan berstatus MISSING_DATA: ${result.error.message}`);
      return [];
    }
    const page = (result.data ?? []) as FundingRow[];
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
  }
  return rows
    .map((row) => ({ time: Date.parse(row.event_time), fundingRate: Number(row.funding_rate) }))
    .filter((row) => Number.isFinite(row.time) && Number.isFinite(row.fundingRate));
}

async function updateJob(id: string, patch: Record<string, unknown>): Promise<void> {
  const client = createWorkerSupabaseClient();
  const { error } = await client.from('research_backtest_jobs').update(patch).eq('id', id);
  if (error) throw new Error(`Update research job gagal: ${error.message}`);
}

export async function runResearchJob(job: ResearchJob): Promise<void> {
  const startedAt = new Date().toISOString();
  await updateJob(job.id, { status: 'RUNNING', progress: 5, started_at: startedAt, error: null });
  try {
    const [higherTimeframe, entryTimeframe, fundingTimeframe] = await Promise.all([
      readAllCandles(job.symbol, '1h'),
      readAllCandles(job.symbol, '15m'),
      readAllFunding(job.symbol),
    ]);
    if (higherTimeframe.length < 220 || entryTimeframe.length < 80) {
      throw new Error(`${job.symbol} belum memiliki cukup data: ${higherTimeframe.length} candle 1H dan ${entryTimeframe.length} candle 15M.`);
    }
    const metricsTimeframe = await readAllMetrics(job.symbol, entryTimeframe[0]?.time, entryTimeframe.at(-1)?.time);

    const result = await evaluateResearchRun({
      symbol: job.symbol,
      higherTimeframe,
      entryTimeframe,
      fundingTimeframe,
      metricsTimeframe,
      onProgress: async (progress) => {
        await updateJob(job.id, { progress });
      },
    });

    await updateJob(job.id, {
      status: 'COMPLETED',
      progress: 100,
      completed_at: new Date().toISOString(),
      result,
    });
    console.log(JSON.stringify({
      research: true,
      jobId: job.id,
      symbol: job.symbol,
      status: 'COMPLETED',
      sample: result.sample,
      candidates: Object.values(result.candidates).map((candidate) => ({
        name: candidate.name,
        trades: candidate.summary.totalTrades,
        dataStatus: candidate.dataStatus,
        promotion: candidate.promotionGate.pass,
      })),
    }));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Research backtest gagal.';
    try {
      await updateJob(job.id, { status: 'FAILED', progress: 100, completed_at: new Date().toISOString(), error: message });
    } catch (updateError) {
      console.error('[research] gagal menyimpan error job', updateError);
    }
    console.error(JSON.stringify({ research: true, jobId: job.id, status: 'FAILED', error: message }));
  }
}

export async function processNextResearchJob(): Promise<boolean> {
  if (activeResearchWorker) return false;
  const client = createWorkerSupabaseClient();
  const result = await client
    .from('research_backtest_jobs')
    .select('id,symbol,status')
    .in('status', ['QUEUED', 'RUNNING'])
    .order('requested_at', { ascending: true })
    .limit(1)
    .maybeSingle<ResearchJob>();
  if (result.error) throw new Error(`Baca research queue gagal: ${result.error.message}`);
  if (!result.data) return false;

  const claimed = await client
    .from('research_backtest_jobs')
    .update({ status: 'RUNNING', progress: 1, started_at: new Date().toISOString() })
    .eq('id', result.data.id)
    .eq('status', result.data.status)
    .select('id,symbol,status')
    .maybeSingle<ResearchJob>();
  if (claimed.error) throw new Error(`Claim research job gagal: ${claimed.error.message}`);
  if (!claimed.data) return false;

  const worker = new Worker(new URL('./research-runner.ts', import.meta.url), {
    workerData: claimed.data,
    execArgv: process.execArgv,
  });
  activeResearchWorker = worker;
  worker.on('error', (error) => {
    console.error('[research-worker]', error);
  });
  worker.on('exit', (code) => {
    if (code !== 0) console.error(`[research-worker] exit code ${code}`);
    if (activeResearchWorker === worker) activeResearchWorker = null;
  });
  return true;
}

export async function watchResearchJobs(): Promise<void> {
  console.log(JSON.stringify({ research: true, watch: true, at: new Date().toISOString() }));
  for (;;) {
    try {
      await processNextResearchJob();
    } catch (error) {
      console.error('[research]', error);
    }
    await new Promise((resolve) => setTimeout(resolve, Math.max(Number(process.env.RESEARCH_JOB_POLL_MS ?? POLL_INTERVAL_MS), 5_000)));
  }
}
