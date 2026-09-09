import { runBacktest, type Candle } from '@nusaquant/core';
import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const SYMBOLS = new Set(['BTCUSDT', 'ETHUSDT']);

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

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({})) as { symbol?: string };
  const symbol = body.symbol?.toUpperCase() ?? 'BTCUSDT';
  if (!SYMBOLS.has(symbol)) return NextResponse.json({ ok: false, error: 'Symbol backtest belum tersedia.' }, { status: 400 });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return NextResponse.json({ ok: false, error: 'Supabase public environment belum dikonfigurasi.' }, { status: 503 });

  const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const [higherResult, entryResult] = await Promise.all([
    supabase.from('market_candles').select('open_time,open,high,low,close,volume').eq('symbol', symbol).eq('interval', '1h').order('open_time', { ascending: true }).limit(500),
    supabase.from('market_candles').select('open_time,open,high,low,close,volume').eq('symbol', symbol).eq('interval', '15m').order('open_time', { ascending: true }).limit(500),
  ]);
  if (higherResult.error || entryResult.error) {
    return NextResponse.json({ ok: false, error: higherResult.error?.message ?? entryResult.error?.message ?? 'Candle query gagal.' }, { status: 502 });
  }

  const higherTimeframe = ((higherResult.data ?? []) as CandleRow[]).map(toCandle);
  const entryTimeframe = ((entryResult.data ?? []) as CandleRow[]).map(toCandle);
  const report = runBacktest({
    symbol,
    higherTimeframe,
    entryTimeframe,
    config: {
      initialEquity: 10_000,
      riskFraction: 0.0025,
      feeRate: 0.0004,
      slippageRate: 0.0002,
      fundingRatePerBar: 0.00001,
      maxBarsInTrade: 96,
      timezone: 'Asia/Jakarta',
    },
  });

  return NextResponse.json({
    ok: true,
    symbol,
    sample: { higherCandles: higherTimeframe.length, entryCandles: entryTimeframe.length },
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
      notes: report.notes,
    },
  });
}
