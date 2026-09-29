import { NextResponse } from 'next/server';
import { getWebDb } from '../../../../lib/webdb';

export const dynamic = 'force-dynamic';

/**
 * RIWAYAT MEJA (mode HP) — 20 trade terakhir meja Papan (termasuk VOID, dilabeli apa adanya).
 * Skor 20-trade yang jujur tetap dihitung /api/meja/skor (VOID tidak masuk skor).
 */
const MEJA_SESSION_ID = '00000000-0000-4000-8000-000000000010';
const RISK_USDT = 0.31;

export async function GET() {
  const rows = await getWebDb().listPositions(MEJA_SESSION_ID, { status: 'CLOSED', orderBy: 'closed_at', orderAsc: false, limit: 20 });
  const trades = rows.map((row) => {
    const pnl = Number(row.realized_pnl ?? 0);
    return {
      symbol: String(row.symbol),
      side: row.side === 'SHORT' ? 'SHORT' : 'LONG',
      r: Number((pnl / RISK_USDT).toFixed(2)),
      usdt: Number(pnl.toFixed(3)),
      reason: row.close_reason ?? null,
      closedAt: row.closed_at,
      void: row.close_reason === 'VOID-REGRESI',
    };
  });
  return NextResponse.json({ ok: true, trades });
}
