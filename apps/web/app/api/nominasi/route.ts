import { NextResponse } from 'next/server';
import { scanBoard, type Board } from '../../../lib/binance';

export const dynamic = 'force-dynamic';

/** Papan nominasi memindai ratusan pair — simpan hasil 45 detik supaya tidak membanjiri sumber data. */
const CACHE_MS = 45_000;
let cached: { at: number; payload: Board } | null = null;
let inFlight: Promise<Board> | null = null;

export async function GET() {
  try {
    if (cached && Date.now() - cached.at < CACHE_MS) {
      return NextResponse.json({ ok: true, cached: true, ...cached.payload });
    }
    if (!inFlight) {
      inFlight = scanBoard(40).finally(() => { inFlight = null; });
    }
    const payload = await inFlight;
    cached = { at: Date.now(), payload };
    return NextResponse.json({ ok: true, cached: false, ...payload });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      funnel: { scanned: 0, liquid: 0, rangeOk: 0, board: 0, staleDropped: 0 },
      rows: [],
      at: new Date().toISOString(),
    });
  }
}
