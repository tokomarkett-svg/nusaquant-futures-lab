import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import type { Candle, FundingPoint, MarketMetricsPoint } from '@nusaquant/core';
import {
  defaultMonthRange,
  fetchDailyMetrics,
  fetchMonthlyFunding,
  fetchMonthlyKlines,
  monthKeys,
} from './binance-archive.ts';
import {
  evaluateResearchRun,
  RESEARCH_VARIANTS,
  type ResearchRunResult,
} from './research-evaluation.ts';

/**
 * Local full-history research CLI.
 *
 * Downloads public Binance bulk data only (no API key, no Supabase) and runs the exact same
 * evaluation the Railway research worker runs, so a strategy decision can be reproduced on a laptop
 * and cross-checked against the dashboard job. Output is research-only: nothing here touches paper
 * approval, Testnet, or live orders.
 *
 * Usage:
 *   npm run research:local --workspace @nusaquant/worker
 *   npm run research:local --workspace @nusaquant/worker -- --symbols=BTCUSDT --start=2025-09 --end=2026-08
 */

const CACHE_DIR = path.resolve(process.cwd(), '.research-cache');

type Args = {
  symbols: string[];
  startMonth: string;
  endMonth: string;
  output: string | null;
  refresh: boolean;
  variants: string[] | null;
};

function parseArgs(argv: string[]): Args {
  const range = defaultMonthRange();
  const args: Args = {
    symbols: ['BTCUSDT', 'ETHUSDT'],
    startMonth: range.startMonth,
    endMonth: range.endMonth,
    output: null,
    refresh: false,
    variants: null,
  };
  for (const raw of argv) {
    const [key, value] = raw.replace(/^--/, '').split('=');
    if (value === undefined) {
      if (key === 'refresh') args.refresh = true;
      continue;
    }
    if (key === 'symbols') args.symbols = value.split(',').map((item) => item.trim().toUpperCase()).filter(Boolean);
    if (key === 'start') args.startMonth = value.slice(0, 7);
    if (key === 'end') args.endMonth = value.slice(0, 7);
    if (key === 'out') args.output = value;
    if (key === 'refresh') args.refresh = value === 'true';
    if (key === 'variants') args.variants = value.split(',').map((item) => item.trim().toUpperCase()).filter(Boolean);
  }
  return args;
}

async function cached<T>(file: string, refresh: boolean, load: () => Promise<T>): Promise<T> {
  const target = path.join(CACHE_DIR, file);
  if (!refresh && existsSync(target)) {
    return JSON.parse(await readFile(target, 'utf8')) as T;
  }
  const value = await load();
  await mkdir(CACHE_DIR, { recursive: true });
  await writeFile(target, JSON.stringify(value));
  return value;
}

function formatMoney(value: number): string {
  return `${value >= 0 ? '+' : ''}${value.toFixed(2)}`;
}

function formatPf(value: number | null): string {
  if (value === null) return '—';
  return Number.isFinite(value) ? value.toFixed(2) : '∞';
}

function verdict(result: ResearchRunResult): void {
  const baseline = result.baseline;
  console.log(`\n=== ${result.symbol} ===`);
  console.log(`sample: ${result.sample.entryCandles} candle 15M · ${result.sample.higherCandles} candle 1H · ${result.sample.fundingPoints} funding · ${result.sample.metricsPoints} metrics`);
  console.log(`periode: ${new Date(baseline.summary.periodStart ?? 0).toISOString().slice(0, 10)} → ${new Date(baseline.summary.periodEnd ?? 0).toISOString().slice(0, 10)}`);
  console.log(`baseline: ${baseline.summary.totalTrades} trade · ${formatMoney(baseline.summary.netPnl)} USDT · ${baseline.summary.expectancyR.toFixed(3)}R · PF ${formatPf(baseline.summary.profitFactor)} · gate ${baseline.summary.gate}`);
  console.log(`baseline OOS: ${baseline.validation.outOfSample.totalTrades} trade · ${formatMoney(baseline.validation.outOfSample.netPnl)} USDT · ${baseline.validation.outOfSample.expectancyR.toFixed(3)}R · PF ${formatPf(baseline.validation.outOfSample.profitFactor)}`);
  console.log(`baseline WF: ${baseline.walkForward.aggregate.totalTrades} trade · ${baseline.walkForward.aggregate.expectancyR.toFixed(3)}R · PF ${formatPf(baseline.walkForward.aggregate.profitFactor)}`);
  console.log(`baseline promotion gate: ${baseline.promotionGate.pass ? 'PASS' : 'REJECT'}`);
  for (const candidate of Object.values(result.candidates)) {
    const tag = candidate.dataStatus === 'MISSING_DATA' ? ' [MISSING_DATA]' : '';
    console.log(
      `  ${candidate.name}${tag}: ${candidate.summary.totalTrades} trade · full ${formatMoney(candidate.summary.netPnl)} · ${candidate.summary.expectancyR.toFixed(3)}R · PF ${formatPf(candidate.summary.profitFactor)}`
      + ` | OOS ${candidate.validation.outOfSample.totalTrades} trade · ${candidate.validation.outOfSample.expectancyR.toFixed(3)}R · PF ${formatPf(candidate.validation.outOfSample.profitFactor)}`
      + ` | WF ${candidate.walkForward.aggregate.expectancyR.toFixed(3)}R · PF ${formatPf(candidate.walkForward.aggregate.profitFactor)}`
      + ` => ${candidate.promotionGate.pass ? 'PASS' : 'REJECT'}`,
    );
  }
  for (const funnel of Object.values(result.funnels)) {
    const zeroTrades = result.candidates[funnel.name]?.summary.totalTrades === 0;
    if (!zeroTrades) continue;
    console.log(`\n  --- funnel ${funnel.name} (${funnel.evaluated} candle dievaluasi) ---`);
    console.log(`  long : ${funnel.longStages.map((item) => `${item.label}=${item.passed} (${(item.share * 100).toFixed(2)}%)`).join(' -> ')}`);
    console.log(`  short: ${funnel.shortStages.map((item) => `${item.label}=${item.passed} (${(item.share * 100).toFixed(2)}%)`).join(' -> ')}`);
    for (const [name, stats] of Object.entries(funnel.distributions)) {
      console.log(`  dist ${name}: n=${stats.count} min=${stats.min.toFixed(6)} p01=${stats.p01.toFixed(6)} p10=${stats.p10.toFixed(6)} median=${stats.median.toFixed(6)} p90=${stats.p90.toFixed(6)} p99=${stats.p99.toFixed(6)} max=${stats.max.toFixed(6)}`);
    }
    if (funnel.diagnosis) console.log(`  diagnosis: ${funnel.diagnosis}`);
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const months = monthKeys(args.startMonth, args.endMonth);
  const startTime = Date.parse(`${args.startMonth}-01T00:00:00Z`);
  const endTime = new Date(Date.parse(`${args.endMonth}-01T00:00:00Z`)).setUTCMonth(
    new Date(Date.parse(`${args.endMonth}-01T00:00:00Z`)).getUTCMonth() + 1,
  ) - 1;
  if (!Number.isFinite(startTime) || !Number.isFinite(endTime)) throw new Error('Rentang periode tidak valid.');

  const runs: ResearchRunResult[] = [];
  for (const symbol of args.symbols) {
    const startedAt = Date.now();
    console.log(JSON.stringify({ localResearch: true, symbol, months: months.length, phase: 'download' }));
    const [higherTimeframe, entryTimeframe, fundingTimeframe, metricsTimeframe] = await Promise.all([
      cached<Candle[]>(`${symbol}-1h-${args.startMonth}-${args.endMonth}.json`, args.refresh, () => fetchMonthlyKlines({ symbol, interval: '1h', months })),
      cached<Candle[]>(`${symbol}-15m-${args.startMonth}-${args.endMonth}.json`, args.refresh, () => fetchMonthlyKlines({ symbol, interval: '15m', months })),
      cached<FundingPoint[]>(`${symbol}-funding-${args.startMonth}-${args.endMonth}.json`, args.refresh, () => fetchMonthlyFunding({ symbol, months })),
      cached<MarketMetricsPoint[]>(`${symbol}-metrics-${args.startMonth}-${args.endMonth}.json`, args.refresh, () => fetchDailyMetrics({ symbol, startTime, endTime })),
    ]);
    console.log(JSON.stringify({
      localResearch: true,
      symbol,
      phase: 'evaluate',
      higherCandles: higherTimeframe.length,
      entryCandles: entryTimeframe.length,
      fundingPoints: fundingTimeframe.length,
      metricsPoints: metricsTimeframe.length,
      variants: RESEARCH_VARIANTS.length,
    }));
    const selectedVariants = args.variants
      ? RESEARCH_VARIANTS.filter((variant) => args.variants?.includes(variant.name))
      : undefined;
    const result = await evaluateResearchRun({
      symbol,
      higherTimeframe,
      entryTimeframe,
      fundingTimeframe,
      metricsTimeframe,
      variants: selectedVariants,
      onProgress: (progress) => {
        if (progress % 10 === 0 || progress >= 95) console.log(JSON.stringify({ localResearch: true, symbol, progress }));
      },
    });
    console.log(JSON.stringify({ localResearch: true, symbol, phase: 'done', seconds: Math.round((Date.now() - startedAt) / 1000) }));
    verdict(result);
    runs.push(result);
  }

  if (args.output) {
    await mkdir(path.dirname(path.resolve(args.output)), { recursive: true });
    await writeFile(args.output, JSON.stringify({ generatedAt: new Date().toISOString(), months: [args.startMonth, args.endMonth], runs }, null, 2));
    console.log(JSON.stringify({ localResearch: true, output: args.output }));
  }

  const promoted = runs.flatMap((run) => [
    ...(run.baseline.promotionGate.pass ? [`${run.symbol}/BASELINE`] : []),
    ...Object.values(run.candidates).filter((candidate) => candidate.promotionGate.pass).map((candidate) => `${run.symbol}/${candidate.name}`),
  ]);
  console.log(JSON.stringify({
    ok: true,
    symbols: args.symbols,
    promoted: promoted.length > 0 ? promoted : [],
    conclusion: promoted.length > 0
      ? 'Ada candidate yang lolos promotion gate. Tetap wajib cross-asset review sebelum paper approval.'
      : 'Tidak ada baseline maupun candidate yang lolos promotion gate. Paper, Testnet, dan live tetap terkunci.',
  }));
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
