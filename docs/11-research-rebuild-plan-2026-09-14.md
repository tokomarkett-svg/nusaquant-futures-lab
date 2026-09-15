# Research rebuild plan — 2026-09-14

## Current state

The current Triad strategy family is frozen after negative baseline, entry variants, and MFE profit-protection results. Edge diagnostics show no positive side, regime, quality, trigger-range, entry-distance, or adequately sampled period bucket.

The current dashboard screening run is bounded to avoid serverless timeout (`5,000` 15M candles and `2,000` 1H candles), and the OOS slices shown so far are below the 30-trade minimum. These runs are useful for rejection, not for promoting a new strategy.

## Work sequence

### 1. Full-history research execution

Build a server-side asynchronous research job rather than a long synchronous browser request. The job must:

- read all available closed 15M and 1H candles for BTCUSDT and ETHUSDT;
- report job status and progress without a gateway timeout;
- persist the run result and error state;
- preserve the existing conservative stop/target, fee, slippage, funding, and same-candle stop-first assumptions;
- run full sample, temporal 70/30, and at least three walk-forward folds;
- keep candidate policy metadata so every result is reproducible.

The browser backtest button remains a bounded screening path until the asynchronous job is available.

### 2. Fresh signal family

Do not add another threshold to the retired Triad family. The new family must have a distinct market premise and be research-only. It will be selected from a written rationale before implementation, not chosen after inspecting the same OOS results.

### 3. Research gates

A candidate may not move to paper unless all of these are true:

- full-sample net expectancy positive after costs;
- OOS has at least 30 trades;
- OOS expectancy and PF are positive;
- at least three walk-forward folds do not collapse;
- result is not dependent on one side, one month, or one small bucket;
- security and Risk Governor checks remain green.

Paper, Demo/Testnet, and live remain locked during the rebuild.
