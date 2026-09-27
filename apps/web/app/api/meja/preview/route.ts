import { NextResponse } from 'next/server';
import { operatorFrom } from '../../../../lib/operator';
import { demoReadyTicket } from '../../../../lib/demo-readiness';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const operator = await operatorFrom(request);
  if (operator instanceof NextResponse) return operator;
  const url = new URL(request.url);
  const symbol = (url.searchParams.get('symbol') ?? '').toUpperCase();
  const side = url.searchParams.get('side');
  if (side !== 'LONG' && side !== 'SHORT') return NextResponse.json({ ok: false, error: 'Pilih LONG atau SHORT.' }, { status: 400 });
  try {
    const ticket = await demoReadyTicket(symbol, side); // same decision as Telegram's worker-only preflight
    return NextResponse.json({ ok: true, environment: 'TESTNET', liveLocked: true, ticket,
      executionEnabled: process.env.DEMO_EXECUTION_ENABLED === '1' });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'Tiket tidak dapat diperiksa.' }, { status: 409 });
  }
}
