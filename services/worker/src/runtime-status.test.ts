import assert from 'node:assert/strict';
import test from 'node:test';
import { runtimeSnapshot } from './runtime-status.ts';

test('diagnostik worker menampilkan mode dan jam siklus tanpa membocorkan rahasia', () => {
  const keys = ['RUN_ALERTS', 'RUN_DESK', 'PMB_NOTIF', 'TELEGRAM_BOT_TOKEN', 'TELEGRAM_CHAT_ID', 'SQLITE_PATH'] as const;
  const before = Object.fromEntries(keys.map((k) => [k, process.env[k]]));
  try {
    process.env.RUN_ALERTS = 'true';
    process.env.RUN_DESK = 'true';
    process.env.PMB_NOTIF = '1';
    process.env.TELEGRAM_BOT_TOKEN = 'jangan-bocorkan-token';
    process.env.TELEGRAM_CHAT_ID = 'jangan-bocorkan-chat';
    process.env.SQLITE_PATH = '/tmp/jangan-bocorkan-path.db';
    const snapshot = runtimeSnapshot('FUTURES', '2026-09-27T00:00:00Z');
    assert.deepEqual(snapshot.modes, { alerts: true, telegramAllowed: true, telegramConfigured: true, desk: true, deskStoreConfigured: true });
    assert.ok(!JSON.stringify(snapshot).includes('jangan-bocorkan'));
  } finally {
    for (const k of keys) if (before[k] === undefined) delete process.env[k]; else process.env[k] = before[k];
  }
});
