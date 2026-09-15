-- Async research backtest jobs. Results are written by the server-side worker only.
-- Never expose SUPABASE_SERVICE_ROLE_KEY to the browser.

create table if not exists public.research_backtest_jobs (
  id uuid primary key default gen_random_uuid(),
  symbol text not null check (symbol in ('BTCUSDT', 'ETHUSDT')),
  status text not null default 'QUEUED' check (status in ('QUEUED', 'RUNNING', 'COMPLETED', 'FAILED')),
  progress smallint not null default 0 check (progress between 0 and 100),
  requested_at timestamptz not null default timezone('utc', now()),
  started_at timestamptz,
  completed_at timestamptz,
  result jsonb,
  error text,
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists research_backtest_jobs_queue
  on public.research_backtest_jobs (status, requested_at);

alter table public.research_backtest_jobs enable row level security;

-- The current dashboard has no browser auth session. API reads/writes use the
-- server-side service-role client, so no anon policy is granted here.
