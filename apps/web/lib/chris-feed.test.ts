import test from 'node:test';
import assert from 'node:assert/strict';

test('app Chris displays exactly worker decision and rejects stale feed/worker failure', async () => {
  const { GET } = await import('../app/api/chris/route');
  const before = process.env.WORKER_DATA_URL;
  const prev = global.fetch;
  process.env.WORKER_DATA_URL = 'https://worker.example.test';
  try {
    const now = Date.now();
    const decision = { symbol: 'BTCUSDT', side: 'LONG', stage: 'SIAP', c1: now - 1800000,
      c2: now - 900000, trigger: 0.06637, entry: 0.0664, stop: 0.065, target: 0.0692 };
    global.fetch = (async () => ({ ok: true, json: async () => ({ ok: true, at: new Date().toISOString(),
      rows: [{ symbol: 'BTCUSDT', at: now, status: 'terpantau', decision },
        { symbol: 'ETHUSDT', at: now - 180_000, status: 'error', decision }] }) }) as Response) as typeof fetch;
    const res = await GET();
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.deepEqual(data.rows[0].decision, decision);
    assert.equal(data.rows[1].decision, null);
    global.fetch = (async () => ({ ok: true, json: async () => ({ ok: true, at: new Date(now - 180_000).toISOString(), rows: [] }) }) as Response) as typeof fetch;
    assert.equal((await GET()).status, 503);
    global.fetch = (async () => { throw new Error('offline'); }) as typeof fetch;
    assert.equal((await GET()).status, 503);
  } finally {
    global.fetch = prev;
    if (before === undefined) delete process.env.WORKER_DATA_URL;
    else process.env.WORKER_DATA_URL = before;
  }
});
