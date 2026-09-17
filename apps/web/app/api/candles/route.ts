import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const symbol = (params.get('symbol') ?? 'BTCUSDT').toUpperCase();
  const interval = params.get('interval') === '1h' ? '1h' : '15m';
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    return NextResponse.json({ ok: false, error: 'Supabase belum dikonfigurasi.', candles: [] });
  }
  const client = createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const result = await client
    .from('market_candles')
    .select('open_time,open,high,low,close')
    .eq('symbol', symbol)
    .eq('interval', interval)
    .order('open_time', { ascending: false })
    .limit(96);
  if (result.error) return NextResponse.json({ ok: false, error: result.error.message, candles: [] });
  return NextResponse.json({ ok: true, candles: (result.data ?? []).reverse() });
}
