import assert from 'node:assert/strict';
import test from 'node:test';
import { toLegacyMarketCandleRows, toMarketCandleRows } from './ingest.ts';

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

test('ingestion preserves Binance taker-flow fields and can downgrade for legacy schema', () => {
  const rows = toMarketCandleRows('BTCUSDT', '15m', [{
    time: Date.parse('2026-09-09T05:00:00.000Z'),
    open: 100,
    high: 105,
    low: 99,
    close: 104,
    volume: 1234,
    quoteVolume: 123456,
    takerBuyVolume: 600,
    takerBuyQuoteVolume: 60000,
    tradeCount: 1200,
  }]);
  assert.equal(rows[0].taker_buy_volume, 600);
  assert.equal(rows[0].taker_buy_quote_volume, 60000);
  assert.deepEqual(toLegacyMarketCandleRows(rows)[0], {
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
