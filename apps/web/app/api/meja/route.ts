import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/** Sesi "Meja Papan" di database — dipakai worker (services/worker/src/desk.ts). */
const MEJA_SESSION_ID = '00000000-0000-4000-8000-000000000010';
const RISK_USDT = 0.31;

/** Awal hari menurut WIB. */
function startOfJakartaDay(now = Date.now()): string {
  const offsetMs = 7 * 3_600_000;
  const local = new Date(now + offsetMs);
  local.setUTCHours(0, 0, 0, 0);
  return new Date(local.getTime() - offsetMs).toISOString();
}

export async function GET() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    return NextResponse.json({ ok: false, error: 'Supabase belum dikonfigurasi di server.', open: [], today: null });
  }
  const client = createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const dayStart = startOfJakartaDay();

  const openResult = await client.from('paper_positions')
    .select('id,symbol,side,entry_price,stop_loss,take_profit,quantity,opened_at,metadata')
    .eq('bot_session_id', MEJA_SESSION_ID)
    .eq('status', 'OPEN')
    .order('opened_at', { ascending: true });

  const todayResult = await client.from('paper_positions')
    .select('id,symbol,side,status,entry_price,exit_price,realized_pnl,close_reason,opened_at,closed_at,metadata')
    .eq('bot_session_id', MEJA_SESSION_ID)
    .gte('opened_at', dayStart)
    .order('opened_at', { ascending: true });

  if (openResult.error || todayResult.error) {
    return NextResponse.json({ ok: false, error: (openResult.error ?? todayResult.error)?.message ?? 'Gagal membaca meja.', open: [], today: null });
  }

  const todayRows = todayResult.data ?? [];
  const closed = todayRows.filter((row) => row.status === 'CLOSED');
  const wins = closed.filter((row) => Number(row.realized_pnl ?? 0) > 0).length;
  const losses = closed.filter((row) => Number(row.realized_pnl ?? 0) < 0).length;
  const rTotal = closed.reduce((sum, row) => sum + Number(row.realized_pnl ?? 0), 0) / RISK_USDT;
  const scores = todayRows.map((row) => Number((row.metadata as Record<string, unknown> | null)?.processScore ?? 0)).filter((value) => value > 0);
  const processScoreAvg = scores.length ? scores.reduce((sum, value) => sum + value, 0) / scores.length : null;

  return NextResponse.json({
    ok: true,
    sessionId: MEJA_SESSION_ID,
    open: (openResult.data ?? []).map((row) => ({
      symbol: row.symbol, side: row.side, entry: Number(row.entry_price), stop: Number(row.stop_loss),
      target: Number(row.take_profit), sizeCoin: Number(row.quantity), openedAt: row.opened_at,
      processScore: Number((row.metadata as Record<string, unknown> | null)?.processScore ?? 0) || null,
      setupKey: String((row.metadata as Record<string, unknown> | null)?.setupKey ?? ''),
    })),
    today: {
      dayStart,
      trades: todayRows.filter((row) => Boolean((row.metadata as Record<string, unknown> | null)?.source === 'MEJA_PAPAN')).length,
      open: openResult.data?.length ?? 0,
      closed: closed.length,
      wins,
      losses,
      rTotal: Number(rTotal.toFixed(3)),
      pnlUsdt: Number((rTotal * RISK_USDT).toFixed(3)),
      processScoreAvg: processScoreAvg === null ? null : Number(processScoreAvg.toFixed(2)),
      lastClosed: closed.at(-1) ? {
        symbol: closed.at(-1)?.symbol, reason: closed.at(-1)?.close_reason,
        r: Number((Number(closed.at(-1)?.realized_pnl ?? 0) / RISK_USDT).toFixed(2)),
      } : null,
    },
  });
}
