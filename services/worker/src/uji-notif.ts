/**
 * Uji notif: cari paket sah (X→C1→C2) LONG & SHORT di data hidup, lalu RENDER notif Telegram
 * persis seperti yang akan dikirim (buildTicketText/buildBellText) — bukti notif tidak asal.
 * Pakai: node --import tsx src/uji-notif.ts [jumlahKoin]
 */
import { computeZones, detectSetup, computeTicket, gateFromCandles, MIN_RANGE_PCT, MIN_QUOTE_VOLUME } from '@nusaquant/core';
import type { Candle, Side } from '@nusaquant/core';
import { buildTicketText, buildBellText } from './alerts.ts';

const BASE = (process.env.WORKER_DATA_URL ?? 'https://nusaquantworker-production.up.railway.app').replace(/\/+$/, '');
const WIB = 7 * 3_600_000;
const wib = (ms: number) => new Date(ms + WIB).toISOString().slice(5, 16).replace('T', ' ');

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

async function main(): Promise<void> {
  const n = Number(process.argv[2] ?? '30');
  type Tkr = { symbol: string; last: number; high: number; low: number; quoteVolume: number };
  const tickers = ((await json('/data/tickers') as Record<string, string | number>[])
    .map((r) => ({ symbol: String(r.symbol), last: Number(r.lastPrice), high: Number(r.highPrice), low: Number(r.lowPrice), quoteVolume: Number(r.quoteVolume) }))
    .filter((t) => Number.isFinite(t.last) && t.last > 0 && Number.isFinite(t.high) && Number.isFinite(t.low)))
    .filter((t) => t.symbol.endsWith('USDT') && t.quoteVolume >= MIN_QUOTE_VOLUME)
    .filter((t => { const r = t.high > 0 && t.low > 0 ? ((t.high - t.low) / t.low) * 100 : 0; return r >= MIN_RANGE_PCT; }))
    .sort((a, b) => b.quoteVolume - a.quoteVolume).slice(0, n);
  const temuan: { symbol: string; side: Side; teks: string; bel: string | null; jam: string }[] = [];
  for (const t of tickers) {
    try {
      const [m15raw, h1raw] = await Promise.all([
        json('/data/klines', { symbol: t.symbol, interval: '15m', limit: 1000 }),
        json('/data/klines', { symbol: t.symbol, interval: '1h', limit: 300 }),
      ]);
      const m15 = keCandle(m15raw as unknown[]); const h1 = keCandle(h1raw as unknown[]);
      const zones = computeZones({ last: t.last, high: t.high, low: t.low });
      if (!zones) continue;
      const gateKini = gateFromCandles(h1).gate;
      for (const side of ['LONG', 'SHORT'] as Side[]) {
        const setup = detectSetup(m15, zones, side);
        if (!setup.valid || setup.candle2 === null) continue;
        const ticket = computeTicket(m15, zones, side, t.last);
        if (!ticket) continue;
        // gate PADA SAAT candle 2 lahir (replay yang jujur, bukan gate sekarang)
        const h1SaatLahir = h1.filter((c) => c.time + 3_600_000 <= setup.candle2! + 900_000).slice(-99);
        if (h1SaatLahir.length < 99) continue;
        const gateLahir = gateFromCandles(h1SaatLahir).gate;
        const gateAlign = (side === 'LONG' && gateLahir === 'HIJAU') || (side === 'SHORT' && gateLahir === 'MERAH');
        const garis = side === 'LONG' ? zones.long : zones.short;
        const cand = { symbol: t.symbol, side, priceNow: t.last, gate: gateLahir, gateAlign, setup, ticket, garis };
        const umurCandle = Math.round((m15.at(-1)!.time - setup.candle2) / 900_000);
        const teks = gateAlign && ticket.actionable
          ? buildTicketText(cand, ticket, process.env.PAPAN_URL)
          : buildTicketText(cand, ticket, process.env.PAPAN_URL);
        temuan.push({
          symbol: t.symbol, side,
          teks: teks + (gateAlign && ticket.actionable ? '' : '\n[REPLAY: paket ini sudah tua — di notif asli TIDAK dikirim; ditampilkan hanya sebagai contoh bentuk]'),
          bel: setup.x !== null && setup.candle1 === null && gateAlign ? buildBellText(cand) : null,
          jam: wib(setup.candle2),
        });
      }
    } catch { /* lanjut koin berikutnya */ }
  }
  const sah = temuan.filter((x) => !x.teks.includes('REPLAY'));
  const tua = temuan.filter((x) => x.teks.includes('REPLAY'));
  const searah = tua.filter((x) => x.teks.includes('SIAP ENTRI') || x.teks.includes('TIKET BASI') || !x.teks.includes('GATE BELUM SEARAH'));
  const longS = searah.filter((x) => x.side === 'LONG').slice(0, 1);
  const shortS = searah.filter((x) => x.side === 'SHORT').slice(0, 1);
  console.log(`\n=== PAKET SAH & MASIH HIDUP (akan dinotifkan beneran): ${sah.length} ===`);
  for (const t of sah.slice(0, 4)) { console.log(`\n━━━ ${t.symbol} ${t.side} · C2 lahir ${t.jam} WIB ━━━`); console.log(t.teks.replace(/<[^>]+>/g, '')); }
  console.log(`\n=== CONTOH BENTUK (paket sah tapi sudah tua — tidak dikirim): ${tua.length} ===`);
  const longContoh = longS[0] ?? tua.find((x) => x.side === 'LONG'); const shortContoh = shortS[0] ?? tua.find((x) => x.side === 'SHORT');
  for (const t of [longContoh, shortContoh]) {
    if (!t) continue;
    console.log(`\n━━━ ${t.symbol} ${t.side} · C2 lahir ${t.jam} WIB ━━━`);
    console.log(t.teks.replace(/<[^>]+>/g, ''));
    if (t.bel) { console.log('--- (bel pintu akan berbunyi seperti ini) ---'); console.log(t.bel.replace(/<[^>]+>/g, '')); }
  }
}
main().catch((e) => { console.error('GAGAL:', e?.message ?? e); process.exit(1); });
