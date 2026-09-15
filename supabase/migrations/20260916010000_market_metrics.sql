-- Binance public futures metrics: open interest and long/short ratios.
-- These observations are research-only until a rule passes the promotion gate.
create table if not exists public.market_metrics (
  id bigint generated always as identity primary key,
  symbol text not null,
  event_time timestamptz not null,
  open_interest numeric(40, 12) not null check (open_interest >= 0),
  open_interest_value numeric(40, 12) not null check (open_interest_value >= 0),
  top_trader_long_short_ratio numeric(30, 12) not null check (top_trader_long_short_ratio > 0),
  top_trader_long_short_position_ratio numeric(30, 12) not null check (top_trader_long_short_position_ratio > 0),
  long_short_ratio numeric(30, 12) not null check (long_short_ratio > 0),
  taker_long_short_volume_ratio numeric(30, 12) not null check (taker_long_short_volume_ratio > 0),
  source text not null default 'BINANCE_PUBLIC_METRICS',
  created_at timestamptz not null default timezone('utc', now()),
  unique (symbol, event_time)
);

create index if not exists market_metrics_lookup
  on public.market_metrics (symbol, event_time desc);

alter table public.market_metrics enable row level security;

-- Server-side worker uses service-role access. No anon policy is granted.
