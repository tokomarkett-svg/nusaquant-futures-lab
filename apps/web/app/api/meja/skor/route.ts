import { NextResponse } from 'next/server';
import { getWebDb } from '../../../../lib/webdb';

export const dynamic = 'force-dynamic';

/**
 * SKOR MEJA 20-TRADE (mode HP) — hitungan lintas hari dari posisi paper MEJA_PAPAN:
 * semua trade disiplin (VOID-REGRESI tidak dihitung), total R, menang/kalah.
 * Rute baru yang berdiri sendiri — tidak menyentuh /api/meja yang sudah dipakai halaman lama.
 */
const MEJA_SESSION_ID = '00000000-0000-4000-8000-000000000010';
const RISK_USDT = 0.31;
const TARGET_TRADE = 20;

export async function GET() {
  const rows = await getWebDb().listPositions(MEJA_SESSION_ID, { status: 'CLOSED', orderBy: 'closed_at', orderAsc: true, limit: 1000 });
  const disiplin = rows.filter((row) => {
    const source = String(((row.metadata ?? {}) as Record<string, unknown>).source ?? '');
    return source === 'MEJA_PAPAN' && row.close_reason !== 'VOID-REGRESI';
  });
  const rTotal = disiplin.reduce((sum, row) => sum + Number(row.realized_pnl ?? 0), 0) / RISK_USDT;
  const wins = disiplin.filter((row) => Number(row.realized_pnl ?? 0) > 0).length;
  const losses = disiplin.filter((row) => Number(row.realized_pnl ?? 0) < 0).length;
  const terakhir = disiplin.slice(-5).map((row) => Number(row.realized_pnl ?? 0) > 0 ? 'W' : Number(row.realized_pnl ?? 0) < 0 ? 'L' : '=');
  return NextResponse.json({
    ok: true,
    total: disiplin.length,
    target: TARGET_TRADE,
    rTotal: Number(rTotal.toFixed(3)),
    rUsdt: Number((rTotal * RISK_USDT).toFixed(3)),
    wins,
    losses,
    winRate: disiplin.length ? Number(((wins / disiplin.length) * 100).toFixed(0)) : null,
    terakhir,
  });
}
