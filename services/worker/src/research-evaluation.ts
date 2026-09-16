import {
  buildFundingDistribution,
  buildLiquidationReclaimFunnel,
  buildTakerFlowFunnel,
  runBacktest,
  runTemporalValidation,
  runWalkForwardValidation,
  type BacktestConfig,
  type BacktestReport,
  type Candle,
  type CandidateFunnel,
  type FundingPoint,
  type MarketMetricsPoint,
} from '@nusaquant/core';

export type ResearchSample = {
  higherCandles: number;
  entryCandles: number;
  fundingPoints: number;
  metricsPoints: number;
  latestEntryTime: number | null;
};

export type GateStatus = 'NOT_READY_SAMPLE' | 'PASS_RESEARCH_GATE' | 'FAIL_NEGATIVE_EXPECTANCY';

export type GateMetrics = Pick<BacktestReport, 'totalTrades' | 'profitFactor' | 'expectancyR'>;

export const RESEARCH_BASE_CONFIG: BacktestConfig = {
  initialEquity: 10_000,
  riskFraction: 0.0025,
  feeRate: 0.0004,
  slippageRate: 0.0002,
  fundingRatePerBar: 0.00001,
  maxBarsInTrade: 96,
  timezone: 'Asia/Jakarta',
};

export const RESEARCH_VARIANTS = [
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
  {
    name: 'MEAN_REVERSION_REJECTION_HYPOTHESIS',
    rule: 'Range higher timeframe, stretch minimal 1.2 ATR dari EMA20, rejection candle, RSI extreme, target kembali ke EMA20.',
    config: { entryPolicy: 'MEAN_REVERSION_REJECTION_HYPOTHESIS' as const },
  },
  {
    name: 'VOLATILITY_EXPANSION_BREAKOUT_HYPOTHESIS',
    rule: 'Trend higher timeframe, close menembus Donchian 20 candle, range minimal 1.1 ATR, dan volume minimal 1.2x rata-rata.',
    config: { entryPolicy: 'VOLATILITY_EXPANSION_BREAKOUT_HYPOTHESIS' as const },
  },
  {
    name: 'FUNDING_CROWDING_REVERSION_HYPOTHESIS',
    rule: 'Funding berada di cap ekstrem >= 0.01% atau <= -0.01%, rejection candle berlawanan, target kembali ke EMA20. Funding event harus lebih lama dari candle entry.',
    config: { entryPolicy: 'FUNDING_CROWDING_REVERSION_HYPOTHESIS' as const },
    requiresFunding: true,
  },
  {
    name: 'TAKER_FLOW_REJECTION_HYPOTHESIS',
    rule: 'Taker buy ratio <= 0.38 atau >= 0.62, didahului gerak tiga candle searah flow, rejection close berlawanan, range <= 2.2 ATR, ADX 1H <= 28, target 1.5R.',
    config: { entryPolicy: 'TAKER_FLOW_REJECTION_HYPOTHESIS' as const },
    requiresTakerFlow: true,
  },
  {
    name: 'LIQUIDATION_RECLAIM_HYPOTHESIS',
    rule: 'Crowding long/short ekstrem, open interest value turun minimal 0.3% dalam satu jam, taker ratio dan candle flow searah flush, price move minimal 0.2%, reclaim close, target 1.5R.',
    config: { entryPolicy: 'LIQUIDATION_RECLAIM_HYPOTHESIS' as const },
    requiresMetrics: true,
  },
] as const;

export type ResearchVariantDefinition = (typeof RESEARCH_VARIANTS)[number];

/**
 * Data availability must be reported explicitly. A candidate that returns zero trades because its
 * input series is missing is NOT evidence against the hypothesis, and it must never be shown as a
 * rejection next to candidates that had real data.
 */
export function variantDataStatus(
  variant: ResearchVariantDefinition,
  sample: { fundingPoints: number; metricsPoints: number; takerFlowCandles: number },
): 'READY' | 'MISSING_DATA' {
  if ('requiresFunding' in variant && variant.requiresFunding && sample.fundingPoints === 0) return 'MISSING_DATA';
  if ('requiresMetrics' in variant && variant.requiresMetrics && sample.metricsPoints === 0) return 'MISSING_DATA';
  if ('requiresTakerFlow' in variant && variant.requiresTakerFlow && sample.takerFlowCandles === 0) return 'MISSING_DATA';
  return 'READY';
}

export function summarizeReport(report: BacktestReport, candles: Candle[]) {
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

export function compactReport(report: BacktestReport, candles: Candle[]) {
  return {
    summary: summarizeReport(report, candles),
    executionAudit: report.executionAudit,
    excursionAudit: report.excursionAudit,
    diagnostics: report.diagnostics,
  };
}

/**
 * Promotion gate. Deliberately strict: a candidate must survive full history, out-of-sample, and
 * walk-forward AFTER costs. A candidate with PF between 1.00 and 1.10 is not promoted because that
 * margin is inside the noise of fee/slippage assumptions.
 */
export function passesPromotionGate(report: GateMetrics, outOfSample: GateMetrics, walkForward: GateMetrics) {
  const positiveAfterCosts = (candidate: GateMetrics) => candidate.profitFactor !== null
    && candidate.profitFactor >= 1.1
    && candidate.expectancyR > 0;
  const requirements = {
    fullHistory: positiveAfterCosts(report),
    outOfSample: positiveAfterCosts(outOfSample) && outOfSample.totalTrades >= 30,
    walkForward: positiveAfterCosts(walkForward) && walkForward.totalTrades >= 30,
  };
  const pass = Object.values(requirements).every(Boolean);
  return {
    pass,
    requirements,
    reason: pass
      ? 'Lolos full-history, OOS minimal 30 trade, dan walk-forward setelah biaya.'
      : 'Research-only: wajib positif setelah biaya dengan PF minimal 1.10, OOS minimal 30 trade, dan walk-forward minimal 30 trade.',
  };
}

export type ResearchProgressCallback = (percent: number) => void | Promise<void>;

export type ResearchRunInput = {
  symbol: string;
  higherTimeframe: Candle[];
  entryTimeframe: Candle[];
  fundingTimeframe: FundingPoint[];
  metricsTimeframe: MarketMetricsPoint[];
  config?: BacktestConfig;
  /** Called between expensive stages so the caller can persist progress. */
  onProgress?: ResearchProgressCallback;
  /** Restrict the variant list, useful for smoke runs. */
  variants?: readonly ResearchVariantDefinition[];
};

export type ResearchRunResult = {
  version: 1;
  symbol: string;
  sample: ResearchSample;
  /** Condition coverage for the data-driven candidates; explains zero-trade outcomes. */
  funnels: Record<string, CandidateFunnel>;
  baseline: ReturnType<typeof compactReport> & {
    validation: ReturnType<typeof runTemporalValidation>;
    walkForward: ReturnType<typeof runWalkForwardValidation>;
    promotionGate: ReturnType<typeof passesPromotionGate>;
  };
  candidates: Record<string, ReturnType<typeof compactReport> & {
    name: string;
    rule: string;
    dataStatus: 'READY' | 'MISSING_DATA';
    validation: ReturnType<typeof runTemporalValidation>;
    walkForward: ReturnType<typeof runWalkForwardValidation>;
    promotionGate: ReturnType<typeof passesPromotionGate>;
  }>;
  notes: string[];
};

function countTakerFlowCandles(candles: Candle[]): number {
  return candles.reduce((total, candle) => total + (Number.isFinite(candle.takerBuyVolume) ? 1 : 0), 0);
}

/**
 * Single source of truth for the full-history research evaluation.
 *
 * The async worker (Supabase) and the local research CLI (public Binance archive) both call this so
 * a dashboard number and a local reproduction can never drift apart.
 */
export async function evaluateResearchRun(input: ResearchRunInput): Promise<ResearchRunResult> {
  const { symbol, higherTimeframe, entryTimeframe, fundingTimeframe, metricsTimeframe } = input;
  const config = { ...RESEARCH_BASE_CONFIG, ...input.config };
  const onProgress = input.onProgress ?? (() => {});

  if (higherTimeframe.length < 220 || entryTimeframe.length < 80) {
    throw new Error(`${symbol} belum memiliki cukup data: ${higherTimeframe.length} candle 1H dan ${entryTimeframe.length} candle 15M.`);
  }

  const takerFlowCandles = countTakerFlowCandles(entryTimeframe);
  const sample: ResearchSample = {
    higherCandles: higherTimeframe.length,
    entryCandles: entryTimeframe.length,
    fundingPoints: fundingTimeframe.length,
    metricsPoints: metricsTimeframe.length,
    latestEntryTime: entryTimeframe.at(-1)?.time ?? null,
  };

  const baseline = runBacktest({ symbol, higherTimeframe, entryTimeframe, fundingTimeframe, metricsTimeframe, config });
  await onProgress(25);
  const validation = runTemporalValidation({
    symbol,
    higherTimeframe,
    entryTimeframe,
    fundingTimeframe,
    metricsTimeframe,
    config,
    trainFraction: 0.7,
    warmupBars: 80,
  });
  await onProgress(40);
  const baselineWalkForward = runWalkForwardValidation({
    symbol,
    higherTimeframe,
    entryTimeframe,
    fundingTimeframe,
    metricsTimeframe,
    config,
    foldCount: 3,
    warmupBars: 80,
  });
  const baselinePromotionGate = passesPromotionGate(baseline, validation.outOfSample, baselineWalkForward.aggregate);
  await onProgress(55);

  const variants = input.variants ?? RESEARCH_VARIANTS;
  const candidates: ResearchRunResult['candidates'] = {};
  for (const [index, variant] of variants.entries()) {
    const variantConfig = { ...config, ...variant.config };
    const report = runBacktest({ symbol, higherTimeframe, entryTimeframe, fundingTimeframe, metricsTimeframe, config: variantConfig });
    const temporal = runTemporalValidation({
      symbol,
      higherTimeframe,
      entryTimeframe,
      fundingTimeframe,
      metricsTimeframe,
      config: variantConfig,
      trainFraction: 0.7,
      warmupBars: 80,
    });
    const walkForward = runWalkForwardValidation({
      symbol,
      higherTimeframe,
      entryTimeframe,
      fundingTimeframe,
      metricsTimeframe,
      config: variantConfig,
      foldCount: 3,
      warmupBars: 80,
    });
    candidates[variant.name] = {
      name: variant.name,
      rule: variant.rule,
      dataStatus: variantDataStatus(variant, { ...sample, takerFlowCandles }),
      ...compactReport(report, entryTimeframe),
      validation: temporal,
      walkForward,
      promotionGate: passesPromotionGate(report, temporal.outOfSample, walkForward.aggregate),
    };
    await onProgress(55 + Math.floor(((index + 1) / variants.length) * 40));
  }

  const funnels: Record<string, CandidateFunnel> = {
    FUNDING_CROWDING_REVERSION_HYPOTHESIS: buildFundingDistribution({ entryTimeframe, fundingTimeframe }),
    TAKER_FLOW_REJECTION_HYPOTHESIS: buildTakerFlowFunnel({ entryTimeframe, higherTimeframe }),
    LIQUIDATION_RECLAIM_HYPOTHESIS: buildLiquidationReclaimFunnel({ entryTimeframe, higherTimeframe, metricsTimeframe }),
  };

  const missing = Object.values(candidates).filter((candidate) => candidate.dataStatus === 'MISSING_DATA').map((candidate) => candidate.name);
  return {
    version: 1,
    symbol,
    sample,
    funnels,
    baseline: {
      ...compactReport(baseline, entryTimeframe),
      validation,
      walkForward: baselineWalkForward,
      promotionGate: baselinePromotionGate,
    },
    candidates,
    notes: [
      'Full-history result dihitung server-side oleh research worker atau CLI lokal, bukan request browser.',
      'Semua candle harus closed; stop dan target pada candle yang sama memakai asumsi stop-first konservatif.',
      'Candidate tetap research-only dan tidak mengubah paper/live rule.',
      ...(missing.length > 0
        ? [`Data berikut tidak tersedia pada periode ini sehingga tidak bisa menjadi bukti menolak hipotesis: ${missing.join(', ')}.`]
        : []),
      ...(takerFlowCandles === 0
        ? ['Kolom taker flow kosong pada seluruh candle; TAKER_FLOW_REJECTION_HYPOTHESIS butuh archive backfill ulang.']
        : []),
    ],
  };
}
