import { NextResponse } from 'next/server';
import { clearOperatorSessionCookie, sameOrigin } from '../../../../lib/operator';

export const dynamic = 'force-dynamic';

/** POST /api/auth/logout — hapus cookie sesi operator. */
export async function POST(request: Request) {
  if (!sameOrigin(request)) {
    return NextResponse.json({ ok: false, error: 'Asal permintaan tidak sah.' }, { status: 403 });
  }
  const response = NextResponse.json({ ok: true });
  response.headers.set('Set-Cookie', clearOperatorSessionCookie());
  return response;
}
