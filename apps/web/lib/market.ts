import { createClient } from '@supabase/supabase-js';
import type { Candle } from '@nusaquant/core';

interface MarketCandleRow {
  open_time: string;
  open: number | string;
  high: number | string;
  low: number | string;
  close: number | string;
  volume: number | string;
}

export interface MarketSnapshot {
  candles: Record<string, { entry: Candle[]; higher: Candle[] }>;
  source: 'SUPABASE' | 'EMPTY';
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
  };
}

export async function loadMarketSnapshot(): Promise<MarketSnapshot> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return { candles: {}, source: 'EMPTY', error: 'Supabase environment belum tersedia.' };

  const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const symbols = ['BTCUSDT', 'ETHUSDT'];
  const result: MarketSnapshot['candles'] = {};

  try {
    await Promise.all(symbols.map(async (symbol) => {
      const [entryResult, higherResult] = await Promise.all([
        supabase.from('market_candles').select('open_time, open, high, low, close, volume').eq('symbol', symbol).eq('interval', '15m').order('open_time', { ascending: true }).limit(500),
        supabase.from('market_candles').select('open_time, open, high, low, close, volume').eq('symbol', symbol).eq('interval', '1h').order('open_time', { ascending: true }).limit(500),
      ]);
      if (entryResult.error) throw entryResult.error;
      if (higherResult.error) throw higherResult.error;
      result[symbol] = {
        entry: (entryResult.data ?? []).map(toCandle),
        higher: (higherResult.data ?? []).map(toCandle),
      };
    }));
    return { candles: result, source: 'SUPABASE', error: null };
  } catch (error) {
    return { candles: {}, source: 'EMPTY', error: error instanceof Error ? error.message : 'Market data query gagal.' };
  }
}
