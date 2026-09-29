import { NextResponse } from 'next/server';
import { isOperatorAuthConfigured, operatorFrom, operatorNotConfigured, operatorUnauthorized } from '../../../../lib/operator';
import { demoReadyTicket } from '../../../../lib/demo-readiness';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  if (!isOperatorAuthConfigured()) return operatorNotConfigured();
  const operator = operatorFrom(request);
  if (!operator) return operatorUnauthorized();
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
