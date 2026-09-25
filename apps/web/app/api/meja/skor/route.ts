import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

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
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    return NextResponse.json({ ok: false, error: 'Supabase belum dikonfigurasi di server.', total: 0, target: TARGET_TRADE });
  }
  const client = createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const result = await client.from('paper_positions')
    .select('realized_pnl,close_reason,metadata')
    .eq('bot_session_id', MEJA_SESSION_ID)
    .eq('status', 'CLOSED')
    .order('closed_at', { ascending: true })
    .limit(1000);
  if (result.error) {
    return NextResponse.json({ ok: false, error: result.error.message, total: 0, target: TARGET_TRADE });
  }
  const disiplin = (result.data ?? []).filter((row) => {
    const source = String((row.metadata as Record<string, unknown> | null)?.source ?? '');
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
