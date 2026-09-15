import {
  runBacktest,
  runTemporalValidation,
  runWalkForwardValidation,
  type BacktestConfig,
  type BacktestReport,
  type Candle,
} from '@nusaquant/core';
import { createWorkerSupabaseClient } from './supabase.ts';

type CandleRow = {
  open_time: string;
  open: number | string;
  high: number | string;
  low: number | string;
  close: number | string;
  volume: number | string;
};

type ResearchJob = {
  id: string;
  symbol: 'BTCUSDT' | 'ETHUSDT';
  status: 'QUEUED' | 'RUNNING' | 'COMPLETED' | 'FAILED';
};

const PAGE_SIZE = 1000;
const MAX_CANDLES = 50_000;
const POLL_INTERVAL_MS = 15_000;

function toCandle(row: CandleRow): Candle {
  return {
    time: Date.parse(row.open_time),
    open: Number(row.open),
    high: Number(row.high),
    low: Number(row.low),
    close: Number(row.close),
    volume: Number(row.volume),
  };
}

async function readAllCandles(symbol: string, interval: string): Promise<Candle[]> {
  const client = createWorkerSupabaseClient();
  const rows: CandleRow[] = [];
  for (let offset = 0; offset < MAX_CANDLES; offset += PAGE_SIZE) {
    const result = await client
      .from('market_candles')
      .select('open_time,open,high,low,close,volume')
      .eq('symbol', symbol)
      .eq('interval', interval)
      .order('open_time', { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);
    if (result.error) throw new Error(`Query ${symbol} ${interval} gagal: ${result.error.message}`);
    const page = (result.data ?? []) as CandleRow[];
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
  }
  return rows.map(toCandle);
}

function summary(report: BacktestReport, candles: Candle[]) {
  return {
    periodStart: candles[0]?.time ?? null,
    periodEnd: candles.at(-1)?.time ?? null,
    sampleCandles: candles.length,
    totalTrades: report.totalTrades,
    winningTrades: report.winningTrades,
    losingTrades: report.losingTrades,
    winRate: report.winRate,
    profitFactor: report.profitFactor,
    expectancyR: report.expectancyR,
    netPnl: report.netPnl,
    maxDrawdown: report.maxDrawdown,
    maxDrawdownPct: report.maxDrawdownPct,
    gate: report.totalTrades < 30
      ? 'NOT_READY_SAMPLE'
      : report.profitFactor !== null && report.profitFactor > 1 && report.expectancyR > 0
        ? 'PASS_RESEARCH_GATE'
        : 'FAIL_NEGATIVE_EXPECTANCY',
  } as const;
}

function compactReport(report: BacktestReport, candles: Candle[]) {
  return {
    summary: summary(report, candles),
    executionAudit: report.executionAudit,
    excursionAudit: report.excursionAudit,
    diagnostics: report.diagnostics,
  };
}

const VARIANTS = [
  {
    name: 'TRIAD_TIMING_HYPOTHESIS',
    rule: 'triggerRangeAtr < 1.2 dan entryDistanceToEmaAtr >= 0.25.',
    config: { entryPolicy: 'TRIAD_TIMING_HYPOTHESIS' as const },
  },
  {
    name: 'TRIAD_RETEST_HYPOTHESIS',
    rule: 'Trigger diikuti retest level candle sebelumnya maksimal 3 candle.',
    config: { entryPolicy: 'TRIAD_RETEST_HYPOTHESIS' as const },
  },
  {
    name: 'TRIAD_FOLLOW_THROUGH_HYPOTHESIS',
    rule: 'Candle berikutnya follow-through searah tanpa menembus low/high trigger.',
    config: { entryPolicy: 'TRIAD_FOLLOW_THROUGH_HYPOTHESIS' as const },
  },
  {
    name: 'MFE_PROFIT_PROTECTION_HYPOTHESIS',
    rule: 'Setelah closed candle mencapai +0.5R, stop pindah ke entry pada candle berikutnya.',
    config: { exitPolicy: 'MFE_PROFIT_PROTECTION_HYPOTHESIS' as const },
  },
] as const;

async function updateJob(id: string, patch: Record<string, unknown>): Promise<void> {
  const client = createWorkerSupabaseClient();
  const { error } = await client.from('research_backtest_jobs').update(patch).eq('id', id);
  if (error) throw new Error(`Update research job gagal: ${error.message}`);
}

export async function runResearchJob(job: ResearchJob): Promise<void> {
  const startedAt = new Date().toISOString();
  await updateJob(job.id, { status: 'RUNNING', progress: 5, started_at: startedAt, error: null });
  try {
    const [higherTimeframe, entryTimeframe] = await Promise.all([
      readAllCandles(job.symbol, '1h'),
      readAllCandles(job.symbol, '15m'),
    ]);
    if (higherTimeframe.length < 220 || entryTimeframe.length < 80) {
      throw new Error(`${job.symbol} belum memiliki cukup data: ${higherTimeframe.length} candle 1H dan ${entryTimeframe.length} candle 15M.`);
    }

    const config: BacktestConfig = {
      initialEquity: 10_000,
      riskFraction: 0.0025,
      feeRate: 0.0004,
      slippageRate: 0.0002,
      fundingRatePerBar: 0.00001,
      maxBarsInTrade: 96,
      timezone: 'Asia/Jakarta',
    };
    const baseline = runBacktest({ symbol: job.symbol, higherTimeframe, entryTimeframe, config });
    await updateJob(job.id, { progress: 25 });
    const validation = runTemporalValidation({
      symbol: job.symbol,
      higherTimeframe,
      entryTimeframe,
      config,
      trainFraction: 0.7,
      warmupBars: 80,
    });
    await updateJob(job.id, { progress: 40 });
    const walkForward = runWalkForwardValidation({
      symbol: job.symbol,
      higherTimeframe,
      entryTimeframe,
      config,
      foldCount: 3,
      warmupBars: 80,
    });
    await updateJob(job.id, { progress: 55 });

    const candidates: Record<string, unknown> = {};
    for (const [index, variant] of VARIANTS.entries()) {
      const variantConfig = { ...config, ...variant.config };
      const report = runBacktest({ symbol: job.symbol, higherTimeframe, entryTimeframe, config: variantConfig });
      const temporal = runTemporalValidation({
        symbol: job.symbol,
        higherTimeframe,
        entryTimeframe,
        config: variantConfig,
        trainFraction: 0.7,
        warmupBars: 80,
      });
      candidates[variant.name] = {
        name: variant.name,
        rule: variant.rule,
        ...compactReport(report, entryTimeframe),
        validation: temporal,
      };
      await updateJob(job.id, { progress: 60 + Math.floor(((index + 1) / VARIANTS.length) * 35) });
    }

    const result = {
      version: 1,
      symbol: job.symbol,
      sample: {
        higherCandles: higherTimeframe.length,
        entryCandles: entryTimeframe.length,
        latestEntryTime: entryTimeframe.at(-1)?.time ?? null,
      },
      baseline: {
        ...compactReport(baseline, entryTimeframe),
        validation,
        walkForward,
      },
      candidates,
      notes: [
        'Full-history result dihitung server-side oleh research worker, bukan request browser.',
        'Semua candle harus closed; stop dan target pada candle yang sama memakai asumsi stop-first konservatif.',
        'Candidate tetap research-only dan tidak mengubah paper/live rule.',
      ],
    };
    await updateJob(job.id, {
      status: 'COMPLETED',
      progress: 100,
      completed_at: new Date().toISOString(),
      result,
    });
    console.log(JSON.stringify({ research: true, jobId: job.id, symbol: job.symbol, status: 'COMPLETED' }));
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
  const client = createWorkerSupabaseClient();
  const result = await client
    .from('research_backtest_jobs')
    .select('id,symbol,status')
    .eq('status', 'QUEUED')
    .order('requested_at', { ascending: true })
    .limit(1)
    .maybeSingle<ResearchJob>();
  if (result.error) throw new Error(`Baca research queue gagal: ${result.error.message}`);
  if (!result.data) return false;

  const claimed = await client
    .from('research_backtest_jobs')
    .update({ status: 'RUNNING', progress: 1, started_at: new Date().toISOString() })
    .eq('id', result.data.id)
    .eq('status', 'QUEUED')
    .select('id,symbol,status')
    .maybeSingle<ResearchJob>();
  if (claimed.error) throw new Error(`Claim research job gagal: ${claimed.error.message}`);
  if (!claimed.data) return false;

  await runResearchJob(claimed.data);
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
