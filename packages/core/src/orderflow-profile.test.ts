import assert from 'node:assert/strict';
import test from 'node:test';
import { buildTradeVolumeProfile, profileLocation, type AggressorTrade } from './orderflow-profile.ts';

const trades: AggressorTrade[] = [
  { id: 10, time: 1000, price: 99, quantity: 3, buyerIsMaker: true },
  { id: 11, time: 1100, price: 100, quantity: 6, buyerIsMaker: false },
  { id: 12, time: 1200, price: 100, quantity: 4, buyerIsMaker: true },
  { id: 13, time: 1300, price: 101, quantity: 5, buyerIsMaker: false },
];
const input = { symbol: 'BTCUSDT', trades, start: 0, end: 2000, tickSize: 1, market: 'FUTURES' as const, complete: true };

test('footprint membaca m=true sebagai seller agresif; POC dan value area dihitung dari transaksi per harga', () => {
  const profile = buildTradeVolumeProfile(input);
  assert.ok(profile);
  assert.equal(profile.poc, 100);
  assert.equal(profile.totalVolume, 18);
  assert.equal(profile.totalDelta, 4); // buy 11, sell 7
  assert.deepEqual(profile.levels.map(({ price, takerBuyQty, takerSellQty, delta }) =>
    ({ price, takerBuyQty, takerSellQty, delta })), [
    { price: 99, takerBuyQty: 0, takerSellQty: 3, delta: -3 },
    { price: 100, takerBuyQty: 6, takerSellQty: 4, delta: 2 },
    { price: 101, takerBuyQty: 5, takerSellQty: 0, delta: 5 },
  ]);
  assert.equal(profile.valueAreaLow, 100);
  assert.equal(profile.valueAreaHigh, 101);
  assert.equal(profileLocation(profile, 99), 'DISCOUNT');
  assert.equal(profileLocation(profile, 100), 'VALUE');
  assert.equal(profileLocation(profile, 102), 'PREMIUM');
  assert.equal(profileLocation(profile, Number.NaN), null);
});

test('research-only: fail closed saat dataset parsial, pasar spot, gap ID, future time, atau trade invalid', () => {
  assert.equal(buildTradeVolumeProfile({ ...input, complete: false }), null);
  assert.equal(buildTradeVolumeProfile({ ...input, market: 'SPOT' }), null);
  assert.equal(buildTradeVolumeProfile({ ...input, trades: [trades[0], trades[2]] }), null);
  assert.equal(buildTradeVolumeProfile({ ...input, end: 1250 }), null);
  assert.equal(buildTradeVolumeProfile({ ...input, trades: [{ ...trades[0], quantity: -1 }] }), null);
  assert.equal(buildTradeVolumeProfile({ ...input, tickSize: 0 }), null);
});
