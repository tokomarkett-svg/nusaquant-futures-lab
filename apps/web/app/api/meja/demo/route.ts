import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { RISK_USDT } from '../../../../lib/binance';
import { manualTicket } from '../../../../lib/manual-ticket';
import { demoReadyTicket } from '../../../../lib/demo-readiness';
import { operatorFrom, sameOrigin } from '../../../../lib/operator';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;
const MEJA_SESSION_ID = '00000000-0000-4000-8000-000000000010';
const MAX_DEMO_PER_DAY = 3;

function startOfJakartaDayIso(now = Date.now()): string {
  const offset = 7 * 3_600_000;
  const local = new Date(now + offset);
  local.setUTCHours(0, 0, 0, 0);
  return new Date(local.getTime() - offset).toISOString();
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) return NextResponse.json({ ok: false, error: 'Asal permintaan tidak sesuai.' }, { status: 403 });
  const operator = await operatorFrom(request);
  if (operator instanceof NextResponse) return operator;
  if (process.env.DEMO_EXECUTION_ENABLED !== '1') {
    return NextResponse.json({ ok: false, error: 'Eksekusi Demo belum diaktifkan; tidak ada order dikirim.' }, { status: 423 });
  }
  const worker = (process.env.WORKER_DATA_URL ?? '').trim().replace(/\/+$/, '');
  const token = (process.env.WORKER_EXEC_TOKEN ?? '').trim();
  const dbUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const dbKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!worker || !token || !dbUrl || !dbKey) return NextResponse.json({ ok: false, error: 'Koneksi worker/jurnal belum lengkap.' }, { status: 503 });
  if (!worker.startsWith('https://') || new URL(worker).username || new URL(worker).password) {
    return NextResponse.json({ ok: false, error: 'Alamat worker tidak aman.' }, { status: 503 });
  }
  const client = createClient(dbUrl, dbKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const body = await request.json().catch(() => null) as { symbol?: unknown; side?: unknown; setupKey?: unknown; confirm?: unknown; environment?: unknown } | null;
  const symbol = typeof body?.symbol === 'string' ? body.symbol.toUpperCase().trim() : '';
  const side = body?.side;
  if ((side !== 'LONG' && side !== 'SHORT') || body?.environment !== 'TESTNET' || typeof body?.setupKey !== 'string' || body?.confirm !== `DEMO ${symbol} ${side}`) {
    return NextResponse.json({ ok: false, error: 'Konfirmasi, lingkungan Demo, atau tiket tidak sesuai.' }, { status: 400 });
  }
  let ticket: Awaited<ReturnType<typeof manualTicket>>;
  try {
    ticket = await demoReadyTicket(symbol, side);
    if (body.setupKey !== ticket.setupKey) throw new Error('Tiket telah berubah atau kedaluwarsa. Buka ulang pratinjau.');
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'Tiket tidak sah.' }, { status: 409 });
  }

  const [openToday, todayRows, unresolved] = await Promise.all([
    client.from('paper_positions').select('id,symbol').eq('bot_session_id', MEJA_SESSION_ID).eq('status', 'OPEN'),
    client.from('paper_positions').select('metadata').eq('bot_session_id', MEJA_SESSION_ID).gte('opened_at', startOfJakartaDayIso()),
    client.from('manual_execution_approvals').select('id').eq('mode', 'TESTNET').in('status', ['RESERVED', 'REVIEW']).limit(1),
  ]);
  if (openToday.error || todayRows.error || unresolved.error) return NextResponse.json({ ok: false, error: 'Jurnal/persetujuan tidak dapat diverifikasi. Tidak ada order dikirim.' }, { status: 503 });
  if (unresolved.data?.length) return NextResponse.json({ ok: false, error: 'Ada eksekusi Demo belum terverifikasi. Rekonsiliasi dengan Binance dahulu; order baru ditahan.' }, { status: 409 });
  if ((openToday.data ?? []).some((r) => r.symbol === symbol)) return NextResponse.json({ ok: false, error: 'Posisi pada simbol ini sudah terbuka.' }, { status: 409 });
  const used = (todayRows.data ?? []).filter((r) => {
    const meta = (r.metadata ?? {}) as Record<string, unknown>;
    return meta.via === 'DEMO' || meta.via === 'TOMBOL';
  }).length;
  if (used >= MAX_DEMO_PER_DAY) return NextResponse.json({ ok: false, error: 'Kuota latihan harian habis.' }, { status: 409 });

  // An atomic UNIQUE constraint locks each setup AND unresolved symbol across serverless instances.
  // An ambiguous timeout is deliberately marked REVIEW and may not be retried.
  const reserved = await client.from('manual_execution_approvals').insert({
    mode: 'TESTNET', setup_key: ticket.setupKey, symbol, side, operator_id: operator.id, status: 'RESERVED',
  }).select('id').single();
  if (reserved.error || !reserved.data) return NextResponse.json({ ok: false, error: 'Tiket sudah pernah dipakai atau ledger persetujuan belum terpasang. Tidak ada order dikirim.' }, { status: 409 });
  const id = reserved.data.id as string;
  const mark = async (status: 'REVIEW' | 'VERIFIED', note: string, ids?: { entryOrderId: string; slOrderId: string; tpOrderId: string }) => {
    await client.from('manual_execution_approvals').update({
      status, note: note.slice(0, 300), updated_at: new Date().toISOString(),
      exchange_entry_id: ids?.entryOrderId, exchange_sl_id: ids?.slOrderId, exchange_tp_id: ids?.tpOrderId,
    }).eq('id', id);
  };
  type Exec = { ok?: boolean; error?: string; entryOrderId?: string; slOrderId?: string; tpOrderId?: string; qty?: string; fillPrice?: number };
  let result: Exec;
  try {
    const r = await fetch(new URL('/exec/demo', worker), {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token, symbol, side, qty: ticket.qty, stop: ticket.stop,
        target: ticket.target, expectedEntry: ticket.entry, setupKey: ticket.setupKey }),
      signal: AbortSignal.timeout(55_000), cache: 'no-store',
    });
    result = await r.json() as Exec;
  } catch {
    await mark('REVIEW', 'Worker timeout/network: status order tidak pasti. Cek akun Demo; jangan ulangi.');
    return NextResponse.json({ ok: false, error: 'Respons worker tidak pasti. PERIKSA POSISI DAN SL/TP DI BINANCE DEMO; tiket ini tidak dapat diulang.' }, { status: 502 });
  }
  if (!result.ok || !result.entryOrderId || !result.slOrderId || !result.tpOrderId || !result.fillPrice || !result.qty) {
    await mark('REVIEW', result.error ?? 'Worker tidak membuktikan proteksi SL/TP.');
    return NextResponse.json({ ok: false, error: `Order belum aman: ${result.error ?? 'SL/TP belum terverifikasi'}. Cek Binance Demo sebelum mencoba lagi.` }, { status: 502 });
  }
  const ids = { entryOrderId: result.entryOrderId, slOrderId: result.slOrderId, tpOrderId: result.tpOrderId };
  // Ledger uses actual Binance fill; planned entry remains stored in metadata for audit.
  const metadata = { source: 'MEJA_PAPAN', via: 'DEMO', setupKey: ticket.setupKey, processScore: 6,
    demoOrderIds: Object.values(ids), plannedEntry: ticket.entry, approvalId: id };
  const inserted = await client.from('paper_positions').insert({
    bot_session_id: MEJA_SESSION_ID, symbol, side, status: 'OPEN', quantity: Number(result.qty),
    entry_price: result.fillPrice, stop_loss: ticket.stop, take_profit: ticket.target,
    opened_at: new Date().toISOString(), metadata,
  }).select('id').single();
  if (inserted.error) {
    // Exchange position may still exist: NEVER claim the trade succeeded or silently remove approval.
    await mark('REVIEW', `Entry+SL/TP on exchange but journal failed: ${inserted.error.message}`, ids);
    return NextResponse.json({ ok: false, error: 'DARURAT: posisi Demo di bursa terlindungi, tetapi jurnal gagal. Periksa akun Demo dan meja; jangan ulangi.' }, { status: 500 });
  }
  const journal = await client.from('trade_journal').insert({
    bot_session_id: MEJA_SESSION_ID, paper_position_id: inserted.data.id, symbol, action: 'DESK_OPEN', reason: 'DEMO', quality_score: 6,
    payload: { plannedEntry: ticket.entry, fillPrice: result.fillPrice, stop: ticket.stop, target: ticket.target,
      size: result.qty, risk: RISK_USDT, via: 'DEMO', setupKey: ticket.setupKey, orders: Object.values(ids), approvalId: id },
  });
  if (journal.error) {
    await mark('REVIEW', `Posisi di bursa+jurnal posisi OK; trade_journal gagal: ${journal.error.message}`, ids);
    return NextResponse.json({ ok: false, error: 'Posisi Demo terbuka dan terlindungi, tetapi catatan trade gagal. Periksa Meja; jangan ulangi.' }, { status: 500 });
  }
  await mark('VERIFIED', 'Entry, proteksi Algo dan jurnal tercatat.', ids);
  await fetch(new URL('/notify/demo', worker), {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ token, text: `🧪 <b>ORDER DEMO TERLINDUNGI</b> ${symbol} ${side}\nFill ${result.fillPrice} · SL ${ticket.stop} · TP ${ticket.target}\nPeriksa posisi dan order Algo di Binance Demo. LIVE ASLI TETAP TERKUNCI.` }),
    signal: AbortSignal.timeout(4_000),
  }).catch(() => undefined);
  return NextResponse.json({ ok: true, testnet: true, position: { symbol, side, entry: result.fillPrice,
    plannedEntry: ticket.entry, stop: ticket.stop, target: ticket.target, qty: result.qty, orders: Object.values(ids) } });
}
