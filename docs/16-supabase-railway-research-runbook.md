# Supabase + Railway research backfill runbook

This runbook imports public research data only. It does not enable Binance private API, Testnet orders, or live orders.

## A. Supabase migration

1. Open the correct Supabase project used by the NusaQuant worker.
2. Open **SQL Editor**.
3. Create a new query.
4. Copy the complete contents of:

   `supabase/migrations/20260915010000_market_derivatives.sql`

5. Run the query.
6. Verify the table exists:

```sql
select to_regclass('public.market_derivatives');
```

Expected result:

```text
public.market_derivatives
```

7. Verify that it is initially empty or contains only previous research data:

```sql
select symbol, metric, count(*)
from public.market_derivatives
group by symbol, metric
order by symbol, metric;
```

Do not add a browser/anon policy and do not paste `SUPABASE_SERVICE_ROLE_KEY` into SQL Editor.

## B. Railway preparation

1. Open the Railway project.
2. Select the **worker service**, not the web/Vercel service.
3. Confirm the worker is using the latest deployment containing commit `e8fc19a`.
4. Open **Variables** and add or update only these research variables:

```text
RESEARCH_ARCHIVE_START=2025-09
RESEARCH_ARCHIVE_END=2026-08
RESEARCH_ARCHIVE_SYMBOLS=BTCUSDT,ETHUSDT
RESEARCH_ARCHIVE_INTERVALS=15m,1h
```

The existing worker variables must remain present:

```text
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
```

Do not send their values in chat and do not commit them.

## C. Run the one-time candle archive backfill

Prefer Railway's one-off **Run Command / Execute Command** feature if it is available for the worker service. Run:

```text
npm run research:backfill --workspace @nusaquant/worker
```

This downloads public Binance bulk USD-M futures klines and upserts them with source `BINANCE_BULK_ARCHIVE`.

Watch the worker logs. A successful run ends with a JSON line containing:

```text
"ok":true
```

Expected approximate counts for a complete September 2025 through August 2026 range:

```text
BTCUSDT 15m: about 35040
BTCUSDT 1h: about 8760
ETHUSDT 15m: about 35040
ETHUSDT 1h: about 8760
```

The exact count can be lower if a monthly archive is unavailable or the exchange has a gap. Do not start research until the command has finished.

## D. Run the one-time funding backfill

Add these temporary variables in the same Railway worker service:

```text
RESEARCH_FUNDING_START=2025-09-01
RESEARCH_FUNDING_END=2026-08-31
RESEARCH_FUNDING_SYMBOLS=BTCUSDT,ETHUSDT
RESEARCH_FUNDING_BASE_URL=https://fapi.binance.com
```

Run the one-off command:

```text
npm run research:funding --workspace @nusaquant/worker
```

A successful run logs one result for each symbol and ends with `"ok":true`. Funding is stored in `market_derivatives` as `metric = 'FUNDING_RATE'`.

Verify in Supabase SQL Editor:

```sql
select symbol, metric, count(*), min(event_time), max(event_time)
from public.market_derivatives
group by symbol, metric
order by symbol, metric;
```

For a year of 8-hour funding events, each symbol should have roughly 1000–1100 rows.

## E. Restore the normal worker

If the commands were run through one-off execution, verify the normal worker is still running.

If the Railway service Start Command was temporarily changed, restore it to:

```text
npm run ingest:watch --workspace @nusaquant/worker
```

Deploy once after restoring it. Do not leave `research:backfill` or `research:funding` as the permanent Start Command.

Confirm:

- worker heartbeat is `ACTIVE`;
- market ingestion continues;
- paper position remains empty;
- no private Binance API key was added;
- no Testnet/live order was enabled.

## F. Run research from the dashboard

1. Open the Vercel dashboard.
2. Select `BTCUSDT`.
3. Click **Full-history research** once.
4. Wait for `COMPLETED` and `progress 100%`.
5. Confirm the result displays candle period and `funding points`.
6. Repeat for `ETHUSDT`.

Inspect:

```text
FUNDING_CROWDING_REVERSION_HYPOTHESIS
Full sample
OOS 30%
Walk-forward
```

The result remains research-only. Do not click **Approve paper entry** based on a single positive result. It must pass full sample, OOS, walk-forward, minimum trade count, costs, and cross-asset review.
