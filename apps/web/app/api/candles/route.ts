import { NextResponse } from 'next/server';
import { getWebDb } from '../../../lib/webdb';

export const dynamic = 'force-dynamic';

const INTERVALS = new Set(['15m', '1h', '4h']);

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const symbol = (params.get('symbol') ?? 'BTCUSDT').toUpperCase();
  const interval = INTERVALS.has(params.get('interval') ?? '') ? (params.get('interval') as string) : '15m';
  try {
    const db = getWebDb();
    const rows = await db.candlesPage(symbol, interval, 0, 96, true);
    const candles = rows.reverse().map((row) => ({
      open_time: row.open_time,
      open: row.open,
      high: row.high,
      low: row.low,
      close: row.close,
      volume: row.volume,
      quote_volume: row.quote_volume,
      taker_buy_volume: row.taker_buy_volume,
      taker_buy_quote_volume: row.taker_buy_quote_volume,
      trade_count: row.trade_count,
    }));
    return NextResponse.json({ ok: true, candles });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'Gagal membaca candle.', candles: [] });
  }
}
