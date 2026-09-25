import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import {
  computeZones, detectSetup, computeTicket, gateFromCandles, RISK_USDT,
  fetchKlines, fetchTickers,
} from '../../../../lib/binance';

export const dynamic = 'force-dynamic';

/** Sama dengan sesi meja di services/worker/src/desk.ts — supaya meja ikut mengawasi posisi tombol. */
const MEJA_SESSION_ID = '00000000-0000-4000-8000-000000000010';
const MAX_TRADES_PER_DAY = 2;
const MAX_CONSECUTIVE_LOSSES = 2;

/** Awal hari WIB (sama dengan desk.ts). */
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
  const client = clientFromEnv();
  if (!client) {
    return NextResponse.json({ ok: false, error: 'Supabase belum dikonfigurasi di server — tombol entri paper butuh SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.' }, { status: 500 });
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

  // 1) Validasi pasar: tiket harus ada, actionable, dan gate searah — dihitung ULANG di server, bukan dipercaya dari browser.
  let ticket: ReturnType<typeof computeTicket>;
  let setupKey = '';
  try {
    const [tickers, m15, h1] = await Promise.all([
      fetchTickers(),
      fetchKlines(symbol, '15m', 140),
      fetchKlines(symbol, '1h', 120),
    ]);
    const ticker = tickers.find((t) => t.symbol === symbol);
    if (!ticker) return NextResponse.json({ ok: false, error: `${symbol} tidak ditemukan di daftar publik.` }, { status: 404 });
    const zones = computeZones(ticker);
    if (!zones) return NextResponse.json({ ok: false, error: 'Data harga tidak lengkap untuk menghitung zona.' }, { status: 409 });
    const gate = gateFromCandles(h1).gate;
    const gateAlign = (side === 'LONG' && gate === 'HIJAU') || (side === 'SHORT' && gate === 'MERAH');
    if (!gateAlign) return NextResponse.json({ ok: false, error: `Gate 1H sekarang ${gate} — belum searah dengan ${side}. Jangan kejar.` }, { status: 409 });
    const setup = detectSetup(m15, zones, side);
    ticket = computeTicket(m15, zones, side, ticker.last);
    if (!setup.valid || !ticket) return NextResponse.json({ ok: false, error: 'Tiket sudah tidak sah (paket X→candle1→candle2 tidak lengkap lagi).' }, { status: 409 });
    if (!ticket.actionable) return NextResponse.json({ ok: false, error: `Tiket basi/nyangkut: ${ticket.warnings.join(' · ') || 'harga sudah jalan'}. Jangan kejar.` }, { status: 409 });
    setupKey = `${symbol}:${side}:${setup.candle2 ?? 0}`;
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : 'Gagal mengambil data pasar.' }, { status: 502 });
  }

  // 2) Pagar meja: 1 posisi per koin, maks 2 trade/hari (WIB), 2 loss beruntun = tutup meja.
  const dayStart = startOfJakartaDayIso();
  const [openToday, todayRows, recentClosed] = await Promise.all([
    client.from('paper_positions').select('id,symbol').eq('bot_session_id', MEJA_SESSION_ID).eq('status', 'OPEN'),
    client.from('paper_positions').select('metadata').eq('bot_session_id', MEJA_SESSION_ID).gte('opened_at', dayStart).order('opened_at', { ascending: true }),
    client.from('paper_positions').select('realized_pnl,closed_at').eq('bot_session_id', MEJA_SESSION_ID).eq('status', 'CLOSED').order('closed_at', { ascending: false }).limit(5),
  ]);
  const firstError = openToday.error ?? todayRows.error ?? recentClosed.error;
  if (firstError) {
    return NextResponse.json({ ok: false, error: `Gagal membaca meja: ${firstError.message}` }, { status: 500 });
  }

  if ((openToday.data ?? []).some((row) => row.symbol === symbol)) {
    return NextResponse.json({ ok: false, error: 'Sudah ada posisi terbuka di koin ini — satu koin satu posisi.' }, { status: 409 });
  }
  const openedToday = (todayRows.data ?? []).length;
  if (openedToday >= MAX_TRADES_PER_DAY) {
    return NextResponse.json({ ok: false, error: `Sudah ${openedToday} trade hari ini — meja tutup sampai besok (pagar 2 trade/hari).` }, { status: 409 });
  }
  let consecutiveLosses = 0;
  for (const row of recentClosed.data ?? []) {
    if (Number(row.realized_pnl ?? 0) < 0) consecutiveLosses += 1; else break;
  }
  if (consecutiveLosses >= MAX_CONSECUTIVE_LOSSES) {
    return NextResponse.json({ ok: false, error: 'Meja sedang istirahat — 2 loss beruntun hari ini. Besok lagi.' }, { status: 409 });
  }

  // 3) Buka posisi PAPER di sesi meja yang sama → meja otomatis mengawasi SL/TP + jurnal.
  const openedAt = new Date().toISOString();
  const metadata = { source: 'MEJA_PAPAN', via: 'TOMBOL', setupKey, processScore: 6 };
  const inserted = await client.from('paper_positions').insert({
    bot_session_id: MEJA_SESSION_ID,
    symbol,
    side,
    status: 'OPEN',
    quantity: ticket.sizeCoin,
    entry_price: ticket.entry,
    stop_loss: ticket.stop,
    take_profit: ticket.target,
    opened_at: openedAt,
    metadata,
  }).select('id').single();
  if (inserted.error) {
    return NextResponse.json({ ok: false, error: `Gagal membuka posisi paper: ${inserted.error.message}` }, { status: 500 });
  }

  const journal = await client.from('trade_journal').insert({
    bot_session_id: MEJA_SESSION_ID,
    symbol,
    action: 'DESK_OPEN',
    reason: 'TOMBOL',
    quality_score: 6,
    payload: { entry: ticket.entry, stop: ticket.stop, target: ticket.target, size: ticket.sizeCoin, risk: RISK_USDT, via: 'TOMBOL', setupKey },
  });
  if (journal.error) console.error('[meja] jurnal tombol gagal:', journal.error.message);

  return NextResponse.json({
    ok: true,
    position: {
      id: inserted.data?.id, symbol, side, entry: ticket.entry, stop: ticket.stop,
      target: ticket.target, sizeCoin: ticket.sizeCoin, risk: RISK_USDT, openedAt,
    },
  });
}
