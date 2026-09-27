import { NextResponse } from 'next/server';
/** PMB one-click entries retired. Chris Testnet needs operator login, new preview & per-ticket approval. */
export async function POST() {
  return NextResponse.json({ ok: false, error: 'Tombol PMB lama dipensiunkan. Tiket Chris hanya lewat login dan persetujuan Demo per tiket.' }, { status: 423 });
}
