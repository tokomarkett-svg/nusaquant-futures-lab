import { NextResponse } from 'next/server';
import { getWebDb } from '../../../../lib/webdb';

export const dynamic = 'force-dynamic';

const SESSIONS = {
  BTCUSDT: '00000000-0000-4000-8000-000000000001',
  ETHUSDT: '00000000-0000-4000-8000-000000000002',
  ADAUSDT: '00000000-0000-4000-8000-000000000003',
  ZECUSDT: '00000000-0000-4000-8000-000000000004',
  UNIUSDT: '00000000-0000-4000-8000-000000000005',
  RUNEUSDT: '00000000-0000-4000-8000-000000000006',
} as const;
type SupportedSymbol = keyof typeof SESSIONS;
type Action = 'start' | 'pause' | 'approve' | 'emergency';

function resolveTarget(value: string | null | undefined): { symbol: SupportedSymbol; sessionId: string } {
  const symbol = value?.toUpperCase() as SupportedSymbol;
  return symbol in SESSIONS ? { symbol, sessionId: SESSIONS[symbol] } : { symbol: 'BTCUSDT', sessionId: SESSIONS.BTCUSDT };
}

async function ensureSession(target: { symbol: SupportedSymbol; sessionId: string }) {
  const db = getWebDb();
  const existing = await db.getBotSession(target.sessionId);
  if (existing) return { data: existing, error: null };
  try {
    const created = await db.ensureBotSession({
      id: target.sessionId,
      name: `NusaQuant ${target.symbol} paper bot`,
      status: 'IDLE',
      mode: 'PAPER_APPROVAL',
      symbol: target.symbol,
      timezone: 'Asia/Jakarta',
      risk_fraction: 0.0025,
      daily_loss_limit: 0.01,
    });
    return { data: created, error: null };
  } catch (error) {
    return { data: null, error: error instanceof Error ? error.message : 'Gagal membuat sesi.' };
  }
}

export async function GET(request: Request) {
  const target = resolveTarget(new URL(request.url).searchParams.get('symbol'));
  const result = await ensureSession(target);
  if (!result.data) {
    return NextResponse.json({ ok: false, configured: true, error: result.error }, { status: 502 });
  }
  const db = getWebDb();
  return NextResponse.json({
    ok: true,
    configured: true,
    session: result.data,
    latestSignal: await db.latestSignal(target.sessionId),
    position: (await db.listPositions(target.sessionId, { status: 'OPEN', limit: 1 }))[0] ?? null,
    latestCandle: (await db.latestCandles(target.symbol, '15m', 1))[0] ?? null,
    serverTime: new Date().toISOString(),
  });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({})) as { action?: Action; symbol?: string };
  const target = resolveTarget(body.symbol);
  const result = await ensureSession(target);
  if (!result.data) {
    return NextResponse.json({ ok: false, configured: true, error: result.error }, { status: 502 });
  }

  const action = body.action;
  if (action === 'approve' && result.data.status !== 'WAITING_APPROVAL') {
    return NextResponse.json({ ok: false, error: 'Belum ada signal paper yang menunggu approval.' }, { status: 409 });
  }
  const nextStatus = action === 'start' ? 'RUNNING' : action === 'pause' ? 'PAUSED' : action === 'approve' ? 'POSITION_OPEN' : action === 'emergency' ? 'EMERGENCY' : null;
  if (!nextStatus) return NextResponse.json({ ok: false, error: 'Action tidak valid.' }, { status: 400 });

  const db = getWebDb();
  const updated = await db.updateBotSessionStatus(target.sessionId, nextStatus, result.data.status);
  if (!updated) return NextResponse.json({ ok: false, error: 'Status sesi berubah di tengah jalan; muat ulang dan coba lagi.' }, { status: 409 });
  return NextResponse.json({
    ok: true,
    configured: true,
    session: updated,
    latestSignal: await db.latestSignal(target.sessionId),
    position: (await db.listPositions(target.sessionId, { status: 'OPEN', limit: 1 }))[0] ?? null,
    latestCandle: (await db.latestCandles(target.symbol, '15m', 1))[0] ?? null,
    serverTime: new Date().toISOString(),
  });
}
