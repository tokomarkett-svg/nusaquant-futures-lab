/**
 * Research-only building block for the Chris Creamer order-flow hypothesis.
 * A true trade-by-price profile must be built from executed FUTURES trades,
 * NOT inferred from OHLCV or a snapshot of resting order-book liquidity.
 * This module never decides SIAP, notifies Telegram, or places orders.
 */
export type AggressorTrade = {
  id: number;
  time: number;
  price: number;
  quantity: number;
  /** Binance aggTrades `m`: true = BUYER is maker, therefore SELLER is taker. */
  buyerIsMaker: boolean;
};

export type PriceFootprint = {
  price: number;
  takerBuyQty: number;
  takerSellQty: number;
  volume: number;
  delta: number;
};

export type TradeVolumeProfile = {
  symbol: string;
  start: number;
  end: number;
  levels: PriceFootprint[];
  totalVolume: number;
  totalDelta: number;
  poc: number;
  valueAreaLow: number;
  valueAreaHigh: number;
  valueAreaFraction: number;
  /** False if pagination, IDs, time coverage or source market are not certified. */
  complete: true;
  /** Exact aggregate ID bounds when sourced directly from raw aggTrades. */
  firstTradeId?: number;
  lastTradeId?: number;
  firstTradePrice?: number;
  lastTradePrice?: number;
};

/**
 * Build from a verified, gap-free Binance Futures aggTrade window.
 * `complete` must be asserted by the collector after cursor pagination, never
 * guessed from the first/last timestamp. Missing even one page => fail closed.
 */
export function buildTradeVolumeProfile(input: {
  symbol: string;
  trades: AggressorTrade[];
  start: number;
  end: number;
  tickSize: number;
  valueAreaFraction?: number;
  complete: boolean;
  market: 'FUTURES' | 'SPOT';
}): TradeVolumeProfile | null {
  const { trades, start, end, tickSize, complete, market } = input;
  const fraction = input.valueAreaFraction ?? 0.7;
  if (!/^[A-Z0-9]{2,24}USDT$/.test(input.symbol) || !complete || market !== 'FUTURES'
    || !Number.isFinite(start) || !Number.isFinite(end) || start >= end
    || !Number.isFinite(tickSize) || tickSize <= 0 || !Number.isFinite(fraction) || fraction <= 0 || fraction > 1
    || trades.length === 0) return null;

  const byTick = new Map<number, { buy: number; sell: number }>();
  let lastId = -1;
  let lastTime = -1;
  for (const trade of trades) {
    if (!Number.isSafeInteger(trade.id) || (lastId >= 0 && trade.id !== lastId + 1) || !Number.isFinite(trade.time)
      || trade.time < start || trade.time >= end || trade.time < lastTime
      || !Number.isFinite(trade.price) || trade.price <= 0
      || !Number.isFinite(trade.quantity) || trade.quantity <= 0
      || typeof trade.buyerIsMaker !== 'boolean') return null;
    const tick = Math.round(trade.price / tickSize);
    if (!Number.isSafeInteger(tick) || tick <= 0) return null;
    const level = byTick.get(tick) ?? { buy: 0, sell: 0 };
    if (trade.buyerIsMaker) level.sell += trade.quantity;
    else level.buy += trade.quantity;
    byTick.set(tick, level);
    lastId = trade.id;
    lastTime = trade.time;
  }
  const levels = [...byTick.entries()].sort((a, b) => a[0] - b[0]).map(([tick, { buy, sell }]): PriceFootprint => ({
    price: Number((tick * tickSize).toPrecision(15)),
    takerBuyQty: buy,
    takerSellQty: sell,
    volume: buy + sell,
    delta: buy - sell,
  }));
  const totalVolume = levels.reduce((sum, level) => sum + level.volume, 0);
  if (!(totalVolume > 0) || !Number.isFinite(totalVolume)) return null;
  const totalDelta = levels.reduce((sum, level) => sum + level.delta, 0);
  let pocIndex = 0;
  for (let i = 1; i < levels.length; i += 1) {
    if (levels[i].volume > levels[pocIndex].volume) pocIndex = i;
  }
  let left = pocIndex;
  let right = pocIndex;
  let areaVolume = levels[pocIndex].volume;
  while (areaVolume < fraction * totalVolume && (left > 0 || right < levels.length - 1)) {
    const below = left > 0 ? levels[left - 1].volume : -1;
    const above = right < levels.length - 1 ? levels[right + 1].volume : -1;
    if (below >= above) areaVolume += levels[--left].volume;
    else areaVolume += levels[++right].volume;
  }
  return { symbol: input.symbol, start, end, levels, totalVolume, totalDelta,
    poc: levels[pocIndex].price, valueAreaLow: levels[left].price,
    valueAreaHigh: levels[right].price, valueAreaFraction: fraction, complete: true,
    firstTradeId: trades[0].id, lastTradeId: trades.at(-1)!.id,
    firstTradePrice: trades[0].price, lastTradePrice: trades.at(-1)!.price };
}

/** Discount/premium as defined relative to the *trade-by-price* value area.
 * Absorption and dominance shift require independent confirmation before any signal. */
/** Merge complete adjacent 5m profiles into one previous-session value area.
 * Recompute POC/value from all executed volume; never average the individual POCs.
 * Any missing 5m window, mixed symbol, or tick-grid change rejects the day. */
export function mergeTradeVolumeProfiles(parts: TradeVolumeProfile[], tickSize: number, valueAreaFraction = 0.7): TradeVolumeProfile | null {
  if (!parts.length || !Number.isFinite(tickSize) || tickSize <= 0
    || !Number.isFinite(valueAreaFraction) || valueAreaFraction <= 0 || valueAreaFraction > 1) return null;
  const symbol = parts[0].symbol;
  const byTick = new Map<number, { buy: number; sell: number }>();
  for (let i = 0; i < parts.length; i += 1) {
    const p = parts[i];
    if (!p.complete || p.symbol !== symbol || !(p.start < p.end)
      || (i > 0 && p.start !== parts[i - 1].end)) return null;
    for (const l of p.levels) {
      const tick = Math.round(l.price / tickSize);
      if (!Number.isSafeInteger(tick) || tick <= 0 || Math.abs(tick * tickSize - l.price) > tickSize * 0.501
        || !(l.takerBuyQty >= 0) || !(l.takerSellQty >= 0) || !Number.isFinite(l.volume)
        || Math.abs(l.volume - l.takerBuyQty - l.takerSellQty) > Math.max(1e-8, l.volume * 1e-9)) return null;
      const row = byTick.get(tick) ?? { buy: 0, sell: 0 };
      row.buy += l.takerBuyQty;
      row.sell += l.takerSellQty;
      byTick.set(tick, row);
    }
  }
  const levels = [...byTick].sort((a, b) => a[0] - b[0]).map(([tick, v]): PriceFootprint => ({
    price: Number((tick * tickSize).toPrecision(15)), takerBuyQty: v.buy,
    takerSellQty: v.sell, volume: v.buy + v.sell, delta: v.buy - v.sell,
  }));
  const totalVolume = levels.reduce((sum, l) => sum + l.volume, 0);
  if (!levels.length || !Number.isFinite(totalVolume) || totalVolume <= 0) return null;
  let pocIndex = 0;
  for (let i = 1; i < levels.length; i += 1) if (levels[i].volume > levels[pocIndex].volume) pocIndex = i;
  let left = pocIndex;
  let right = pocIndex;
  let area = levels[pocIndex].volume;
  while (area < valueAreaFraction * totalVolume && (left > 0 || right < levels.length - 1)) {
    const below = left > 0 ? levels[left - 1].volume : -1;
    const above = right < levels.length - 1 ? levels[right + 1].volume : -1;
    if (below >= above) area += levels[--left].volume;
    else area += levels[++right].volume;
  }
  return { symbol, start: parts[0].start, end: parts.at(-1)!.end, levels, totalVolume,
    totalDelta: levels.reduce((sum, l) => sum + l.delta, 0), poc: levels[pocIndex].price,
    valueAreaLow: levels[left].price, valueAreaHigh: levels[right].price,
    valueAreaFraction, complete: true };
}

export function profileLocation(profile: TradeVolumeProfile, price: number): 'DISCOUNT' | 'VALUE' | 'PREMIUM' | null {
  if (!Number.isFinite(price) || price <= 0) return null;
  if (price < profile.valueAreaLow) return 'DISCOUNT';
  if (price > profile.valueAreaHigh) return 'PREMIUM';
  return 'VALUE';
}
