import type { Candle } from '@nusaquant/core';
import { getWebDb, type MarketCandleRow } from './webdb';

export interface MarketSnapshot {
  candles: Record<string, { entry: Candle[]; higher: Candle[] }>;
  source: 'SQLITE' | 'EMPTY';
  error: string | null;
}

function toCandle(row: MarketCandleRow): Candle {
  return {
    time: Date.parse(row.open_time),
    open: Number(row.open),
    high: Number(row.high),
    low: Number(row.low),
    close: Number(row.close),
    volume: Number(row.volume),
    ...(row.quote_volume !== null && row.quote_volume !== undefined ? { quoteVolume: Number(row.quote_volume) } : {}),
    ...(row.taker_buy_volume !== null && row.taker_buy_volume !== undefined ? { takerBuyVolume: Number(row.taker_buy_volume) } : {}),
    ...(row.taker_buy_quote_volume !== null && row.taker_buy_quote_volume !== undefined ? { takerBuyQuoteVolume: Number(row.taker_buy_quote_volume) } : {}),
    ...(row.trade_count !== null && row.trade_count !== undefined ? { tradeCount: Number(row.trade_count) } : {}),
  };
}

/** Server-only: membaca candle dari SQLite lokal. */
export async function loadMarketSnapshot(): Promise<MarketSnapshot> {
  const symbols = ['BTCUSDT', 'ETHUSDT'];
  const result: MarketSnapshot['candles'] = {};
  try {
    const db = getWebDb();
    await Promise.all(symbols.map(async (symbol) => {
      const [entryRows, higherRows] = await Promise.all([
        db.candlesPage(symbol, '15m', 0, 500, true),
        db.candlesPage(symbol, '1h', 0, 500, true),
      ]);
      result[symbol] = { entry: entryRows.map(toCandle), higher: higherRows.map(toCandle) };
    }));
    return { candles: result, source: 'SQLITE', error: null };
  } catch (error) {
    return { candles: {}, source: 'EMPTY', error: error instanceof Error ? error.message : 'Market data query gagal.' };
  }
}
