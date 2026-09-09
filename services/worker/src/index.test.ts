import assert from 'node:assert/strict';
import test from 'node:test';
import { PaperBotEngine } from './index.ts';

test('bot starts in observation mode without opening a position', () => {
  const bot = new PaperBotEngine({ mode: 'PAPER_APPROVAL' });
  const snapshot = bot.start(new Date('2026-09-09T00:00:00.000Z'));
  assert.equal(snapshot.status, 'RUNNING');
  assert.equal(snapshot.position, null);
  assert.equal(snapshot.plan?.timezone, 'Asia/Jakarta');
});

test('pause stops new work and clears pending approval', () => {
  const bot = new PaperBotEngine({ mode: 'PAPER_APPROVAL' });
  bot.start();
  const snapshot = bot.pause();
  assert.equal(snapshot.status, 'PAUSED');
  assert.equal(snapshot.pendingSignal, null);
});

test('insufficient candle data cannot create a paper order', () => {
  const bot = new PaperBotEngine({ mode: 'PAPER_AUTO' });
  bot.start();
  const snapshot = bot.onClosedCandle({ higherTimeframe: [], entryTimeframe: [] });
  assert.equal(snapshot.position, null);
  assert.equal(snapshot.latestSignal?.decision, 'NO_TRADE');
});
