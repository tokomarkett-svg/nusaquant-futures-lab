import { NextResponse } from 'next/server';
import {
  createOperatorSession,
  isOperatorAuthConfigured,
  operatorSessionCookie,
  sameOrigin,
  verifyOperatorPassword,
} from '../../../../lib/operator';

export const dynamic = 'force-dynamic';

/**
 * POST /api/auth/login { password } — verifikasi kata sandi operator, set cookie sesi httpOnly.
 * Fail closed bila OPERATOR_PASSWORD_HASH / OPERATOR_SESSION_SECRET belum dikonfigurasi.
 */
export async function POST(request: Request) {
  if (!isOperatorAuthConfigured()) {
    return NextResponse.json({ ok: false, error: 'Login operator belum dikonfigurasi.' }, { status: 503 });
  }
  if (!sameOrigin(request)) {
    return NextResponse.json({ ok: false, error: 'Asal permintaan tidak sah.' }, { status: 403 });
  }
  let body: { password?: string } = {};
  try {
    body = (await request.json()) as { password?: string };
  } catch {
    return NextResponse.json({ ok: false, error: 'Body tidak valid.' }, { status: 400 });
  }
  const password = typeof body.password === 'string' ? body.password : '';
  const valid = await verifyOperatorPassword(password);
  if (!valid) {
    return NextResponse.json({ ok: false, error: 'Kata sandi salah.' }, { status: 401 });
  }
  const session = createOperatorSession();
  if (!session) {
    return NextResponse.json({ ok: false, error: 'Sesi tidak dapat dibuat.' }, { status: 500 });
  }
  const response = NextResponse.json({ ok: true });
  response.headers.set('Set-Cookie', operatorSessionCookie(session.token, session.expiresAt));
  return response;
}
