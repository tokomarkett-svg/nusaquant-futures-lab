import { NextResponse } from 'next/server';
import { fetchPrices } from '../../../lib/binance';

export const dynamic = 'force-dynamic';

/** Harga terakhir semua pair USDT — satu request upstream, dipakai untuk tick live di papan. */
export async function GET() {
  try {
    const prices = await fetchPrices();
    return NextResponse.json({ ok: true, at: new Date().toISOString(), prices });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : String(error), prices: {} });
  }
}
