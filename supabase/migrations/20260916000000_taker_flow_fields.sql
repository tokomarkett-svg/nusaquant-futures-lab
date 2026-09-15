-- Binance kline flow fields used by the taker-flow research candidate.
-- Existing candles remain valid; historical archive backfill populates these fields.
alter table public.market_candles
  add column if not exists quote_volume numeric(40, 10),
  add column if not exists taker_buy_volume numeric(40, 10),
  add column if not exists taker_buy_quote_volume numeric(40, 10),
  add column if not exists trade_count bigint;

alter table public.market_candles
  drop constraint if exists market_candles_flow_fields_check;

alter table public.market_candles
  add constraint market_candles_flow_fields_check check (
    (quote_volume is null or quote_volume >= 0)
    and (taker_buy_volume is null or taker_buy_volume >= 0)
    and (taker_buy_quote_volume is null or taker_buy_quote_volume >= 0)
    and (trade_count is null or trade_count >= 0)
    and (taker_buy_volume is null or taker_buy_volume <= volume)
    and (taker_buy_quote_volume is null or quote_volume is null or taker_buy_quote_volume <= quote_volume)
  );
