import assert from 'node:assert/strict';
import test from 'node:test';
import { BinancePublicMarketDataClient } from './market-data.ts';

test('public market adapter validates and filters unfinished candles', async () => {
  const now = Date.now();
  const payload = [
    [now - 3_600_000, '100', '102', '99', '101', '0', now],
    [now - 1000, '101', '102', '100', '101.5', '900', now],
  ];
  const client = new BinancePublicMarketDataClient({
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      json: async () => payload,
    } as Response),
  });
  const candles = await client.getKlines({ symbol: 'BTCUSDT', interval: '1h', limit: 10 });
  assert.equal(candles.length, 1);
  assert.equal(candles[0].close, 101);
});

test('public market adapter rejects exchange errors', async () => {
  const client = new BinancePublicMarketDataClient({
    fetchImpl: async () => ({ ok: false, status: 429, json: async () => ({}) } as Response),
  });
  await assert.rejects(() => client.getKlines({ symbol: 'BTCUSDT', interval: '15m' }), /HTTP 429/);
});
