import { runBacktest, runTemporalValidation, runWalkForwardValidation, type Candle } from '@nusaquant/core';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const SYMBOLS = new Set(['BTCUSDT', 'ETHUSDT']);
const PAGE_SIZE = 1000;
const MAX_CANDLES = 20_000;

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
    grossWins: report.trades.filter((trade) => trade.netPnl > 0).reduce((sum, trade) => sum + trade.netPnl, 0),
    grossLosses: Math.abs(report.trades.filter((trade) => trade.netPnl < 0).reduce((sum, trade) => sum + trade.netPnl, 0)),
    maxDrawdown: report.maxDrawdown,
    maxDrawdownPct: report.maxDrawdownPct,
    gate: report.totalTrades < 30
      ? 'NOT_READY_SAMPLE'
      : report.profitFactor !== null && report.profitFactor > 1 && report.expectancyR > 0
        ? 'PASS_RESEARCH_GATE'
        : 'FAIL_NEGATIVE_EXPECTANCY',
  } as const;
}

async function readCandles(supabase: SupabaseClient, symbol: string, interval: string): Promise<CandleRow[]> {
  const rows: CandleRow[] = [];
  for (let offset = 0; offset < MAX_CANDLES; offset += PAGE_SIZE) {
    const result = await supabase
      .from('market_candles')
      .select('open_time,open,high,low,close,volume')
      .eq('symbol', symbol)
      .eq('interval', interval)
      .order('open_time', { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);
    if (result.error) throw new Error(result.error.message);
    const page = (result.data ?? []) as CandleRow[];
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
  }
  return rows;
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({})) as { symbol?: string };
  const symbol = body.symbol?.toUpperCase() ?? 'BTCUSDT';
  if (!SYMBOLS.has(symbol)) return NextResponse.json({ ok: false, error: 'Symbol backtest belum tersedia.' }, { status: 400 });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return NextResponse.json({ ok: false, error: 'Supabase public environment belum dikonfigurasi.' }, { status: 503 });

  const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  let higherTimeframe: Candle[];
  let entryTimeframe: Candle[];
  try {
    const [higherRows, entryRows] = await Promise.all([
      readCandles(supabase, symbol, '1h'),
      readCandles(supabase, symbol, '15m'),
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
      })),
      diagnostics: report.diagnostics,
      executionAudit: report.executionAudit,
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
      notes: report.notes,
    },
  });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? `Backtest ${symbol} gagal: ${error.message}` : `Backtest ${symbol} gagal.` }, { status: 500 });
  }
}
