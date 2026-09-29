import { NextResponse } from 'next/server';
import { getWebDb } from '../../../../lib/webdb';

export const dynamic = 'force-dynamic';

const SESSIONS = {
  BTCUSDT: '00000000-0000-4000-8000-000000000001',
  ETHUSDT: '00000000-0000-4000-8000-000000000002',
} as const;
type SupportedSymbol = keyof typeof SESSIONS;

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
  const db = getWebDb();

  const session = await db.getBotSession(target.sessionId);
  if (!session) {
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

  const [latestEquity, positions, signalEvaluations] = await Promise.all([
    db.latestEquity(target.sessionId),
    db.listPositions(target.sessionId, { symbol: target.symbol, limit: 1000 }),
    db.countSignals(target.sessionId, target.symbol),
  ]);

  const openPosition = positions.some((position) => position.status === 'OPEN');
  const closedTrades = positions.filter((position) => position.status === 'CLOSED').length;
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
    signalEvaluations,
    latestEquityAt: latestEquity?.captured_at ?? null,
    workerHeartbeatAt: null,
  });
}
