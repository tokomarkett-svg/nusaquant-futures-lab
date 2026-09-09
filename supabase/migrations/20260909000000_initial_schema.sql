-- NusaQuant Futures Lab — initial persistence schema
-- Run with Supabase SQL Editor or Supabase CLI.
-- The service-role key must never be exposed to the browser.

create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create table if not exists public.bot_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  name text not null default 'Primary bot',
  status text not null default 'IDLE' check (status in ('IDLE', 'STARTING', 'RUNNING', 'WAITING_APPROVAL', 'POSITION_OPEN', 'PAUSED', 'COOLDOWN', 'EMERGENCY')),
  mode text not null default 'PAPER_APPROVAL' check (mode in ('OBSERVATION', 'PAPER_APPROVAL', 'PAPER_AUTO', 'TESTNET', 'LIVE')),
  symbol text not null default 'BTCUSDT',
  timezone text not null default 'Asia/Jakarta',
  risk_fraction numeric(10, 6) not null default 0.0025 check (risk_fraction > 0 and risk_fraction <= 0.02),
  daily_loss_limit numeric(10, 6) not null default 0.01 check (daily_loss_limit > 0 and daily_loss_limit <= 0.1),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.market_candles (
  id bigint generated always as identity primary key,
  symbol text not null,
  interval text not null,
  open_time timestamptz not null,
  open numeric(30, 10) not null check (open > 0),
  high numeric(30, 10) not null check (high > 0),
  low numeric(30, 10) not null check (low > 0),
  close numeric(30, 10) not null check (close > 0),
  volume numeric(40, 10) not null check (volume >= 0),
  source text not null default 'BINANCE_PUBLIC',
  created_at timestamptz not null default timezone('utc', now()),
  unique (symbol, interval, open_time),
  check (high >= greatest(open, close)),
  check (low <= least(open, close))
);

create table if not exists public.market_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  bot_session_id uuid references public.bot_sessions(id) on delete cascade,
  plan_date date not null,
  timezone text not null default 'Asia/Jakarta',
  regime text not null,
  generated_at timestamptz not null default timezone('utc', now()),
  notes jsonb not null default '[]'::jsonb,
  unique (bot_session_id, plan_date, timezone)
);

create table if not exists public.opportunity_windows (
  id uuid primary key default gen_random_uuid(),
  market_plan_id uuid not null references public.market_plans(id) on delete cascade,
  window_key text not null,
  label text not null,
  start_minute smallint not null check (start_minute between 0 and 1439),
  end_minute smallint not null check (end_minute between 0 and 1439),
  status text not null check (status in ('UPCOMING', 'ACTIVE', 'EXPIRED', 'INSUFFICIENT_DATA', 'BLOCKED')),
  quality_score smallint not null default 0 check (quality_score between 0 and 100),
  sample_size integer not null default 0 check (sample_size >= 0),
  setup_count integer not null default 0 check (setup_count >= 0),
  expectancy_r numeric(14, 6),
  rationale jsonb not null default '[]'::jsonb,
  required_conditions jsonb not null default '[]'::jsonb,
  unique (market_plan_id, window_key)
);

create table if not exists public.signal_evaluations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  bot_session_id uuid references public.bot_sessions(id) on delete set null,
  symbol text not null,
  timeframe text not null,
  evaluated_at timestamptz not null default timezone('utc', now()),
  decision text not null check (decision in ('LONG', 'SHORT', 'NO_TRADE')),
  candidate text not null check (candidate in ('LONG', 'SHORT', 'NO_TRADE')),
  stage text not null check (stage in ('TRIGGERED', 'SETUP', 'NO_TRADE')),
  timing text not null check (timing in ('ENTER_NOW', 'WAIT_CONFIRMATION', 'NO_TRADE')),
  regime text not null,
  quality_score smallint not null check (quality_score between 0 and 100),
  entry numeric(30, 10),
  trigger_price numeric(30, 10),
  stop_loss numeric(30, 10),
  take_profit numeric(30, 10),
  quantity numeric(40, 16),
  risk_amount numeric(30, 10),
  risk_reward numeric(14, 6),
  evidence jsonb not null default '[]'::jsonb,
  blockers jsonb not null default '[]'::jsonb,
  patterns jsonb not null default '[]'::jsonb,
  structure jsonb not null default '{}'::jsonb
);

create table if not exists public.paper_orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  bot_session_id uuid references public.bot_sessions(id) on delete set null,
  signal_id uuid references public.signal_evaluations(id) on delete set null,
  client_order_id text not null unique,
  symbol text not null,
  side text not null check (side in ('LONG', 'SHORT')),
  order_type text not null default 'SIMULATED_MARKET',
  status text not null default 'NEW' check (status in ('NEW', 'PARTIALLY_FILLED', 'FILLED', 'CANCELED', 'REJECTED', 'EXPIRED')),
  quantity numeric(40, 16) not null check (quantity > 0),
  requested_price numeric(30, 10) not null check (requested_price > 0),
  filled_price numeric(30, 10),
  fee numeric(30, 10) not null default 0,
  slippage numeric(30, 10) not null default 0,
  submitted_at timestamptz not null default timezone('utc', now()),
  filled_at timestamptz,
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists public.paper_positions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  bot_session_id uuid references public.bot_sessions(id) on delete set null,
  symbol text not null,
  side text not null check (side in ('LONG', 'SHORT')),
  status text not null default 'OPEN' check (status in ('OPEN', 'CLOSED')),
  quantity numeric(40, 16) not null check (quantity > 0),
  entry_price numeric(30, 10) not null check (entry_price > 0),
  stop_loss numeric(30, 10) not null check (stop_loss > 0),
  take_profit numeric(30, 10) not null check (take_profit > 0),
  exit_price numeric(30, 10),
  realized_pnl numeric(30, 10),
  close_reason text,
  opened_at timestamptz not null default timezone('utc', now()),
  closed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb
);

create unique index if not exists one_open_position_per_session_symbol
  on public.paper_positions (bot_session_id, symbol)
  where status = 'OPEN';

create table if not exists public.trade_journal (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  bot_session_id uuid references public.bot_sessions(id) on delete set null,
  paper_position_id uuid references public.paper_positions(id) on delete set null,
  symbol text not null,
  action text not null,
  reason text not null,
  regime text,
  quality_score smallint,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.equity_snapshots (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users(id) on delete cascade,
  bot_session_id uuid references public.bot_sessions(id) on delete cascade,
  captured_at timestamptz not null default timezone('utc', now()),
  equity numeric(30, 10) not null,
  realized_pnl numeric(30, 10) not null default 0,
  unrealized_pnl numeric(30, 10) not null default 0,
  drawdown numeric(30, 10) not null default 0,
  daily_loss numeric(30, 10) not null default 0
);

create index if not exists market_candles_lookup on public.market_candles (symbol, interval, open_time desc);
create index if not exists signals_lookup on public.signal_evaluations (bot_session_id, evaluated_at desc);
create index if not exists journals_lookup on public.trade_journal (bot_session_id, created_at desc);
create index if not exists equity_lookup on public.equity_snapshots (bot_session_id, captured_at desc);

create trigger bot_sessions_updated_at
before update on public.bot_sessions
for each row execute function public.set_updated_at();

-- RLS: browser access is user-scoped. The worker should use the service-role key server-side.
alter table public.bot_sessions enable row level security;
alter table public.market_candles enable row level security;
alter table public.market_plans enable row level security;
alter table public.opportunity_windows enable row level security;
alter table public.signal_evaluations enable row level security;
alter table public.paper_orders enable row level security;
alter table public.paper_positions enable row level security;
alter table public.trade_journal enable row level security;
alter table public.equity_snapshots enable row level security;

create policy "users read own bot sessions" on public.bot_sessions for select using (auth.uid() = user_id);
create policy "users manage own bot sessions" on public.bot_sessions for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "users read market candles" on public.market_candles for select using (true);
create policy "users read own market plans" on public.market_plans for select using (auth.uid() = user_id);
create policy "users read own opportunity windows" on public.opportunity_windows for select using (
  exists (select 1 from public.market_plans p where p.id = market_plan_id and p.user_id = auth.uid())
);
create policy "users read own signals" on public.signal_evaluations for select using (auth.uid() = user_id);
create policy "users read own orders" on public.paper_orders for select using (auth.uid() = user_id);
create policy "users read own positions" on public.paper_positions for select using (auth.uid() = user_id);
create policy "users read own journal" on public.trade_journal for select using (auth.uid() = user_id);
create policy "users read own equity" on public.equity_snapshots for select using (auth.uid() = user_id);
