# Derivatives research, funnel diagnostics, and tooling — 2026-09-16

## What changed in this pass

This session was a code and tooling pass, not a strategy-tuning pass. No entry rule, threshold,
stop-loss, or exit rule was changed to improve a metric. The promotion gate was not relaxed.

### 1. Research evaluation is now one code path

Previously the full-history evaluation lived inline in `services/worker/src/research-jobs.ts`, so it
could only run inside the Railway worker against Supabase. It now lives in
`services/worker/src/research-evaluation.ts` and is called by both:

- the async research job worker (Supabase data source), and
- the new local CLI `services/worker/src/local-research.ts` (public Binance bulk archive).

Both produce the same `result` shape, so a dashboard number and a local reproduction cannot drift.

### 2. Local research CLI

```bash
npm run research:local --workspace @nusaquant/worker
npm run research:local --workspace @nusaquant/worker -- --symbols=BTCUSDT --start=2025-09 --end=2026-08
npm run research:local --workspace @nusaquant/worker -- --symbols=BTCUSDT --variants=NONE
```

Public data only. No API key, no Supabase, no order path. Downloads are cached in
`services/worker/.research-cache/` (gitignored); add `--refresh=true` to force re-download and
`--out=path.json` to keep the raw result. This removes the deployment round-trip from the research
loop, which is what made the full-history cross-asset run below possible in one session.

### 3. Missing data is no longer indistinguishable from a rejected hypothesis

`readAllMetrics` previously fell back to the official archive only when the `market_metrics` query
errored. If the migration had been applied but `research:metrics` was never run, the table existed and
was empty, so the worker silently returned zero metrics points. `LIQUIDATION_RECLAIM_HYPOTHESIS` would
then report `0 trades` next to candidates that had real data, which reads as a rejection but is not one.

Now both a missing table and an empty table fall back to the public archive, and every candidate
carries an explicit `dataStatus` of `READY` or `MISSING_DATA`. `MISSING_DATA` candidates are labelled
in the CLI output, in the job `notes`, and in the dashboard.

### 4. Candidate condition funnel

`packages/core/src/diagnostics.ts` counts, for each condition of the data-driven candidates, how many
candles survive it independently and cumulatively, plus the observed distribution of every threshold
the rule uses. This answers the question a zero-trade result cannot: is the rule wrong, or can it never
fire on this data? The funnel is diagnostics only and never feeds the promotion gate.

### 5. Bugs and gaps fixed

- **`npm run typecheck` never checked `packages/core`.** It only ran web and worker. Adding core
  immediately surfaced four real compile errors in `packages/core` (`.ts` import extensions without
  `allowImportingTsExtensions`, and `Candle` imported from `backtest.ts` where it was never exported).
  Core now has a `typecheck` script, the root script runs all three workspaces, and all four are fixed.
- **`runBacktest` was O(n²) in the higher-timeframe lookup.** Every 15M candle re-filtered the entire
  1H array. Replaced with a forward cursor. Verified behaviour-preserving: the BTCUSDT 2026-05→08
  baseline returns an identical `115 trades / -743.55 USDT / -0.268R / PF 0.54`, identical OOS
  `35 / -311.21 / PF 0.41`, and identical walk-forward `78 / -0.296R / PF 0.50`.
- **A thin walk-forward aggregate rendered as `PF ∞` with a positive expectancy.** `combineSummaries`
  returned `Infinity` whenever `grossLosses === 0`, so the BTC `LIQUIDATION_RECLAIM` aggregate (one
  trade in one fold, none in the other two) displayed `+0.725R · PF ∞`. The gate already blocked it, but
  the display read like a passing candidate. It now returns `null` below 30 trades, with a regression
  test.
- **Funding timestamps.** The Binance funding archive writes an occasional stray extra millisecond
  (`1785542400001`). Timestamps are floored to the second on parse so one event cannot be stored twice
  under two keys.
- **Parsing duplicated four times.** Kline, funding, and metrics CSV parsing existed separately in
  `research-backfill.ts`, `funding-backfill.ts`, `metrics-backfill.ts`, and `research-jobs.ts`. It now
  exists once in `services/worker/src/binance-archive.ts`, covered by tests.
- Core and worker `tsconfig` target raised `ES2020` → `ES2022` to match the runtime (Node 20) and the
  `Array.prototype.at` usage already present in the worker.

### 6. Test coverage

Core `13 → 19`, worker `16 → 29`, total `29 → 48`, all passing. New tests cover the promotion gate
(including that PF between 1.00 and 1.10 is rejected as inside cost noise, and that a null profit
factor is unproven rather than infinite), `MISSING_DATA` classification, all three CSV parsers, the
month/day key generators, the thin-aggregate profit factor, and the entry-candle alignment guarantee
that an observation dated after a candle close cannot leak backwards into that candle.

## Research findings

Source for everything below: official Binance USDⓈ-M bulk archives, `35,040` closed 15M candles and
`8,760` 1H candles per symbol, `1,095` funding points, `105,120` metrics points, period
**2025-09-01 → 2026-08-31**. Cost model unchanged and conservative (fee `0.0004`, slippage `0.0002`,
funding `0.00001`/bar, stop-first intrabar). Raw output kept in `reports/local-research-*.json`.

Two cosmetic defects found while reading that output were fixed after the runs, so the committed JSON
still shows them: the thin BTC walk-forward aggregate is stored with `profitFactor: null` but rendered
as `PF ∞` by the old CLI formatter, and the funnel `diagnosis` string says "Aturan long mati pada
kondisi Crowding short", mixing up the two sides. The counts and every number in the tables below are
unaffected.

### The funding "extreme" threshold sits on the exchange cap, not in a tail

`FUNDING_CROWDING_REVERSION_HYPOTHESIS` filters on `|funding| >= 0.0001`. Measured over the full year
of the funding archive:

```text
BTCUSDT  n=1095   min -0.000152   median 0.000036   p90 0.000094   p99 0.000100   max 0.000100
         share |r| >= 0.0001 : 8.58%   (r >= +0.0001: 7.95% · r <= -0.0001: 0.64%)
         share |r| >= 0.0002 : 0.00%

ETHUSDT  n=1095   min -0.000365   median 0.000028   p90 0.000084   p99 0.000100   max 0.000100
         share |r| >= 0.0001 : 8.77%   (r >= +0.0001: 6.30% · r <= -0.0001: 2.47%)
         share |r| >= 0.0002 : 0.37%, and every one of those is on the negative side
```

The positive side is hard-capped at `+0.0001` on both symbols: `max` equals the threshold, and not one
observation in 1,095 exceeds it. So `0.0001` is not an extreme, it is the ceiling, and the filter
selects roughly one observation in eleven. The candidate then enters against the prevailing move
whenever funding sits at cap plus a rejection candle.

Result, full history: BTC `159 trades, -3424.80 USDT, -1.053R, PF 0.05`; ETH
`138 trades, -3036.00 USDT, -1.047R, PF 0.08`. It is the worst candidate on both symbols by a wide
margin, and OOS matches full sample almost exactly (BTC `-1.055R`), so it is a stable loss, not noise.

Decision: rejected. It must not be re-run at a "stricter" absolute threshold, because on the positive
side no stricter threshold exists inside the cap. A successor must define extremeness against the
rolling distribution (a percentile of recent funding), not a constant equal to the cap.

### LIQUIDATION_RECLAIM is underpowered because the short side cannot fire

Funnel, BTCUSDT, `34,960` candles evaluated (ETH in brackets):

```text
crowding long  (3 ratios >= 1.5)   : 10,971  (31.38%)   [16,207 · 46.36%]
open-interest drop >= 0.3% / 1h    :  2,333  ( 6.67%)   [ 4,539 · 12.98%]
taker ratio <= 0.75                :    835  ( 2.39%)   [ 1,478 ·  4.23%]
candle taker flow <= 0.45          :    373  ( 1.07%)   [   570 ·  1.63%]
price move 4 candles <= -0.2%      :    240  ( 0.69%)   [   387 ·  1.11%]
bullish reclaim close              :     18  ( 0.05%)   [    17 ·  0.05%]
ADX 1H <= 28                       :     11  ( 0.03%)   [     4 ·  0.01%]

crowding short (3 ratios <= 0.667) :      0  ( 0.00%)   [     0 ·  0.00%]
```

The short side is structurally unreachable. The rule needs all three crowding ratios at or below
`0.667`, but the observed distributions over the period are:

```text
all-account count ratio : p01 0.517   median 1.467   p99 2.479
top-trader position     : p01 0.697   median 1.360   p99 2.169
```

A median of `1.467` means this measure is structurally long-skewed; asking for `<= 0.667` on all three
at once describes a state the instrument does not visit in a year. The long side does reach `11` candles
(`4` on ETH), which is why the candidate produced `9` trades on BTC and `4` on ETH rather than zero.

Important correction to the previous session's note: the candidate is **not** data-starved. It ran with
`105,120` metrics points and `dataStatus READY`. It is rule-starved: `9` and `4` trades against a
30-trade minimum is `NOT_READY_SAMPLE` on both symbols, and the walk-forward aggregate holds one trade
on BTC and none on ETH.

Decision: rejected as written. It may be re-proposed only with crowding expressed in distribution terms
and a funnel demonstrating a reachable sample before any evaluation is run.

### Full-history cross-asset results

Baseline:

| Symbol | Trades | Net P/L | Expectancy | PF | OOS trades | OOS P/L | OOS R | OOS PF | WF trades | WF R | WF PF | Gate |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|
| BTCUSDT | 376 | -2110.78 | -0.251R | 0.57 | 110 | -683.58 | -0.256R | 0.56 | 217 | -0.284R | 0.53 | REJECT |
| ETHUSDT | 363 | -1814.80 | -0.219R | 0.64 | 110 | -613.00 | -0.229R | 0.62 | 231 | -0.193R | 0.67 | REJECT |

The OOS sample is now `110` trades on both symbols, comfortably above the 30-trade minimum that made
earlier runs `NOT_READY`. The verdict did not change with the larger sample: OOS expectancy tracks
full-sample expectancy closely on both assets, which is what a genuinely absent edge looks like.

Candidates, full history (OOS expectancy and walk-forward expectancy in the last columns):

| Candidate | BTC trades | BTC R | BTC PF | BTC OOS R | BTC WF R | ETH trades | ETH R | ETH PF | ETH OOS R | ETH WF R |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| TRIAD_TIMING | 158 | -0.281 | 0.53 | -0.316 | -0.294 | 167 | -0.237 | 0.61 | -0.219 | -0.286 |
| TRIAD_RETEST | 171 | -0.242 | 0.60 | -0.390 | -0.253 | 176 | -0.178 | 0.70 | -0.405 | -0.205 |
| TRIAD_FOLLOW_THROUGH | 195 | -0.185 | 0.68 | -0.194 | -0.127 | 190 | -0.198 | 0.67 | -0.283 | -0.183 |
| MFE_PROFIT_PROTECTION | 410 | -0.239 | 0.40 | -0.201 | -0.247 | 404 | -0.193 | 0.52 | -0.190 | -0.201 |
| MEAN_REVERSION_REJECTION | 55 | -0.428 | 0.31 | -0.578 | -0.426 | 68 | -0.407 | 0.37 | -0.288 | -0.408 |
| VOLATILITY_EXPANSION_BREAKOUT | 566 | -0.190 | 0.68 | -0.318 | -0.236 | 525 | -0.153 | 0.74 | -0.084 | -0.124 |
| FUNDING_CROWDING_REVERSION | 159 | -1.053 | 0.05 | -1.055 | -1.081 | 138 | -1.047 | 0.08 | -1.022 | -0.948 |
| TAKER_FLOW_REJECTION | 15 | -0.399 | 0.31 | -0.593 | -0.443 | 7 | -0.373 | 0.38 | -0.326 | -0.285 |
| LIQUIDATION_RECLAIM | 9 | -0.192 | 0.59 | n/a (0) | n/a (1) | 4 | -0.863 | 0.00 | n/a (0) | n/a (0) |

Every cell is negative. `TAKER_FLOW_REJECTION` (`15` and `7` trades) and `LIQUIDATION_RECLAIM` (`9` and
`4` trades) are below the 30-trade minimum, so they are `NOT_READY_SAMPLE` rather than proven negative —
but neither is close to promotable, and neither has a funnel showing a path to a larger sample without
loosening the rule.

## Decision

No baseline and no candidate passes the promotion gate on either symbol, on a one-year sample with an
adequate OOS count. Paper approval, Demo/Testnet, and live stay locked.

The two most recent data-driven candidates are rejected **as written**, with the reason recorded as a
specification defect (a threshold equal to the exchange cap; a crowding state the instrument never
visits) rather than as a tested-and-negative edge. That distinction matters: re-running either with
tweaked constants would burn trials without testing the underlying premise.

## Next phase

1. Keep BTCUSDT and ETHUSDT in observation. Do not tune thresholds to improve the numbers above.
2. Any successor to the derivatives family must define extremeness and crowding against the rolling
   distribution, and must ship a funnel showing a reachable sample before it is evaluated.
3. Record trial count. Nine candidates on two symbols is eighteen selections; a single near-breakeven
   slice among them is not a discovery (the Deflated Sharpe / PBO concern adopted in `docs/14`).
4. Re-run any new candidate through `npm run research:local` first, then confirm on the dashboard job,
   so both paths are known to agree.
5. `runBacktest` is still O(n²) in `evaluateIntelligentSignal` because indicators are recomputed over a
   growing prefix each candle; a full-year single-symbol run takes about 50 minutes locally. Making the
   indicator warm-up incremental is the largest remaining performance item and should be done as its
   own change with a byte-identical result check, the same way the cursor fix was verified.

## Validation run this session

```text
npm install           ok, 0 vulnerabilities
npm run typecheck     core + web + worker, pass
npm test              core 19 pass, worker 29 pass, 48 total
npm run build         pass, 7 routes
research:local        executed end to end for BTCUSDT and ETHUSDT against the public archive
```
