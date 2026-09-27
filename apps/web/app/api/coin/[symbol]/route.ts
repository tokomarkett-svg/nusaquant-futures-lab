import { NextResponse } from 'next/server';
import { coinDetail, dataMarket, ticketTimeValid } from '../../../../lib/binance';
import { manualTicket } from '../../../../lib/manual-ticket';
import { simbolTestnet } from '../../../../lib/testnet';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const ALLOWED = new Set(['5m', '15m', '1h', '4h']);

export async function GET(request: Request, context: { params: Promise<{ symbol: string }> }) {
  const { symbol } = await context.params;
  const requested = new URL(request.url).searchParams.get('interval') ?? '15m';
  const interval = ALLOWED.has(requested) ? requested : '15m';
  try {
    const detail = await coinDetail(symbol, interval);
    detail.technicalReadyLong = false;
    detail.technicalReadyShort = false;
    detail.demoReadyLong = false;
    detail.demoReadyShort = false;
    // Arsip chart lama tidak boleh mengeluarkan tiket/arah PMB setelah migrasi.
    detail.ticketLong = null; detail.ticketShort = null;
    detail.setupLong = { ...detail.setupLong, x: null, candle1: null, candle2: null, valid: false, notes: ['Metode PMB dipensiunkan. Buka papan Chris.'], entry: null, stop: null, riskDistance: null };
    detail.setupShort = { ...detail.setupShort, x: null, candle1: null, candle2: null, valid: false, notes: ['Metode PMB dipensiunkan. Buka papan Chris.'], entry: null, stop: null, riskDistance: null };
    detail.gateAlignLong = false; detail.gateAlignShort = false;
    return NextResponse.json({ ok: true, ...detail });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : String(error) });
  }
}
