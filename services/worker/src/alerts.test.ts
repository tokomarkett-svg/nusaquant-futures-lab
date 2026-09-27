import assert from 'node:assert/strict';
import test from 'node:test';
import { appConfirmsReady, buildBellText, buildStartupText, buildTicketText, collectAlertsForCandidate, createAlertStore, describeTelegramConfig, discoverChatFromUpdates, explainTelegramError, jenisPerpText, resolveAlertMode, scanAlertCandidates, sendTelegram, type AlertCandidate, type AlertScanRow } from './alerts.ts';
import { jenisPerp } from '@nusaquant/core';
import type { SetupMarkers, Ticket } from '@nusaquant/core';

// Tiket di tes dianggap BARU LAHIR — candle 2 relatif ke jam sekarang (aturan umur tiket 3 candle ×15m).
const KINI = Date.now();

const setupNoC1: SetupMarkers = {
  side: 'LONG', x: Math.floor(KINI / 900_000) * 900_000 - 900_000, candle1: null, candle2: null,
  staleBars: 1, valid: false, notes: ['X ada, candle 1 belum sah'],
  entry: null, stop: null, riskDistance: null,
};

const setupTicket: SetupMarkers = {
  side: 'LONG', x: 1_700_000_000_000, candle1: KINI - 25 * 60_000, candle2: KINI - 15 * 60_000,
  staleBars: 1, valid: true, notes: ['Paket lengkap'],
  entry: 101.2, stop: 96.4, riskDistance: 4.8,
};

const ticket: Ticket = {
  side: 'LONG', entry: 101.2, stop: 96.4, target: 110.8, riskDistance: 4.8, riskPct: 4.74,
  sizeCoin: 0.0646, riskUsdt: 0.31, rewardUsdt: 0.62, rr: 2,
  stopGeometryOk: true, stopVsBatal: 'aman', entryAgeBars: 0, priceNow: 101.3,
  distanceNowPct: 0.1, chaseRisk: false, actionable: true, warnings: [],
};

const candidateBell: AlertCandidate = { symbol: 'ONTUSDT', side: 'LONG', priceNow: 0.05771, gate: 'HIJAU', gateAlign: true, setup: setupNoC1, ticket: null };
const candidateTicket: AlertCandidate = { symbol: 'RUNEUSDT', side: 'LONG', priceNow: 101.3, gate: 'HIJAU', gateAlign: true, setup: setupTicket, ticket, garis: { pintu: 100.5, manis: 100.1, batal: 99.6 } };

test('bel pintu: hanya dikirim untuk X yang masih segar', () => {
  const store = createAlertStore();
  const fresh = collectAlertsForCandidate(candidateBell, store);
  assert.equal(fresh.length, 1);
  assert.equal(fresh[0].kind, 'X');
  assert.match(buildBellText(candidateBell), /BEL PINTU/);
  assert.match(buildBellText(candidateBell), /Belum entry/);

  const stale = collectAlertsForCandidate({ ...candidateBell, setup: { ...setupNoC1, staleBars: 5 } }, store);
  assert.equal(stale.length, 0, 'X yang sudah 5 candle tidak lagi dianggap bel baru');
});

test('tiket siap: pesannya memuat entry, stop, target, ukuran, dan pengingat risiko', () => {
  const text = buildTicketText(candidateTicket, ticket);
  assert.match(text, /TIKET FUTURES SAH/);
  assert.match(text, /TIDAK BISA order Demo/);
  assert.match(text, /ENTRY: 101\.20/);
  assert.match(text, /96\.40/);
  assert.match(text, /110\.80/);
  assert.match(text, /jangan salin order ke Binance/);
  assert.doesNotMatch(text, /Salin persis ke Binance/);
  assert.doesNotMatch(text, /JANGAN EKSEKUSI/);

  const denganTautan = buildTicketText(candidateTicket, ticket, 'https://papan.example.app');
  assert.match(denganTautan, /https:\/\/papan\.example\.app\/hp\/koin\/RUNEUSDT/);
  assert.match(text, /pintu 100\.50/);
  assert.match(text, /batal 99\.60/);
  assert.match(text, /Lahir \d{2}:\d{2} WIB/);

  const basi = buildTicketText(candidateTicket, { ...ticket, actionable: false, chaseRisk: true, warnings: ['harga sudah berjalan 0.8R — jangan dikejar'] });
  assert.match(basi, /TIKET BASI — jangan dikejar/);
});

test('dedupe: satu setup tidak dikirim dua kali', () => {
  const store = createAlertStore();
  const first = collectAlertsForCandidate(candidateTicket, store);
  assert.equal(first.length, 1);
  store.add(first[0].key);
  const second = collectAlertsForCandidate(candidateTicket, store);
  assert.equal(second.length, 0);

  // setup baru (candle 2 lain) → boleh dikirim lagi
  const newer = collectAlertsForCandidate({ ...candidateTicket, setup: { ...setupTicket, candle2: KINI - 5 * 60_000 } }, store);
  assert.equal(newer.length, 1);
});

test('tiket tanpa gate searah: dikirim dengan peringatan JANGAN EKSEKUSI', () => {
  const store = createAlertStore();
  const misaligned: AlertCandidate = { ...candidateTicket, gate: 'MERAH', gateAlign: false };
  const messages = collectAlertsForCandidate(misaligned, store);
  assert.equal(messages.length, 1);
  assert.equal(messages[0].kind, 'TIKET_TANPA_GATE');
  assert.match(messages[0].text, /GATE BELUM SEARAH/);
  assert.match(messages[0].text, /JANGAN EKSEKUSI/);
});

test('bel pintu tidak dikirim kalau gate belum searah', () => {
  const store = createAlertStore();
  const misaligned: AlertCandidate = { ...candidateBell, gate: 'MERAH', gateAlign: false };
  assert.equal(collectAlertsForCandidate(misaligned, store).length, 0);
});

test('pesan sapa startup memuat label aktif dan aturan risiko', () => {
  const text = buildStartupText();
  assert.match(text, /alert aktif/);
  assert.match(text, /BEL PINTU/);
  assert.match(text, /Alarm bukan order/);
});

test('penerjemah error Telegram memberi langkah perbaikan yang benar', () => {
  assert.match(explainTelegramError(401, '{"ok":false,"description":"Unauthorized"}'), /TOKEN salah/);
  assert.match(explainTelegramError(400, '{"description":"Bad Request: chat not found"}'), /CHAT ID salah/);
  assert.match(explainTelegramError(403, JSON.stringify({ description: "Forbidden: bot can't initiate conversation with a user" })), /BELUM menekan tombol START/);
  assert.match(explainTelegramError(400, '{"description":"Bad Request: chat_id is empty"}'), /CHAT ID kosong/);
});

test('diagnosa konfigurasi tidak membocorkan token/chat id lengkap', () => {
  const previous = { token: process.env.TELEGRAM_BOT_TOKEN, chat: process.env.TELEGRAM_CHAT_ID };
  process.env.TELEGRAM_BOT_TOKEN = '1234567890:AAHsecretsecretsecretsecret';
  process.env.TELEGRAM_CHAT_ID = ' 123456789';
  const config = describeTelegramConfig() as Record<string, unknown>;
  assert.equal(config.tokenLooksValid, true);
  assert.match(String(config.tokenMasked), /^12…/);
  assert.ok(!String(config.tokenMasked).includes('secret'));
  assert.equal(config.chatIdPunyaSpasi, true, 'spasi di chat id harus terdeteksi');
  if (previous.token === undefined) delete process.env.TELEGRAM_BOT_TOKEN; else process.env.TELEGRAM_BOT_TOKEN = previous.token;
  if (previous.chat === undefined) delete process.env.TELEGRAM_CHAT_ID; else process.env.TELEGRAM_CHAT_ID = previous.chat;
});

test('tanpa token, pengiriman jatuh ke mode DRY RUN (tidak melempar error)', async () => {
  const previousToken = process.env.TELEGRAM_BOT_TOKEN;
  const previousChat = process.env.TELEGRAM_CHAT_ID;
  delete process.env.TELEGRAM_BOT_TOKEN;
  delete process.env.TELEGRAM_CHAT_ID;
  const sent = await sendTelegram('uji dry run');
  assert.equal(sent, false);
  if (previousToken) process.env.TELEGRAM_BOT_TOKEN = previousToken;
  if (previousChat) process.env.TELEGRAM_CHAT_ID = previousChat;
});

test('dengan token, pesan dikirim ke endpoint Bot API resmi', async () => {
  let seenUrl = '';
  let seenBody = '';
  const sent = await sendTelegram('<b>halo</b>', {
    token: 'token-uji', chatId: '12345',
    fetchImpl: (async (url: URL | string, init?: RequestInit) => {
      seenUrl = String(url);
      seenBody = String(init?.body ?? '');
      return { ok: true, status: 200, text: async () => 'ok' } as Response;
    }) as typeof fetch,
  });
  assert.equal(sent, true);
  assert.match(seenUrl, /^https:\/\/api\.telegram\.org\/bottoken-uji\/sendMessage$/);
  assert.match(seenBody, /"chat_id":"12345"/);
  assert.match(seenBody, /"parse_mode":"HTML"/);
});

test('penemu chat id: memakai chat pribadi terakhir yang menyapa bot', async () => {
  const updates = {
    ok: true,
    result: [
      { update_id: 1, message: { chat: { id: 111111111, type: 'private', first_name: 'Lama' } } },
      { update_id: 2, message: { chat: { id: -100222222, type: 'group', title: 'Grup' } } },
      { update_id: 3, message: { chat: { id: 333333333, type: 'private', first_name: 'Bri', username: 'bri' } } },
    ],
  };
  const found = await discoverChatFromUpdates({
    token: 'token-uji',
    fetchImpl: (async () => ({ ok: true, status: 200, json: async () => updates }) as unknown as Response) as typeof fetch,
  });
  assert.deepEqual(found, { chatId: '333333333', label: 'Bri' });
});

test('penemu chat id: mengabaikan grup & aman saat belum ada percakapan', async () => {
  const onlyGroup = { ok: true, result: [{ update_id: 1, message: { chat: { id: -100999, type: 'group' } } }] };
  const groupResult = await discoverChatFromUpdates({
    token: 'token-uji',
    fetchImpl: (async () => ({ ok: true, status: 200, json: async () => onlyGroup }) as unknown as Response) as typeof fetch,
  });
  assert.equal(groupResult, null);

  const empty = await discoverChatFromUpdates({
    token: 'token-uji',
    fetchImpl: (async () => ({ ok: true, status: 200, json: async () => ({ ok: true, result: [] }) }) as unknown as Response) as typeof fetch,
  });
  assert.equal(empty, null);
});

test('mode notifikasi: semua / tiketsiap / tiketsemua berperilaku sesuai pilihan', () => {
  assert.equal(resolveAlertMode(undefined), 'semua');
  assert.equal(resolveAlertMode('TIKETSIAP'), 'tiketsiap');
  assert.equal(resolveAlertMode(' tiket-semua '), 'tiketsemua');
  assert.equal(resolveAlertMode('ngawur'), 'semua', 'nilai tak dikenal kembali ke default');

  const siap: AlertCandidate = { ...candidateTicket, gate: 'HIJAU', gateAlign: true };
  const tanpaGate: AlertCandidate = { ...candidateTicket, gate: 'MERAH', gateAlign: false };

  // mode semua: bel pintu boleh, tiket apa pun boleh
  const storeAll = createAlertStore();
  assert.equal(collectAlertsForCandidate(candidateBell, storeAll, { mode: 'semua' }).length, 1);
  assert.equal(collectAlertsForCandidate(tanpaGate, storeAll, { mode: 'semua' })[0].kind, 'TIKET_TANPA_GATE');

  // mode tiketsiap: hanya tiket gate searah, tanpa bel, tanpa peringatan
  const storeSiap = createAlertStore();
  assert.equal(collectAlertsForCandidate(candidateBell, storeSiap, { mode: 'tiketsiap' }).length, 0, 'bel pintu tidak dikirim');
  assert.equal(collectAlertsForCandidate(tanpaGate, storeSiap, { mode: 'tiketsiap' }).length, 0, 'tiket tanpa gate tidak dikirim');
  assert.equal(collectAlertsForCandidate(siap, storeSiap, { mode: 'tiketsiap' }).length, 1);

  // mode tiketsemua: tiket apa pun, tanpa bel
  const storeTiket = createAlertStore();
  assert.equal(collectAlertsForCandidate(candidateBell, storeTiket, { mode: 'tiketsemua' }).length, 0);
  assert.equal(collectAlertsForCandidate(tanpaGate, storeTiket, { mode: 'tiketsemua' }).length, 1);
});


test('jenisPerp: perp saham & komoditas ditandai, koin kripto tidak', () => {
  assert.equal(jenisPerp('ARMUSDT'), 'saham');
  assert.equal(jenisPerp('HOODUSDT'), 'saham');
  assert.equal(jenisPerp('NATGASUSDT'), 'komoditas');
  assert.equal(jenisPerp('XAUUSDT'), 'komoditas');
  assert.equal(jenisPerp('RUNEUSDT'), 'kripto');
  assert.equal(jenisPerp('BTCUSDT'), 'kripto');
  assert.match(jenisPerpText('saham') ?? '', /Perp SAHAM/);
  assert.match(jenisPerpText('komoditas') ?? '', /KOMODITAS/);
  assert.equal(jenisPerpText('kripto'), null);
  assert.equal(jenisPerpText(undefined), null);
});

test('X lama tidak boleh menjadi bel baru walau snapshot masih mengatakan staleBars=1', () => {
  const store = createAlertStore();
  const oldX = { ...candidateBell, setup: { ...setupNoC1, x: KINI - 3 * 3_600_000 } };
  assert.equal(collectAlertsForCandidate(oldX, store).length, 0);
});

test('siklus notifikasi tidak menandai DRY RUN sebagai terkirim; boleh coba lagi setelah aktif', async () => {
  const { runAlertCycle } = await import('./alerts.ts');
  const store = createAlertStore();
  const now = Date.now();
  const market = {
    get24hTickerDetails: async () => [{ symbol: 'TESTUSDT', last: 96.85, high: 110, low: 90, quoteVolume: 50_000_000 }],
    getKlines: async ({ interval }: { interval: string }) => {
      if (interval === '1h') return Array.from({ length: 130 }, (_, i) => ({
        time: now - (130 - i) * 3_600_000, open: 80 + i * 0.15, high: 81 + i * 0.15,
        low: 79 + i * 0.15, close: 80.1 + i * 0.15, volume: 1,
      }));
      const step = 900_000;
      const latest = Math.floor(now / step) * step - step;
      const bars = Array.from({ length: 140 }, (_, i) => ({
        time: latest - (139 - i) * step, open: 96.2, high: 96.4, low: 96.1, close: 96.3, volume: 1,
      }));
      bars[137] = { ...bars[137], open: 96.3, high: 96.4, low: 95.5, close: 96.25 };
      bars[138] = { ...bars[138], open: 96.6, high: 96.8, low: 95, close: 96.4 };
      bars[139] = { ...bars[139], open: 96.45, high: 96.9, low: 96.4, close: 96.85 };
      return bars;
    },
  } as unknown as import('./market-data.ts').BinancePublicMarketDataClient;
  const blocked = await runAlertCycle(store, market, { confirmReady: async () => false, send: async () => { throw new Error('No Telegram when app says no'); } });
  assert.equal(blocked.sent, 0);
  assert.equal(store.size(), 0);
  const dry = await runAlertCycle(store, market, { confirmReady: async () => true, send: async () => false });
  assert.equal(dry.sent, 0);
  assert.equal(store.size(), 0);
  const live = await runAlertCycle(store, market, { confirmReady: async () => true, send: async () => true });
  assert.equal(live.sent, 1);
  assert.equal(store.size(), 1);
});

test('alarm SIAP hanya jika app memvalidasi setup yang sama, harga sama, dan belum basi', async () => {
  const row: AlertScanRow = { ...candidateTicket, market: 'FUTURES', rangePct: 5,
    quoteVolume: 10_000_000, dataAgeMin: 3, scannedAt: Date.now() };
  const reply = (payload: Record<string, unknown>, status = 200) =>
    (async () => ({ ok: status === 200, status, json: async () => payload }) as Response) as typeof fetch;
  const valid = { ok: true, setupKey: `RUNEUSDT:LONG:${setupTicket.candle2}`,
    entry: ticket.entry, stop: ticket.stop, target: ticket.target,
    expiresAt: new Date(Date.now() + 15 * 60_000).toISOString() };
  const base = { token: 'shared-test-token', baseUrl: 'https://web.example.test' };
  assert.equal(await appConfirmsReady(row, { ...base, fetchImpl: reply(valid) }), true);
  assert.equal(await appConfirmsReady(row, { ...base, fetchImpl: reply({ ...valid, setupKey: 'another-setup' }) }), false);
  assert.equal(await appConfirmsReady(row, { ...base, fetchImpl: reply({ ...valid, target: 999 }) }), false);
  assert.equal(await appConfirmsReady(row, { ...base, fetchImpl: reply({ ...valid, expiresAt: new Date(Date.now() - 1).toISOString() }) }), false);
  assert.equal(await appConfirmsReady(row, { ...base, fetchImpl: reply({ ok: false }, 409) }), false);
  assert.equal(await appConfirmsReady({ ...row, market: 'SPOT' }, { ...base, fetchImpl: reply(valid) }), false);
  assert.equal(await appConfirmsReady({ ...row, scannedAt: Date.now() - 180_000 }, { ...base, fetchImpl: reply(valid) }), false);
  assert.equal(await appConfirmsReady(row, { ...base, token: '', fetchImpl: reply(valid) }), false);
});

test('scanner mempertahankan tahap koin yang belum lolos MA99 agar aplikasi bisa tampilkan PINTU/C1/C2', async () => {
  const now = Date.now();
  const latest15 = Math.floor(now / 900_000) * 900_000 - 900_000;
  const latest1h = Math.floor(now / 3_600_000) * 3_600_000 - 3_600_000;
  const market = {
    marketUsed: () => 'FUTURES',
    get24hTickerDetails: async () => [{ symbol: 'TESTUSDT', last: 105, high: 140, low: 80, quoteVolume: 50_000_000 }],
    getKlines: async ({ interval }: { interval: string }) => interval === '15m'
      ? Array.from({ length: 140 }, (_, i) => ({ time: latest15 - (139 - i) * 900_000,
        open: 100, high: 101, low: 99, close: 100, volume: 1 }))
      : Array.from({ length: 130 }, (_, i) => ({ time: latest1h - (129 - i) * 3_600_000,
        open: 100, high: 101, low: 99, close: 100, volume: 1 })),
  } as unknown as import('./market-data.ts').BinancePublicMarketDataClient;
  const rows = await scanAlertCandidates(market, 10);
  assert.equal(rows.length, 1, 'koin belum searah tidak boleh lenyap dari progres scanner');
  assert.equal(rows[0].gateAlign, false, 'tidak akan mengirim alarm SIAP');
  assert.equal(rows[0].symbol, 'TESTUSDT');
});
