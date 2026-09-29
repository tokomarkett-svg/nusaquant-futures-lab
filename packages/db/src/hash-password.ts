#!/usr/bin/env node
/**
 * Buat hash kata sandi operator untuk env OPERATOR_PASSWORD_HASH.
 *
 * Cara pakai (kata sandi TIDAK boleh ditulis di riwayat shell / repo):
 *   node --import tsx src/hash-password.ts   (lalu ketik kata sandi + Enter)
 *
 * Keluaran: satu baris $scrypt$... — tempel sebagai nilai OPERATOR_PASSWORD_HASH.
 * Verifikasi memakai crypto.scrypt dengan parameter yang sama (lihat apps/web/lib/operator.ts).
 */
import { randomBytes, scrypt as scryptCb } from 'node:crypto';

function scryptKey(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCb(password, salt, KEYLEN, { N, r, p }, (error, derived) => {
      if (error) reject(error);
      else resolve(derived as Buffer);
    });
  });
}

async function readPassword(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  const password = Buffer.concat(chunks).toString('utf8').replace(/[\r\n]+$/, '');
  if (!password) throw new Error('Kata sandi kosong.');
  return password;
}

const N = 16384;
const r = 8;
const p = 1;
const KEYLEN = 64;

const password = await readPassword();
const salt = randomBytes(16);
const derived = await scryptKey(password, salt);
console.log(`$scrypt$N=${N},r=${r},p=${p}$${salt.toString('hex')}$${derived.toString('hex')}`);
