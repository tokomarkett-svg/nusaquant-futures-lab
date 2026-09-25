import assert from 'node:assert/strict';
import test from 'node:test';
import { buildBellText, buildTicketText, collectAlertsForCandidate, createAlertStore, sendTelegram, type AlertCandidate } from './alerts.ts';
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
