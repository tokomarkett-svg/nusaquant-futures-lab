-- Public derivatives observations used only by research until a signal family passes validation.
-- No private Binance API credentials are required.

create table if not exists public.market_derivatives (
  id bigint generated always as identity primary key,
  symbol text not null,
  metric text not null check (metric in ('FUNDING_RATE', 'OPEN_INTEREST')),
  event_time timestamptz not null,
  funding_rate numeric(20, 12),
  open_interest numeric(40, 12),
  source text not null default 'BINANCE_PUBLIC',
  created_at timestamptz not null default timezone('utc', now()),
  unique (symbol, metric, event_time),
  check ((metric = 'FUNDING_RATE' and funding_rate is not null and open_interest is null)
    or (metric = 'OPEN_INTEREST' and open_interest is not null and funding_rate is null))
);

create index if not exists market_derivatives_lookup
  on public.market_derivatives (symbol, metric, event_time desc);

alter table public.market_derivatives enable row level security;

-- Server-side worker uses service-role access. No anon policy is granted.
