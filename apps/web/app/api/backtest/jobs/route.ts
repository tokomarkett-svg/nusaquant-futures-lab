import { NextResponse } from 'next/server';
import { getWebDb } from '../../../../lib/webdb';

export const dynamic = 'force-dynamic';

const SYMBOLS = new Set(['BTCUSDT', 'ETHUSDT']);

export async function GET() {
  try {
    const jobs = await getWebDb().listResearchJobs(10);
    return NextResponse.json({ ok: true, jobs });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'Gagal membaca jobs.' }, { status: 502 });
  }
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({})) as { symbol?: string };
  const symbol = body.symbol?.toUpperCase() ?? 'BTCUSDT';
  if (!SYMBOLS.has(symbol)) return NextResponse.json({ ok: false, error: 'Symbol research belum tersedia.' }, { status: 400 });

  const db = getWebDb();
  const active = await db.findActiveResearchJob(symbol);
  if (active) return NextResponse.json({ ok: true, job: active, reused: true });

  const job = await db.insertResearchJob({ symbol, metadata: { source: 'dashboard' } });
  return NextResponse.json({ ok: true, job, reused: false });
}
