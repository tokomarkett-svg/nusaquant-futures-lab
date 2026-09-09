import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const SESSIONS = {
  BTCUSDT: '00000000-0000-4000-8000-000000000001',
  ETHUSDT: '00000000-0000-4000-8000-000000000002',
} as const;
type SupportedSymbol = keyof typeof SESSIONS;
type Action = 'start' | 'pause' | 'approve' | 'emergency';
type LatestSignal = { decision: string; stage: string; timing: string; quality_score: number; evaluated_at: string; blockers: string[] };
type LatestPosition = { side: string; symbol: string; quantity: number | string; entry_price: number | string; stop_loss: number | string; take_profit: number | string; opened_at: string };

function getAdminClient() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) return null;
  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function resolveTarget(value: string | null | undefined): { symbol: SupportedSymbol; sessionId: string } {
  const symbol = value?.toUpperCase() as SupportedSymbol;
  return symbol in SESSIONS ? { symbol, sessionId: SESSIONS[symbol] } : { symbol: 'BTCUSDT', sessionId: SESSIONS.BTCUSDT };
}

async function latestSignal(client: NonNullable<ReturnType<typeof getAdminClient>>, sessionId: string): Promise<LatestSignal | null> {
  const result = await client
    .from('signal_evaluations')
    .select('decision,stage,timing,quality_score,evaluated_at,blockers')
    .eq('bot_session_id', sessionId)
    .order('evaluated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (result.error) return null;
  return result.data as LatestSignal | null;
}

async function latestPosition(client: NonNullable<ReturnType<typeof getAdminClient>>, sessionId: string): Promise<LatestPosition | null> {
  const result = await client
    .from('paper_positions')
    .select('side,symbol,quantity,entry_price,stop_loss,take_profit,opened_at')
    .eq('bot_session_id', sessionId)
    .eq('status', 'OPEN')
    .order('opened_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (result.error) return null;
  return result.data as LatestPosition | null;
}

async function ensureSession(target: { symbol: SupportedSymbol; sessionId: string }) {
  const client = getAdminClient();
  if (!client) return { client: null, data: null, error: 'Server Supabase key belum dikonfigurasi.' };

  const existing = await client.from('bot_sessions').select('*').eq('id', target.sessionId).maybeSingle();
  if (existing.error) return { client, data: null, error: existing.error.message };
  if (existing.data) return { client, data: existing.data, error: null };

  const created = await client.from('bot_sessions').insert({
    id: target.sessionId,
    name: `NusaQuant ${target.symbol} paper bot`,
    status: 'IDLE',
    mode: 'PAPER_APPROVAL',
    symbol: target.symbol,
    timezone: 'Asia/Jakarta',
    risk_fraction: 0.0025,
    daily_loss_limit: 0.01,
  }).select('*').single();
  return { client, data: created.data, error: created.error?.message ?? null };
}

export async function GET(request: Request) {
  const target = resolveTarget(new URL(request.url).searchParams.get('symbol'));
  const result = await ensureSession(target);
  if (!result.data) {
    return NextResponse.json({ ok: false, configured: Boolean(result.client), error: result.error }, { status: result.client ? 502 : 503 });
  }
  return NextResponse.json({
    ok: true,
    configured: true,
    session: result.data,
    latestSignal: await latestSignal(result.client!, target.sessionId),
    position: await latestPosition(result.client!, target.sessionId),
  });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({})) as { action?: Action; symbol?: string };
  const target = resolveTarget(body.symbol);
  const result = await ensureSession(target);
  if (!result.client || !result.data) {
    return NextResponse.json({ ok: false, configured: Boolean(result.client), error: result.error }, { status: result.client ? 502 : 503 });
  }

  const action = body.action;
  if (action === 'approve' && result.data.status !== 'WAITING_APPROVAL') {
    return NextResponse.json({ ok: false, error: 'Belum ada signal paper yang menunggu approval.' }, { status: 409 });
  }
  const nextStatus = action === 'start' ? 'RUNNING' : action === 'pause' ? 'PAUSED' : action === 'approve' ? 'POSITION_OPEN' : action === 'emergency' ? 'EMERGENCY' : null;
  if (!nextStatus) return NextResponse.json({ ok: false, error: 'Action tidak valid.' }, { status: 400 });

  const updated = await result.client.from('bot_sessions').update({ status: nextStatus }).eq('id', target.sessionId).eq('status', result.data.status).select('*').single();
  if (updated.error) return NextResponse.json({ ok: false, error: updated.error.message }, { status: 502 });
  return NextResponse.json({
    ok: true,
    configured: true,
    session: updated.data,
    latestSignal: await latestSignal(result.client!, target.sessionId),
    position: await latestPosition(result.client!, target.sessionId),
  });
}
