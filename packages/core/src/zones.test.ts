import assert from 'node:assert/strict';
import test from 'node:test';
import { computeTicket, detectSetup, type Zones } from './zones.ts';
import type { Candle } from './index.ts';

/** Zona long buatan: pintu 100, manis 98, batal 95 (short cermin: pintu 94, batal 99). */
const zones: Zones = {
  high: 110, low: 90, range: 20, rangePct: 22,
  long: { pintu: 100, manis: 98, batal: 95 },
  short: { pintu: 94, manis: 96, batal: 99 },
};

const T = 1_700_000_000_000;
const mk = (i: number, o: number, h: number, l: number, c: number): Candle => ({ time: T + i * 900_000, open: o, high: h, low: l, close: c, volume: 1 });

const longCandles: Candle[] = [
  mk(0, 101, 102, 100.5, 101.4),    // di luar ruangan (di atas pintu)
  mk(1, 101, 101.2, 99.4, 100.2),   // X: low menusuk pintu
  mk(2, 100, 100.3, 99.6, 100.0),   // bukan candle 1 (buntut kecil)
  mk(3, 100.2, 100.3, 96.4, 99.8),  // CANDLE 1: low 96.4 di pita, buntut 3.4 = 8.5x badan, close di paruh atas
  mk(4, 99.6, 101.5, 99.5, 101.2),  // CANDLE 2: close 101.2 di atas puncak candle 1 (100.3)
  mk(5, 101.2, 101.6, 100.9, 101.5),// candle berjalan
];

const shortCandles: Candle[] = [
  mk(0, 93, 93.6, 92.6, 92.8),
  mk(1, 92.8, 94.6, 92.7, 94.2),    // X: high menusuk pintu short (94)
  mk(2, 95.4, 97.6, 94.0, 94.6),    // CANDLE 1: high 97.6 di pita (94..99), buntut atas 2.2 = 2.75x badan, close paruh bawah
  mk(3, 94.4, 94.6, 92.5, 93.4),    // CANDLE 2: close 93.4 di bawah dasar candle 1 (94.0)
  mk(4, 93.4, 93.8, 92.2, 92.9),
];

test('tiket long: entry = close candle 2, stop = buntut candle 1, target = 2R, ukuran = 1R / jarak', () => {
  const setup = detectSetup(longCandles, zones, 'LONG');
  assert.equal(setup.valid, true);
  assert.equal(setup.entry, 101.2);
  assert.equal(setup.stop, 96.4);

  const ticket = computeTicket(longCandles, zones, 'LONG', 101.5);
  assert.ok(ticket, 'tiket harus terbentuk');
  // profil v3: stop = garis batal long (95), risk 6.2, target entry+2R
  const risk = 101.2 - 95;
  assert.equal(ticket.entry, 101.2);
  assert.equal(ticket.stop, 95);
  assert.ok(Math.abs(ticket.target - (101.2 + 2 * risk)) < 1e-9);
  assert.ok(Math.abs(ticket.sizeCoin - 0.31 / risk) < 1e-9);
  assert.equal(ticket.rr, 2);
  assert.equal(ticket.actionable, true);
  assert.equal(ticket.stopVsBatal, 'aman');
  assert.equal(ticket.warnings.length, 0);
});

test('profil lama (PMB_STOP_MODE=buntut): stop tetap buntut candle 1', () => {
  process.env.PMB_STOP_MODE = 'buntut';
  try {
    const t = computeTicket(longCandles, zones, 'LONG', 101.5);
    assert.ok(t);
    assert.equal(t.stop, 96.4);
    assert.equal(t.target, 101.2 + 2 * (101.2 - 96.4));
    assert.equal(t.actionable, true);
  } finally {
    process.env.PMB_STOP_MODE = 'batal';
  }
});

test('pagar anti-nyangkut: harga sudah jalan >0,5R dari entry -> tiket tidak bisa dieksekusi', () => {
  const chased = computeTicket(longCandles, zones, 'LONG', 105);
  assert.ok(chased);
  assert.equal(chased.actionable, false);
  assert.equal(chased.chaseRisk, true);
  assert.match(chased.warnings.join(' '), /jangan dikejar/);
});

test('tiket short (cermin): profil v3 — stop = garis batal short (99), target 2R ke bawah', () => {
  const setup = detectSetup(shortCandles, zones, 'SHORT');
  assert.equal(setup.valid, true);
  const ticket = computeTicket(shortCandles, zones, 'SHORT', 92.9);
  assert.ok(ticket);
  assert.equal(ticket.entry, 93.4);
  assert.equal(ticket.stop, 99);
  const risk = 99 - 93.4;
  assert.ok(Math.abs(ticket.target - (93.4 - 2 * risk)) < 1e-9);
  assert.equal(ticket.stopGeometryOk, true);
  assert.equal(ticket.actionable, true);
});

test('tanpa paket lengkap tidak ada tiket (no setup = no trade)', () => {
  const noTouch: Candle[] = [mk(0, 101, 102, 100.8, 101.5), mk(1, 101.5, 102, 101, 101.8)];
  assert.equal(computeTicket(noTouch, zones, 'LONG', 101.8), null);
  const touchedButNoC1: Candle[] = [
    mk(0, 101, 102, 100.8, 101.5),
    mk(1, 101.5, 101.8, 99.0, 99.4), // X menusuk pintu
    mk(2, 99.4, 99.6, 99.0, 99.2),   // tidak ada candle 1 sah setelahnya
  ];
  assert.equal(computeTicket(touchedButNoC1, zones, 'LONG', 99.2), null);
});
test('tiket basi: candle 2 > 3 candle lalu MEMATIKAN actionable (kasus ALLO 16 candle)', () => {
  // candle pengisi di ATAS pintu (low > 100) supaya tidak membuat X baru — paket lama dibiarkan menua
  const basi = computeTicket([...longCandles, ...Array.from({ length: 16 }, (_, i) => mk(20 + i, 100.4, 100.6, 100.2, 100.5))], zones, 'LONG', 100.5);
  assert.ok(basi);
  assert.equal(basi.entryAgeBars !== null && basi.entryAgeBars > 3, true);
  assert.equal(basi.actionable, false, 'tiket umur 16 candle tidak boleh actionable');
  assert.match(basi.warnings.join(' '), /tiket dianggap basi/);
});
test('zona kena batal: tutup di luar garis batal mematikan sisi itu, koin tidak dihukum', () => {
  // candle terakhir ditutup 94.5 — di bawah garis batal long (95) → sisi LONG mati
  const menembus = [...longCandles.slice(0, -1), mk(longCandles.length - 1, 96, 96.2, 94.2, 94.5)];
  const longMati = detectSetup(menembus, zones, 'LONG');
  assert.equal(longMati.valid, false);
  assert.equal(longMati.x, null, 'X lama ikut gugur — zona sudah batal');
  assert.match(longMati.notes.join(' '), /BATAL/);

  // zona long batal tidak membunuh sisi SHORT (cermin: 94.5 masih di dalam untuk short)
  const shortSisa = detectSetup(menembus, zones, 'SHORT');
  assert.equal(/BATAL/.test(shortSisa.notes.join(' ')), false, 'sisi short tidak ikut mati');
});
