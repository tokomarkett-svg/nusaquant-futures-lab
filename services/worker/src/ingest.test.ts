import assert from 'node:assert/strict';
import test from 'node:test';
import { toMarketCandleRows } from './ingest.ts';

test('ingestion maps candles to the Supabase schema', () => {
  const rows = toMarketCandleRows('btcusdt', '15m', [{
    time: Date.parse('2026-09-09T05:00:00.000Z'),
    open: 100,
    high: 105,
    low: 99,
    close: 104,
    volume: 1234,
  }]);
  assert.deepEqual(rows[0], {
    symbol: 'BTCUSDT',
    interval: '15m',
    open_time: '2026-09-09T05:00:00.000Z',
    open: 100,
    high: 105,
    low: 99,
    close: 104,
    volume: 1234,
    source: 'BINANCE_PUBLIC',
  });
});
