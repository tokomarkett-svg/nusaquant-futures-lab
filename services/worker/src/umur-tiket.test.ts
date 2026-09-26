import test from 'node:test';
import assert from 'node:assert/strict';
import {
  tiketSahSampai,
  tiketMasihSah,
  buildBasiText,
  collectAlertsForCandidate,
  type AlertCandidate,
} from './alerts.ts';
import type { SetupMarkers, Ticket } from '@nusaquant/core';

const kini = Date.now();
const candle15m = 15 * 60_000;

const tiketPalsu = (priceNow: number): Ticket => ({
  side: 'LONG',
  entry: 100,
  stop: 99,
  target: 102,
  riskDistance: 1,
  riskPct: 1,
  sizeCoin: 0.31,
  riskUsdt: 0.31,
  rewardUsdt: 0.62,
  rr: 2,
  stopGeometryOk: true,
  stopVsBatal: 'aman',
  entryAgeBars: 0,
  priceNow,
  distanceNowPct: 0,
  chaseRisk: false,
  actionable: true,
  warnings: [],
});

const kandidat = (candle2: number | null, over: Partial<AlertCandidate> = {}): AlertCandidate => {
  const setup: SetupMarkers = {
    side: 'LONG',
    x: candle2 === null ? kini - 10 * candle15m : candle2 - 8 * candle15m,
    candle1: candle2 === null ? null : candle2 - candle15m,
    candle2,
    staleBars: 0,
    valid: candle2 !== null,
    notes: [],
    entry: candle2 === null ? null : 100,
    stop: candle2 === null ? null : 99,
    riskDistance: candle2 === null ? null : 1,
  };
  return {
    symbol: 'TESUSDT',
    side: 'LONG',
    priceNow: 100.2,
    gate: 'HIJAU',
    gateAlign: true,
    setup,
    ticket: candle2 === null ? null : tiketPalsu(100.2),
    jenis: 'kripto',
    ...over,
  };
};

test('tiketMasihSah: segar sah, lewat 3 candle ×15m basi, null basi', () => {
  const c2 = kini - 30 * 60_000; // 30 menit lalu → masih dalam jendela 72 mnt
  assert.equal(tiketMasihSah(c2, kini), true);
  assert.equal(tiketMasihSah(kini - 90 * 60_000, kini), false);
  assert.equal(tiketMasihSah(null, kini), false);
  assert.equal(tiketMasihSah(c2, kini), kini <= tiketSahSampai(c2));
});

test('SIAP ENTRI hanya untuk tiket segar — teks memuat batas sah jam WIB', () => {
  const store = { has: () => false, add: () => {}, size: () => 0 } as never;
  const c2 = kini - 10 * 60_000;
  const msgs = collectAlertsForCandidate(kandidat(c2), store as never, { mode: 'tiketsiap' });
  assert.equal(msgs.length, 1);
  assert.equal(msgs[0].kind, 'TIKET');
  assert.ok(msgs[0].text.includes('SAH sampai'), 'batas umur wajib tercetak');
  assert.ok(msgs[0].text.includes('WIB'));
});

test('tiket kedaluwarsa yang sudah dikabarkan → TIKET BASI sekali, bukan sinyal segar', () => {
  const c2 = kini - 90 * 60_000; // jelas basi
  const kunci = `TESUSDT:LONG:TIKET:${c2}`;
  const sudah = new Set([kunci]);
  const store = { has: (k: string) => sudah.has(k), add: (k: string) => sudah.add(k), size: () => sudah.size };

  const pertama = collectAlertsForCandidate(kandidat(c2), store as never, { mode: 'tiketsiap' });
  assert.equal(pertama.length, 1);
  assert.equal(pertama[0].kind, 'TIKET_BASI');
  assert.ok(pertama[0].text.includes('TIKET BASI'));
  assert.ok(pertama[0].text.includes('JANGAN'));

  // tiru runAlertCycle: kunci pesan terkirim dicatat ke store sebelum siklus berikut
  sudah.add(pertama[0].key);
  const kedua = collectAlertsForCandidate(kandidat(c2), store as never, { mode: 'tiketsiap' });
  assert.equal(kedua.length, 0, 'kabar basi tidak boleh diulang-ulang');
});

test('tiket kedaluwarsa yang TIDAK pernah dikabarkan → diem (tanpa spam)', () => {
  const store = { has: () => false, add: () => {}, size: () => 0 } as never;
  const c2 = kini - 90 * 60_000;
  const msgs = collectAlertsForCandidate(kandidat(c2), store as never, { mode: 'tiketsiap' });
  assert.equal(msgs.length, 0);
});

test('buildBasiText: sebut simbol, sisi, batas jam, dan larangan kejar', () => {
  const c2 = kini - 60 * 60_000;
  const teks = buildBasiText(kandidat(c2));
  assert.ok(teks.includes('TESUSDT LONG'));
  assert.ok(teks.includes('WIB'));
  assert.ok(teks.includes('kejar'));
});
