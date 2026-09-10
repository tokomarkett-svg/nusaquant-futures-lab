import assert from 'node:assert/strict';
import test from 'node:test';
import { PaperBotEngine } from './index.ts';
import { desiredStatusAction, isFreshMarketCandle } from './session-control.ts';

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

test('stale market candles are rejected before signal evaluation', () => {
  const now = Date.parse('2026-09-10T03:00:00.000Z');
  assert.equal(isFreshMarketCandle('2026-09-10T02:45:00.000Z', now), true);
  assert.equal(isFreshMarketCandle('2026-09-10T02:14:59.000Z', now), false);
  assert.equal(isFreshMarketCandle('2026-09-10T03:15:00.000Z', now), false);
});

test('session commands map to safe paper-only worker actions', () => {
  assert.equal(desiredStatusAction('RUNNING'), 'START');
  assert.equal(desiredStatusAction('WAITING_APPROVAL'), 'START');
  assert.equal(desiredStatusAction('POSITION_OPEN'), 'APPROVE');
  assert.equal(desiredStatusAction('PAUSED'), 'PAUSE');
  assert.equal(desiredStatusAction('EMERGENCY'), 'EMERGENCY');
});

test('paper position state can be restored after a worker restart', () => {
  const bot = new PaperBotEngine({ mode: 'PAPER_APPROVAL', symbol: 'BTCUSDT' });
  const snapshot = bot.restorePosition({
    id: 'paper-4',
    symbol: 'BTCUSDT',
    side: 'LONG',
    entry: 100,
    quantity: 0.1,
    stopLoss: 95,
    takeProfit: 110,
    openedAt: '2026-09-09T00:00:00.000Z',
  });
  assert.equal(snapshot.status, 'POSITION_OPEN');
  assert.equal(snapshot.position?.id, 'paper-4');
});

test('paper exit records costs and daily loss governor blocks new entries', () => {
  const bot = new PaperBotEngine({ mode: 'PAPER_APPROVAL', dailyLossFraction: 0.0005 });
  bot.restorePosition({
    id: 'paper-5',
    symbol: 'BTCUSDT',
    side: 'LONG',
    entry: 100,
    quantity: 1,
    stopLoss: 90,
    takeProfit: 120,
    openedAt: '2026-09-09T00:00:00.000Z',
  });

  const snapshot = bot.onPriceTick(90, new Date('2026-09-09T00:15:00.000Z'));
  assert.equal(snapshot.status, 'PAUSED');
  assert.equal(snapshot.riskBlocked, true);
  assert.ok((snapshot.lastClosedPosition?.totalCosts ?? 0) > 0);
  assert.ok((snapshot.lastClosedPosition?.realizedPnl ?? 0) < -10);
  assert.ok(snapshot.dailyRealizedPnl <= -snapshot.dailyLossLimit);
  assert.equal(bot.start(new Date('2026-09-09T00:30:00.000Z')).status, 'PAUSED');
});
