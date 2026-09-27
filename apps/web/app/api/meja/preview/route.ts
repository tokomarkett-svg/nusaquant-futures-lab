import { NextResponse } from 'next/server';
import { operatorFrom } from '../../../../lib/operator';
import { manualTicket } from '../../../../lib/manual-ticket';
import { simbolTestnet } from '../../../../lib/testnet';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const operator = await operatorFrom(request);
  if (operator instanceof NextResponse) return operator;
  const url = new URL(request.url);
  const symbol = (url.searchParams.get('symbol') ?? '').toUpperCase();
  const side = url.searchParams.get('side');
  if (side !== 'LONG' && side !== 'SHORT') return NextResponse.json({ ok: false, error: 'Pilih LONG atau SHORT.' }, { status: 400 });
  try {
    const ticket = await manualTicket(symbol, side);
    const symbols = await simbolTestnet(); // a failed Testnet exchangeInfo MUST NOT be interpreted as approval
    if (!symbols.has(symbol)) return NextResponse.json({ ok: false, error: 'Simbol ini tidak tersedia di Demo/Testnet; jangan kirim order.' }, { status: 409 });
    return NextResponse.json({ ok: true, environment: 'TESTNET', liveLocked: true, ticket,
      executionEnabled: process.env.DEMO_EXECUTION_ENABLED === '1' });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'Tiket tidak dapat diperiksa.' }, { status: 409 });
  }
}
