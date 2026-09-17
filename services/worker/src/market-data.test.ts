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

test('getKlines mendukung interval 1d untuk radar', async () => {
  let seenUrl = '';
  const client = new BinancePublicMarketDataClient({
    fetchImpl: (async (url: URL | string) => {
      seenUrl = String(url);
      return { ok: true, json: async () => [[1_700_000_000_000, '1', '2', '0.5', '1.5', '10', 0, '0', '0', '0', '0', 0] ] } as unknown as Response;
    }) as typeof fetch,
  });
  const candles = await client.getKlines({ symbol: 'BTCUSDT', interval: '1d', limit: 1 });
  assert.equal(candles.length, 1);
  assert.ok(seenUrl.includes('interval=1d'), `URL harus memuat interval=1d, dapat ${seenUrl}`);
});
