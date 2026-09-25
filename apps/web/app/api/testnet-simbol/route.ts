import { NextResponse } from 'next/server';
import { simbolTestnet } from '../../../lib/testnet';

export const dynamic = 'force-dynamic';

/** Daftar simbol yang tersedia di Binance Futures TESTNET (cache 1 jam di memori server). */
export async function GET() {
  try {
    const symbols = await simbolTestnet();
    return NextResponse.json({ ok: true, symbols: Array.from(symbols) });
  } catch (error) {
    return NextResponse.json({ ok: false, symbols: [], error: error instanceof Error ? error.message : 'gagal ambil daftar testnet' });
  }
}
