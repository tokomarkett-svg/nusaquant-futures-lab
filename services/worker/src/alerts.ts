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
  /** Garis pintu-manis-batal sisi kandidat (zona 24 jam saat dipindai). */
  garis?: { pintu: number; manis: number; batal: number };
};

export type AlertMessage = { key: string; kind: 'X' | 'TIKET' | 'TIKET_TANPA_GATE'; text: string };

/**
 * Mode notifikasi:
 *  semua      → bel pintu + tiket siap + peringatan gate (default, untuk belajar)
 *  tiketsiap  → HANYA tiket yang gate-nya searah & bisa dieksekusi (paling tenang, untuk real)
 *  tiketsemua → semua tiket (tanpa bel pintu)
 */
export type AlertMode = 'semua' | 'tiketsiap' | 'tiketsemua';

export function resolveAlertMode(value = process.env.ALERT_MODE): AlertMode {
  const normalized = (value ?? '').trim().toLowerCase();
  if (normalized === 'tiketsiap' || normalized === 'tiket-siap') return 'tiketsiap';
  if (normalized === 'tiketsemua' || normalized === 'tiket-semua') return 'tiketsemua';
  return 'semua';
}

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

export function buildTicketText(candidate: AlertCandidate, ticket: Ticket, papanUrl?: string): string {
  const digits = digitsFor(ticket.entry);
  const format = (value: number) => value.toFixed(digits);
  const tautanChart = papanUrl ? `\n🔎 Chart live: ${papanUrl}/nominasi/${candidate.symbol}` : '';
  const garisText = candidate.garis
    ? `📏 Garis pas bot: pintu ${format(candidate.garis.pintu)} · manis ${format(candidate.garis.manis)} · batal ${format(candidate.garis.batal)}`
    : '';
  const lahirText = candidate.setup.candle2
    ? `Lahir ${new Date(candidate.setup.candle2 + 7 * 3_600_000).toISOString().slice(11, 16)} WIB — tiket umurnya pendek, lirik yang baru`
    : '';

  // Kartu SIAP ENTRI: hanya untuk tiket actionable + gate searah — angka entry jadi hero.
  if (candidate.gateAlign && ticket.actionable) {
    const orderSide = candidate.side === 'LONG' ? 'BUY' : 'SELL';
    return [
      `🎯 <b>SIAP ENTRI — ${candidate.symbol} ${candidate.side}</b>`,
      '',
      `👉 <b>ENTRY: ${format(ticket.entry)}</b>  (${orderSide})`,
      `🛑 SL     : ${format(ticket.stop)}  (−${ticket.riskUsdt} USDT)`,
      `✅ TP     : ${format(ticket.target)}  (+${ticket.rewardUsdt} USDT)`,
      `📦 Ukuran : ${ticket.sizeCoin.toLocaleString('id-ID', { maximumFractionDigits: 4 })} coin`,
      '',
      `Gate 1H ${candidate.gate} ✔ · stop ${ticket.riskPct.toFixed(2)}% dari entry · target 2R`,
      garisText,
      lahirText,
      ticket.warnings.length ? `⚠ ${ticket.warnings.join(' · ')}` : 'Semua pagar lolos — harga masih di dekat pintu.',
      '',
      `Salin persis ke Binance: <code>${orderSide} ${candidate.symbol} ${format(ticket.entry)} SL ${format(ticket.stop)} TP ${format(ticket.target)}</code>${tautanChart}`,
      '1% risiko · maksimal 2 trade/hari · stop dipasang SEBELUM entry.',
    ].join('\n');
  }

  const status = !candidate.gateAlign
    ? '⚠️ <b>TIKET TERBENTUK TAPI GATE BELUM SEARAH — JANGAN EKSEKUSI</b>'
    : '🟠 <b>TIKET BASI — jangan dikejar</b>';
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
    garisText,
    `Ingat: 1% risiko · maksimal 2 trade/hari · stop dipasang SEBELUM entry.${tautanChart}`,
  ].join('\n');
}

/** Tentukan pesan baru dari satu kandidat (bel pintu & tiket), tanpa mengirim. */
export function collectAlertsForCandidate(
  candidate: AlertCandidate,
  store: ReturnType<typeof createAlertStore>,
  options: { bellAgeBars?: number; mode?: AlertMode; papanUrl?: string } = {},
): AlertMessage[] {
  const messages: AlertMessage[] = [];
  const bellAgeBars = options.bellAgeBars ?? 1;
  const mode = options.mode ?? resolveAlertMode();

  // Bel pintu hanya dikirim kalau gate sudah searah (aturan: gate dulu, baru pintu).
  if (mode === 'semua' && candidate.gateAlign && candidate.setup.x !== null && candidate.setup.candle1 === null && candidate.setup.staleBars !== null && candidate.setup.staleBars <= bellAgeBars) {
    const key = `${candidate.symbol}:${candidate.side}:X:${candidate.setup.x}`;
    if (!store.has(key)) messages.push({ key, kind: 'X', text: buildBellText(candidate) });
  }

  if (candidate.ticket && candidate.ticket.actionable && candidate.setup.candle2 !== null) {
    const key = `${candidate.symbol}:${candidate.side}:TIKET:${candidate.setup.candle2}`;
    if (!store.has(key)) {
      const kind = candidate.gateAlign ? 'TIKET' : 'TIKET_TANPA_GATE';
      const allowed = mode === 'semua' || (mode === 'tiketsiap' && kind === 'TIKET') || mode === 'tiketsemua';
      if (allowed) messages.push({ key, kind, text: buildTicketText(candidate, candidate.ticket, options.papanUrl) });
    }
  }

  return messages;
}

/** Alamat papan web (tanpa garis miring di ujung) untuk tautan chart pada notif. */
function normalizePapanUrl(): string | undefined {
  const raw = (process.env.PAPAN_URL ?? '').trim().replace(/\/+$/, '');
  return raw ? raw : undefined;
}

/** Baris diagnosa (tanpa membocorkan rahasia) supaya salah ketik langsung ketahuan dari log. */
export function describeTelegramConfig(): Record<string, string | number | boolean> {
  const token = process.env.TELEGRAM_BOT_TOKEN ?? '';
  const chatId = process.env.TELEGRAM_CHAT_ID ?? '';
  const mask = (value: string) => (value.length <= 4 ? '*'.repeat(value.length) : `${value.slice(0, 2)}…${value.slice(-2)} (${value.length} karakter)`);
  return {
    tokenPresent: token.length > 0,
    tokenLooksValid: /^\d{6,}:[A-Za-z0-9_-]{20,}$/.test(token),
    tokenMasked: mask(token),
    chatIdPresent: chatId.length > 0,
    chatIdDigitsOnly: /^-?\d+$/.test(chatId.trim()),
    chatIdMasked: mask(chatId.trim()),
    chatIdPunyaSpasi: chatId !== chatId.trim() || /\s/.test(chatId),
  };
}

/** Terjemahkan pesan error Telegram menjadi langkah perbaikan yang bisa dikerjakan di HP. */
export function explainTelegramError(status: number, body: string): string {
  const text = body.toLowerCase();
  if (status === 401 || text.includes('unauthorized')) {
    return 'TOKEN salah/kurang lengkap. Buka BotFather → /mybots → bot-mu → API Token → salin ulang seluruh token (termasuk angka dan titik dua di depan).';
  }
  if (text.includes('chat not found')) {
    return 'CHAT ID salah. Ambil ulang dari @userinfobot, pastikan hanya angkanya (tanpa spasi/kata «Id:»).';
  }
  if (text.includes("can't initiate conversation") || text.includes('bot was blocked') || text.includes('user is deactivated')) {
    return 'Kamu BELUM menekan tombol START di chat bot-mu. Buka link t.me/namabot → tekan START (wajib sekali).';
  }
  if (text.includes('chat_id is empty') || text.includes('chat id is empty')) {
    return 'CHAT ID kosong. Isi variabel TELEGRAM_CHAT_ID di Railway dengan angka dari @userinfobot.';
  }
  if (status === 400) {
    return 'Permintaan ditolak Telegram. Periksa token & chat id (lihat baris diagnosa di atas).';
  }
  return `Telegram menolak (HTTP ${status}): ${body.slice(0, 160)}`;
}

export type BotUpdate = {
  update_id?: number;
  message?: { chat?: { id?: number; type?: string; username?: string; first_name?: string; title?: string } };
};

/**
 * Temukan chat id dari percakapan NYATA dengan bot (lewat getUpdates).
 * Jauh lebih pasti daripada menempel angka manual — yang menyapa bot itulah alamat yang benar.
 */
export async function discoverChatFromUpdates(
  options: { token?: string; fetchImpl?: typeof fetch } = {},
): Promise<{ chatId: string; label: string } | null> {
  const token = options.token ?? process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return null;
  const fetchImpl = options.fetchImpl ?? fetch;
  const response = await fetchImpl(`https://api.telegram.org/bot${token}/getUpdates?timeout=0`);
  if (!response.ok) return null;
  const payload = await response.json() as { ok?: boolean; result?: BotUpdate[] };
  if (!payload.ok || !Array.isArray(payload.result)) return null;
  for (let index = payload.result.length - 1; index >= 0; index -= 1) {
    const chat = payload.result[index]?.message?.chat;
    if (!chat || typeof chat.id !== 'number') continue;
    if (chat.type && chat.type !== 'private') continue; // abaikan grup/channel
    const label = chat.first_name ?? chat.username ?? chat.title ?? 'chat pribadi';
    return { chatId: String(chat.id), label: String(label) };
  }
  return null;
}

/**
 * Saklar utama notif Telegram. Status: NYALA (pemilik menyalakan eksplisit 25/9 malam, setelah
 * langkah arah-hari + MA 15m/1H cocok dipasang). Matikan kapan pun: Railway Variables PMB_NOTIF=0.
 * Tes yang menyuntik fetchImpl sendiri tidak terdampak.
 */
export function notifDibungkam(options: { fetchImpl?: typeof fetch } = {}): boolean {
  return (process.env.PMB_NOTIF ?? '1') === '0' && !options.fetchImpl;
}

export async function sendTelegram(text: string, options: { token?: string; chatId?: string; fetchImpl?: typeof fetch } = {}): Promise<boolean> {
  if (notifDibungkam(options)) {
    console.log('[notif dibungkam] PMB_NOTIF belum diset — pesan tidak dikirim:', text.slice(0, 60).replace(/\n/g, ' '));
    return false;
  }
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
    throw new Error(explainTelegramError(response.status, body));
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
  const liquid = tickers.filter((t) => t.symbol.endsWith('USDT') && !t.symbol.includes('_') && !EXCLUDED.test(t.symbol) && !LEVERAGED.test(t.symbol) && t.quoteVolume >= MIN_QUOTE_VOLUME);
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
          client.getKlines({ symbol: ticker.symbol, interval: '1h', limit: 130 }),
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
        // LANGKAH 1 pelajaran pemilik: TENTUKAN ARAH HARI DULU.
        // Hari NAIK = harga sekarang di atas OPEN hari ini (tengah malam WIB) → hanya LONG.
        // Hari TURUN = di bawah open → hanya SHORT.
        // Insiden MINA 25/9: hari turun −6% tapi mesin suruh LONG → rugi nyata. Aturan ini mencegahnya.
        const mulaiHariWib = Math.floor((now - 17 * 3_600_000) / 86_400_000) * 86_400_000 + 17 * 3_600_000;
        const candleHariIni = m15.filter((c) => c.time >= mulaiHariWib);
        const openHariIni = (candleHariIni[0] ?? m15[0]).open;
        const hariNaik = ticker.last >= openHariIni;
        if ((side === 'LONG' && !hariNaik) || (side === 'SHORT' && hariNaik)) return null;
        // MA 15m juga wajib searah (pelajaran pemilik: jangan melawan MA — kalau trend short,
        // tunggu harga kena PINTU SHORT walau sempat naik; bounce tanpa MA searah = jebakan).
        if (m15.length >= 99) {
          const closes15 = (m15 as Candle[]).map((c) => c.close);
          const rata = (n: number) => closes15.slice(-n).reduce((acc, v) => acc + v, 0) / n;
          const ma25x = rata(25); const ma99x = rata(99); const close15 = closes15.at(-1) ?? Number.NaN;
          const hijau15 = close15 > ma99x && ma25x > ma99x;
          const merah15 = close15 < ma99x && ma25x < ma99x;
          if ((side === 'LONG' && !hijau15) || (side === 'SHORT' && !merah15)) return null;
        }
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
          garis: side === 'LONG'
            ? { pintu: zones.long.pintu, manis: zones.long.manis, batal: zones.long.batal }
            : { pintu: zones.short.pintu, manis: zones.short.manis, batal: zones.short.batal },
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

export async function runAlertCycle(
  store: ReturnType<typeof createAlertStore>,
  client?: BinancePublicMarketDataClient,
  options: { chatId?: string; mode?: AlertMode; papanUrl?: string } = {},
): Promise<{ scanned: number; sent: number; messages: AlertMessage[] }> {
  const market = client ?? new BinancePublicMarketDataClient({ baseUrl: process.env.BINANCE_BASE_URL ?? DEFAULT_BINANCE_BASE_URL });
  const rows = await scanAlertCandidates(market);
  const messages: AlertMessage[] = [];
  for (const row of rows) {
    if (!row.gateAlign && row.setup.candle2 === null) continue; // hemat: gate belum searah & belum ada paket = tidak ada yang dikabarkan
    messages.push(...collectAlertsForCandidate(row, store, { mode: options.mode, papanUrl: options.papanUrl ?? normalizePapanUrl() }));
  }
  let sent = 0;
  for (const message of messages) {
    try {
      await sendTelegram(message.text, { chatId: options.chatId });
      store.add(message.key);
      sent += 1;
    } catch (error) {
      console.error('[alerts] gagal kirim', message.key, error instanceof Error ? error.message : error);
    }
  }
  return { scanned: rows.length, sent, messages };
}

/** Pesan sapa saat worker menyala — bukti cepat bahwa token & chat id sudah benar. */
export function buildStartupText(): string {
  return [
    '✅ <b>NusaQuant alert aktif</b>',
    '',
    'Bot memantau seluruh pasar USDT dengan sistem pintu–manis–batal.',
    'Yang akan kamu terima:',
    '🔔 BEL PINTU — harga menyentuh pintu & gate searah',
    '🎯 TIKET SIAP — entry, stop, target 2R, ukuran coin',
    '⚠️ JANGAN EKSEKUSI — tiket muncul tapi gate melawan',
    '',
    'Ingat: 1% risiko · maks 2 trade/hari · stop sebelum entry.',
  ].join('\n');
}

export async function watchAlerts(): Promise<void> {
  const store = createAlertStore();
  const pollMs = Math.max(Number(process.env.ALERT_POLL_MS ?? 120_000), 60_000);
  const mode = resolveAlertMode();
  const config = describeTelegramConfig();
  const maskId = (value: string) => (value.length <= 4 ? '****' : `${value.slice(0, 2)}…${value.slice(-2)} (${value.length} digit)`);
  let effectiveChatId = (process.env.TELEGRAM_CHAT_ID ?? '').trim();

  // Deteksi alamat yang benar dari percakapan nyata — menutup semua kasus salah tempel.
  if (config.tokenPresent) {
    try {
      const discovered = await discoverChatFromUpdates();
      if (discovered) {
        if (effectiveChatId && discovered.chatId !== effectiveChatId) {
          console.warn(`[alerts] chat id di Railway (${maskId(effectiveChatId)}) BEDA dengan chat yang menyapa bot (${maskId(discovered.chatId)} · ${discovered.label}). Memakai yang menyapa bot.`);
        } else if (!effectiveChatId) {
          console.warn(`[alerts] TELEGRAM_CHAT_ID kosong — memakai chat yang menyapa bot: ${maskId(discovered.chatId)} · ${discovered.label}`);
        }
        effectiveChatId = discovered.chatId;
      } else if (!effectiveChatId) {
        console.warn('[alerts] belum ada percakapan dengan bot. Kirim pesan apa saja ke bot-mu di Telegram supaya alamatnya terdeteksi otomatis.');
      }
    } catch (error) {
      console.error('[alerts] gagal mendeteksi chat id:', error instanceof Error ? error.message : error);
    }
  }

  const hasToken = Boolean(config.tokenPresent && effectiveChatId);
  console.log(JSON.stringify({ alerts: true, watch: true, pollMs, mode, hasToken, chatIdMasked: effectiveChatId ? maskId(effectiveChatId) : null, config, at: new Date().toISOString() }));
  if (!hasToken) {
    console.warn('[alerts] token/chat id belum lengkap → mode DRY RUN (pesan hanya ditulis di log). Pesan sapa akan dicoba lagi setiap siklus setelah variabel diisi.');
  }
  let startupSent = false;
  for (;;) {
    try {
      // Pesan sapa dicoba tiap siklus sampai berhasil — supaya perbaikan variabel langsung terbukti tanpa redeploy.
      if (!startupSent && hasToken) {
        try {
          await sendTelegram(buildStartupText(), { chatId: effectiveChatId });
          startupSent = true;
          console.log(JSON.stringify({ alerts: true, startupMessage: 'sent', at: new Date().toISOString() }));
        } catch (error) {
          console.error('[alerts] gagal kirim pesan sapa:', error instanceof Error ? error.message : error);
          console.error('[alerts] diagnosa:', JSON.stringify(describeTelegramConfig()));
        }
      }
      const result = await runAlertCycle(store, undefined, { chatId: effectiveChatId, mode });
      console.log(JSON.stringify({ alerts: true, scanned: result.scanned, sent: result.sent, seen: store.size(), startupSent, at: new Date().toISOString() }));
    } catch (error) {
      console.error('[alerts]', error instanceof Error ? error.message : error);
    }
    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }
}
