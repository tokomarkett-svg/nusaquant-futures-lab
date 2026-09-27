/**
 * Notifikasi Telegram — worker memindai pasar dengan sistem Pintu–Manis–Batal
 * lalu mengirim pesan saat (a) bel pintu berbunyi searah gate, dan (b) tiket siap.
 *
 * Gratis sepenuhnya (Bot API resmi). Tanpa token → mode DRY RUN: pesan hanya ditulis di log.
 * Env: TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, RUN_ALERTS=true, ALERT_POLL_MS (min 60 dtk).
 */

import {
  MIN_QUOTE_VOLUME, MIN_RANGE_PCT, STALE_CANDLE_MINUTES,
  computeZones, distanceToPintu, detectSetup, computeTicket, gateFromCandles, gateAlignForSide, gateMatchesSide, jenisPerp,
  type Candle, type SetupMarkers, type Side, type Ticket, type Zones,
} from '@nusaquant/core';
import { BinancePublicMarketDataClient, scanMarketClient, type DataMarket } from './market-data.ts';
import { runtimeStatus } from './runtime-status.ts';

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
  /** Pasar sumber data garis & tiket ini (FUTURES = sama dengan chart murid). */
  market?: DataMarket;
  /** Jenis aset di bawahnya — perp saham/komoditas perlu ditandai agar tak dicari di daftar koin. */
  jenis?: 'saham' | 'komoditas' | 'kripto';
  /** Kelayakan order Testnet terpisah dari sinyal Futures teknis. */
  demoTradable?: boolean;
};

/** Baris penanda untuk notif/papan — kosong untuk kripto. jenisPerp() datang dari core. */
export function jenisPerpText(jenis: 'saham' | 'komoditas' | 'kripto' | undefined): string | null {
  if (jenis === 'saham') return '🏷 Perp SAHAM (bukan kripto) — ada di menu Futures Binance';
  if (jenis === 'komoditas') return '🏷 Perp KOMODITAS (emas/gas/logam — bukan kripto) — ada di menu Futures Binance';
  return null;
}

export type AlertMessage = { key: string; kind: 'X' | 'TIKET' | 'TIKET_TANPA_GATE' | 'TIKET_BASI'; text: string };

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

/** Jam WIB "HH:MM" dari epoch ms. */
const jamWib = (ms: number) => new Date(ms + 7 * 3_600_000).toISOString().slice(11, 16);

/**
 * Umur tiket (aturan rumus pemilik): tiket sah maks 3 candle ×15m setelah
 * candle 2 TERTUTUP. Lewat itu = TIKET BASI — notif entri terlarang.
 */
export function tiketSahSampai(candle2Ms: number): number {
  return candle2Ms + 15 * 60_000 + 3 * 15 * 60_000;
}
export function tiketMasihSah(candle2Ms: number | null, now = Date.now()): boolean {
  if (candle2Ms === null) return false;
  return now <= tiketSahSampai(candle2Ms);
}

/** ⚰️ Kabar tiket mati — wajib menyusul setiap SIAP ENTRI yang kadaluarsa. */
export function buildBasiText(candidate: AlertCandidate): string {
  const batas = candidate.setup.candle2 !== null ? jamWib(tiketSahSampai(candidate.setup.candle2)) : '?';
  return [
    `⚰️ <b>TIKET BASI — ${candidate.symbol} ${candidate.side}</b>`,
    '',
    `Batas sah ${batas} WIB sudah lewat / harga sudah lari dari pintu.`,
    '❌ JANGAN entri sekarang. ❌ JANGAN kejar. Tunggu paket X→C1→C2 yang BARU.',
    'Kalau posisi sudah terbuka dari tiket ini: stop TETAP di angka semula, jangan diturunkan.',
  ].join('\n');
}

export function buildBellText(candidate: AlertCandidate): string {
  const digits = digitsFor(candidate.priceNow);
  const marketText = candidate.market === 'SPOT'
    ? '⚠ Data SPOT (futures tak terjangkau) — garis bisa BEDA dengan chart futures-mu'
    : '📊 Data FUTURES — sama dengan chart futures-mu';
  return [
    `🔔 <b>BEL PINTU — ${candidate.symbol}</b>`,
    `Arah: <b>${candidate.side}</b> · gate 1H: ${candidate.gate}${candidate.gateAlign ? ' (searah ✔)' : ' (BELUM searah)'}`,
    `Harga: ${candidate.priceNow.toFixed(digits)}`,
    marketText,
    ...(jenisPerpText(candidate.jenis) ? [jenisPerpText(candidate.jenis)!] : []),
    '',
    'Langkah: buka papan, lihat candle 1 (buntut ≥2× badan, close paruh atas/bawah).',
    'Belum entry — candle 1 & 2 belum tentu sah.',
  ].join('\n');
}

export function buildTicketText(candidate: AlertCandidate, ticket: Ticket, papanUrl?: string): string {
  const digits = digitsFor(ticket.entry);
  const format = (value: number) => value.toFixed(digits);
  const tautanChart = papanUrl ? `\n🔎 Chart live: ${papanUrl}/hp/koin/${candidate.symbol}` : '';
  const tautanIzin = papanUrl && candidate.demoTradable ? `\n🧪 Tinjau tiket DEMO (login & setujui sendiri): ${papanUrl}/hp/entri?symbol=${encodeURIComponent(candidate.symbol)}&side=${candidate.side}` : '';
  const garisText = candidate.garis
    ? `📏 Garis pas bot: pintu ${format(candidate.garis.pintu)} · manis ${format(candidate.garis.manis)} · batal ${format(candidate.garis.batal)}`
    : '';
  const marketText = candidate.market === 'SPOT'
    ? '⚠ Data SPOT (futures tak terjangkau) — garis bisa BEDA dengan chart futures-mu'
    : '📊 Data FUTURES — sama dengan chart futures-mu';
  const lahirText = candidate.setup.candle2
    ? `⏳ Lahir ${jamWib(candidate.setup.candle2)} WIB · SAH sampai ${jamWib(tiketSahSampai(candidate.setup.candle2))} WIB (3 candle ×15m) — lewat itu TIKET BASI, jangan entri.`
    : '';
  const searah = candidate.gateAlign && gateMatchesSide(candidate.gate, candidate.side);

  // Kartu SIAP ENTRI: hanya untuk tiket actionable + gate searah — angka entry jadi hero.
  if (searah && ticket.actionable) {
    const orderSide = candidate.side === 'LONG' ? 'BUY' : 'SELL';
    return [
      `🎯 <b>TIKET FUTURES SAH — ${candidate.symbol} ${candidate.side}</b>`,
      '',
      `👉 <b>ENTRY: ${format(ticket.entry)}</b>  (${orderSide})`,
      `🛑 SL     : ${format(ticket.stop)}  (−${ticket.riskUsdt} USDT)`,
      `✅ TP     : ${format(ticket.target)}  (+${ticket.rewardUsdt} USDT)`,
      `📦 Ukuran : ${ticket.sizeCoin.toLocaleString('id-ID', { maximumFractionDigits: 4 })} coin`,
      '',
      `Gate 1H ${candidate.gate} · MA25/MA99 1H+15m searah ✔ · stop ${ticket.riskPct.toFixed(2)}% dari entry · target 2R`,
      marketText,
      ...(jenisPerpText(candidate.jenis) ? [jenisPerpText(candidate.jenis)!] : []),
      garisText,
      lahirText,
      ticket.warnings.length ? `⚠ ${ticket.warnings.join(' · ')}` : 'Semua pagar lolos — harga masih di dekat pintu.',
      '',
      candidate.demoTradable
        ? '🧪 Simbol TRADING di Testnet; Demo hanya jika tombol aktif dan Anda setujui tiket baru di aplikasi.'
        : '⛔ Simbol ini belum TRADING di Testnet; sinyal Futures sah tetapi TIDAK BISA order Demo.',
      `Alarm saja — buka aplikasi untuk periksa ulang; jangan salin order ke Binance.${tautanChart}${tautanIzin}`,
      'Tidak ada order otomatis. Uang asli tetap terkunci; bila Demo terkunci jangan entry.',
    ].join('\n');
  }

  const status = !searah
    ? '⚠️ <b>TIKET TERBENTUK TAPI GATE BELUM SEARAH — JANGAN EKSEKUSI</b>'
    : '🟠 <b>TIKET BASI — jangan dikejar</b>';
  return [
    `${status}`,
    `<b>${candidate.symbol}</b> · ${candidate.side} · gate 1H ${candidate.gate}${searah ? ' ✔' : ''}`,
    ...(jenisPerpText(candidate.jenis) ? [jenisPerpText(candidate.jenis)!] : []),
    '',
    `Entry  : <b>${format(ticket.entry)}</b>`,
    `Stop   : ${format(ticket.stop)} (jarak ${ticket.riskPct.toFixed(2)}%)`,
    `Target : ${format(ticket.target)}  (2R)`,
    `Ukuran : ${ticket.sizeCoin.toLocaleString('id-ID', { maximumFractionDigits: 4 })} coin  (risiko ${ticket.riskUsdt} USDT → imbalan ${ticket.rewardUsdt} USDT)`,
    '',
    !searah
      ? `⛔ Gate 1H = ${candidate.gate} — tidak searah dengan ${candidate.side}. Tunggu gate berbalik; tiket ini untuk latihan/jurnal saja.`
      : ticket.warnings.length ? `⚠ ${ticket.warnings.join(' · ')}` : 'Semua pagar lolos: gate searah, stop di sisi benar, harga belum lari.',
    '',
    garisText,
    marketText,
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
  // Cache/putus koneksi dapat membuat staleBars kecil walaupun X sudah berjam-jam lalu.
  // Bel hanya untuk X dari candle tertutup yang benar-benar masih baru.
  const xSegar = candidate.setup.x !== null && Date.now() >= candidate.setup.x + 900_000
    && Date.now() <= candidate.setup.x + (bellAgeBars + 1) * 900_000;
  if (mode === 'semua' && candidate.gateAlign && xSegar && candidate.setup.candle1 === null && candidate.setup.staleBars !== null && candidate.setup.staleBars <= bellAgeBars) {
    const key = `${candidate.symbol}:${candidate.side}:X:${candidate.setup.x}`;
    if (!store.has(key)) messages.push({ key, kind: 'X', text: buildBellText(candidate) });
  }

  if (candidate.setup.candle2 !== null) {
    const key = `${candidate.symbol}:${candidate.side}:TIKET:${candidate.setup.candle2}`;
    const basiKey = `BASI:${candidate.symbol}:${candidate.side}:${candidate.setup.candle2}`;
    const masihSah = tiketMasihSah(candidate.setup.candle2);
    const sudahDikabari = store.has(key);

    // TIKET BASI: pernah dikabarkan tapi waktunya habis → WAJIB diumumkan mati (sekali).
    if (sudahDikabari && !masihSah) {
      if (!store.has(basiKey)) messages.push({ key: basiKey, kind: 'TIKET_BASI', text: buildBasiText(candidate) });
      return messages;
    }

    // SIAP ENTRI hanya untuk tiket MASIH SAH — tiket tua dilarang keras tampil sebagai sinyal segar.
    if (!sudahDikabari && masihSah && candidate.ticket && candidate.ticket.actionable) {
      const kind = candidate.gateAlign && gateMatchesSide(candidate.gate, candidate.side) ? 'TIKET' : 'TIKET_TANPA_GATE';
      const allowed = mode === 'semua' || (mode === 'tiketsiap' && kind === 'TIKET') || mode === 'tiketsemua';
      if (allowed) messages.push({ key, kind, text: buildTicketText(candidate, candidate.ticket, options.papanUrl) });
    }
  }

  return messages;
}

/** Alamat papan web (tanpa garis miring di ujung) untuk tautan chart pada notif. */
function normalizePapanUrl(): string | undefined {
  const raw = (process.env.PAPAN_URL ?? '').trim().replace(/\/+$/, '');
  return raw || 'https://web-gray-eta-79.vercel.app';
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
 * Saklar utama notif Telegram. Status: BISU (dibisukan lagi 25/9 larut malam setelah tiket BANK
 * bocor di nilai batas — C1 tepat 2,00x, C2 breakout paling telat, notif keluar di umur terakhir
 * tiket). Nyala HANYA bila pemilik set PMB_NOTIF=1 secara eksplisit.
 * Tes yang menyuntik fetchImpl sendiri tidak terdampak.
 */
export function notifDibungkam(options: { fetchImpl?: typeof fetch } = {}): boolean {
  return process.env.PMB_NOTIF !== '1' && !options.fetchImpl;
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
const MAX_CANDIDATES = 600; // PINDAI SEMUA: semua koin USDT yang lolos gerbang vol/range (permintaan pemilik 25/9)

export type AlertScanRow = AlertCandidate & { zones?: Zones; rangePct: number; quoteVolume: number; dataAgeMin: number; scannedAt: number };

/** Pindai pasar dengan aturan yang sama seperti papan web. */
export async function scanAlertCandidates(client: BinancePublicMarketDataClient, limit = MAX_CANDIDATES): Promise<AlertScanRow[]> {
  const tickers = await client.get24hTickerDetails();
  const tickerMarket = client.marketUsed?.() ?? 'FUTURES';
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
          client.getKlines({ symbol: ticker.symbol, interval: '15m', limit: 140, market: tickerMarket }),
          client.getKlines({ symbol: ticker.symbol, interval: '1h', limit: 130, market: tickerMarket }),
        ]);
        const newest = m15.at(-1)?.time ?? 0;
        const dataAgeMin = (now - (newest + 900_000)) / 60_000;
        const h1AgeMin = (now - ((h1.at(-1)?.time ?? 0) + 3_600_000)) / 60_000;
        // 1H normal boleh berumur <60 menit; >75 berarti candle penentu gate
        // belum diperbarui. Jangan ambil keputusan baru memakai gate lama.
        if (m15.length < 20 || h1.length < 99 || dataAgeMin > STALE_CANDLE_MINUTES || h1AgeMin > 75) return null;
        const { gate } = gateFromCandles(h1);
        // Arah hari harus dipilih SEBELUM menghitung setup, bukan memilih sisi yang paling
        // dekat pintu kemudian membuang koin kalau sisi itu melawan hari. Di atas open WIB
        // hanya LONG, di bawah open WIB hanya SHORT (harga tepat open = tidak ada arah).
        const mulaiHariWib = Math.floor((now - 17 * 3_600_000) / 86_400_000) * 86_400_000 + 17 * 3_600_000;
        const candleHariIni = m15.find((c) => c.time === mulaiHariWib);
        if (!candleHariIni || ticker.last === candleHariIni.open) return null;
        const side: Side = ticker.last > candleHariIni.open ? 'LONG' : 'SHORT';
        // Tahap PINTU/C1/C2 tetap ditampilkan meski gate belum lolos.
        // Tiket SIAP baru boleh ketika warna gate 1H + 15m benar-benar searah:
        // MA25 berada di sisi MA99 yang sesuai DAN harga melewati MA99 ≥0,5%.
        // Fungsi core yang sama dipakai oleh manualTicket aplikasi (alarm tidak beda rumus).
        const gateAlign = gateAlignForSide(m15 as Candle[], h1 as Candle[], side);
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
          // FUTURES = pasar yang dilihat murid. SPOT = jalan darurat; notif otomatis memberi peringatan.
          // Opsional-call: klien palsu di tes boleh tidak punya marketUsed().
          market: tickerMarket,
          jenis: jenisPerp(ticker.symbol),
          zones,
          rangePct: zones.rangePct,
          quoteVolume: ticker.quoteVolume,
          dataAgeMin: Math.round(dataAgeMin),
          scannedAt: now,
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

// ALERT, MEJA, dan PAPAN sebelumnya menjalankan pindai identik sendiri-sendiri:
// ratusan request kline per konsumen. Akibatnya IP Railway diban Binance (HTTP 418).
// Satu hasil bersama cukup karena semua memakai rumus dan pasar yang sama.
const SHARED_SCAN_TTL_MS = 120_000;
const sharedScans = new WeakMap<BinancePublicMarketDataClient, {
  cache?: { at: number; rows: AlertScanRow[] };
  inFlight?: Promise<AlertScanRow[]>;
}>();

export async function scanAlertCandidatesShared(
  client: BinancePublicMarketDataClient,
  limit = MAX_CANDIDATES,
): Promise<AlertScanRow[]> {
  let state = sharedScans.get(client);
  if (!state) {
    state = {};
    sharedScans.set(client, state);
  }
  if (state.cache && Date.now() - state.cache.at < SHARED_SCAN_TTL_MS) {
    return state.cache.rows.slice(0, limit);
  }
  if (!state.inFlight) {
    const scanState = state;
    scanState.inFlight = scanAlertCandidates(client, MAX_CANDIDATES)
      .then((rows) => {
        scanState.cache = { at: Date.now(), rows };
        return rows;
      })
      .catch((error) => {
        // Snapshot lama hanya untuk tampilan, TIDAK boleh dipakai untuk eksekusi:
        // konsumen harus memeriksa umur tiket berdasarkan jam nyata.
        if (scanState.cache) return scanState.cache.rows;
        throw error;
      })
      .finally(() => { scanState.inFlight = undefined; });
  }
  return (await state.inFlight!).slice(0, limit);
}

/** Baca-saja: tanyakan ke gerbang app yang SAMA dengan tombol pratinjau/konfirmasi.
 * Fail closed: token/koneksi/app/Testnet bermasalah => tidak ada alarm SIAP. */
export async function appConfirmsReady(row: AlertScanRow, options: { fetchImpl?: typeof fetch; baseUrl?: string; token?: string } = {}): Promise<boolean> {
  const c2 = row.setup.candle2;
  if (!c2 || !row.setup.valid || !row.ticket?.actionable || !row.gateAlign || !gateMatchesSide(row.gate, row.side) || row.market !== 'FUTURES'
    || !tiketMasihSah(c2) || Date.now() - row.scannedAt > 120_000 || row.dataAgeMin > STALE_CANDLE_MINUTES) return false;
  const token = options.token ?? process.env.EXEC_TOKEN;
  const base = options.baseUrl ?? process.env.ALERT_CHECK_BASE_URL ?? 'https://web-gray-eta-79.vercel.app';
  if (!token || !base.startsWith('https://')) return false;
  try {
    const response = await (options.fetchImpl ?? fetch)(new URL('/api/meja/alert-check', base), {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token, symbol: row.symbol, side: row.side,
        setupKey: `${row.symbol}:${row.side}:${c2}` }),
      signal: AbortSignal.timeout(12_000), cache: 'no-store',
    });
    if (!response.ok) return false;
    const payload = await response.json() as { ok?: boolean; setupKey?: string; entry?: number; stop?: number; target?: number; expiresAt?: string; demoTradable?: boolean };
    const close = (a: number, b: number) => Number.isFinite(a) && Number.isFinite(b)
      && Math.abs(a - b) <= Math.max(1e-10, Math.abs(b) * 1e-9);
    const valid = payload.ok === true && payload.setupKey === `${row.symbol}:${row.side}:${c2}`
      && Date.parse(payload.expiresAt ?? '') > Date.now()
      && close(Number(payload.entry), row.ticket.entry) && close(Number(payload.stop), row.ticket.stop)
      && close(Number(payload.target), row.ticket.target);
    if (valid) row.demoTradable = payload.demoTradable === true;
    return valid;
  } catch { return false; }
}

export async function runAlertCycle(
  store: ReturnType<typeof createAlertStore>,
  client?: BinancePublicMarketDataClient,
  options: { chatId?: string; papanUrl?: string; send?: typeof sendTelegram;
    confirmReady?: (row: AlertScanRow) => Promise<boolean> } = {},
): Promise<{ scanned: number; sent: number; messages: AlertMessage[] }> {
  const market = client ?? scanMarketClient();
  const rows = await scanAlertCandidatesShared(market);
  const messages: AlertMessage[] = [];
  for (const row of rows) {
    // Hanya alarm dari tiket aplikasi yang lolos SEMUA pagar server + simbol Testnet TRADING.
    // BEL PINTU/TIKET_TANPA_GATE tidak menimbulkan alarm entry.
    const pending = collectAlertsForCandidate(row, store, { mode: 'tiketsiap', papanUrl: options.papanUrl ?? normalizePapanUrl() });
    // Pernah mengabarkan tiket? Kirim peringatan BASI saat jendela habis (bukan alarm entry baru).
    messages.push(...pending.filter((message) => message.kind === 'TIKET_BASI'));
    if (!pending.some((message) => message.kind === 'TIKET')) continue;
    if (!gateMatchesSide(row.gate, row.side)) continue; // pagar juga aktif pada mock/cache dan saat rolling deploy
    if (!(await (options.confirmReady ?? appConfirmsReady)(row))) continue;
    if (!tiketMasihSah(row.setup.candle2)) continue;
    messages.push(...pending.filter((message) => message.kind === 'TIKET').map((message) => ({
      ...message, text: buildTicketText(row, row.ticket!, options.papanUrl ?? normalizePapanUrl()),
    })));
  }
  let sent = 0;
  for (const message of messages) {
    try {
      const delivered = await (options.send ?? sendTelegram)(message.text, { chatId: options.chatId });
      if (delivered) {
        store.add(message.key);
        sent += 1;
      }
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
    '📋 Pintu/C1/C2/Basi/Batal dipantau di Papan aplikasi, bukan alarm entri.',
    '🎯 Alarm TIKET FUTURES SIAP — hanya saat rumus aplikasi mengesahkan arah, gate, dan tiket.',
    '',
    'Alarm bukan order. Login di aplikasi, periksa ulang dan setujui sendiri per tiket; Demo terkunci sampai diaktifkan, uang asli selalu terkunci.',
  ].join('\n');
}

export async function watchAlerts(): Promise<void> {
  const store = createAlertStore();
  const pollMs = Math.max(Number(process.env.ALERT_POLL_MS ?? 120_000), 60_000);
  const mode = 'tiketsiap'; // Keputusan pemilik: Telegram HANYA tiket siap yang diverifikasi app.
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
  // Pertahankan klien antar polling: cooldown 418/429/451 dan fallback spot tidak
  // di-reset tiap dua menit sehingga worker tidak terus menghantam IP yang diban.
  const market = scanMarketClient();
  for (;;) {
    try {
      // Pesan sapa dicoba tiap siklus sampai berhasil — supaya perbaikan variabel langsung terbukti tanpa redeploy.
      if (!startupSent && hasToken) {
        try {
          startupSent = await sendTelegram(buildStartupText(), { chatId: effectiveChatId });
          if (startupSent) {
            runtimeStatus.alerts.startupDeliveredAt = new Date().toISOString();
            console.log(JSON.stringify({ alerts: true, startupMessage: 'sent', at: new Date().toISOString() }));
          }
        } catch (error) {
          console.error('[alerts] gagal kirim pesan sapa:', error instanceof Error ? error.message : error);
          console.error('[alerts] diagnosa:', JSON.stringify(describeTelegramConfig()));
        }
      }
      const result = await runAlertCycle(store, market, { chatId: effectiveChatId });
      runtimeStatus.alerts.lastCycleAt = new Date().toISOString();
      runtimeStatus.alerts.scanned = result.scanned;
      runtimeStatus.alerts.delivered += result.sent;
      if (result.sent > 0) runtimeStatus.alerts.lastDeliveryAt = new Date().toISOString();
      console.log(JSON.stringify({ alerts: true, scanned: result.scanned, sent: result.sent, seen: store.size(), startupSent, at: new Date().toISOString() }));
    } catch (error) {
      runtimeStatus.alerts.lastFailureAt = new Date().toISOString();
      console.error('[alerts]', error instanceof Error ? error.message : error);
    }
    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }
}
