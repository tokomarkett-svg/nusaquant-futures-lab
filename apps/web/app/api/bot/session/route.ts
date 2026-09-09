import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const DEFAULT_SESSION_ID = '00000000-0000-4000-8000-000000000001';
type Action = 'start' | 'pause' | 'approve' | 'emergency';

function getAdminClient() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) return null;
  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function ensureSession() {
  const client = getAdminClient();
  if (!client) return { client: null, data: null, error: 'Server Supabase key belum dikonfigurasi.' };

  const existing = await client.from('bot_sessions').select('*').eq('id', DEFAULT_SESSION_ID).maybeSingle();
  if (existing.error) return { client, data: null, error: existing.error.message };
  if (existing.data) return { client, data: existing.data, error: null };

  const created = await client.from('bot_sessions').insert({
    id: DEFAULT_SESSION_ID,
    name: 'NusaQuant paper bot',
    status: 'IDLE',
    mode: 'PAPER_APPROVAL',
    symbol: 'BTCUSDT',
    timezone: 'Asia/Jakarta',
    risk_fraction: 0.0025,
    daily_loss_limit: 0.01,
  }).select('*').single();
  return { client, data: created.data, error: created.error?.message ?? null };
}

export async function GET() {
  const result = await ensureSession();
  if (!result.data) {
    return NextResponse.json({ ok: false, configured: Boolean(result.client), error: result.error }, { status: result.client ? 502 : 503 });
  }
  return NextResponse.json({ ok: true, configured: true, session: result.data });
}

export async function POST(request: Request) {
  const result = await ensureSession();
  if (!result.client || !result.data) {
    return NextResponse.json({ ok: false, configured: Boolean(result.client), error: result.error }, { status: result.client ? 502 : 503 });
  }

  const body = await request.json().catch(() => ({})) as { action?: Action };
  const action = body.action;
  const nextStatus = action === 'start' ? 'RUNNING' : action === 'pause' ? 'PAUSED' : action === 'approve' ? 'POSITION_OPEN' : action === 'emergency' ? 'EMERGENCY' : null;
  if (!nextStatus) return NextResponse.json({ ok: false, error: 'Action tidak valid.' }, { status: 400 });

  const updated = await result.client.from('bot_sessions').update({ status: nextStatus }).eq('id', DEFAULT_SESSION_ID).select('*').single();
  if (updated.error) return NextResponse.json({ ok: false, error: updated.error.message }, { status: 502 });
  return NextResponse.json({ ok: true, configured: true, session: updated.data });
}
