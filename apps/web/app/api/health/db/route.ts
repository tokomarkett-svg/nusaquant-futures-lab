import { NextResponse } from 'next/server';
import { existsSync, statSync } from 'node:fs';
import { getWebDb } from '../../../../lib/webdb';

export const dynamic = 'force-dynamic';

/**
 * GET /api/health/db — cek kesiapan database SQLite lokal.
 * Tidak mengembalikan kredensial apa pun (memang tidak ada kredensial).
 */
export async function GET() {
  const path = getWebDb().path;
  try {
    const count = await getWebDb().countMarketCandles();
    const stat = existsSync(path) ? statSync(path) : null;
    return NextResponse.json({
      ok: true,
      configured: true,
      message: `SQLite terhubung · ${path}`,
      path,
      sizeBytes: stat?.size ?? null,
      candles: count,
    });
  } catch (e) {
    return NextResponse.json({
      ok: false,
      configured: true,
      message: e instanceof Error ? e.message : 'SQLite tidak dapat diakses.',
      path,
    });
  }
}
