/**
 * UJI BALIK strategi Pintu–Manis–Batal (aturan PERSIS mesin):
 * X menusuk pintu → C1 sah (buntut ≥2× badan, badan ≥8% range, close paruh luar)
 * → C2 menembus ≤3 candle → gate 1H searah → tiket segar (umur 0) → entry close C2.
 * Keluar: SL konservatif (sentuh-duanya = SL) / TP 2R / timeout 192 candle (48 jam).
 * Laporan: menang/kalah, ekspektasi R, dan PISAH per arah trend hari (naik/turun) —
 * untuk menguji teori "kalau trend naik jangan short".
 *
 * Pakai: npm run backtest:pmb --workspace @nusaquant/worker [jumlahKoin]
 */
import { computeZones, detectSetup, computeTicket, gateFromCandles } from '@nusaquant/core';
import type { Candle } from '@nusaquant/core';

const BASE = (process.env.WORKER_DATA_URL ?? 'https://nusaquantworker-production.up.railway.app').replace(/\/+$/, '');
const TIMEOUT = 192;
// --- tombol varian (untuk uji A/B sebelum mengubah mesin hidup) ---
const STOP_BATAL = process.env.PMB_STOP === 'batal';        // stop di garis batal (lebih lega)
const C2_MARGIN = Number(process.env.PMB_C2_MARGIN ?? '0'); // C2 harus menembus C1 lebih dalam (× jarak risiko)
const GATE_JAM = Number(process.env.PMB_GATE_JAM ?? '0');   // gate harus set warna N jam beruntun
const TREND = process.env.PMB_TREND ?? '';                  // 'searah' | 'lawan' — filter arah trend hari
const GATE_WAJIB = process.env.PMB_GATE === '1';            // MA 1H wajib searah saat entry (riset docs/50)
const MA15_WAJIB = process.env.PMB_MA15 === '1';            // MA 15m (25/99) wajib searah saat entry (riset docs/50)
const WIB = 7 * 3_600_000;
const wib = (ms: number) => new Date(ms + WIB).toISOString().slice(5, 16).replace('T', ' ');

async function json(path: string, params: Record<string, string | number> = {}): Promise<unknown> {
  const url = new URL(path, BASE);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
  const r = await fetch(url, { signal: AbortSignal.timeout(20000) });
  if (!r.ok) throw new Error(`${path} HTTP ${r.status}`);
  return r.json();
}
const keCandle = (rows: unknown[]): Candle[] => (rows as unknown[][]).map((r) => ({
  time: Number(r[0]), open: Number(r[1]), high: Number(r[2]), low: Number(r[3]), close: Number(r[4]), volume: Number(r[5]),
})).filter((c) => Number.isFinite(c.time) && c.close > 0);

type Hasil = { symbol: string; side: 'LONG' | 'SHORT'; gate: string; searahTrendHari: boolean; r: number; keluar: string; lahir: number };
const hasil: Hasil[] = [];

function gateLampau(gateMap: Map<number, string>, tutupMs: number, jamLalu: number): string {
  const target = tutupMs - jamLalu * 3_600_000;
  let terbaik = -1; let g = '';
  for (const [tutup, warna] of gateMap) if (tutup <= target && tutup > terbaik) { terbaik = tutup; g = warna; }
  return g;
}

async function uji(simbol: string): Promise<void> {
  const [m15raw, h1raw] = await Promise.all([
    json('/data/klines', { symbol: simbol, interval: '15m', limit: 1000 }),
    json('/data/klines', { symbol: simbol, interval: '1h', limit: 500 }),
  ]);
  const c = keCandle(m15raw as unknown[]);
  const h1 = keCandle(h1raw as unknown[]);
  if (c.length < 200 || h1.length < 120) return;

  // peta gate per jam-tutup
  const gateMap = new Map<number, string>();
  for (let i = 99; i < h1.length; i++) gateMap.set(h1[i].time + 3_600_000, gateFromCandles(h1.slice(0, i + 1)).gate);

  let terbuka: { arah: 'LONG' | 'SHORT'; entry: number; stop: number; target: number; jarak: number; lahir: number; gate: string; searah: boolean; indeks: number } | null = null;

  for (let i = 96; i < c.length - 1; i++) {
    const kini = c[i];
    const tutupMs = kini.time + 900_000;

    // kelola posisi terbuka dulu
    if (terbuka) {
      const t = terbuka;
      const candle = kini;
      let selesai: { r: number; keluar: string } | null = null;
      if (t.arah === 'LONG') {
        if (candle.low <= t.stop) selesai = { r: -1, keluar: 'SL' };
        else if (candle.high >= t.target) selesai = { r: 2, keluar: 'TP' };
      } else {
        if (candle.high >= t.stop) selesai = { r: -1, keluar: 'SL' };
        else if (candle.low <= t.target) selesai = { r: 2, keluar: 'TP' };
      }
      if (!selesai && i - t.indeks >= TIMEOUT) {
        const r = t.arah === 'LONG' ? (kini.close - t.entry) / t.jarak : (t.entry - kini.close) / t.jarak;
        selesai = { r: Number(r.toFixed(2)), keluar: 'WAKTU' };
      }
      if (selesai) {
        hasil.push({ symbol: simbol, side: t.arah, gate: t.gate, searahTrendHari: t.searah, r: selesai.r, keluar: selesai.keluar, lahir: t.lahir });
        terbuka = null;
      }
      continue;
    }

    const jendela = c.slice(i - 95, i + 1);
    const high = Math.max(...jendela.map((x) => x.high));
    const low = Math.min(...jendela.map((x) => x.low));
    const zones = computeZones({ last: kini.close, high, low });
    if (!zones || zones.rangePct < 3) continue;
    let gate = '';
    let terbaru = -1;
    for (const [tutup, g] of gateMap) if (tutup <= tutupMs && tutup > terbaru) { terbaru = tutup; gate = g; }
    if (!gate) continue;
    if (GATE_JAM > 0) {
      let matang = true;
      for (let jam = 1; jam <= GATE_JAM; jam++) if (gateLampau(gateMap, tutupMs, jam) !== gate) { matang = false; break; }
      if (!matang) continue;
    }

    for (const sisi of ['LONG', 'SHORT'] as const) {
      if (terbuka) break;
      const searah = (sisi === 'LONG' && gate === 'HIJAU') || (sisi === 'SHORT' && gate === 'MERAH');
      if (!searah) continue;
      const setup = detectSetup(c.slice(0, i + 1), zones, sisi);
      if (!setup.valid || setup.candle2 !== kini.time) continue;
      if (GATE_WAJIB && gate !== (sisi === 'LONG' ? 'HIJAU' : 'MERAH')) continue;
      if (MA15_WAJIB) {
        const closes15 = c.slice(0, i + 1).map((x) => x.close);
        if (closes15.length < 99) continue;
        const rata = (n: number) => closes15.slice(-n).reduce((acc, v) => acc + v, 0) / n;
        const ma25x = rata(25); const ma99x = rata(99); const cl = closes15.at(-1) ?? Number.NaN;
        const hijau15 = cl > ma99x && ma25x > ma99x; const merah15 = cl < ma99x && ma25x < ma99x;
        if ((sisi === 'LONG' && !hijau15) || (sisi === 'SHORT' && !merah15)) continue;
      }
      const tiket = computeTicket(c.slice(0, i + 1), zones, sisi, kini.close);
      if (!tiket?.actionable) continue;
      if (C2_MARGIN > 0 && setup.candle1) {
        const c1 = c.find((x) => x.time === setup.candle1);
        if (!c1) continue;
        if (sisi === 'LONG' && !(kini.close < c1.low - C2_MARGIN * tiket.riskDistance)) continue;
        if (sisi === 'SHORT' && !(kini.close > c1.high + C2_MARGIN * tiket.riskDistance)) continue;
      }
      const trendNaik = kini.close > c[i - 96].close;
      const searahTrend = (sisi === 'LONG') === trendNaik;
      if (TREND === 'searah' && !searahTrend) continue;
      if (TREND === 'lawan' && searahTrend) continue;
      let stop = tiket.stop; let target = tiket.target; let jarak = tiket.riskDistance;
      if (STOP_BATAL) {
        stop = sisi === 'LONG' ? zones.long.batal : zones.short.batal;
        jarak = sisi === 'LONG' ? tiket.entry - stop : stop - tiket.entry;
        if (!(jarak > 0)) continue;
        target = sisi === 'LONG' ? tiket.entry + 2 * jarak : tiket.entry - 2 * jarak;
      }
      terbuka = { arah: sisi, entry: tiket.entry, stop, target, jarak, lahir: kini.time, gate, searah: searahTrend, indeks: i };
      break;
    }
  }
}
async function main() {
  const n = Number(process.argv[2] ?? '20');
  const tickers = (await json('/data/tickers')) as Array<Record<string, unknown>>;
  const liquid = tickers
    .filter((t) => String(t.symbol).endsWith('USDT') && !String(t.symbol).includes('_'))
    .sort((a, b) => Number(b.quoteVolume) - Number(a.quoteVolume))
    .slice(0, n)
    .map((t) => String(t.symbol));

  console.log(`UJI BALIK PMB — ${liquid.length} koin terlikuid, ±9 hari data 15m, aturan mesin PERSIS`);
  let i = 0;
  for (const s of liquid) {
    try { await uji(s); } catch { /* lewati koin bermasalah */ }
    i++;
    if (i % 5 === 0) console.log(`  …${i}/${liquid.length} koin selesai`);
  }

  const total = hasil.length;
  if (!total) { console.log('Tidak ada tiket terbentuk di jendela ini.'); return; }
  const menang = hasil.filter((h) => h.r > 0);
  const ekspektasi = hasil.reduce((s, h) => s + h.r, 0) / total;
  console.log(`\n═══ HASIL ═══`);
  console.log(`tiket: ${total} · menang(TP): ${menang.length} (${(menang.length / total * 100).toFixed(1)}%) · kalah(SL): ${hasil.filter(h=>h.r<0).length} · waktu: ${hasil.filter(h=>h.keluar==='WAKTU').length}`);
  console.log(`ekspektasi: ${ekspektasi >= 0 ? '+' : ''}${ekspektasi.toFixed(3)}R per trade (breakeven 2R = -0.333R kalah → butuh menang >33,3%)`);
  console.log(`total R: ${hasil.reduce((s,h)=>s+h.r,0).toFixed(1)}R`);

  console.log(`\n— UJI TEORIMU: lawan vs searah trend hari (24 jam sebelum lahir) —`);
  for (const [label, saring] of [['SEARAH trend hari', (h: Hasil) => h.searahTrendHari], ['LAWAN trend hari', (h: Hasil) => !h.searahTrendHari]] as const) {
    const g = hasil.filter(saring);
    if (!g.length) continue;
    const m = g.filter((h) => h.r > 0).length;
    const e = g.reduce((s, h) => s + h.r, 0) / g.length;
    console.log(`${label}: ${g.length} tiket · menang ${(m / g.length * 100).toFixed(0)}% · ekspektasi ${e >= 0 ? '+' : ''}${e.toFixed(3)}R`);
  }
  console.log(`\n— per arah —`);
  for (const sisi of ['LONG', 'SHORT'] as const) {
    const g = hasil.filter((h) => h.side === sisi);
    if (!g.length) continue;
    const m = g.filter((h) => h.r > 0).length;
    console.log(`${sisi}: ${g.length} tiket · menang ${(m / g.length * 100).toFixed(0)}% · ekspektasi ${(g.reduce((s, h) => s + h.r, 0) / g.length).toFixed(3)}R`);
  }
  console.log(`\n— 12 tiket terakhir —`);
  for (const h of hasil.slice(-12)) {
    console.log(`${wib(h.lahir)} ${h.symbol} ${h.side} → ${h.r >= 0 ? '+' : ''}${h.r}R (${h.keluar}) · ${h.searahTrendHari ? 'searah trend hari' : 'LAWAN trend hari'}`);
  }
}
main().catch((e) => { console.error('GAGAL:', e instanceof Error ? e.message : e); process.exitCode = 1; });
