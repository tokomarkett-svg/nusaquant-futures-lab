import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const SESSIONS = {
  BTCUSDT: '00000000-0000-4000-8000-000000000001',
  ETHUSDT: '00000000-0000-4000-8000-000000000002',
} as const;
type SupportedSymbol = keyof typeof SESSIONS;

type PaperPositionRow = {
  status: 'OPEN' | 'CLOSED';
  realized_pnl: number | string | null;
  metadata: Record<string, unknown> | null;
};

type EquityRow = {
  equity: number | string;
  realized_pnl: number | string;
  daily_loss: number | string;
  captured_at: string;
};

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

function numeric(value: number | string | null | undefined, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export async function GET(request: Request) {
  const target = resolveTarget(new URL(request.url).searchParams.get('symbol'));
  const client = getAdminClient();
  if (!client) {
    return NextResponse.json({ ok: false, configured: false, error: 'Server Supabase key belum dikonfigurasi.' }, { status: 503 });
  }

  const sessionResult = await client
    .from('bot_sessions')
    .select('id,status,mode,symbol,risk_fraction,daily_loss_limit,updated_at')
    .eq('id', target.sessionId)
    .maybeSingle();
  if (sessionResult.error) return NextResponse.json({ ok: false, configured: true, error: sessionResult.error.message }, { status: 502 });
  if (!sessionResult.data) {
    return NextResponse.json({
      ok: true,
      configured: true,
      symbol: target.symbol,
      session: null,
      equity: 10_000,
      realizedPnl: 0,
      dailyLoss: 0,
      dailyLossLimit: 100,
      riskPerTrade: 25,
      closedTrades: 0,
      openPosition: false,
      signalEvaluations: 0,
      latestEquityAt: null,
      workerHeartbeatAt: null,
    });
  }

  const [equityResult, positionsResult, signalCountResult] = await Promise.all([
    client
      .from('equity_snapshots')
      .select('equity,realized_pnl,daily_loss,captured_at')
      .eq('bot_session_id', target.sessionId)
      .order('captured_at', { ascending: false })
      .limit(1)
      .maybeSingle<EquityRow>(),
    client
      .from('paper_positions')
      .select('status,realized_pnl,metadata')
      .eq('bot_session_id', target.sessionId)
      .eq('symbol', target.symbol)
      .limit(1000),
    client
      .from('signal_evaluations')
      .select('id', { count: 'exact', head: true })
      .eq('bot_session_id', target.sessionId)
      .eq('symbol', target.symbol),
  ]);

  if (equityResult.error) return NextResponse.json({ ok: false, configured: true, error: equityResult.error.message }, { status: 502 });
  if (positionsResult.error) return NextResponse.json({ ok: false, configured: true, error: positionsResult.error.message }, { status: 502 });
  if (signalCountResult.error) return NextResponse.json({ ok: false, configured: true, error: signalCountResult.error.message }, { status: 502 });

  const positions = (positionsResult.data ?? []) as PaperPositionRow[];
  const latestEquity = equityResult.data;
  const openPosition = positions.some((position) => position.status === 'OPEN');
  const closedTrades = positions.filter((position) => position.status === 'CLOSED').length;
  const session = sessionResult.data as { status: string; mode: string; risk_fraction: number | string; daily_loss_limit: number | string; updated_at: string };
  const dailyLossLimit = 10_000 * numeric(session.daily_loss_limit, 0.01);

  return NextResponse.json({
    ok: true,
    configured: true,
    symbol: target.symbol,
    session: {
      status: session.status,
      mode: session.mode,
    },
    equity: numeric(latestEquity?.equity, 10_000),
    realizedPnl: numeric(latestEquity?.realized_pnl),
    dailyLoss: numeric(latestEquity?.daily_loss),
    dailyLossLimit,
    riskPerTrade: 10_000 * numeric(session.risk_fraction, 0.0025),
    closedTrades,
    openPosition,
    signalEvaluations: signalCountResult.count ?? 0,
    latestEquityAt: latestEquity?.captured_at ?? null,
    workerHeartbeatAt: session.updated_at,
  });
}
