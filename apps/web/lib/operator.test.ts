import assert from 'node:assert/strict';
import { createHmac, randomBytes, scryptSync } from 'node:crypto';
import test from 'node:test';
import {
  clearOperatorSessionCookie,
  createOperatorSession,
  isOperatorAuthConfigured,
  operatorFrom,
  operatorSessionCookie,
  sameOrigin,
  verifyOperatorPassword,
} from './operator';

const URL = 'https://web.example.test/api/meja/demo';

function withEnv(env: Record<string, string | undefined>, fn: () => void | Promise<void>): Promise<void> | void {
  const prev = { ...process.env };
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  const restore = () => { process.env = prev; };
  const result = fn();
  if (result instanceof Promise) return result.finally(restore);
  restore();
}

function makeHash(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 });
  return `$scrypt$N=16384,r=8,p=1$${salt.toString('hex')}$${hash.toString('hex')}`;
}

test('manual approval rejects cross-origin POSTs, even with a cookie session', () => {
  assert.equal(sameOrigin(new Request(URL, { headers: { origin: 'https://evil.example.test' } })), false);
  assert.equal(sameOrigin(new Request(URL)), false);
  assert.equal(sameOrigin(new Request(URL, { headers: { origin: 'https://web.example.test' } })), true);
});

test('auth fail closed: tanpa konfigurasi, operatorFrom selalu null', () => {
  withEnv({ OPERATOR_PASSWORD_HASH: undefined, OPERATOR_SESSION_SECRET: undefined }, () => {
    assert.equal(isOperatorAuthConfigured(), false);
    assert.equal(operatorFrom(new Request(URL, { headers: { cookie: 'nq_operator=apa.saja' } })), null);
  });
});

test('verifyOperatorPassword: benar diterima, salah/format rusak ditolak', async () => {
  const hash = makeHash('kata-sandi-rahasia');
  await withEnv({ OPERATOR_PASSWORD_HASH: hash }, async () => {
    assert.equal(await verifyOperatorPassword('kata-sandi-rahasia'), true);
    assert.equal(await verifyOperatorPassword('salah'), false);
    assert.equal(await verifyOperatorPassword(''), false);
  });
  await withEnv({ OPERATOR_PASSWORD_HASH: 'bukan-format-hash' }, async () => {
    assert.equal(await verifyOperatorPassword('kata-sandi-rahasia'), false);
  });
});

test('sesi cookie: dibuat, dibaca kembali, yang dipalsukan/daluarsa ditolak', () => {
  const hash = makeHash('x');
  withEnv({ OPERATOR_PASSWORD_HASH: hash, OPERATOR_SESSION_SECRET: 'rahasia-sesi-min-16-karakter' }, () => {
    const session = createOperatorSession();
    assert.ok(session);
    const req = new Request(URL, { headers: { cookie: `nq_operator=${encodeURIComponent(session!.token)}` } });
    assert.deepEqual(operatorFrom(req), { id: 'operator' });
    // tanda tangan dipalsukan
    const bad = new Request(URL, { headers: { cookie: `nq_operator=${encodeURIComponent(session!.token.slice(0, -1))}0` } });
    assert.equal(operatorFrom(bad), null);
    // cookie httpOnly + SameSite
    const setCookie = operatorSessionCookie(session!.token, session!.expiresAt);
    assert.ok(setCookie.includes('HttpOnly'));
    assert.ok(setCookie.includes('SameSite=Lax'));
    assert.ok(clearOperatorSessionCookie().includes('Max-Age=0'));
  });
});

test('sesi kedaluwarsa ditolak', () => {
  const hash = makeHash('x');
  withEnv({ OPERATOR_PASSWORD_HASH: hash, OPERATOR_SESSION_SECRET: 'rahasia-sesi-min-16-karakter' }, () => {
    const session = createOperatorSession();
    assert.ok(session);
    // buat token yang sudah lewat dengan menandatangani ulang body kedaluwarsa
    const expiredBody = `operator.${Date.now() - 1000}`;
    const sig = createHmac('sha256', 'rahasia-sesi-min-16-karakter').update(expiredBody).digest('hex');
    const req = new Request(URL, { headers: { cookie: `nq_operator=${encodeURIComponent(`${expiredBody}.${sig}`)}` } });
    assert.equal(operatorFrom(req), null);
  });
});
