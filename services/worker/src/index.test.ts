import assert from 'node:assert/strict';
import test from 'node:test';
import { MAX_PENDING_SIGNAL_AGE_MS, PaperBotEngine } from './index.ts';
import type { Candle, IntelligentSignal } from '@nusaquant/core';
import { DEFAULT_MARKET_DATA_MAX_AGE_MS, WILLIAMS_MARKET_DATA_MAX_AGE_MS, desiredStatusAction, isFreshMarketCandle, resolveBotSessionIds } from './session-control.ts';

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

test('observation resume clears a stale pending approval signal', () => {
  const bot = new PaperBotEngine({ mode: 'PAPER_APPROVAL' });
  bot.start();
  const signal = {
    decision: 'LONG',
    candidate: 'LONG',
    stage: 'TRIGGERED',
    timing: 'ENTER_NOW',
    regime: 'TREND_UP',
    qualityScore: 80,
    scoreMax: 100,
    entry: 100,
    triggerPrice: 100,
    stopLoss: 95,
    takeProfit: 110,
    quantity: 1,
    riskAmount: 10,
    riskReward: 2,
    maxChaseDistance: 1,
    patterns: [],
    structure: { bias: 'BULLISH', lastSwingHigh: 100, lastSwingLow: 95, breakOfStructure: 'BULLISH', reason: 'test' },
    evidence: [],
    blockers: [],
    explanation: 'test',
  } satisfies IntelligentSignal;
  bot.restorePendingSignal(signal);
  assert.equal(bot.snapshot().status, 'WAITING_APPROVAL');
  const resumed = bot.resumeObservation();
  assert.equal(resumed.status, 'RUNNING');
  assert.equal(resumed.pendingSignal, null);
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

test('worker watch always includes BTC and ETH sessions', () => {
  const sessions = resolveBotSessionIds('custom-session,00000000-0000-4000-8000-000000000001');
  assert.deepEqual(sessions, [
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000002',
    'custom-session',
  ]);
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

test('paper approval opens, closes with costs, and returns to cooldown', () => {
  const bot = new PaperBotEngine({ mode: 'PAPER_APPROVAL', symbol: 'BTCUSDT' });
  bot.start(new Date('2026-09-09T00:00:00.000Z'));
  const signal = {
    decision: 'LONG',
    candidate: 'LONG',
    stage: 'TRIGGERED',
    timing: 'ENTER_NOW',
    regime: 'TREND_UP',
    qualityScore: 82,
    scoreMax: 100,
    entry: 100,
    triggerPrice: 100,
    stopLoss: 90,
    takeProfit: 120,
    quantity: 1,
    riskAmount: 10,
    riskReward: 2,
    maxChaseDistance: 1,
    patterns: [],
    structure: { bias: 'BULLISH', lastSwingHigh: 100, lastSwingLow: 90, breakOfStructure: 'BULLISH', reason: 'test' },
    evidence: [],
    blockers: [],
    explanation: 'test',
  } satisfies IntelligentSignal;
  bot.restorePendingSignal(signal);
  const opened = bot.approvePending(new Date('2026-09-09T00:00:00.000Z'));
  assert.equal(opened.status, 'POSITION_OPEN');
  assert.equal(opened.position?.symbol, 'BTCUSDT');
  const closed = bot.onPriceTick(90, new Date('2026-09-09T00:15:00.000Z'));
  assert.equal(closed.status, 'COOLDOWN');
  assert.equal(closed.position, null);
  assert.equal(closed.lastClosedPosition?.closeReason, 'STOP_LOSS');
  assert.ok((closed.lastClosedPosition?.totalCosts ?? 0) > 0);
  assert.ok((closed.lastClosedPosition?.realizedPnl ?? 0) < 0);
});

test('paper candle mark uses OHLC and conservative stop-first intrabar fill', () => {
  const bot = new PaperBotEngine({ mode: 'PAPER_APPROVAL', symbol: 'BTCUSDT' });
  bot.restorePosition({
    id: 'paper-6',
    symbol: 'BTCUSDT',
    side: 'LONG',
    entry: 100,
    quantity: 1,
    stopLoss: 90,
    takeProfit: 120,
    openedAt: '2026-09-09T00:00:00.000Z',
  });
  const closed = bot.onCandle({ high: 121, low: 89, close: 100, now: new Date('2026-09-09T00:15:00.000Z') });
  assert.equal(closed.lastClosedPosition?.closeReason, 'STOP_LOSS');
  assert.equal(closed.lastClosedPosition?.exit, 90);
});

test('stale paper approval is canceled after the signal candle expires', () => {
  const bot = new PaperBotEngine({ mode: 'PAPER_APPROVAL', symbol: 'BTCUSDT' });
  const signal = {
    decision: 'LONG',
    candidate: 'LONG',
    stage: 'TRIGGERED',
    timing: 'ENTER_NOW',
    regime: 'TREND_UP',
    qualityScore: 82,
    scoreMax: 100,
    entry: 100,
    triggerPrice: 100,
    stopLoss: 90,
    takeProfit: 120,
    quantity: 1,
    riskAmount: 10,
    riskReward: 2,
    maxChaseDistance: 1,
    patterns: [],
    structure: { bias: 'BULLISH', lastSwingHigh: 100, lastSwingLow: 90, breakOfStructure: 'BULLISH', reason: 'test' },
    evidence: [],
    blockers: [],
    explanation: 'test',
  } satisfies IntelligentSignal;
  bot.restorePendingSignal({
    ...signal,
    structure: { ...signal.structure, candle_open_time: '2026-09-09T00:00:00.000Z' },
  } as IntelligentSignal);
  const snapshot = bot.expirePendingApproval(new Date(Date.parse('2026-09-09T00:00:00.000Z') + MAX_PENDING_SIGNAL_AGE_MS + 1));
  assert.equal(snapshot.status, 'RUNNING');
  assert.equal(snapshot.position, null);
  assert.match(snapshot.lastEvent ?? '', /kedaluwarsa/);
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

function williamsEntryCandles(): Candle[] {
  const hour = 60 * 60 * 1000;
  const day0 = Date.parse('2026-01-01T00:00:00Z');
  const entry: Candle[] = [];
  for (let day = 0; day < 50; day += 1) {
    const dayClose = 100 + day * 0.1;
    for (let h = 0; h < 24; h += 1) {
      entry.push({
        time: day0 + day * 86_400_000 + h * hour,
        open: dayClose - 0.1,
        high: day === 49 ? dayClose + 1 : dayClose + 0.2,
        low: day === 49 ? dayClose - 1 : dayClose - 0.2,
        close: dayClose,
        volume: 50,
      });
    }
  }
  const triggerDayStart = day0 + 50 * 86_400_000;
  entry.push({ time: triggerDayStart, open: 104.9, high: 105.0, low: 104.7, close: 104.9, volume: 50 });
  entry.push({ time: triggerDayStart + hour, open: 105.0, high: 106.2, low: 104.9, close: 106.0, volume: 60 });
  return entry;
}

test('williams strategy opens a paper position after approval', () => {
  const bot = new PaperBotEngine({
    symbol: 'ETHUSDT',
    mode: 'PAPER_APPROVAL',
    strategy: 'WILLIAMS_VOLATILITY_BREAKOUT',
    entryIntervalMs: 60 * 60 * 1000,
  });
  const entry = williamsEntryCandles();
  const triggerTime = entry.at(-1)!.time;
  bot.start(new Date(triggerTime));

  const waiting = bot.onClosedCandle({ higherTimeframe: [], entryTimeframe: entry });
  assert.equal(waiting.status, 'WAITING_APPROVAL');
  assert.equal(waiting.strategy, 'WILLIAMS_VOLATILITY_BREAKOUT');
  assert.equal(waiting.pendingSignal?.decision, 'LONG');
  assert.ok(waiting.pendingSignal?.stopLoss && waiting.pendingSignal.stopLoss < 104.9);

  const approved = bot.approvePending(new Date(triggerTime));
  assert.equal(approved.status, 'POSITION_OPEN');
  assert.equal(approved.position?.side, 'LONG');
  assert.equal(approved.position?.entry, 106.0);
});

test('williams strategy time-exits after 72 entry bars', () => {
  const bot = new PaperBotEngine({
    symbol: 'ETHUSDT',
    mode: 'PAPER_AUTO',
    strategy: 'WILLIAMS_VOLATILITY_BREAKOUT',
    entryIntervalMs: 60 * 60 * 1000,
  });
  const entry = williamsEntryCandles();
  const triggerTime = entry.at(-1)!.time;
  bot.start(new Date(triggerTime));
  const opened = bot.onClosedCandle({ higherTimeframe: [], entryTimeframe: entry, now: new Date(triggerTime) });
  assert.equal(opened.status, 'POSITION_OPEN');

  const hour = 60 * 60 * 1000;
  let snapshot = opened;
  for (let bar = 1; bar <= 72; bar += 1) {
    snapshot = bot.onCandle({
      high: 107,
      low: 105,
      close: 106,
      now: new Date(triggerTime + bar * hour),
    });
    if (snapshot.status !== 'POSITION_OPEN') break;
  }
  assert.equal(snapshot.lastClosedPosition?.closeReason, 'TIME_EXIT');
  assert.equal(snapshot.lastClosedPosition?.barsHeld, 72);
  assert.equal(snapshot.status, 'COOLDOWN');
});

test('williams strategy stays observing when the gate is not broken', () => {
  const bot = new PaperBotEngine({
    symbol: 'ETHUSDT',
    mode: 'PAPER_AUTO',
    strategy: 'WILLIAMS_VOLATILITY_BREAKOUT',
    entryIntervalMs: 60 * 60 * 1000,
  });
  // Trigger di bawah gate: close 105.4 < open 104.9 + 1.0
  const entry = williamsEntryCandles();
  entry[entry.length - 1] = { ...entry.at(-1)!, close: 105.4, high: 105.6 };
  bot.start(new Date(entry.at(-1)!.time));
  const snapshot = bot.onClosedCandle({ higherTimeframe: [], entryTimeframe: entry });
  assert.equal(snapshot.status, 'RUNNING');
  assert.equal(snapshot.position, null);
  assert.equal(snapshot.pendingSignal, null);
});

test('williams freshness threshold covers a just-closed 1h candle', () => {
  const now = Date.parse('2026-09-17T02:50:00.000Z');
  // Candle 1H 01:00-02:00 UTC baru ditutup 50 menit lalu + open_time 01:00 => umur 110 menit?
  // Yang relevan: open_time candle 1H terakhir (01:00) vs now (02:50) = 110 menit -> stale bahkan untuk Williams.
  assert.equal(isFreshMarketCandle('2026-09-17T02:00:00.000Z', now, DEFAULT_MARKET_DATA_MAX_AGE_MS), false);
  assert.equal(isFreshMarketCandle('2026-09-17T02:00:00.000Z', now, WILLIAMS_MARKET_DATA_MAX_AGE_MS), true);
  assert.ok(WILLIAMS_MARKET_DATA_MAX_AGE_MS > 60 * 60 * 1000);
});
