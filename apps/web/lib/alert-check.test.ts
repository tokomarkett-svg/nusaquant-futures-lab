import test from 'node:test';
import assert from 'node:assert/strict';

test('alarm preflight rejects missing/wrong shared token before any market request', async () => {
  const { POST } = await import('../app/api/meja/alert-check/route');
  const old = process.env.WORKER_EXEC_TOKEN;
  const body = (token: string) => new Request('https://web-gray-eta-79.vercel.app/api/meja/alert-check', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ token, symbol: 'BTCUSDT', side: 'LONG', setupKey: 'BTCUSDT:LONG:0' }),
  });
  try {
    delete process.env.WORKER_EXEC_TOKEN;
    assert.equal((await POST(body('anything'))).status, 401);
    process.env.WORKER_EXEC_TOKEN = 'secret-value';
    assert.equal((await POST(body('wrong-value'))).status, 401);
  } finally {
    if (old === undefined) delete process.env.WORKER_EXEC_TOKEN;
    else process.env.WORKER_EXEC_TOKEN = old;
  }
});
