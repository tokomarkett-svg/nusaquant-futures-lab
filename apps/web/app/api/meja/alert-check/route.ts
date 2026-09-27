import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { demoReadyTicket } from '../../../../lib/demo-readiness';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/** Worker-only preflight: EXACTLY the same server decision as /api/meja/preview.
 * Read-only, fail-closed, no user token, no exchange order. The shared worker token
 * must be in a POST body (not URL/log). A missing token blocks all ready alarms. */
export async function POST(request: Request) {
  const expected = (process.env.WORKER_EXEC_TOKEN ?? '').trim();
  const body = await request.json().catch(() => null) as
    | { token?: unknown; symbol?: unknown; side?: unknown; setupKey?: unknown }
    | null;
  const provided = typeof body?.token === 'string' ? body.token : '';
  const first = Buffer.from(expected);
  const second = Buffer.from(provided);
  if (!expected || first.length !== second.length || !timingSafeEqual(first, second)) {
    return NextResponse.json({ ok: false, error: 'Akses worker ditolak.' }, { status: 401 });
  }
  const symbol = typeof body?.symbol === 'string' ? body.symbol.toUpperCase() : '';
  const side = body?.side;
  if (!/^[A-Z0-9]{2,24}USDT$/.test(symbol) || (side !== 'LONG' && side !== 'SHORT') || typeof body?.setupKey !== 'string') {
    return NextResponse.json({ ok: false, error: 'Tiket tidak sah.' }, { status: 400 });
  }
  try {
    const ticket = await demoReadyTicket(symbol, side);
    if (ticket.setupKey !== body.setupKey) throw new Error('Setup telah berubah atau basi.');
    return NextResponse.json({ ok: true, setupKey: ticket.setupKey, entry: ticket.entry,
      stop: ticket.stop, target: ticket.target, expiresAt: ticket.expiresAt });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : 'Tiket belum siap.' }, { status: 409 });
  }
}
