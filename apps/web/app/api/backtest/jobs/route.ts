import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const SYMBOLS = new Set(['BTCUSDT', 'ETHUSDT']);

type JobRow = {
  id: string;
  symbol: string;
  status: string;
  progress: number;
  requested_at: string;
  started_at: string | null;
  completed_at: string | null;
  result: unknown;
  error: string | null;
};

function getClient() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function GET() {
  const client = getClient();
  if (!client) return NextResponse.json({ ok: false, error: 'Research job server environment belum dikonfigurasi.' }, { status: 503 });
  const result = await client
    .from('research_backtest_jobs')
    .select('id,symbol,status,progress,requested_at,started_at,completed_at,result,error')
    .order('requested_at', { ascending: false })
    .limit(10);
  if (result.error) return NextResponse.json({ ok: false, error: result.error.message }, { status: 502 });
  return NextResponse.json({ ok: true, jobs: (result.data ?? []) as JobRow[] });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({})) as { symbol?: string };
  const symbol = body.symbol?.toUpperCase() ?? 'BTCUSDT';
  if (!SYMBOLS.has(symbol)) return NextResponse.json({ ok: false, error: 'Symbol research belum tersedia.' }, { status: 400 });

  const client = getClient();
  if (!client) return NextResponse.json({ ok: false, error: 'Research job server environment belum dikonfigurasi.' }, { status: 503 });

  const active = await client
    .from('research_backtest_jobs')
    .select('id,symbol,status,progress,requested_at,started_at,completed_at,result,error')
    .eq('symbol', symbol)
    .in('status', ['QUEUED', 'RUNNING'])
    .order('requested_at', { ascending: false })
    .limit(1)
    .maybeSingle<JobRow>();
  if (active.error) return NextResponse.json({ ok: false, error: active.error.message }, { status: 502 });
  if (active.data) return NextResponse.json({ ok: true, job: active.data, reused: true });

  const inserted = await client
    .from('research_backtest_jobs')
    .insert({ symbol, status: 'QUEUED', progress: 0, metadata: { source: 'dashboard' } })
    .select('id,symbol,status,progress,requested_at,started_at,completed_at,result,error')
    .single<JobRow>();
  if (inserted.error) return NextResponse.json({ ok: false, error: inserted.error.message }, { status: 502 });
  return NextResponse.json({ ok: true, job: inserted.data }, { status: 202 });
}
