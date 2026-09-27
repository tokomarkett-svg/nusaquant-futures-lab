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

import { bukaDemo, demoConfig } from './exec-demo.ts';

test('Demo terkunci default, bahkan jika kunci Binance terpasang (tanpa panggilan jaringan)', async () => {
  const old = process.env.DEMO_EXECUTION_ENABLED;
  const oldFetch = globalThis.fetch;
  try {
    delete process.env.DEMO_EXECUTION_ENABLED;
    globalThis.fetch = async () => { throw new Error('network must not be called'); };
    await assert.rejects(bukaDemo({ symbol: 'BTCUSDT', side: 'LONG', qty: 0.3, expectedEntry: 100,
      stop: 99, target: 102, setupKey: `BTCUSDT:LONG:${Date.now() - 20 * 60_000}` }), /terkunci/);
    assert.equal(demoConfig().base, 'https://testnet.binancefuture.com');
  } finally { if (old === undefined) delete process.env.DEMO_EXECUTION_ENABLED; else process.env.DEMO_EXECUTION_ENABLED = old; globalThis.fetch = oldFetch; }
});

test('stop ditolak bursa: adaptor TIDAK mengembalikan sukses dan menutup posisi Demo', async () => {
  const oldFetch = globalThis.fetch;
  const keys = ['BINANCE_TESTNET_API_KEY', 'BINANCE_TESTNET_API_SECRET', 'DEMO_EXECUTION_ENABLED'] as const;
  const oldEnv = keys.map((key) => process.env[key]);
  let position = 0;
  let closeCalls = 0;
  let entryCalls = 0;
  const mock = (payload: unknown, status = 200) => new Response(JSON.stringify(payload), { status, headers: { 'content-type': 'application/json' } });
  try {
    process.env.BINANCE_TESTNET_API_KEY = 'test-key'; process.env.BINANCE_TESTNET_API_SECRET = 'test-secret'; process.env.DEMO_EXECUTION_ENABLED = '1';
    globalThis.fetch = async (url, options) => {
      const u = new URL(String(url));
      assert.equal(u.origin, 'https://testnet.binancefuture.com', 'NEVER send test credentials to mainnet');
      const path = u.pathname;
      if (path === '/fapi/v1/exchangeInfo') return mock({ symbols: [{ symbol: 'BTCUSDT', status: 'TRADING', filters: [
        { filterType: 'MARKET_LOT_SIZE', stepSize: '0.001', minQty: '0.001' }, { filterType: 'PRICE_FILTER', tickSize: '0.1' },
        { filterType: 'MIN_NOTIONAL', notional: '5' },
      ] }] });
      if (path === '/fapi/v3/account') return mock({});
      if (path === '/fapi/v1/positionSide/dual') return mock({ dualSidePosition: false });
      if (path === '/fapi/v1/ticker/price') return mock({ price: '100' });
      if (path === '/fapi/v2/positionRisk') return mock([{ symbol: 'BTCUSDT', positionAmt: String(position) }]);
      if (path === '/fapi/v1/openOrders' || path === '/fapi/v1/openAlgoOrders') return mock([]);
      if (path === '/fapi/v1/order' && options?.method === 'GET') return mock({ code: -2013, msg: 'Order does not exist.' }, 400);
      if (path === '/fapi/v1/order' && options?.method === 'POST') {
        if (u.searchParams.get('reduceOnly') === 'true') { closeCalls++; position = 0; return mock({ status: 'FILLED' }); }
        entryCalls++; position = 0.3;
        return mock({ status: 'FILLED', orderId: 987, avgPrice: '100', executedQty: '0.300' });
      }
      if (path === '/fapi/v1/algoOrder' && options?.method === 'POST') return mock({ code: -4120, msg: 'Algo order rejected' }, 400);
      if (path === '/fapi/v1/allOpenOrders' || path === '/fapi/v1/algoOpenOrders') return mock({ code: 200, msg: 'success' });
      throw new Error(`Unexpected testnet request ${options?.method} ${path}`);
    };
    await assert.rejects(bukaDemo({ symbol: 'BTCUSDT', side: 'LONG', qty: 0.3, expectedEntry: 100,
      stop: 99, target: 102, setupKey: `BTCUSDT:LONG:${Date.now() - 20 * 60_000}` }), /dibatalkan dan posisi ditutup/);
    assert.equal(entryCalls, 1);
    assert.equal(closeCalls, 1);
    assert.equal(position, 0);
  } finally {
    globalThis.fetch = oldFetch;
    keys.forEach((key, index) => { if (oldEnv[index] === undefined) delete process.env[key]; else process.env[key] = oldEnv[index]; });
  }
});

test('sukses hanya bila kedua proteksi Algo terlihat aktif di exchange (tanpa order nyata)', async () => {
  const oldFetch = globalThis.fetch;
  const keys = ['BINANCE_TESTNET_API_KEY', 'BINANCE_TESTNET_API_SECRET', 'DEMO_EXECUTION_ENABLED'] as const;
  const oldEnv = keys.map((key) => process.env[key]);
  const active: number[] = [];
  let entryCalls = 0;
  const mock = (payload: unknown, status = 200) => new Response(JSON.stringify(payload), { status, headers: { 'content-type': 'application/json' } });
  try {
    process.env.BINANCE_TESTNET_API_KEY = 'test-key'; process.env.BINANCE_TESTNET_API_SECRET = 'test-secret'; process.env.DEMO_EXECUTION_ENABLED = '1';
    globalThis.fetch = async (url, options) => {
      const u = new URL(String(url)); assert.equal(u.origin, 'https://testnet.binancefuture.com');
      switch (u.pathname) {
        case '/fapi/v1/exchangeInfo': return mock({ symbols: [{ symbol: 'BTCUSDT', status: 'TRADING', filters: [
          { filterType: 'MARKET_LOT_SIZE', stepSize: '0.001', minQty: '0.001' }, { filterType: 'PRICE_FILTER', tickSize: '0.1' }, { filterType: 'MIN_NOTIONAL', notional: '5' },
        ] }] });
        case '/fapi/v3/account': return mock({});
        case '/fapi/v1/positionSide/dual': return mock({ dualSidePosition: false });
        case '/fapi/v1/ticker/price': return mock({ price: '100' });
        case '/fapi/v2/positionRisk': return mock([{ symbol: 'BTCUSDT', positionAmt: '0' }]);
        case '/fapi/v1/openOrders': return mock([]);
        case '/fapi/v1/openAlgoOrders': return mock(active.map((algoId) => ({ algoId })));
        case '/fapi/v1/order':
          if (options?.method === 'GET') return mock({ code: -2013, msg: 'Order does not exist.' }, 400);
          entryCalls++;
          return mock({ status: 'FILLED', orderId: 987, avgPrice: '100', executedQty: '0.300' });
        case '/fapi/v1/algoOrder':
          assert.equal(u.searchParams.get('algoType'), 'CONDITIONAL');
          assert.ok(u.searchParams.get('triggerPrice'));
          active.push(active.length === 0 ? 111 : 222);
          return mock({ algoId: active.at(-1) });
        default: throw new Error(`Unexpected mock route ${u.pathname}`);
      }
    };
    const result = await bukaDemo({ symbol: 'BTCUSDT', side: 'LONG', qty: 0.3, expectedEntry: 100,
      stop: 99, target: 102, setupKey: `BTCUSDT:LONG:${Date.now() - 20 * 60_000}` });
    assert.equal(result.ok, true); assert.equal(result.slOrderId, '111'); assert.equal(result.tpOrderId, '222');
    assert.equal(entryCalls, 1);
  } finally {
    globalThis.fetch = oldFetch;
    keys.forEach((key, index) => { if (oldEnv[index] === undefined) delete process.env[key]; else process.env[key] = oldEnv[index]; });
  }
});
