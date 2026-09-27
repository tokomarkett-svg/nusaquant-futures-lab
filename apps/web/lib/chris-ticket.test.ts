import test from 'node:test';
import assert from 'node:assert/strict';
import { manualTicket } from './manual-ticket';

test('Demo approval uses ONLY closed C2 from worker Chris; rejects stale, wrong side & reversal', async () => {
  const old = process.env.WORKER_DATA_URL;
  const prev = global.fetch;
  process.env.WORKER_DATA_URL = 'https://worker.test';
  const q = 900_000;
  const c2 = Math.floor(Date.now() / q) * q - q;
  const d = { symbol: 'BTCUSDT', side: 'LONG', stage: 'SIAP', x: c2 - 3 * q, c1: c2 - q, c2,
    trigger: 100, priceNow: 101.2, entry: 101, stop: 99, target: 105, sizeCoin: .155 };
  let decision = d;
  let price = 101.2;
  const fetchMock = (async (url: URL | string) => ({ ok: true, json: async () => String(url).includes('champion-json')
    ? { ok: true, at: new Date().toISOString(), rows: [{ symbol: 'BTCUSDT', at: Date.now(), decision }] }
    : [{ symbol: 'BTCUSDT', lastPrice: String(price), highPrice: '110', lowPrice: '90', quoteVolume: '10000000' }],
  }) as Response) as typeof fetch;
  global.fetch = fetchMock;
  try {
    assert.equal((await manualTicket('BTCUSDT', 'LONG')).setupKey, `BTCUSDT:LONG:${c2}`);
    await assert.rejects(manualTicket('BTCUSDT', 'SHORT'), /belum ada tiket/i);
    price = 99.8;
    await assert.rejects(manualTicket('BTCUSDT', 'LONG'), /batas C1/i);
    price = 101.2;
    decision = { ...d, stage: 'BATAL' };
    await assert.rejects(manualTicket('BTCUSDT', 'LONG'), /belum ada tiket/i);
  } finally {
    global.fetch = prev;
    if (old === undefined) delete process.env.WORKER_DATA_URL;
    else process.env.WORKER_DATA_URL = old;
  }
});
