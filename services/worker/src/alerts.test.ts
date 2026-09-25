import assert from 'node:assert/strict';
import test from 'node:test';
import { buildBellText, buildStartupText, buildTicketText, collectAlertsForCandidate, createAlertStore, describeTelegramConfig, discoverChatFromUpdates, explainTelegramError, sendTelegram, type AlertCandidate } from './alerts.ts';
import type { SetupMarkers, Ticket } from '@nusaquant/core';

const setupNoC1: SetupMarkers = {
  side: 'LONG', x: 1_700_000_000_000, candle1: null, candle2: null,
  staleBars: 1, valid: false, notes: ['X ada, candle 1 belum sah'],
  entry: null, stop: null, riskDistance: null,
};

const setupTicket: SetupMarkers = {
  side: 'LONG', x: 1_700_000_000_000, candle1: 1_700_000_900_000, candle2: 1_700_001_800_000,
  staleBars: 3, valid: true, notes: ['Paket lengkap'],
  entry: 101.2, stop: 96.4, riskDistance: 4.8,
};

const ticket: Ticket = {
  side: 'LONG', entry: 101.2, stop: 96.4, target: 110.8, riskDistance: 4.8, riskPct: 4.74,
  sizeCoin: 0.0646, riskUsdt: 0.31, rewardUsdt: 0.62, rr: 2,
  stopGeometryOk: true, stopVsBatal: 'aman', entryAgeBars: 0, priceNow: 101.3,
  distanceNowPct: 0.1, chaseRisk: false, actionable: true, warnings: [],
};

const candidateBell: AlertCandidate = { symbol: 'ONTUSDT', side: 'LONG', priceNow: 0.05771, gate: 'HIJAU', gateAlign: true, setup: setupNoC1, ticket: null };
const candidateTicket: AlertCandidate = { symbol: 'RUNEUSDT', side: 'LONG', priceNow: 101.3, gate: 'HIJAU', gateAlign: true, setup: setupTicket, ticket };

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
  assert.match(text, /TIKET SIAP/);
  assert.match(text, /101\.20/);
  assert.match(text, /96\.40/);
  assert.match(text, /110\.80/);
  assert.match(text, /1% risiko/);

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
  const newer = collectAlertsForCandidate({ ...candidateTicket, setup: { ...setupTicket, candle2: 1_700_002_700_000 } }, store);
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
  assert.match(text, /1% risiko/);
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
