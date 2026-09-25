import assert from 'node:assert/strict';
import test from 'node:test';
import { computeTicket, detectSetup, type Candle, type Zones } from './binance.ts';

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
  const risk = 101.2 - 96.4;
  assert.equal(ticket.entry, 101.2);
  assert.equal(ticket.stop, 96.4);
  assert.ok(Math.abs(ticket.target - (101.2 + 2 * risk)) < 1e-9);
  assert.ok(Math.abs(ticket.sizeCoin - 0.31 / risk) < 1e-9);
  assert.equal(ticket.rr, 2);
  assert.equal(ticket.actionable, true);
  assert.equal(ticket.stopVsBatal, 'aman');
  assert.equal(ticket.warnings.length, 0);
});

test('pagar anti-nyangkut: harga sudah jalan >0,5R dari entry -> tiket tidak bisa dieksekusi', () => {
  const chased = computeTicket(longCandles, zones, 'LONG', 105);
  assert.ok(chased);
  assert.equal(chased.actionable, false);
  assert.equal(chased.chaseRisk, true);
  assert.match(chased.warnings.join(' '), /jangan dikejar/);
});

test('tiket short (cermin): entry = close candle 2, stop = buntut atas candle 1, target = 2R ke bawah', () => {
  const setup = detectSetup(shortCandles, zones, 'SHORT');
  assert.equal(setup.valid, true);
  const ticket = computeTicket(shortCandles, zones, 'SHORT', 92.9);
  assert.ok(ticket);
  assert.equal(ticket.entry, 93.4);
  assert.equal(ticket.stop, 97.6);
  const risk = 97.6 - 93.4;
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
