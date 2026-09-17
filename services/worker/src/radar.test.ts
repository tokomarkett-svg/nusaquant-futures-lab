import assert from 'node:assert/strict';
import test from 'node:test';
import type { Candle } from '@nusaquant/core';
import { computeRadar, RADAR_UNIVERSE_FALLBACK } from './radar.ts';

const day = 86_400_000;

function dailySeries(now: number, formingClose: number): Candle[] {
  const candles: Candle[] = [];
  const firstDay = Math.floor(now / day) - 46;
  for (let index = 0; index < 46; index += 1) {
    const close = 100 + index * 0.2;
    candles.push({
      time: (firstDay + index) * day,
      open: close - 0.1,
      high: index === 45 ? close + 2 : close + 0.5,
      low: index === 45 ? close - 2 : close - 0.5,
      close,
      volume: 10,
    });
  }
  candles.push({ time: (firstDay + 46) * day, open: 109.2, high: Math.max(109.3, formingClose), low: Math.min(109.0, formingClose), close: formingClose, volume: 10 });
  return candles;
}

test('radar membaca regime, gate, dan jarak breakout secara kausal', () => {
  const now = Math.floor(Date.parse('2026-09-17T06:00:00Z') / day) * day + 6 * 60 * 60 * 1000;
  const reading = computeRadar('TESTUSDT', dailySeries(now, 110), now);
  assert.ok(reading);
  assert.equal(reading.regime, 'UP');
  // prev range = 4 (high close+2, low close-2) -> gate 2 -> gate long = 109.2 + 2 = 111.2
  assert.ok(Math.abs(reading.distLongPct - ((111.2 - 110) / 110) * 100) < 1e-9);
  assert.ok(Math.abs(reading.distShortPct - ((110 - 107.2) / 110) * 100) < 1e-9);
  assert.equal(reading.touched, null);
});

test('radar menandai gate yang sudah tertembus', () => {
  const now = Math.floor(Date.parse('2026-09-17T06:00:00Z') / day) * day + 6 * 60 * 60 * 1000;
  const long = computeRadar('TESTUSDT', dailySeries(now, 112), now);
  assert.equal(long?.touched, 'LONG');
  const short = computeRadar('TESTUSDT', dailySeries(now, 106), now);
  assert.equal(short?.touched, 'SHORT');
});

test('radar menolak sample harian yang kurang', () => {
  const now = Date.parse('2026-09-17T06:00:00Z');
  assert.equal(computeRadar('TESTUSDT', [], now), null);
});

test('universe fallback berjumlah 80 simbol unik', () => {
  assert.equal(RADAR_UNIVERSE_FALLBACK.length, 80);
  assert.equal(new Set(RADAR_UNIVERSE_FALLBACK).size, 80);
});
