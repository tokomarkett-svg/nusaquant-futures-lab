import { NextResponse } from 'next/server';
import { coinDetail, dataMarket, ticketTimeValid } from '../../../../lib/binance';
import { demoReadyTicket } from '../../../../lib/demo-readiness';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const ALLOWED = new Set(['5m', '15m', '1h', '4h']);

export async function GET(request: Request, context: { params: Promise<{ symbol: string }> }) {
  const { symbol } = await context.params;
  const requested = new URL(request.url).searchParams.get('interval') ?? '15m';
  const interval = ALLOWED.has(requested) ? requested : '15m';
  try {
    const detail = await coinDetail(symbol, interval);
    detail.demoReadyLong = false;
    detail.demoReadyShort = false;
    if (interval === '15m' && dataMarket() === 'FUTURES') {
      const check = async (side: 'LONG' | 'SHORT'): Promise<boolean> => {
        const setup = side === 'LONG' ? detail.setupLong : detail.setupShort;
        const ticket = side === 'LONG' ? detail.ticketLong : detail.ticketShort;
        const aligned = side === 'LONG' ? detail.gateAlignLong : detail.gateAlignShort;
        if (!aligned || !setup.valid || !ticket?.actionable || !ticketTimeValid(setup.candle2)) return false;
        try {
          const verified = await demoReadyTicket(detail.symbol, side);
          const same = (a: number, b: number) => Math.abs(a - b) <= Math.max(1e-10, Math.abs(b) * 1e-9);
          return verified.setupKey === `${detail.symbol}:${side}:${setup.candle2}`
            && same(verified.entry, ticket.entry) && same(verified.stop, ticket.stop)
            && same(verified.target, ticket.target);
        } catch { return false; }
      };
      [detail.demoReadyLong, detail.demoReadyShort] = await Promise.all([check('LONG'), check('SHORT')]);
    }
    return NextResponse.json({ ok: true, ...detail });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : String(error) });
  }
}
