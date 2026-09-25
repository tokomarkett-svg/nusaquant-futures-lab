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
import { sendTelegram, scanAlertCandidates } from './alerts.ts';
import { BinancePublicMarketDataClient, DEFAULT_BINANCE_BASE_URL } from './market-data.ts';

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
    if (route === '/papan' && req.method === 'GET') {
      res.statusCode = 200;
      res.setHeader('content-type', 'text/html; charset=utf-8');
      res.setHeader('cache-control', 'no-store');
      res.end(halamanPapan());
      return;
    }
    if (route === '/data/papan-json' && req.method === 'GET') {
      try {
        const market = new BinancePublicMarketDataClient({ baseUrl: process.env.BINANCE_BASE_URL ?? DEFAULT_BINANCE_BASE_URL });
        const rows = await scanAlertCandidates(market, 12);
        const payload = rows.map((r) => ({
          symbol: r.symbol, side: r.side, price: r.priceNow, gate: r.gate, gateAlign: r.gateAlign,
          siap: Boolean(r.ticket?.actionable && r.gateAlign),
          basi: Boolean(r.ticket && !r.ticket.actionable),
          entry: r.ticket?.entry ?? null, stop: r.ticket?.stop ?? null, target: r.ticket?.target ?? null,
          sizeCoin: r.ticket?.sizeCoin ?? null, riskPct: r.ticket?.riskPct ?? null,
          garis: r.garis ?? null, ageMin: r.dataAgeMin,
        }));
        return balasJson(200, { ok: true, rows: payload, at: new Date().toISOString() });
      } catch (error) {
        return balasJson(502, { ok: false, error: error instanceof Error ? error.message : 'pindai gagal' });
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


/** Halaman PAPAN DARURAT — dibuka dari domain Railway (umumnya tak tersapu blokir provider). */
function halamanPapan(): string {
  return `<!DOCTYPE html>
<html lang="id"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>NusaQuant — Papan Darurat</title>
<style>
body{margin:0;background:#f6faf7;color:#16241b;font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif}
.wrap{max-width:460px;margin:0 auto;padding:16px 14px 40px}
h1{font-size:19px;margin:6px 0 2px}
.sub{color:#5c7a67;font-size:12px}
.kartu{background:linear-gradient(180deg,#f2fbf5,#e9f7ee);border:1px solid #1c5c34;border-radius:14px;padding:14px 16px;margin-top:10px}
.badge{display:inline-block;font-size:11px;font-weight:800;padding:3px 10px;border-radius:8px;background:#0e2a1d;color:#fff;margin-right:6px}
.sisi{font-size:11px;font-weight:800;padding:3px 10px;border-radius:8px}
.long{background:#dff3e6;color:#0e7a3d}.short{background:#fde8e8;color:#b3311e}
.entry{font-family:ui-monospace,monospace;font-size:30px;font-weight:700;margin-top:4px}
.baris{font-family:ui-monospace,monospace;font-size:13px;margin-top:6px;color:#3c5747}
.salintext{font-family:ui-monospace,monospace;font-size:11px;color:#5c7a67;margin-top:8px}
.baris-list{background:#fff;border:1px solid #dcebe1;border-radius:12px;padding:10px 12px;margin-top:8px;font-size:13px;display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.muat{color:#5c7a67;font-size:13px;margin-top:14px;text-align:center}
.gagal{background:#fdeeee;border:1px solid #efc9c9;color:#b3311e;border-radius:12px;padding:12px;margin-top:12px;font-size:13px}
</style></head><body><div class="wrap">
<h1>🟢 NusaQuant — Papan Darurat</h1>
<div class="sub">dibuka lewat domain Railway — jalan walau vercel.app kena sapu provider · segar tiap 60 dtk · <span id="jam">…</span></div>
<div id="isi"><div class="muat">Memindai futures…</div></div>
<script>
function dgt(v){return v>=100?v.toFixed(2):v>=1?v.toFixed(4):v>=0.01?v.toFixed(5):v.toFixed(7)}
async function muat(){
  try{
    const r=await fetch('/data/papan-json',{cache:'no-store'});
    const b=await r.json();
    if(!b.ok)throw new Error(b.error||'gagal');
    document.getElementById('jam').textContent=new Date(b.at).toLocaleTimeString('id-ID',{timeZone:'Asia/Jakarta'})+' WIB';
    const siap=b.rows.filter(x=>x.siap), lain=b.rows.filter(x=>!x.siap);
    let h='';
    if(siap.length===0)h+='<div class="baris-list">🎯 Belum ada tiket segar sekarang — mesin duduk menunggu (itu perilaku benar).</div>';
    for(const s of siap){
      const o=s.side==='LONG'?'BUY':'SELL';
      h+='<div class="kartu"><span class="badge">🎯 SIAP ENTRI</span><b>'+s.symbol+'</b> <span class="sisi '+s.side.toLowerCase()+'">'+s.side+' · '+o+'</span><div>ENTRY</div><div class="entry">'+dgt(s.entry)+'</div>'
        +'<div class="baris">🛑 SL '+dgt(s.stop)+' · ✅ TP '+dgt(s.target)+' · 📦 '+Number(s.sizeCoin).toLocaleString('id-ID',{maximumFractionDigits:2})+' coin</div>'
        +'<div class="baris">📏 pintu '+dgt(s.garis.pintu)+' · manis '+dgt(s.garis.manis)+' · batal '+dgt(s.garis.batal)+'</div>'
        +'<div class="salintext">Salin: '+o+' '+s.symbol+' '+dgt(s.entry)+' SL '+dgt(s.stop)+' TP '+dgt(s.target)+'</div></div>';
    }
    h+='<div class="sub" style="margin-top:14px">SIMAKAN · '+lain.length+' kandidat terdekat</div>';
    for(const s of lain){
      h+='<div class="baris-list"><b>'+s.symbol+'</b><span class="sisi '+s.side.toLowerCase()+'">'+s.side+'</span><span>'+dgt(s.price)+'</span><span>gate '+s.gate+(s.gateAlign?' ✔':'')+'</span><span style="margin-left:auto;color:#7fa98d">'+(s.basi?'basi':(s.siap?'siap':'simak'))+'</span></div>';
    }
    document.getElementById('isi').innerHTML=h;
  }catch(e){
    document.getElementById('isi').innerHTML='<div class="gagal">Gagal memindai: '+(e&&e.message?e.message:e)+' — coba lagi 1 menit.</div>';
  }
}
muat(); setInterval(muat,60000);
</script></div></body></html>`;
}
