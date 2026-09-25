import { NextResponse } from 'next/server';
import { coinDetail } from '../../../../lib/binance';

export const dynamic = 'force-dynamic';

const ALLOWED = new Set(['5m', '15m', '1h', '4h']);

export async function GET(request: Request, context: { params: Promise<{ symbol: string }> }) {
  const { symbol } = await context.params;
  const requested = new URL(request.url).searchParams.get('interval') ?? '15m';
  const interval = ALLOWED.has(requested) ? requested : '15m';
  try {
    const detail = await coinDetail(symbol, interval);
    return NextResponse.json({ ok: true, ...detail });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : String(error) });
  }
}
