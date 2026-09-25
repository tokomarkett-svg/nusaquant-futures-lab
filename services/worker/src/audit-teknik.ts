/**
 * Audit teknik Pintu–Manis–Batal: recompute penuh dari data futures LIVE (via jembatan worker),
 * lalu tunjukkan tiap aturan — likuid, range ≥3%, garis 0.705/0.786/0.886, X, syarat sah
 * candle 1 & candle 2, gate searah, anti-nyangkut — plus PUTUSAN akhirnya.
 *
 * Pakai: npm run audit:teknik --workspace @nusaquant/worker -- FORMUSDT ETHFIUSDT
 * (tanpa argumen = audit 3 koin contoh)
 */
import { computeZones, detectSetup, computeTicket, gateFromCandles, RATIO, MIN_RANGE_PCT, MIN_QUOTE_VOLUME } from '@nusaquant/core';
import type { Candle } from '@nusaquant/core';

const BASE = (process.env.WORKER_DATA_URL ?? 'https://nusaquantworker-production.up.railway.app').replace(/\/+$/, '');
const WIB = 7 * 3_600_000;
const wib = (ms: number) => new Date(ms + WIB).toISOString().slice(5, 16).replace('T', ' ');
const f = (v: number, d = 5) => v.toFixed(d);

async function json(path: string, params: Record<string, string | number> = {}): Promise<unknown> {
  const url = new URL(path, BASE);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
  const r = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!r.ok) throw new Error(`${path} → HTTP ${r.status}`);
  return r.json();
}

const keCandle = (rows: unknown[]): Candle[] => (rows as unknown[][]).map((r) => ({
  time: Number(r[0]), open: Number(r[1]), high: Number(r[2]), low: Number(r[3]), close: Number(r[4]), volume: Number(r[5]),
})).filter((c) => Number.isFinite(c.time) && c.close > 0);

async function audit(symbol: string): Promise<void> {
  const [tickers, m15raw, h1raw] = await Promise.all([
    json('/data/tickers'), json('/data/klines', { symbol, interval: '15m', limit: 200 }), json('/data/klines', { symbol, interval: '1h', limit: 120 }),
  ]);
  const ticker = (tickers as Array<Record<string, unknown>>).find((t) => t.symbol === symbol);
  if (!ticker) { console.log(`${symbol}: TIDAK ADA di futures`); return; }
  const last = Number(ticker.lastPrice), high = Number(ticker.highPrice), low = Number(ticker.lowPrice), vol = Number(ticker.quoteVolume);
  const m15 = keCandle(m15raw as unknown[]).filter((c) => c.time + 900_000 <= Date.now());
  const h1 = keCandle(h1raw as unknown[]).filter((c) => c.time + 3_600_000 <= Date.now());
  const zones = computeZones({ last, high, low, quoteVolume: vol });
  const umurMenit = Math.round((Date.now() - ((m15.at(-1)?.time ?? 0) + 900_000)) / 60_000);

  console.log(`\n══════════ ${symbol} ══════════`);
  console.log(`LIVE: harga ${f(last)} · candle 15m terakhir ditutup ${umurMenit} mnt lalu (wajib ≤45)`);
  console.log(`[1] Likuiditas: ${f(vol / 1e6, 1)} jt ≥ ${MIN_QUOTE_VOLUME / 1e6} jt → ${vol >= MIN_QUOTE_VOLUME ? 'LOLOS' : 'GAGAL'}`);
  if (!zones) { console.log('zona nihil'); return; }
  console.log(`[2] Range 24j: ${f(zones.rangePct, 1)}% ≥ ${MIN_RANGE_PCT}% → ${zones.rangePct >= MIN_RANGE_PCT ? 'LOLOS' : 'GAGAL'}`);
  console.log(`[3] Garis (0.705/0.786/0.886) LONG : pintu ${f(zones.long.pintu)} manis ${f(zones.long.manis)} batal ${f(zones.long.batal)}`);
  console.log(`    Garis (0.705/0.786/0.886) SHORT: pintu ${f(zones.short.pintu)} manis ${f(zones.short.manis)} batal ${f(zones.short.batal)}`);
  const gate = gateFromCandles(h1).gate;
  for (const side of ['SHORT', 'LONG'] as const) {
    const setup = detectSetup(m15, zones, side);
    const ticket = computeTicket(m15, zones, side, last);
    const searah = (side === 'LONG' && gate === 'HIJAU') || (side === 'SHORT' && gate === 'MERAH');
    console.log(`[4] ${side}: X=${setup.x ? wib(setup.x) : '—'} · C1=${setup.candle1 ? wib(setup.candle1) : '—'} · C2=${setup.candle2 ? wib(setup.candle2) : '—'} · gate ${gate} & ${side} → ${searah ? 'SEARAH' : 'LAWAN'}`);
    if (setup.candle1) {
      const c1 = m15.find((c) => c.time === setup.candle1);
      if (c1) {
        const badan = Math.abs(c1.close - c1.open), buntut = side === 'LONG' ? Math.min(c1.open, c1.close) - c1.low : c1.high - Math.max(c1.open, c1.close);
        const rangeC = c1.high - c1.low;
        const luar = side === 'LONG' ? c1.close >= (c1.high + c1.low) / 2 : c1.close <= (c1.high + c1.low) / 2;
        console.log(`    Sah C1? buntut/badan ${f(badan > 0 ? buntut / badan : 99, 2)}× (≥2) ${buntut >= 2 * badan ? '✓' : '✗'} · badan ${f((badan / rangeC) * 100, 1)}% (≥8%) ${badan >= 0.08 * rangeC ? '✓' : '✗'} · close paruh ${luar ? 'luar ✓' : 'dalam ✗'}`);
      }
    }
    if (setup.candle2 && setup.candle1) {
      const jeda = Math.round((setup.candle2 - setup.candle1) / 900_000);
      const umurC2 = Math.round(((m15.at(-1)?.time ?? 0) - setup.candle2) / 900_000);
      console.log(`    Sah C2? menembus ${jeda} candle (maks 3) ${jeda <= 3 ? '✓' : '✗'} · umur ${umurC2} candle (maks 3) → ${umurC2 <= 3 ? 'SEGAR' : 'BASI (mati)'}`);
    }
    if (ticket) {
      console.log(`[5] TIKET ${side}: entry ${f(ticket.entry)} · stop ${f(ticket.stop)} · target ${f(ticket.target)} (2R) · ${ticket.sizeCoin.toLocaleString('id-ID', { maximumFractionDigits: 2 })} coin · jarak ${f(ticket.riskPct, 2)}%`);
      console.log(`    Anti-nyangkut: ${f(Math.abs(last - ticket.entry) / ticket.riskDistance, 2)}R (maks 0.5R) → ${ticket.chaseRisk ? 'NYANGKUT' : 'AMAN'}`);
      console.log(`    ⚖️ PUTUSAN: ${ticket.actionable && searah ? `BOLEH ENTRI (${side})` : ticket.actionable ? 'tiket sah tapi gate lawan — JANGAN' : 'TIDAK LAYAK — ' + (ticket.warnings.join('; ') || 'gagal pagar')}`);
    } else {
      console.log(`[5] TIDAK ADA TIKET — ${setup.notes.join('; ') || 'paket belum lengkap'}`);
    }
  }
}

async function main(): Promise<void> {
  const target = process.argv.slice(2);
  const simbol = target.length ? target : ['ETHFIUSDT', 'FORMUSDT', 'ORCLUSDT'];
  console.log(`Rasio resmi: pintu ${RATIO.pintu} · manis ${RATIO.manis} · batal ${RATIO.batal} · sumber: ${BASE} (futures)`);
  for (const s of simbol) {
    try { await audit(s.toUpperCase()); } catch (e) { console.log(`${s}: ${e instanceof Error ? e.message : e}`); }
  }
}
main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exitCode = 1; });
