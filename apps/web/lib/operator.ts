/**
 * Auth operator lokal NusaQuant (pengganti Supabase Auth).
 *
 * Satu akun operator saja:
 *  - Kata sandi diverifikasi dengan scrypt terhadap hash di env OPERATOR_PASSWORD_HASH
 *    (format: $scrypt$N=16384,r=8,p=1$<saltHex>$<hashHex> — dibuat via
 *    `npm run hash-password --workspace @nusaquant/db`).
 *  - Sesi disimpan di cookie httpOnly `nq_operator` berisi token HMAC-SHA256
 *    yang ditandatangani OPERATOR_SESSION_SECRET (min. 16 karakter).
 *  - Tidak ada multi-user, tidak ada magic link, tidak ada email.
 *
 * Fail closed: bila OPERATOR_PASSWORD_HASH / OPERATOR_SESSION_SECRET belum
 * dikonfigurasi, semua endpoint order menjawab 503 dan tetap terkunci.
 */
import { createHmac, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';

export const OPERATOR_COOKIE = 'nq_operator';
const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12 jam

export type Operator = { id: 'operator' };

export function isOperatorAuthConfigured(): boolean {
  const hash = (process.env.OPERATOR_PASSWORD_HASH ?? '').trim();
  const secret = (process.env.OPERATOR_SESSION_SECRET ?? '').trim();
  return hash.startsWith('$scrypt$') && secret.length >= 16;
}

type ParsedHash = { N: number; r: number; p: number; salt: Buffer; hash: Buffer };

function parsePasswordHash(raw: string): ParsedHash | null {
  // $scrypt$N=16384,r=8,p=1$<saltHex>$<hashHex>
  const match = /^\$scrypt\$N=(\d+),r=(\d+),p=(\d+)\$([0-9a-fA-F]+)\$([0-9a-fA-F]+)$/.exec(raw.trim());
  if (!match) return null;
  const N = Number(match[1]);
  const r = Number(match[2]);
  const p = Number(match[3]);
  if (!Number.isSafeInteger(N) || !Number.isSafeInteger(r) || !Number.isSafeInteger(p)) return null;
  if (N < 1024 || N > 1_048_576 || r < 1 || r > 32 || p < 1 || p > 8) return null;
  const salt = Buffer.from(match[4], 'hex');
  const hash = Buffer.from(match[5], 'hex');
  if (salt.length < 8 || hash.length < 16 || hash.length > 128) return null;
  return { N, r, p, salt, hash };
}

function scryptKey(password: string, salt: Buffer, keylen: number, opts: { N: number; r: number; p: number }): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCb(password, salt, keylen, opts, (error, derived) => {
      if (error) reject(error);
      else resolve(derived as Buffer);
    });
  });
}

/** Verifikasi kata sandi terhadap OPERATOR_PASSWORD_HASH. Salah format / kosong = false. */
export async function verifyOperatorPassword(password: string): Promise<boolean> {
  if (!password) return false;
  const parsed = parsePasswordHash(process.env.OPERATOR_PASSWORD_HASH ?? '');
  if (!parsed) return false;
  try {
    const derived = await scryptKey(password, parsed.salt, parsed.hash.length, { N: parsed.N, r: parsed.r, p: parsed.p });
    return derived.length === parsed.hash.length && timingSafeEqual(derived, parsed.hash);
  } catch {
    return false;
  }
}

/** Buat token sesi. Mengembalikan null bila secret belum dikonfigurasi. */
export function createOperatorSession(): { token: string; expiresAt: number } | null {
  const secret = (process.env.OPERATOR_SESSION_SECRET ?? '').trim();
  if (secret.length < 16) return null;
  const expiresAt = Date.now() + SESSION_TTL_MS;
  const body = `operator.${expiresAt}`;
  const sig = createHmac('sha256', secret).update(body).digest('hex');
  return { token: `${body}.${sig}`, expiresAt };
}

function readCookieValue(cookieHeader: string | null, name: string): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(';')) {
    const index = part.indexOf('=');
    if (index === -1) continue;
    if (part.slice(0, index).trim() === name) return decodeURIComponent(part.slice(index + 1).trim());
  }
  return null;
}

/** Baca operator dari cookie sesi. Null = tidak login / sesi kedaluwarsa / tak valid. */
export function operatorFrom(request: Request): Operator | null {
  if (!isOperatorAuthConfigured()) return null;
  const secret = (process.env.OPERATOR_SESSION_SECRET ?? '').trim();
  const token = readCookieValue(request.headers.get('cookie'), OPERATOR_COOKIE);
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 3 || parts[0] !== 'operator') return null;
  const expiresAt = Number(parts[1]);
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) return null;
  const expected = createHmac('sha256', secret).update(`${parts[0]}.${parts[1]}`).digest('hex');
  const actual = Buffer.from(parts[2], 'utf8');
  const want = Buffer.from(expected, 'utf8');
  if (actual.length !== want.length) return null;
  try {
    if (!timingSafeEqual(actual, want)) return null;
  } catch {
    return null;
  }
  return { id: 'operator' };
}

export function operatorSessionCookie(token: string, expiresAt: number): string {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `${OPERATOR_COOKIE}=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/${secure}; Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}; Expires=${new Date(expiresAt).toUTCString()}`;
}

export function clearOperatorSessionCookie(): string {
  return `${OPERATOR_COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT`;
}

/** 503 standar saat auth operator belum dikonfigurasi (fail closed). */
export function operatorNotConfigured(): NextResponse {
  return NextResponse.json({ ok: false, error: 'Login operator belum dikonfigurasi. Order tetap terkunci.' }, { status: 503 });
}

/** 401 standar saat belum login. */
export function operatorUnauthorized(): NextResponse {
  return NextResponse.json({ ok: false, error: 'Login operator diperlukan.' }, { status: 401 });
}

/** Tolak POST lintas origin dari browser, walau membawa cookie sesi. */
export function sameOrigin(request: Request): boolean {
  const origin = request.headers.get('origin');
  return Boolean(origin && origin === new URL(request.url).origin);
}
