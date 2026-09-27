/**
 * Research-only, read-only Futures aggTrades collector. Never wired to alarm/order.
 * Binance only exposes REST aggTrades for the last 24 hours. Tick history for
 * year-long OOS validation must be archived separately; no synthetic OHLC fills.
 */
import { buildTradeVolumeProfile, type AggressorTrade, type TradeVolumeProfile } from '@nusaquant/core';

export async function collectFuturesFootprint(options: {
  symbol: string; start: number; end: number; tickSize: number;
  fetchImpl?: typeof fetch; baseUrl?: string; maxPages?: number; now?: number;
}): Promise<TradeVolumeProfile | null> {
  const { symbol, start, end, tickSize } = options;
  const now = options.now ?? Date.now();
  const maxPages = options.maxPages ?? 30;
  const base = options.baseUrl ?? 'https://fapi.binance.com';
  if (!/^[A-Z0-9]{2,24}USDT$/.test(symbol) || !/^https:\/\//.test(base)
    || !Number.isSafeInteger(start) || !Number.isSafeInteger(end)
    || start < now - 24 * 3_600_000 || end > now || end <= start || end - start >= 3_600_000
    || !Number.isInteger(maxPages) || maxPages < 1 || maxPages > 100
    || !Number.isFinite(tickSize) || tickSize <= 0) return null;

  const trades: AggressorTrade[] = [];
  let cursor: number | null = null;
  let complete = false;
  const fetchImpl = options.fetchImpl ?? fetch;
  for (let page = 0; page < maxPages; page += 1) {
    const url = new URL('/fapi/v1/aggTrades', base);
    url.searchParams.set('symbol', symbol);
    url.searchParams.set('limit', '1000');
    if (cursor === null) {
      url.searchParams.set('startTime', String(start));
      url.searchParams.set('endTime', String(end - 1));
    } else {
      // Binance warns not to mix fromId with startTime/endTime on one call.
      url.searchParams.set('fromId', String(cursor));
    }
    let batch: unknown;
    try {
      const response = await fetchImpl(url, { signal: AbortSignal.timeout(10_000) });
      if (!response.ok) return null;
      batch = await response.json();
    } catch { return null; }
    if (!Array.isArray(batch) || batch.length > 1000) return null;
    if (batch.length === 0) { complete = true; break; }
    let pastEnd = false;
    for (const raw of batch) {
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
      const row = raw as Record<string, unknown>;
      const trade: AggressorTrade = {
        id: Number(row.a), time: Number(row.T), price: Number(row.p), quantity: Number(row.q),
        buyerIsMaker: row.m as boolean,
      };
      if (!Number.isSafeInteger(trade.id) || !Number.isSafeInteger(trade.time)
        || !(trade.price > 0) || !(trade.quantity > 0) || typeof row.m !== 'boolean') return null;
      if (trades.length && trade.id !== trades.at(-1)!.id + 1) return null;
      if (trade.time >= end) { pastEnd = true; break; }
      if (trade.time < start || (trades.length && trade.time < trades.at(-1)!.time)) return null;
      trades.push(trade);
    }
    if (pastEnd || batch.length < 1000) { complete = true; break; }
    const last = batch.at(-1) as Record<string, unknown>;
    cursor = Number(last.a) + 1;
    if (!Number.isSafeInteger(cursor)) return null;
  }
  return buildTradeVolumeProfile({ symbol, trades, start, end, tickSize, complete, market: 'FUTURES' });
}
