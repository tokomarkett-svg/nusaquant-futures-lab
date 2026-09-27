import { NextResponse } from 'next/server';
import { fetchTickers } from '../../../lib/binance';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/** The app consumes the very same worker decision as Telegram, never recomputes with MA/spot. */
export async function GET(request?: Request) {
  const worker = (process.env.WORKER_DATA_URL ?? '').replace(/\/+$/, '');
  if (!worker.startsWith('https://')) return NextResponse.json({ ok: false, error: 'Worker tidak dikonfigurasi', rows: [] }, { status: 503 });
  try {
    const response = await fetch(new URL('/data/champion-json', worker), { cache: 'no-store', signal: AbortSignal.timeout(12_000) });
    if (!response.ok) throw new Error(`Worker HTTP ${response.status}`);
    const data = await response.json() as { ok?: boolean; at?: string; rows?: Array<{ symbol: string; at: number; decision?: { stage: string; c1: number; c2: number | null } | null }> };
    if (!data.ok || !Array.isArray(data.rows) || !Number.isFinite(Date.parse(data.at ?? ''))
      || Date.now() - Date.parse(data.at!) > 110_000 || Date.parse(data.at!) > Date.now() + 5_000) throw new Error('Scanner footprint belum segar');
    // Fail closed individually even if one pair's collection fails.
    const rows = data.rows.map((row) => ({ ...row, decision: row.at && Date.now() - row.at < 110_000 ? row.decision ?? null : null }));
    const universe = request && new URL(request.url).searchParams.get('brief') === '1' ? []
      : await fetchTickers().then((tickers) => tickers.map((t) => t.symbol)).catch(() => [] as string[]);
    return NextResponse.json({ ...data, rows, universe }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : 'Data Futures gagal', rows: [] }, { status: 503 });
  }
}
