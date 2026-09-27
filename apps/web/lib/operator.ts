import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

/** Only an authenticated Supabase user with this exact server-side email may approve orders.
 * Missing configuration always DENIES; browser-provided email/role is never trusted. */
export async function operatorFrom(request: Request): Promise<{ id: string; email: string } | NextResponse> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const allowed = (process.env.OPERATOR_EMAIL ?? '').trim().toLowerCase();
  if (!url || !anon || !allowed) return NextResponse.json({ ok: false, error: 'Login operator belum dikonfigurasi. Order tetap terkunci.' }, { status: 503 });
  const bearer = request.headers.get('authorization')?.match(/^Bearer ([A-Za-z0-9._-]+)$/)?.[1];
  if (!bearer) return NextResponse.json({ ok: false, error: 'Login operator diperlukan.' }, { status: 401 });
  const supabase = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await supabase.auth.getUser(bearer);
  if (error || !data.user || !data.user.email_confirmed_at || data.user.email?.toLowerCase() !== allowed) {
    return NextResponse.json({ ok: false, error: 'Akun ini tidak berwenang menyetujui order.' }, { status: 403 });
  }
  return { id: data.user.id, email: allowed };
}

/** Reject cross-origin browser POSTs, even with a bearer token. */
export function sameOrigin(request: Request): boolean {
  const origin = request.headers.get('origin');
  return Boolean(origin && origin === new URL(request.url).origin);
}
