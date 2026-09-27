-- A separate, server-only, one-time execution ledger. Apply before enabling Demo.
-- No browser role can read or write it; service-role exclusively.
create table if not exists public.manual_execution_approvals (
  id uuid primary key default gen_random_uuid(),
  mode text not null check (mode in ('TESTNET', 'LIVE')),
  setup_key text not null,
  symbol text not null,
  side text not null check (side in ('LONG', 'SHORT')),
  operator_id uuid not null references auth.users(id),
  status text not null default 'RESERVED' check (status in ('RESERVED', 'VERIFIED', 'REVIEW')),
  exchange_entry_id text,
  exchange_sl_id text,
  exchange_tp_id text,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (mode, setup_key)
);
create index if not exists manual_execution_approvals_created_at_idx on public.manual_execution_approvals(created_at desc);
create unique index if not exists manual_execution_one_unresolved_mode
  on public.manual_execution_approvals(mode)
  where status in ('RESERVED', 'REVIEW');
alter table public.manual_execution_approvals enable row level security;
revoke all on public.manual_execution_approvals from anon, authenticated;
