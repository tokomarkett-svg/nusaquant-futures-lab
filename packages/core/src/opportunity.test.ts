import assert from 'node:assert/strict';
import test from 'node:test';
import { createDailyMarketPlan, getActiveOpportunity, type WindowProfile } from './opportunity.ts';

const profiles: WindowProfile[] = [
  {
    id: 'midday',
    label: 'Midday watch',
    startMinute: 720,
    endMinute: 780,
    preferredRegimes: ['TREND_UP'],
    sampleSize: 80,
    setupCount: 24,
    winRate: 0.55,
    expectancyR: 0.35,
  },
  {
    id: 'unknown',
    label: 'Insufficient history',
    startMinute: 900,
    endMinute: 960,
    preferredRegimes: ['TREND_UP'],
    sampleSize: 4,
    setupCount: 1,
    winRate: null,
    expectancyR: null,
  },
];

test('daily plan marks the matching local window as active', () => {
  const plan = createDailyMarketPlan({
    now: new Date('2026-09-09T05:30:00.000Z'),
    timezone: 'Asia/Jakarta',
    regime: 'TREND_UP',
    profiles,
  });
  assert.equal(plan.dateKey, '2026-09-09');
  assert.equal(getActiveOpportunity(plan)?.id, 'midday');
  assert.equal(plan.windows[1].status, 'INSUFFICIENT_DATA');
});

test('window timing never becomes an automatic entry', () => {
  const plan = createDailyMarketPlan({
    now: new Date('2026-09-09T05:30:00.000Z'),
    timezone: 'Asia/Jakarta',
    regime: 'TREND_DOWN',
    profiles,
  });
  assert.ok(plan.notes.some((note) => note.includes('Jam adalah prioritas')));
  assert.ok(plan.windows[0].rationale.some((reason) => reason.includes('tidak sepenuhnya sesuai')));
});
