import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import {
  computeZones, detectSetup, computeTicket, gateFromCandles, RISK_USDT,
  fetchKlines, fetchTickers,
} from '../../../../lib/binance';

export const dynamic = 'force-dynamic';

/** Sesi meja yang sama dengan worker — posisi demo dicatat di jurnal meja. */
const MEJA_SESSION_ID = '00000000-0000-4000-8000-000000000010';
const MAX_DEMO_PER_DAY = 3;

function startOfJakartaDayIso(now = Date.now()): string {
  const offsetMs = 7 * 3_600_000;
  const local = new Date(now + offsetMs);
  local.setUTCHours(0, 0, 0, 0);
  return new Date(local.getTime() - offsetMs).toISOString();
}

function clientFromEnv() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) return null;
  return createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function POST(request: Request) {
  const worker = (process.env.WORKER_DATA_URL ?? '').trim().replace(/\/+$/, '');
  const token = (process.env.WORKER_EXEC_TOKEN ?? '').trim();
  if (!worker || !token) {
    return NextResponse.json({ ok: false, error: 'Mode demo belum aktif: perlu WORKER_DATA_URL + WORKER_EXEC_TOKEN di Vercel (dan EXEC_TOKEN di Railway).' }, { status: 500 });
  }
  const client = clientFromEnv();
  if (!client) {
    return NextResponse.json({ ok: false, error: 'Supabase belum dikonfigurasi di server.' }, { status: 500 });
  }

  let body: { symbol?: unknown; side?: unknown };
  try {
    body = await request.json() as { symbol?: unknown; side?: unknown };
  } catch {
    return NextResponse.json({ ok: false, error: 'Body bukan JSON yang sah.' }, { status: 400 });
  }
  const symbol = typeof body.symbol === 'string' ? body.symbol.toUpperCase().trim() : '';
  const side = body.side === 'LONG' ? 'LONG' : body.side === 'SHORT' ? 'SHORT' : null;
  if (!/^[A-Z0-9]+USDT$/.test(symbol) || !side) {
    return NextResponse.json({ ok: false, error: 'symbol (…USDT) dan side (LONG|SHORT) wajib diisi.' }, { status: 400 });
  }

  // 1) Validasi pasar dihitung ULANG: tiket harus segar & gate searah — sama seperti tombol paper.
  let ticket: ReturnType<typeof computeTicket>;
  let setupKey = '';
  try {
    const [tickers, m15, h1] = await Promise.all([
      fetchTickers(),
      fetchKlines(symbol, '15m', 140),
      fetchKlines(symbol, '1h', 120),
    ]);
    const ticker = tickers.find((t) => t.symbol === symbol);
    if (!ticker) return NextResponse.json({ ok: false, error: `${symbol} tidak ditemukan di pasar futures.` }, { status: 404 });
    const zones = computeZones(ticker);
    if (!zones) return NextResponse.json({ ok: false, error: 'Data harga tidak lengkap.' }, { status: 409 });
    const gate = gateFromCandles(h1).gate;
    const gateAlign = (side === 'LONG' && gate === 'HIJAU') || (side === 'SHORT' && gate === 'MERAH');
    if (!gateAlign) return NextResponse.json({ ok: false, error: `Gate 1H sekarang ${gate} — belum searah dengan ${side}. Jangan kejar.` }, { status: 409 });
    const setup = detectSetup(m15, zones, side);
    ticket = computeTicket(m15, zones, side, ticker.last);
    if (!setup.valid || !ticket) return NextResponse.json({ ok: false, error: 'Tiket sudah tidak sah (paket tidak lengkap lagi).' }, { status: 409 });
    if (!ticket.actionable) return NextResponse.json({ ok: false, error: `Tiket basi/nyangkut: ${ticket.warnings.join(' · ') || 'harga sudah jalan'}. Jangan kejar.` }, { status: 409 });
    setupKey = `${symbol}:${side}:${setup.candle2 ?? 0}`;
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : 'Gagal mengambil data pasar.' }, { status: 502 });
  }

  // 2) Pagar latihan demo: 1 posisi/koin, kuota sendiri 3/hari (jatah robot tidak dipakai).
  const dayStart = startOfJakartaDayIso();
  const [openToday, todayRows] = await Promise.all([
    client.from('paper_positions').select('id,symbol').eq('bot_session_id', MEJA_SESSION_ID).eq('status', 'OPEN'),
    client.from('paper_positions').select('metadata').eq('bot_session_id', MEJA_SESSION_ID).gte('opened_at', dayStart),
  ]);
  if (openToday.error || todayRows.error) {
    return NextResponse.json({ ok: false, error: `Gagal membaca meja: ${(openToday.error ?? todayRows.error)?.message}` }, { status: 500 });
  }
  if ((openToday.data ?? []).some((row) => row.symbol === symbol)) {
    return NextResponse.json({ ok: false, error: 'Sudah ada posisi terbuka di koin ini.' }, { status: 409 });
  }
  const demoHariIni = (todayRows.data ?? []).filter((row) => {
    const meta = (row.metadata ?? {}) as Record<string, unknown>;
    return meta.via === 'DEMO' || meta.via === 'TOMBOL';
  });
  if (demoHariIni.length >= MAX_DEMO_PER_DAY) {
    return NextResponse.json({ ok: false, error: `Kuota latihan demo hari ini habis (${demoHariIni.length}/${MAX_DEMO_PER_DAY}) — besok lagi.` }, { status: 409 });
  }

  // 3) Kirim order ke testnet lewat worker (kunci demo hanya ada di Railway).
  type HasilExec = { ok?: boolean; error?: string; entryOrderId?: string; slOrderId?: string; tpOrderId?: string; qty?: string };
  const eksekusi = await fetch(new URL('/exec/demo', worker), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ token, symbol, side, qty: ticket.sizeCoin, stop: ticket.stop, target: ticket.target }),
    signal: AbortSignal.timeout(20_000),
  }).then((r) => r.json() as Promise<HasilExec>)
    .catch((error: unknown): HasilExec => ({ ok: false, error: error instanceof Error ? error.message : 'Worker tidak terjangkau.' }));
  if (!eksekusi.ok) {
    return NextResponse.json({ ok: false, error: `Testnet menolak: ${eksekusi.error ?? 'sebab tidak diketahui'}` }, { status: 502 });
  }

  // 4) Catat posisi demo ke meja (jurnal tetap rapi; meja mengawasi & menutup di testnet saat waktunya).
  const openedAt = new Date().toISOString();
  const metadata = { source: 'MEJA_PAPAN', via: 'DEMO', setupKey, processScore: 6, demoOrderIds: [eksekusi.entryOrderId, eksekusi.slOrderId, eksekusi.tpOrderId].filter(Boolean) };
  const inserted = await client.from('paper_positions').insert({
    bot_session_id: MEJA_SESSION_ID, symbol, side, status: 'OPEN',
    quantity: Number(eksekusi.qty ?? ticket.sizeCoin),
    entry_price: ticket.entry, stop_loss: ticket.stop, take_profit: ticket.target,
    opened_at: openedAt, metadata,
  }).select('id').single();
  if (inserted.error) {
    return NextResponse.json({ ok: false, error: `Order demo MASUK ke testnet, tapi jurnal gagal: ${inserted.error.message}` }, { status: 500 });
  }
  await client.from('trade_journal').insert({
    bot_session_id: MEJA_SESSION_ID, symbol, action: 'DESK_OPEN', reason: 'DEMO',
    quality_score: 6,
    payload: { entry: ticket.entry, stop: ticket.stop, target: ticket.target, size: eksekusi.qty ?? ticket.sizeCoin, risk: RISK_USDT, via: 'DEMO', setupKey, orders: metadata.demoOrderIds },
  }).then((j) => { if (j.error) console.error('[meja] jurnal demo gagal:', j.error.message); });

  return NextResponse.json({
    ok: true, testnet: true,
    position: { symbol, side, entry: ticket.entry, stop: ticket.stop, target: ticket.target, qty: eksekusi.qty, orders: metadata.demoOrderIds },
  });
}
