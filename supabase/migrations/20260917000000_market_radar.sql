create table if not exists public.market_radar (
  symbol text primary key,
  regime text not null check (regime in ('UP', 'DOWN', 'FLAT')),
  day_open numeric(30, 10) not null check (day_open > 0),
  prev_range_pct numeric(12, 4) not null check (prev_range_pct >= 0),
  last_price numeric(30, 10) not null check (last_price > 0),
  dist_long_pct numeric(12, 4) not null,
  dist_short_pct numeric(12, 4) not null,
  touched text check (touched in ('LONG', 'SHORT')),
  updated_at timestamptz not null default timezone('utc', now())
);
