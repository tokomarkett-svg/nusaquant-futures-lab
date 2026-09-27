/** Offline RESEARCH replay of checksum-verified USD-M aggTrades windows.
 * No Binance key, Telegram, order path, network calls, or production import.
 * Evaluates each 5m close using only profiles/1H/4H candles closed before it.
 * Never emits SIAP; writes a reproducible stage funnel, not a profitability claim. */
import { createReadStream, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createGunzip } from 'node:zlib';
import { createInterface } from 'node:readline';
import {
  buildTradeVolumeProfile, mergeTradeVolumeProfiles, buildChampionContext,
  evaluateChampionSequence, type AggressorTrade, type FootprintBar,
} from '@nusaquant/core';
import type { Candle } from '@nusaquant/core';

type DayMeta = { source: string; symbol: string; date: string; start: number; end: number;
  windows: number; trades: number; sha256: string };
type Window = { symbol: string; start: number; end: number; trades: AggressorTrade[] };
const FIVE = 300_000;
const HOUR = 3_600_000;
const DAY = 86_400_000;

function dayOf(ms: number): string { return new Date(ms).toISOString().slice(0, 10); }
function sourcePaths(cache: string, symbol: string, day: string) {
  const basename = `${cache}/${symbol}-5m-${day}`;
  return { meta: `${basename}.meta.json`, gzip: `${basename}.jsonl.gz` };
}
function closedHigher(bars: FootprintBar[], size: number): Candle[] {
  const result: Candle[] = [];
  for (let i = 0; i < bars.length;) {
    const first = bars[i].candle;
    const span = size / FIVE;
    if (first.time % size !== 0) { i++; continue; }
    const chunk = bars.slice(i, i + span).map((b) => b.candle);
    if (chunk.length !== span || chunk.some((c, j) => c.time !== first.time + j * FIVE)) { i++; continue; }
    result.push({ time: first.time, open: chunk[0].open, high: Math.max(...chunk.map((c) => c.high)),
      low: Math.min(...chunk.map((c) => c.low)), close: chunk.at(-1)!.close,
      volume: chunk.reduce((sum, c) => sum + c.volume, 0) });
    i += span;
  }
  return result;
}
async function loadDay(cache: string, symbol: string, day: string, tickSize: number): Promise<{ meta: DayMeta; bars: FootprintBar[] }> {
  const { meta: mpath, gzip } = sourcePaths(cache, symbol, day);
  const meta = JSON.parse(readFileSync(mpath, 'utf8')) as DayMeta;
  const start = Date.parse(`${day}T00:00:00Z`);
  if (meta.source !== 'Binance USD-M daily aggTrades SHA256 verified' || meta.symbol !== symbol
    || meta.date !== day || meta.start !== start || meta.end !== start + DAY || meta.windows !== 288
    || !Number.isInteger(meta.trades) || meta.trades <= 0) throw new Error(`metadata tidak sah ${day}`);
  const digest = createHash('sha256');
  for await (const chunk of createReadStream(gzip)) digest.update(chunk);
  if (digest.digest('hex') !== meta.sha256) throw new Error(`hash turunan archive ${day} berubah`);
  const bars: FootprintBar[] = [];
  let tradeCount = 0;
  let previousId: number | null = null;
  const lines = createInterface({ input: createReadStream(gzip).pipe(createGunzip()), crlfDelay: Infinity });
  for await (const line of lines) {
    if (!line) continue;
    const window = JSON.parse(line) as Window;
    const t = start + bars.length * FIVE;
    if (window.symbol !== symbol || window.start !== t || window.end !== t + FIVE || !window.trades?.length) {
      throw new Error(`window / symbol tidak urut di ${day}`);
    }
    if (previousId !== null && window.trades[0].id !== previousId + 1) throw new Error(`gap ID antarwindow ${day}`);
    previousId = window.trades.at(-1)!.id;
    const profile = buildTradeVolumeProfile({ symbol, trades: window.trades, start: t, end: t + FIVE,
      tickSize, complete: true, market: 'FUTURES' });
    if (!profile) throw new Error(`profil tidak sah ${day} ${new Date(t).toISOString()}`);
    let high = -Infinity;
    let low = Infinity;
    let volume = 0;
    for (const trade of window.trades) {
      if (trade.price > high) high = trade.price;
      if (trade.price < low) low = trade.price;
      volume += trade.quantity;
    }
    const candle: Candle = { time: t, open: window.trades[0].price, high,
      low, close: window.trades.at(-1)!.price, volume };
    bars.push({ candle, profile });
    tradeCount += window.trades.length;
  }
  if (bars.length !== 288 || tradeCount !== meta.trades) throw new Error(`hari ${day} tidak lengkap`);
  return { meta, bars };
}

export async function replayChampionHistory(options: {
  cache: string; symbol: string; firstDay: string; lastDay: string; tickSize: number;
}) {
  const { cache, symbol, firstDay, lastDay, tickSize } = options;
  if (!/^[A-Z0-9]{2,24}USDT$/.test(symbol) || !Number.isFinite(tickSize) || tickSize <= 0) throw new Error('input invalid');
  const first = Date.parse(`${firstDay}T00:00:00Z`);
  const last = Date.parse(`${lastDay}T00:00:00Z`);
  if (!Number.isSafeInteger(first) || !Number.isSafeInteger(last) || first > last || (last - first) / DAY > 30)
    throw new Error('tanggal tidak sah, maksimal 31 hari tiap replay');
  const bars: FootprintBar[] = [];
  const profiles = new Map<string, ReturnType<typeof mergeTradeVolumeProfiles>>();
  const sources: Array<Pick<DayMeta, 'date' | 'sha256' | 'trades'>> = [];
  for (let date = first; date <= last; date += DAY) {
    const day = dayOf(date);
    const loaded = await loadDay(cache, symbol, day, tickSize);
    const value = mergeTradeVolumeProfiles(loaded.bars.map((bar) => bar.profile), tickSize);
    if (!value || value.start !== date || value.end !== date + DAY) throw new Error(`value profile sesi ${day} gagal`);
    profiles.set(day, value);
    sources.push({ date: day, sha256: loaded.meta.sha256, trades: loaded.meta.trades });
    bars.push(...loaded.bars);
  }
  const h1 = closedHigher(bars, HOUR);
  const h4 = closedHigher(bars, 4 * HOUR);
  const funnel: Record<string, number> = {};
  const candidates: Array<{ time: string; side: string; entry: number; stop: number; target: number }> = [];
  let evaluated = 0;
  for (let i = 20; i + 2 < bars.length; i++) {
    const abs = bars[i];
    const t = abs.candle.time;
    const value = profiles.get(dayOf(t - DAY));
    if (!value) continue; // previous complete UTC session required
    const context = buildChampionContext({
      h1: h1.filter((c) => c.time + HOUR <= t).slice(-50),
      h4: h4.filter((c) => c.time + 4 * HOUR <= t).slice(-30),
      m5: bars.slice(i - 60, i).map((b) => b.candle), asOf: t,
    });
    if (!context) { funnel.DATA_KURANG = (funnel.DATA_KURANG ?? 0) + 1; continue; }
    const result = evaluateChampionSequence({ symbol, now: t + 3 * FIVE, tickSize,
      context, value, participation: bars.slice(i - 20, i),
      absorption: abs, retest: bars[i + 1], flip: bars[i + 2] });
    evaluated++;
    funnel[result.stage] = (funnel[result.stage] ?? 0) + 1;
    if (result.candidate) {
      candidates.push({ time: new Date(result.candidate.flipAt + FIVE).toISOString(),
        side: result.candidate.side, entry: result.candidate.entry,
        stop: result.candidate.stop, target: result.candidate.target });
    }
  }
  return { ok: true, strategy: 'CHAMPION_FOOTPRINT_V0_RESEARCH_ONLY', ready: false, symbol,
    firstDay, lastDay, tickSize, sources, windows: bars.length, evaluated, funnel,
    candidates: candidates.slice(0, 40), candidateCount: candidates.length,
    performance: null, reason: 'Hanya funnel data nyata. Belum ada OOS, GEX dealer, biaya/latency/fill; bukan alarm.' };
}

if (process.argv[1]?.endsWith('champion-history-replay.ts')) {
  const [cache, symbol, firstDay, lastDay, tick] = process.argv.slice(2);
  replayChampionHistory({ cache, symbol, firstDay, lastDay, tickSize: Number(tick) })
    .then((report) => { console.log(JSON.stringify(report)); })
    .catch((error) => { console.error('GAGAL TERTUTUP:', error instanceof Error ? error.message : error); process.exitCode = 1; });
}
