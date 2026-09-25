import assert from 'node:assert/strict';
import test from 'node:test';
import { formatHarga, formatQty, tandaTangan } from './exec-demo.ts';

test('tandaTangan: query terurut + HMAC-SHA256 heksadesimal', () => {
  const sig = tandaTangan({ symbol: 'BTCUSDT', side: 'BUY', timestamp: 1700000000000 }, 'rahasia');
  assert.match(sig, /^[a-f0-9]{64}$/);
  const sigDua = tandaTangan({ timestamp: 1700000000000, side: 'BUY', symbol: 'BTCUSDT' }, 'rahasia');
  assert.equal(sig, sigDua, 'urutan kunci tidak boleh mengubah hasil');
});

test('formatQty: bulat ke kelipatan stepSize & tolak di bawah minimum', () => {
  assert.equal(formatQty(64.5833, 0.01).qty, '64.58');
  assert.equal(formatQty(11481.49, 1).qty, '11481');
  assert.equal(formatQty(0.97, 0.01).valid, true);
  assert.equal(formatQty(0.004, 0.01).valid, false, 'lebih kecil dari satu step tidak sah');
});

test('formatHarga: bulat ke tickSize', () => {
  assert.equal(formatHarga(0.680004, 0.0001), '0.6800');
  assert.equal(formatHarga(93.08712, 0.1), '93.1');
});
