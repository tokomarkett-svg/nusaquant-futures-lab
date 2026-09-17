import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    return NextResponse.json({ ok: false, error: 'Supabase belum dikonfigurasi.', rows: [] });
  }
  const client = createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const result = await client
    .from('market_radar')
    .select('symbol,regime,day_open,prev_range_pct,last_price,dist_long_pct,dist_short_pct,touched,updated_at')
    .order('symbol', { ascending: true });
  if (result.error) {
    // Tabel belum dibuat = migrasi radar belum dijalankan; jangan jatuhkan halaman.
    return NextResponse.json({ ok: false, error: result.error.message, rows: [] });
  }
  return NextResponse.json({ ok: true, rows: result.data ?? [] });
}
