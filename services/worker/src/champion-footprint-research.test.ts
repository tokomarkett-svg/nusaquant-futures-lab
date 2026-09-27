import assert from 'node:assert/strict';
import test from 'node:test';
import { collectFuturesFootprint } from './champion-footprint-research.ts';

const end = Math.floor(Date.now() / 60_000) * 60_000 - 60_000;
const start = end - 5 * 60_000;
const trade = (id: number, time = start + 1_000) => ({ a: id, T: time, p: '100.0', q: '1', m: id % 2 === 0 });

test('research: paginasi 1000 aggTrades Futures, m=true sell taker, stop setelah end tanpa order/alarm', async () => {
  const requests: URL[] = [];
  const fetchImpl = (async (url: URL) => {
    requests.push(url);
    const batch = requests.length === 1
      ? Array.from({ length: 1000 }, (_, i) => trade(i + 1))
      : [trade(1001, start + 2_000), trade(1002, end + 1)];
    return { ok: true, json: async () => batch } as Response;
  }) as typeof fetch;
  const profile = await collectFuturesFootprint({ symbol: 'BTCUSDT', start, end, tickSize: 0.1, fetchImpl });
  assert.ok(profile);
  assert.equal(profile.totalVolume, 1001);
  assert.equal(profile.totalDelta, 1); // odd IDs = buyer taker; even IDs = seller taker
  assert.equal(requests.length, 2);
  assert.equal(requests[0].searchParams.get('endTime'), String(end - 1));
  assert.equal(requests[1].searchParams.get('fromId'), '1001');
  assert.equal(requests[1].searchParams.has('endTime'), false);
  assert.ok(requests.every((url) => url.pathname === '/fapi/v1/aggTrades'));
});

test('research: page limit, missing aggregate ID, stale >24h dan HTTP error wajib fail closed', async () => {
  const first = (async () => ({ ok: true, json: async () => Array.from({ length: 1000 }, (_, i) => trade(i + 1)) }) as Response) as typeof fetch;
  assert.equal(await collectFuturesFootprint({ symbol: 'BTCUSDT', start, end, tickSize: .1, maxPages: 1, fetchImpl: first }), null);
  let called = 0;
  const gap = (async () => ({ ok: true, json: async () => ++called === 1
    ? Array.from({ length: 1000 }, (_, i) => trade(i + 1)) : [trade(1002)] }) as Response) as typeof fetch;
  assert.equal(await collectFuturesFootprint({ symbol: 'BTCUSDT', start, end, tickSize: .1, fetchImpl: gap }), null);
  assert.equal(await collectFuturesFootprint({ symbol: 'BTCUSDT', start: end - 25 * 3_600_000, end, tickSize: .1, fetchImpl: first }), null);
  const error = (async () => ({ ok: false }) as Response) as typeof fetch;
  assert.equal(await collectFuturesFootprint({ symbol: 'BTCUSDT', start, end, tickSize: .1, fetchImpl: error }), null);
});
