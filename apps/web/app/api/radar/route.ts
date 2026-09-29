import { NextResponse } from 'next/server';
import { getWebDb } from '../../../lib/webdb';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const db = getWebDb();
    const rows = await db.listRadar();
    return NextResponse.json({ ok: true, rows });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'Gagal membaca radar.', rows: [] });
  }
}
