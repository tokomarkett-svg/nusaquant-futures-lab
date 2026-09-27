import {
  computeZones, distanceToPintu, fetchTickers, MIN_QUOTE_VOLUME, MIN_RANGE_PCT,
  type Board, type BoardRow, type Side, type Ticker,
} from './binance';
import { jenisPerp } from '@nusaquant/core';

const WORKER = (process.env.WORKER_DATA_URL ?? '').trim().replace(/\/+$/, '');
type Scan = {
  ok: boolean; market: string; at: string;
  rows: Array<{ symbol: string; side: Side; price: number; gate: BoardRow['gate']; gateAlign: boolean;
    siap: boolean; ageMin: number; scannedAt: number; zones: BoardRow['zones'] | null;
    setup: { x: number | null; candle1: number | null; candle2: number | null; valid: boolean; notes: string[] };
    ticket: BoardRow['ticket']; quoteVolume: number; rangePct: number; jenis: BoardRow['jenis'] }>;
};

/** Universe penuh USDT-M tampil di web; kandidat mendalam memakai snapshot scanner
 * worker yang SAMA dengan Telegram. Yang gagal gerbang awal tetap tercantum sebagai
 * DISIMAK, bukan hilang dari daftar. Panggilan ini tidak mengirim order. */
export async function scanBoardFromWorker(options: {
  getTickers?: () => Promise<Ticker[]>; fetchImpl?: typeof fetch; workerUrl?: string;
} = {}): Promise<Board> {
  const worker = options.workerUrl ?? WORKER;
  if (!worker.startsWith('https://')) throw new Error('Alamat worker futures belum dikonfigurasi.');
  const [tickers, response] = await Promise.all([
    (options.getTickers ?? fetchTickers)(),
    (options.fetchImpl ?? fetch)(new URL('/data/papan-json', worker), { cache: 'no-store', signal: AbortSignal.timeout(35_000) }),
  ]);
  if (!response.ok) throw new Error(`Pemindaian worker gagal HTTP ${response.status}.`);
  const scan = await response.json() as Scan;
  if (!scan.ok || scan.market !== 'FUTURES' || !Array.isArray(scan.rows)
    || Date.now() - Date.parse(scan.at) > 180_000) throw new Error('Snapshot Futures scanner belum segar; tidak ada tiket siap.');
  const candidates = new Map(scan.rows.map((r) => [r.symbol, r]));
  const rows: BoardRow[] = [];
  let liquid = 0; let rangeOk = 0;
  for (const ticker of tickers) {
    // Ticker Futures ini adalah daftar produksi, BUKAN hanya simbol Demo/Testnet.
    const zones = computeZones(ticker);
    if (!zones) continue; // ticker belum memiliki 24h high/low yang valid
    if (ticker.quoteVolume >= MIN_QUOTE_VOLUME) liquid++;
    if (ticker.quoteVolume >= MIN_QUOTE_VOLUME && zones.rangePct >= MIN_RANGE_PCT) rangeOk++;
    const c = candidates.get(ticker.symbol);
    const longDist = distanceToPintu(zones, 'LONG', ticker.last);
    const shortDist = distanceToPintu(zones, 'SHORT', ticker.last);
    const side: Side = c?.side ?? (Math.abs(longDist) <= Math.abs(shortDist) ? 'LONG' : 'SHORT');
    const distPct = side === 'LONG' ? longDist : shortDist;
    const insideBand = side === 'LONG'
      ? ticker.last <= zones.long.pintu && ticker.last >= zones.long.batal
      : ticker.last >= zones.short.pintu && ticker.last <= zones.short.batal;
    const validScan = Boolean(c && c.zones && c.scannedAt && Date.now() - c.scannedAt <= 120_000);
    const setup = c?.setup;
    const padam = Boolean(setup?.notes?.some((note) => note.includes('kena BATAL')));
    const status: BoardRow['status'] = !validScan ? 'DISIMAK'
      : padam ? 'PADAM' : insideBand ? 'MENYALA' : Math.abs(distPct) <= 1.5 ? 'SIMAK' : 'DISIMAK';
    rows.push({
      symbol: ticker.symbol, last: ticker.last, quoteVolume: ticker.quoteVolume,
      zones, rangePct: zones.rangePct, side, status, gate: validScan ? c!.gate : 'KUNING',
      gateAlign: validScan ? Boolean(c!.gateAlign) : false,
      insideBand, distPct, touchAgeMin: insideBand && validScan ? 0 : null, bucket: null,
      dataAgeMin: validScan ? Number(c!.ageMin) : 999,
      volJt: Number((ticker.quoteVolume / 1e6).toFixed(1)), jenis: jenisPerp(ticker.symbol),
      setup: validScan && setup ? { x: setup.x, candle1: setup.candle1, candle2: setup.candle2,
        valid: setup.valid, note: setup.notes.at(-1) ?? null }
        : { x: null, candle1: null, candle2: null, valid: false, note: 'Belum lolos filter awal / data candle belum tersedia.' },
      ticket: validScan ? c!.ticket : null,
      technicalReady: Boolean(validScan && c!.siap && !padam && scan.market === 'FUTURES'),
      demoReady: false,
    });
  }
  rows.sort((a, b) => Number(b.technicalReady) - Number(a.technicalReady)
    || (a.status === 'MENYALA' ? -1 : 0) - (b.status === 'MENYALA' ? -1 : 0)
    || Math.abs(a.distPct) - Math.abs(b.distPct));
  return { market: 'FUTURES', at: new Date().toISOString(), rows,
    funnel: { scanned: tickers.length, liquid, rangeOk, board: rows.length,
      staleDropped: scan.rows.filter((r) => !r.zones).length } };
}
