import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    return NextResponse.json({
      ok: false,
      configured: false,
      message: 'Supabase environment variables belum tersedia di deployment ini.',
    }, { status: 503 });
  }

  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { count, error } = await supabase
    .from('market_candles')
    .select('id', { count: 'exact', head: true });

  if (error) {
    return NextResponse.json({
      ok: false,
      configured: true,
      message: 'Supabase terkonfigurasi, tetapi query database gagal.',
      error: error.message,
    }, { status: 502 });
  }

  return NextResponse.json({
    ok: true,
    configured: true,
    message: 'Koneksi Supabase aktif.',
    table: 'market_candles',
    rows: count ?? 0,
  });
}
