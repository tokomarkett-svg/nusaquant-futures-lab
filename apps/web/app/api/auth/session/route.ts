import { NextResponse } from 'next/server';
import { isOperatorAuthConfigured, operatorFrom } from '../../../../lib/operator';

export const dynamic = 'force-dynamic';

/** GET /api/auth/session — status login operator saat ini. */
export async function GET(request: Request) {
  const configured = isOperatorAuthConfigured();
  if (!configured) return NextResponse.json({ ok: true, configured: false, operator: null });
  const operator = operatorFrom(request);
  return NextResponse.json({ ok: true, configured: true, operator: operator ? { id: operator.id } : null });
}
