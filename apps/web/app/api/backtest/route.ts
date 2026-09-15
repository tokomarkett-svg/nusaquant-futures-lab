import { runBacktest, runTemporalValidation, runWalkForwardValidation, type Candle } from '@nusaquant/core';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const SYMBOLS = new Set(['BTCUSDT', 'ETHUSDT']);
const PAGE_SIZE = 1000;
// Keep the research request bounded for the serverless runtime. This still
// preserves the same 15M/1H rule and leaves enough history for 30+ OOS trades.
const MAX_ENTRY_CANDLES = 4_500;
const MAX_HIGHER_CANDLES = 1_500;

type CandleRow = {
  open_time: string;
  open: number | string;
  high: number | string;
  low: number | string;
  close: number | string;
  volume: number | string;
};

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

function reportSummary(report: ReturnType<typeof runBacktest>, periodCandles: Candle[]) {
  return {
    periodStart: periodCandles[0]?.time ?? null,
    periodEnd: periodCandles.at(-1)?.time ?? null,
    sampleCandles: periodCandles.length,
    totalTrades: report.totalTrades,
    winningTrades: report.winningTrades,
    losingTrades: report.losingTrades,
    winRate: report.winRate,
    profitFactor: report.profitFactor,
    expectancyR: report.expectancyR,
    netPnl: report.netPnl,
    grossWins: report.trades.filter((trade) => trade.grossPnl > 0).reduce((sum, trade) => sum + trade.grossPnl, 0),
    grossLosses: Math.abs(report.trades.filter((trade) => trade.grossPnl < 0).reduce((sum, trade) => sum + trade.grossPnl, 0)),
    maxDrawdown: report.maxDrawdown,
    maxDrawdownPct: report.maxDrawdownPct,
    gate: report.totalTrades < 30
      ? 'NOT_READY_SAMPLE'
      : report.profitFactor !== null && report.profitFactor > 1 && report.expectancyR > 0
        ? 'PASS_RESEARCH_GATE'
        : 'FAIL_NEGATIVE_EXPECTANCY',
  } as const;
}

async function readCandles(supabase: SupabaseClient, symbol: string, interval: string, maxCandles: number): Promise<CandleRow[]> {
  const rows: CandleRow[] = [];
  for (let offset = 0; offset < maxCandles; offset += PAGE_SIZE) {
    const result = await supabase
      .from('market_candles')
      .select('open_time,open,high,low,close,volume')
      .eq('symbol', symbol)
      .eq('interval', interval)
      .order('open_time', { ascending: false })
      .range(offset, offset + PAGE_SIZE - 1);
    if (result.error) throw new Error(result.error.message);
    const page = (result.data ?? []) as CandleRow[];
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
  }
  return rows.reverse();
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({})) as { symbol?: string };
  const symbol = body.symbol?.toUpperCase() ?? 'BTCUSDT';
  if (!SYMBOLS.has(symbol)) return NextResponse.json({ ok: false, error: 'Symbol backtest belum tersedia.' }, { status: 400 });

  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  // API route runs server-side; never expose this key to the browser.
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return NextResponse.json({ ok: false, error: 'Supabase server environment belum dikonfigurasi.' }, { status: 503 });

  const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  let higherTimeframe: Candle[];
  let entryTimeframe: Candle[];
  try {
    const [higherRows, entryRows] = await Promise.all([
      readCandles(supabase, symbol, '1h', MAX_HIGHER_CANDLES),
      readCandles(supabase, symbol, '15m', MAX_ENTRY_CANDLES),
    ]);
    higherTimeframe = higherRows.map(toCandle);
    entryTimeframe = entryRows.map(toCandle);
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : 'Candle query gagal.' }, { status: 502 });
  }

  if (higherTimeframe.length < 220 || entryTimeframe.length < 80) {
    return NextResponse.json({
      ok: false,
      error: `${symbol} belum memiliki cukup data untuk backtest: ${higherTimeframe.length} candle 1H dan ${entryTimeframe.length} candle 15M; minimum 220/80.`,
      sample: { higherCandles: higherTimeframe.length, entryCandles: entryTimeframe.length },
    }, { status: 422 });
  }

  const config = {
    initialEquity: 10_000,
    riskFraction: 0.0025,
    feeRate: 0.0004,
    slippageRate: 0.0002,
    fundingRatePerBar: 0.00001,
    maxBarsInTrade: 96,
    timezone: 'Asia/Jakarta',
  } as const;
  try {
    const report = runBacktest({ symbol, higherTimeframe, entryTimeframe, config });
  const validation = runTemporalValidation({
    symbol,
    higherTimeframe,
    entryTimeframe,
    config,
    trainFraction: 0.7,
    warmupBars: 80,
  });
  const walkForward = runWalkForwardValidation({
    symbol,
    higherTimeframe,
    entryTimeframe,
    config,
    foldCount: 3,
    warmupBars: 80,
  });
  const hypothesisConfig = { ...config, entryPolicy: 'TRIAD_TIMING_HYPOTHESIS' as const };
  const hypothesisReport = runBacktest({ symbol, higherTimeframe, entryTimeframe, config: hypothesisConfig });
  const hypothesisValidation = runTemporalValidation({
    symbol,
    higherTimeframe,
    entryTimeframe,
    config: hypothesisConfig,
    trainFraction: 0.7,
    warmupBars: 80,
  });
  const retestConfig = { ...config, entryPolicy: 'TRIAD_RETEST_HYPOTHESIS' as const };
  const retestReport = runBacktest({ symbol, higherTimeframe, entryTimeframe, config: retestConfig });
  const retestValidation = runTemporalValidation({
    symbol,
    higherTimeframe,
    entryTimeframe,
    config: retestConfig,
    trainFraction: 0.7,
    warmupBars: 80,
  });
  const followThroughConfig = { ...config, entryPolicy: 'TRIAD_FOLLOW_THROUGH_HYPOTHESIS' as const };
  const followThroughReport = runBacktest({ symbol, higherTimeframe, entryTimeframe, config: followThroughConfig });
  const followThroughValidation = runTemporalValidation({
    symbol,
    higherTimeframe,
    entryTimeframe,
    config: followThroughConfig,
    trainFraction: 0.7,
    warmupBars: 80,
  });
  const profitProtectionConfig = { ...config, exitPolicy: 'MFE_PROFIT_PROTECTION_HYPOTHESIS' as const };
  const profitProtectionReport = runBacktest({ symbol, higherTimeframe, entryTimeframe, config: profitProtectionConfig });
  const profitProtectionValidation = runTemporalValidation({
    symbol,
    higherTimeframe,
    entryTimeframe,
    config: profitProtectionConfig,
    trainFraction: 0.7,
    warmupBars: 80,
  });
  const meanReversionConfig = { ...config, entryPolicy: 'MEAN_REVERSION_REJECTION_HYPOTHESIS' as const };
  const meanReversionReport = runBacktest({ symbol, higherTimeframe, entryTimeframe, config: meanReversionConfig });
  const meanReversionValidation = runTemporalValidation({
    symbol,
    higherTimeframe,
    entryTimeframe,
    config: meanReversionConfig,
    trainFraction: 0.7,
    warmupBars: 80,
  });
  const breakoutConfig = { ...config, entryPolicy: 'VOLATILITY_EXPANSION_BREAKOUT_HYPOTHESIS' as const };
  const breakoutReport = runBacktest({ symbol, higherTimeframe, entryTimeframe, config: breakoutConfig });
  const breakoutValidation = runTemporalValidation({
    symbol,
    higherTimeframe,
    entryTimeframe,
    config: breakoutConfig,
    trainFraction: 0.7,
    warmupBars: 80,
  });

  return NextResponse.json({
    ok: true,
    symbol,
    sample: { higherCandles: higherTimeframe.length, entryCandles: entryTimeframe.length, latestEntryTime: entryTimeframe.at(-1)?.time ?? null },
    report: {
      initialEquity: report.initialEquity,
      finalEquity: report.finalEquity,
      netPnl: report.netPnl,
      totalTrades: report.totalTrades,
      winningTrades: report.winningTrades,
      losingTrades: report.losingTrades,
      winRate: report.winRate,
      profitFactor: report.profitFactor,
      expectancyR: report.expectancyR,
      maxDrawdown: report.maxDrawdown,
      maxDrawdownPct: report.maxDrawdownPct,
      gate: report.totalTrades < 30
        ? 'NOT_READY_SAMPLE'
        : report.profitFactor !== null && report.profitFactor > 1 && report.expectancyR > 0
          ? 'PASS_RESEARCH_GATE'
          : 'FAIL_NEGATIVE_EXPECTANCY',
      trades: report.trades.map((trade) => ({
        side: trade.side,
        entryTime: trade.entryTime,
        exitTime: trade.exitTime,
        entry: trade.entry,
        exit: trade.exit,
        netPnl: trade.netPnl,
        costs: trade.costs,
        rMultiple: trade.rMultiple,
        exitReason: trade.exitReason,
        qualityScore: trade.qualityScore,
        regime: trade.regime,
        barsHeld: trade.barsHeld,
        triggerRangeAtr: trade.triggerRangeAtr,
        entryDistanceToEmaAtr: trade.entryDistanceToEmaAtr,
        stopDistanceAtr: trade.stopDistanceAtr,
        maxFavorableExcursionR: trade.maxFavorableExcursionR,
        maxAdverseExcursionR: trade.maxAdverseExcursionR,
      })),
      diagnostics: report.diagnostics,
      executionAudit: report.executionAudit,
      excursionAudit: report.excursionAudit,
      validation,
      walkForward,
      researchVariant: {
        name: 'TRIAD_TIMING_HYPOTHESIS',
        rule: 'triggerRangeAtr < 1.2 dan entryDistanceToEmaAtr >= 0.25; research-only, bukan rule paper/live.',
        baseline: reportSummary(report, entryTimeframe),
        baselineValidation: validation,
        candidate: reportSummary(hypothesisReport, entryTimeframe),
        candidateValidation: hypothesisValidation,
      },
      researchRetestVariant: {
        name: 'TRIAD_RETEST_HYPOTHESIS',
        rule: 'Setup trigger harus diikuti retest level candle sebelumnya dalam maksimal 3 candle; close harus kembali menahan level. Research-only, bukan rule paper/live.',
        baseline: reportSummary(report, entryTimeframe),
        baselineValidation: validation,
        candidate: reportSummary(retestReport, entryTimeframe),
        candidateValidation: retestValidation,
      },
      researchFollowThroughVariant: {
        name: 'TRIAD_FOLLOW_THROUGH_HYPOTHESIS',
        rule: 'Setelah trigger close, candle berikutnya harus follow-through searah tanpa menembus low/high trigger; entry direbase pada close candle konfirmasi. Research-only, bukan rule paper/live.',
        baseline: reportSummary(report, entryTimeframe),
        baselineValidation: validation,
        candidate: reportSummary(followThroughReport, entryTimeframe),
        candidateValidation: followThroughValidation,
      },
      researchProfitProtectionVariant: {
        name: 'MFE_PROFIT_PROTECTION_HYPOTHESIS',
        rule: 'Entry baseline tetap; setelah candle closed mencapai +0.5R favorable excursion, stop dipindahkan ke entry pada candle berikutnya. Research-only, bukan rule paper/live.',
        baseline: reportSummary(report, entryTimeframe),
        baselineValidation: validation,
        candidate: reportSummary(profitProtectionReport, entryTimeframe),
        candidateValidation: profitProtectionValidation,
      },
      researchMeanReversionVariant: {
        name: 'MEAN_REVERSION_REJECTION_HYPOTHESIS',
        rule: 'Range higher timeframe, stretch minimal 1.2 ATR dari EMA20, rejection candle, RSI extreme, target kembali ke EMA20. Research-only, bukan rule paper/live.',
        baseline: reportSummary(report, entryTimeframe),
        baselineValidation: validation,
        candidate: reportSummary(meanReversionReport, entryTimeframe),
        candidateValidation: meanReversionValidation,
      },
      researchBreakoutVariant: {
        name: 'VOLATILITY_EXPANSION_BREAKOUT_HYPOTHESIS',
        rule: 'Trend higher timeframe, close menembus Donchian 20 candle, range minimal 1.1 ATR, volume minimal 1.2x rata-rata. Research-only, bukan rule paper/live.',
        baseline: reportSummary(report, entryTimeframe),
        baselineValidation: validation,
        candidate: reportSummary(breakoutReport, entryTimeframe),
        candidateValidation: breakoutValidation,
      },
      notes: [
        ...report.notes,
        `Server research sample dibatasi ke ${MAX_ENTRY_CANDLES} candle 15M dan ${MAX_HIGHER_CANDLES} candle 1H agar endpoint tidak timeout; gunakan hasil ini untuk screening, bukan promosi live.`,
      ],
    },
  });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? `Backtest ${symbol} gagal: ${error.message}` : `Backtest ${symbol} gagal.` }, { status: 500 });
  }
}
