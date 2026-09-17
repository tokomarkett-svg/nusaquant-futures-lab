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
  evaluateSingleVariant,
  RESEARCH_VARIANTS,
  type ResearchRunResult,
  type SingleVariantResult,
} from './research-evaluation.ts';

/**
 * Local full-history research CLI.
 *
 * Downloads public Binance bulk data only (no API key, no Supabase) and runs the exact same
 * evaluation the Railway research worker runs. Output is research-only: nothing here touches paper
 * approval, Testnet, or live orders.
 *
 * Usage:
 *   npm run research:local --workspace @nusaquant/worker
 *   npm run research:local --workspace @nusaquant/worker -- --symbols=BTCUSDT --start=2025-09 --end=2026-08
 *   npm run research:local --workspace @nusaquant/worker -- --symbols=BTCUSDT --variants=NONE
 *   npm run research:local --workspace @nusaquant/worker -- --entry=5m --higher=1h \
 *     --variants=CHAMPION_ABSORPTION_REVERSION_HYPOTHESIS --skip-baseline
 *   npm run research:local --workspace @nusaquant/worker -- --entry=1h --higher=4h \
 *     --variants=WILLIAMS_VOLATILITY_BREAKOUT_HYPOTHESIS
 */

const CACHE_DIR = path.resolve(process.cwd(), '.research-cache');

const INTERVAL_MS: Record<string, number> = {
  '1m': 60_000,
  '5m': 300_000,
  '15m': 900_000,
  '1h': 3_600_000,
  '4h': 14_400_000,
};

type Args = {
  symbols: string[];
  startMonth: string;
  endMonth: string;
  output: string | null;
  refresh: boolean;
  variants: string[] | null;
  entry: string;
  higher: string;
  skipBaseline: boolean;
  noMetrics: boolean;
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
    entry: '15m',
    higher: '1h',
    skipBaseline: false,
    noMetrics: false,
  };
  for (const raw of argv) {
    const [key, value] = raw.replace(/^--/, '').split('=');
    if (value === undefined) {
      if (key === 'refresh') args.refresh = true;
      if (key === 'skip-baseline') args.skipBaseline = true;
      if (key === 'no-metrics') args.noMetrics = true;
      continue;
    }
    if (key === 'symbols') args.symbols = value.split(',').map((item) => item.trim().toUpperCase()).filter(Boolean);
    if (key === 'start') args.startMonth = value.slice(0, 7);
    if (key === 'end') args.endMonth = value.slice(0, 7);
    if (key === 'out') args.output = value;
    if (key === 'refresh') args.refresh = value === 'true';
      if (key === 'variants') args.variants = value.split(',').map((item) => item.trim().toUpperCase()).filter(Boolean);
      if (key === 'entry') args.entry = value.trim();
      if (key === 'higher') args.higher = value.trim();
      if (key === 'skip-baseline') args.skipBaseline = value === 'true';
      if (key === 'no-metrics') args.noMetrics = value === 'true';
  }
  if (!INTERVAL_MS[args.entry] || !INTERVAL_MS[args.higher]) {
    throw new Error(`Interval tidak didukung: entry=${args.entry} higher=${args.higher}.`);
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

function printFunnel(name: string, funnel: ResearchRunResult['funnels'][string] | SingleVariantResult['funnel'], zeroTrades: boolean): void {
  if (!funnel || !zeroTrades) return;
  console.log(`\n  --- funnel ${name} (${funnel.evaluated} candle dievaluasi) ---`);
  console.log(`  long : ${funnel.longStages.map((item) => `${item.label}=${item.passed} (${(item.share * 100).toFixed(2)}%)`).join(' -> ')}`);
  console.log(`  short: ${funnel.shortStages.map((item) => `${item.label}=${item.passed} (${(item.share * 100).toFixed(2)}%)`).join(' -> ')}`);
  if (funnel.diagnosis) console.log(`  diagnosis: ${funnel.diagnosis}`);
}

function verdict(result: ResearchRunResult): void {
  const baseline = result.baseline;
  console.log(`\n=== ${result.symbol} ===`);
  console.log(`sample: ${result.sample.entryCandles} candle entry · ${result.sample.higherCandles} candle higher · ${result.sample.fundingPoints} funding · ${result.sample.metricsPoints} metrics`);
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
  for (const candidate of Object.values(result.candidates)) {
    printFunnel(candidate.name, result.funnels[candidate.name], candidate.summary.totalTrades === 0);
  }
}

function verdictSingle(symbol: string, single: SingleVariantResult, sample: { entryCandles: number; higherCandles: number; fundingPoints: number; metricsPoints: number }): void {
  console.log(`\n=== ${symbol} · ${single.name} (single-variant run) ===`);
  console.log(`sample: ${sample.entryCandles} candle entry · ${sample.higherCandles} candle higher · ${sample.fundingPoints} funding · ${sample.metricsPoints} metrics`);
  console.log(`full: ${single.summary.totalTrades} trade · ${formatMoney(single.summary.netPnl)} USDT · ${single.summary.expectancyR.toFixed(3)}R · PF ${formatPf(single.summary.profitFactor)} · gate ${single.summary.gate}`);
  console.log(`OOS 30%: ${single.validation.outOfSample.totalTrades} trade · ${formatMoney(single.validation.outOfSample.netPnl)} USDT · ${single.validation.outOfSample.expectancyR.toFixed(3)}R · PF ${formatPf(single.validation.outOfSample.profitFactor)}`);
  console.log(`WF: ${single.walkForward.aggregate.totalTrades} trade · ${single.walkForward.aggregate.expectancyR.toFixed(3)}R · PF ${formatPf(single.walkForward.aggregate.profitFactor)}`);
  console.log(`promotion gate: ${single.promotionGate.pass ? 'PASS' : 'REJECT'}${single.promotionGate.pass ? '' : ` (${single.promotionGate.reason})`}`);
  printFunnel(single.name, single.funnel, single.summary.totalTrades === 0);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const months = monthKeys(args.startMonth, args.endMonth);
  const startTime = Date.parse(`${args.startMonth}-01T00:00:00Z`);
  const endTime = new Date(Date.parse(`${args.endMonth}-01T00:00:00Z`)).setUTCMonth(
    new Date(Date.parse(`${args.endMonth}-01T00:00:00Z`)).getUTCMonth() + 1,
  ) - 1;
  if (!Number.isFinite(startTime) || !Number.isFinite(endTime)) throw new Error('Rentang periode tidak valid.');
  const entryIntervalMs = INTERVAL_MS[args.entry];

  const runs: ResearchRunResult[] = [];
  const singles: Array<{ symbol: string; result: SingleVariantResult }> = [];
  for (const symbol of args.symbols) {
    const startedAt = Date.now();
    console.log(JSON.stringify({ localResearch: true, symbol, months: months.length, entry: args.entry, higher: args.higher, phase: 'download' }));
    const [higherTimeframe, entryTimeframe, fundingTimeframe, metricsTimeframe] = await Promise.all([
      cached<Candle[]>(`${symbol}-${args.higher}-${args.startMonth}-${args.endMonth}.json`, args.refresh, () => fetchMonthlyKlines({ symbol, interval: args.higher, months })),
      cached<Candle[]>(`${symbol}-${args.entry}-${args.startMonth}-${args.endMonth}.json`, args.refresh, () => fetchMonthlyKlines({ symbol, interval: args.entry, months })),
      cached<FundingPoint[]>(`${symbol}-funding-${args.startMonth}-${args.endMonth}.json`, args.refresh, () => fetchMonthlyFunding({ symbol, months })),
      args.noMetrics
        ? Promise.resolve<MarketMetricsPoint[]>([])
        : cached<MarketMetricsPoint[]>(`${symbol}-metrics-${args.startMonth}-${args.endMonth}.json`, args.refresh, () => fetchDailyMetrics({ symbol, startTime, endTime })),
    ]);
    const sampleInfo = {
      entryCandles: entryTimeframe.length,
      higherCandles: higherTimeframe.length,
      fundingPoints: fundingTimeframe.length,
      metricsPoints: metricsTimeframe.length,
    };
    console.log(JSON.stringify({ localResearch: true, symbol, phase: 'evaluate', ...sampleInfo, variants: args.variants ? args.variants.length : RESEARCH_VARIANTS.length }));

    const selectedVariants = args.variants
      ? RESEARCH_VARIANTS.filter((variant) => args.variants?.includes(variant.name))
      : undefined;

    if (args.skipBaseline && selectedVariants && selectedVariants.length === 1) {
      const single = await evaluateSingleVariant({
        symbol,
        higherTimeframe,
        entryTimeframe,
        fundingTimeframe,
        metricsTimeframe,
        entryIntervalMs,
        variantName: selectedVariants[0].name,
        onProgress: (progress) => {
          if (progress % 10 === 0) console.log(JSON.stringify({ localResearch: true, symbol, progress }));
        },
      });
      verdictSingle(symbol, single, sampleInfo);
      singles.push({ symbol, result: single });
      continue;
    }

    const result = await evaluateResearchRun({
      symbol,
      higherTimeframe,
      entryTimeframe,
      fundingTimeframe,
      metricsTimeframe,
      entryIntervalMs,
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
    await writeFile(args.output, JSON.stringify({
      generatedAt: new Date().toISOString(),
      months: [args.startMonth, args.endMonth],
      intervals: { entry: args.entry, higher: args.higher },
      runs,
      singles,
    }, null, 2));
    console.log(JSON.stringify({ localResearch: true, output: args.output }));
  }

  const promoted = [
    ...runs.flatMap((run) => [
      ...(run.baseline.promotionGate.pass ? [`${run.symbol}/BASELINE`] : []),
      ...Object.values(run.candidates).filter((candidate) => candidate.promotionGate.pass).map((candidate) => `${run.symbol}/${candidate.name}`),
    ]),
    ...singles.filter((item) => item.result.promotionGate.pass).map((item) => `${item.symbol}/${item.result.name}`),
  ];
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
