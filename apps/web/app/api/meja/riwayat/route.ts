import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * RIWAYAT MEJA (mode HP) — 20 trade terakhir meja Papan (termasuk VOID, dilabeli apa adanya).
 * Skor 20-trade yang jujur tetap dihitung /api/meja/skor (VOID tidak masuk skor).
 */
const MEJA_SESSION_ID = '00000000-0000-4000-8000-000000000010';
const RISK_USDT = 0.31;

export async function GET() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    return NextResponse.json({ ok: false, error: 'Supabase belum dikonfigurasi di server.', trades: [] });
  }
  const client = createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const result = await client.from('paper_positions')
    .select('symbol,side,entry_price,exit_price,realized_pnl,close_reason,closed_at,metadata')
    .eq('bot_session_id', MEJA_SESSION_ID)
    .eq('status', 'CLOSED')
    .order('closed_at', { ascending: false })
    .limit(20);
  if (result.error) {
    return NextResponse.json({ ok: false, error: result.error.message, trades: [] });
  }
  const trades = (result.data ?? []).map((row) => {
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
