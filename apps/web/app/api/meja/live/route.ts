import { NextResponse } from 'next/server';

/** Explicit hard lock: no live Binance SDK, credential read, or worker call exists here.
 * Mainnet release requires a new reviewed code change after full Testnet reconciliation. */
export async function POST() {
  return NextResponse.json({ ok: false, liveLocked: true,
    error: 'Order Futures asli belum diaktifkan. Selesaikan uji Demo, audit risiko, dan persetujuan terpisah terlebih dahulu.' }, { status: 423 });
}
