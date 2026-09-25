/**
 * Jembatan data Binance FUTURES untuk web.
 *
 * Masalah: Vercel & beberapa IP datacenter diblokir fapi.binance.com (HTTP 451),
 * sementara worker di Railway terbukti bisa membaca futures.
 * Solusi: worker menyediakan endpoint baca-saja /data/* yang meneruskan ke fapi —
 * dengan cache pendek supaya hemat rate-limit. Papan web, notif, dan meja
 * menjadi membaca PASAR YANG SAMA: futures.
 */
import http from 'node:http';
import { bukaDemo, tutupDemo, tokenSah } from './exec-demo.ts';
import { sendTelegram } from './alerts.ts';

const INTERVAL_MS: Record<string, number> = {
  '5m': 300_000, '15m': 900_000, '30m': 1_800_000, '1h': 3_600_000, '4h': 14_400_000, '1d': 86_400_000,
};
const SYMBOL_RE = /^[A-Z0-9]{1,30}$/;

const CACHE_TTL_MS: Record<string, number> = {
  '/data/prices': 3_000,
  '/data/tickers': 20_000,
  '/data/klines': 8_000,
};

type CacheEntry = { at: number; payload: unknown };
const cache = new Map<string, CacheEntry>();

export function validateKlinesQuery(query: URLSearchParams): { ok: true; symbol: string; interval: string; limit: number } | { ok: false; error: string } {
  const symbol = (query.get('symbol') ?? '').toUpperCase();
  const interval = query.get('interval') ?? '15m';
  const limitRaw = query.get('limit') ?? '200';
  if (!SYMBOL_RE.test(symbol)) return { ok: false, error: 'symbol tidak sah.' };
  if (!(interval in INTERVAL_MS)) return { ok: false, error: 'interval tidak sah.' };
  const limit = Number(limitRaw);
  if (!Number.isInteger(limit) || limit < 1 || limit > 1000) return { ok: false, error: 'limit harus 1..1000.' };
  return { ok: true, symbol, interval, limit };
}

async function fetchUpstream(base: string, path: string, params: Record<string, string>): Promise<unknown> {
  const url = new URL(path, base);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  const response = await fetch(url, { signal: AbortSignal.timeout(9_000) });
  const payload = await response.json() as unknown;
  if (!response.ok) {
    const pesan = (payload as { msg?: string })?.msg ?? `HTTP ${response.status}`;
    throw new Error(`fapi: ${pesan}`);
  }
  return payload;
}

export function createDataProxyHandler(upstreamBase = process.env.WORKER_UPSTREAM_BASE ?? 'https://fapi.binance.com'): (req: http.IncomingMessage, res: http.ServerResponse) => Promise<void> {
  return async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    const url = new URL(req.url ?? '/', 'http://lokal');
    const route = url.pathname;

    const balasJson = (status: number, payload: unknown) => {
      res.statusCode = status;
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify(payload));
    };

    if (route === '/health') return balasJson(200, { ok: true, market: 'FUTURES', at: new Date().toISOString() });

    let upstreamPath = '';
    let params: Record<string, string> = {};
    if (route === '/exec/demo' && req.method === 'POST') {
      let body = '';
      for await (const chunk of req) body += chunk;
      try {
        const parsed = JSON.parse(body || '{}') as { token?: string; symbol?: string; side?: string; qty?: number; stop?: number; target?: number };
        if (!tokenSah(parsed.token, process.env.EXEC_TOKEN)) return balasJson(401, { ok: false, error: 'token eksekusi salah/kosong.' });
        const hasil = await bukaDemo({
          symbol: String(parsed.symbol ?? '').toUpperCase(),
          side: parsed.side === 'LONG' ? 'LONG' : 'SHORT',
          qty: Number(parsed.qty), stop: Number(parsed.stop), target: Number(parsed.target),
        });
        return balasJson(200, hasil);
      } catch (error) {
        return balasJson(502, { ok: false, error: error instanceof Error ? error.message : 'gagal eksekusi demo.' });
      }
    }
    if (route === '/exec/demo-close' && req.method === 'POST') {
      let body = '';
      for await (const chunk of req) body += chunk;
      try {
        const parsed = JSON.parse(body || '{}') as { token?: string; symbol?: string };
        if (!tokenSah(parsed.token, process.env.EXEC_TOKEN)) return balasJson(401, { ok: false, error: 'token eksekusi salah/kosong.' });
        return balasJson(200, await tutupDemo(String(parsed.symbol ?? '').toUpperCase()));
      } catch (error) {
        return balasJson(502, { ok: false, error: error instanceof Error ? error.message : 'gagal menutup demo.' });
      }
    }
    if (route === '/notify/demo' && req.method === 'POST') {
      let body = '';
      for await (const chunk of req) body += chunk;
      try {
        const parsed = JSON.parse(body || '{}') as { token?: string; text?: string };
        if (!tokenSah(parsed.token, process.env.EXEC_TOKEN)) return balasJson(401, { ok: false, error: 'token eksekusi salah/kosong.' });
        const teks = String(parsed.text ?? '').slice(0, 600);
        await sendTelegram(teks, { chatId: (process.env.TELEGRAM_CHAT_ID ?? '').trim() || undefined });
        return balasJson(200, { ok: true });
      } catch (error) {
        return balasJson(502, { ok: false, error: error instanceof Error ? error.message : 'gagal kirim telegram.' });
      }
    }
    if (route === '/data/prices') {
      upstreamPath = '/fapi/v1/ticker/price';
    } else if (route === '/data/tickers') {
      upstreamPath = '/fapi/v1/ticker/24hr';
    } else if (route === '/data/klines') {
      const check = validateKlinesQuery(url.searchParams);
      if (!check.ok) return balasJson(400, { ok: false, error: check.error });
      upstreamPath = '/fapi/v1/klines';
      params = { symbol: check.symbol, interval: check.interval, limit: String(check.limit) };
    } else {
      return balasJson(404, { ok: false, error: 'rute tidak dikenal.' });
    }

    const cacheKey = `${route}?${JSON.stringify(params)}`;
    const ttl = CACHE_TTL_MS[route] ?? 5_000;
    const cached = cache.get(cacheKey);
    if (cached && Date.now() - cached.at < ttl) return balasJson(200, cached.payload);

    try {
      const payload = await fetchUpstream(upstreamBase, upstreamPath, params);
      cache.set(cacheKey, { at: Date.now(), payload });
      return balasJson(200, payload);
    } catch (error) {
      return balasJson(502, { ok: false, error: error instanceof Error ? error.message : 'gagal meneruskan ke fapi.' });
    }
  };
}

/** Nyalakan jembatan. Kembalikan server supaya bisa ditutup di tes. */
export function startDataProxy(port: number, upstreamBase?: string): http.Server {
  const server = http.createServer((req, res) => {
    void createDataProxyHandler(upstreamBase)(req, res).catch(() => {
      res.statusCode = 500;
      res.end(JSON.stringify({ ok: false, error: 'kesalahan jembatan.' }));
    });
  });
  server.listen(port, '0.0.0.0');
  return server;
}
