/**
 * Notifikasi Telegram — worker memindai pasar dengan sistem Pintu–Manis–Batal
 * lalu mengirim pesan saat (a) bel pintu berbunyi searah gate, dan (b) tiket siap.
 *
 * Gratis sepenuhnya (Bot API resmi). Tanpa token → mode DRY RUN: pesan hanya ditulis di log.
 * Env: TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, RUN_ALERTS=true, ALERT_POLL_MS (min 60 dtk).
 */

import {
  MIN_QUOTE_VOLUME, MIN_RANGE_PCT, STALE_CANDLE_MINUTES,
  computeZones, distanceToPintu, detectSetup, computeTicket, gateFromCandles,
  type Candle, type SetupMarkers, type Side, type Ticket, type Zones,
} from '@nusaquant/core';
import { BinancePublicMarketDataClient, DEFAULT_BINANCE_BASE_URL } from './market-data.ts';

export type AlertCandidate = {
  symbol: string;
  side: Side;
  priceNow: number;
  gate: 'HIJAU' | 'MERAH' | 'KUNING';
  gateAlign: boolean;
  setup: SetupMarkers;
  ticket: Ticket | null;
};

export type AlertMessage = { key: string; kind: 'X' | 'TIKET' | 'TIKET_TANPA_GATE'; text: string };

/** Penyimpan sederhana agar satu setup tidak dikirim berulang-ulang. */
export function createAlertStore() {
  const seen = new Set<string>();
  return {
    has(key: string) { return seen.has(key); },
    add(key: string) { seen.add(key); },
    size() { return seen.size; },
  };
}

const digitsFor = (price: number) => (price >= 100 ? 2 : price >= 1 ? 4 : price >= 0.01 ? 5 : 7);

export function buildBellText(candidate: AlertCandidate): string {
  const digits = digitsFor(candidate.priceNow);
  const zone = candidate.side === 'LONG' ? candidate.setup : candidate.setup;
  void zone;
  return [
    `🔔 <b>BEL PINTU — ${candidate.symbol}</b>`,
    `Arah: <b>${candidate.side}</b> · gate 1H: ${candidate.gate}${candidate.gateAlign ? ' (searah ✔)' : ' (BELUM searah)'}`,
    `Harga: ${candidate.priceNow.toFixed(digits)}`,
    '',
    'Langkah: buka papan, lihat candle 1 (buntut ≥2× badan, close paruh atas/bawah).',
    'Belum entry — candle 1 & 2 belum tentu sah.',
  ].join('\n');
}

export function buildTicketText(candidate: AlertCandidate, ticket: Ticket): string {
  const digits = digitsFor(ticket.entry);
  const format = (value: number) => value.toFixed(digits);
  const status = !candidate.gateAlign
    ? '⚠️ <b>TIKET TERBENTUK TAPI GATE BELUM SEARAH — JANGAN EKSEKUSI</b>'
    : ticket.actionable ? '🎯 <b>TIKET SIAP — boleh dieksekusi</b>' : '🟠 <b>TIKET BASI — jangan dikejar</b>';
  return [
    `${status}`,
    `<b>${candidate.symbol}</b> · ${candidate.side} · gate 1H ${candidate.gate}${candidate.gateAlign ? ' ✔' : ''}`,
    '',
    `Entry  : <b>${format(ticket.entry)}</b>`,
    `Stop   : ${format(ticket.stop)} (jarak ${ticket.riskPct.toFixed(2)}%)`,
    `Target : ${format(ticket.target)}  (2R)`,
    `Ukuran : ${ticket.sizeCoin.toLocaleString('id-ID', { maximumFractionDigits: 4 })} coin  (risiko ${ticket.riskUsdt} USDT → imbalan ${ticket.rewardUsdt} USDT)`,
    '',
    !candidate.gateAlign
      ? `⛔ Gate 1H = ${candidate.gate} — tidak searah dengan ${candidate.side}. Tunggu gate berbalik; tiket ini untuk latihan/jurnal saja.`
      : ticket.warnings.length ? `⚠ ${ticket.warnings.join(' · ')}` : 'Semua pagar lolos: gate searah, stop di sisi benar, harga belum lari.',
    '',
    'Ingat: 1% risiko · maksimal 2 trade/hari · stop dipasang SEBELUM entry.',
  ].join('\n');
}

/** Tentukan pesan baru dari satu kandidat (bel pintu & tiket), tanpa mengirim. */
export function collectAlertsForCandidate(
  candidate: AlertCandidate,
  store: ReturnType<typeof createAlertStore>,
  options: { bellAgeBars?: number } = {},
): AlertMessage[] {
  const messages: AlertMessage[] = [];
  const bellAgeBars = options.bellAgeBars ?? 1;

  // Bel pintu hanya dikirim kalau gate sudah searah (aturan: gate dulu, baru pintu).
  if (candidate.gateAlign && candidate.setup.x !== null && candidate.setup.candle1 === null && candidate.setup.staleBars !== null && candidate.setup.staleBars <= bellAgeBars) {
    const key = `${candidate.symbol}:${candidate.side}:X:${candidate.setup.x}`;
    if (!store.has(key)) messages.push({ key, kind: 'X', text: buildBellText(candidate) });
  }

  if (candidate.ticket && candidate.ticket.actionable && candidate.setup.candle2 !== null) {
    const key = `${candidate.symbol}:${candidate.side}:TIKET:${candidate.setup.candle2}`;
    if (!store.has(key)) {
      messages.push({
        key,
        kind: candidate.gateAlign ? 'TIKET' : 'TIKET_TANPA_GATE',
        text: buildTicketText(candidate, candidate.ticket),
      });
    }
  }

  return messages;
}

export async function sendTelegram(text: string, options: { token?: string; chatId?: string; fetchImpl?: typeof fetch } = {}): Promise<boolean> {
  const token = options.token ?? process.env.TELEGRAM_BOT_TOKEN;
  const chatId = options.chatId ?? process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) {
    console.log(JSON.stringify({ alerts: true, dryRun: true, text: text.replace(/<\/?b>/g, '') }));
    return false;
  }
  const fetchImpl = options.fetchImpl ?? fetch;
  const response = await fetchImpl(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML', disable_web_page_preview: true }),
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Telegram HTTP ${response.status}: ${body.slice(0, 200)}`);
  }
  return true;
}

const EXCLUDED = /(USDC|FDUSD|TUSD|BUSD|DAI|EUR|TRY|BRL|AEUR|USD1|XUSD|EURI)$/;
const LEVERAGED = /(UP|DOWN|BULL|BEAR)USDT$/;
const CONCURRENCY = 5;
const MAX_CANDIDATES = 40;

export type AlertScanRow = AlertCandidate & { rangePct: number; quoteVolume: number; dataAgeMin: number };

/** Pindai pasar dengan aturan yang sama seperti papan web. */
export async function scanAlertCandidates(client: BinancePublicMarketDataClient, limit = MAX_CANDIDATES): Promise<AlertScanRow[]> {
  const tickers = await client.get24hTickerDetails();
  const liquid = tickers.filter((t) => t.symbol.endsWith('USDT') && !EXCLUDED.test(t.symbol) && !LEVERAGED.test(t.symbol) && t.quoteVolume >= MIN_QUOTE_VOLUME);
  const withZones = liquid
    .map((ticker) => ({ ticker, zones: computeZones(ticker) }))
    .filter((row): row is { ticker: typeof liquid[number]; zones: Zones } => row.zones !== null && row.zones.rangePct >= MIN_RANGE_PCT);

  const ranked = withZones.map((row) => {
    const distLong = distanceToPintu(row.zones, 'LONG', row.ticker.last);
    const distShort = distanceToPintu(row.zones, 'SHORT', row.ticker.last);
    const score = (value: number) => (value >= 0 ? value : Math.abs(value) * 0.5);
    return { ...row, score: Math.min(score(distLong), score(distShort)) };
  }).sort((a, b) => a.score - b.score).slice(0, limit);

  const now = Date.now();
  const rows: AlertScanRow[] = [];
  for (let index = 0; index < ranked.length; index += CONCURRENCY) {
    const slice = ranked.slice(index, index + CONCURRENCY);
    const enriched = await Promise.all(slice.map(async ({ ticker, zones }) => {
      try {
        const [m15, h1] = await Promise.all([
          client.getKlines({ symbol: ticker.symbol, interval: '15m', limit: 140 }),
          client.getKlines({ symbol: ticker.symbol, interval: '1h', limit: 120 }),
        ]);
        const newest = m15.at(-1)?.time ?? 0;
        const dataAgeMin = (now - (newest + 900_000)) / 60_000;
        if (m15.length < 20 || h1.length < 99 || dataAgeMin > STALE_CANDLE_MINUTES) return null;
        const { gate } = gateFromCandles(h1);
        const distLong = distanceToPintu(zones, 'LONG', ticker.last);
        const distShort = distanceToPintu(zones, 'SHORT', ticker.last);
        const insideLong = ticker.last <= zones.long.pintu && ticker.last >= zones.long.batal;
        const insideShort = ticker.last >= zones.short.pintu && ticker.last <= zones.short.batal;
        const side: Side = insideLong || (Math.abs(distLong) <= Math.abs(distShort) && distLong >= -0.5) ? 'LONG' : 'SHORT';
        const gateAlign = (side === 'LONG' && gate === 'HIJAU') || (side === 'SHORT' && gate === 'MERAH');
        const setup = detectSetup(m15 as Candle[], zones, side);
        const ticket = computeTicket(m15 as Candle[], zones, side, ticker.last);
        const row: AlertScanRow = {
          symbol: ticker.symbol,
          side,
          priceNow: ticker.last,
          gate,
          gateAlign,
          setup,
          ticket,
          rangePct: zones.rangePct,
          quoteVolume: ticker.quoteVolume,
          dataAgeMin: Math.round(dataAgeMin),
        };
        return row;
      } catch {
        return null;
      }
    }));
    for (const row of enriched) if (row) rows.push(row);
  }
  return rows;
}

export async function runAlertCycle(store: ReturnType<typeof createAlertStore>, client?: BinancePublicMarketDataClient): Promise<{ scanned: number; sent: number; messages: AlertMessage[] }> {
  const market = client ?? new BinancePublicMarketDataClient({ baseUrl: process.env.BINANCE_BASE_URL ?? DEFAULT_BINANCE_BASE_URL });
  const rows = await scanAlertCandidates(market);
  const messages: AlertMessage[] = [];
  for (const row of rows) {
    if (!row.gateAlign && row.setup.candle2 === null) continue; // hemat: gate belum searah & belum ada paket = tidak ada yang dikabarkan
    messages.push(...collectAlertsForCandidate(row, store));
  }
  let sent = 0;
  for (const message of messages) {
    try {
      await sendTelegram(message.text);
      store.add(message.key);
      sent += 1;
    } catch (error) {
      console.error('[alerts] gagal kirim', message.key, error instanceof Error ? error.message : error);
    }
  }
  return { scanned: rows.length, sent, messages };
}

export async function watchAlerts(): Promise<void> {
  const store = createAlertStore();
  const pollMs = Math.max(Number(process.env.ALERT_POLL_MS ?? 120_000), 60_000);
  console.log(JSON.stringify({ alerts: true, watch: true, pollMs, hasToken: Boolean(process.env.TELEGRAM_BOT_TOKEN), at: new Date().toISOString() }));
  for (;;) {
    try {
      const result = await runAlertCycle(store);
      console.log(JSON.stringify({ alerts: true, scanned: result.scanned, sent: result.sent, seen: store.size(), at: new Date().toISOString() }));
    } catch (error) {
      console.error('[alerts]', error instanceof Error ? error.message : error);
    }
    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }
}
