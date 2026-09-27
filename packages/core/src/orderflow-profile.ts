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
};

/**
 * Build from a verified, gap-free Binance Futures aggTrade window.
 * `complete` must be asserted by the collector after cursor pagination, never
 * guessed from the first/last timestamp. Missing even one page => fail closed.
 */
export function buildTradeVolumeProfile(input: {
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
  if (!complete || market !== 'FUTURES' || !Number.isFinite(start) || !Number.isFinite(end) || start >= end
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
  return { start, end, levels, totalVolume, totalDelta,
    poc: levels[pocIndex].price, valueAreaLow: levels[left].price,
    valueAreaHigh: levels[right].price, valueAreaFraction: fraction, complete: true };
}

/** Discount/premium as defined relative to the *trade-by-price* value area.
 * Absorption and dominance shift require independent confirmation before any signal. */
export function profileLocation(profile: TradeVolumeProfile, price: number): 'DISCOUNT' | 'VALUE' | 'PREMIUM' | null {
  if (!Number.isFinite(price) || price <= 0) return null;
  if (price < profile.valueAreaLow) return 'DISCOUNT';
  if (price > profile.valueAreaHigh) return 'PREMIUM';
  return 'VALUE';
}
