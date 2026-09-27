/** One-off offline proof: official checksum-verified USD-M archive -> shared core profile.
 * Research only; never imported by worker runtime, web, desk, or Telegram. */
import { readFileSync } from 'node:fs';
import { buildTradeVolumeProfile, profileLocation, type AggressorTrade } from '@nusaquant/core';

type ArchiveWindow = { source: string; symbol: string; date: string; start: number; end: number;
  dayTradesChecked: number; complete: boolean; market: 'FUTURES' | 'SPOT'; trades: AggressorTrade[] };

const [path, tickSizeArg] = process.argv.slice(2);
if (!path || !tickSizeArg) {
  console.error('Contoh: node --import tsx src/champion-archive-evaluate.ts .cache/window.json 0.1');
  process.exitCode = 2;
} else {
  try {
    const window = JSON.parse(readFileSync(path, 'utf8')) as ArchiveWindow;
    if (window.source !== 'Binance USD-M daily aggTrades (SHA256 verified)' || !window.complete
      || !Number.isSafeInteger(window.dayTradesChecked) || window.dayTradesChecked < window.trades.length) {
      throw new Error('Bukti sumber dan kelengkapan arsip hilang');
    }
    const profile = buildTradeVolumeProfile({
      symbol: window.symbol, trades: window.trades, start: window.start, end: window.end,
      market: window.market, complete: window.complete, tickSize: Number(tickSizeArg),
    });
    if (!profile) throw new Error('Trade-by-price gagal validasi; tidak boleh ada sinyal');
    const close = window.trades.at(-1)!.price;
    console.log(JSON.stringify({ researchOnly: true, source: window.source, symbol: window.symbol, date: window.date,
      start: new Date(window.start).toISOString(), end: new Date(window.end).toISOString(),
      dayTradesChecked: window.dayTradesChecked, windowTrades: window.trades.length,
      poc: profile.poc, valueAreaLow: profile.valueAreaLow, valueAreaHigh: profile.valueAreaHigh,
      takerBuyVolume: (profile.totalVolume + profile.totalDelta) / 2,
      takerSellVolume: (profile.totalVolume - profile.totalDelta) / 2,
      delta: profile.totalDelta, close, locationAtClose: profileLocation(profile, close),
      ready: false, reason: 'Satu footprint tidak membuktikan environment, second failure, flip, GEX atau edge OOS.' }));
  } catch (error) {
    console.error('GAGAL TERTUTUP:', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
