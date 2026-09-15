# Full-history ETH research decision — 2026-09-15

## Job completion

The async worker completed the ETHUSDT full-history job successfully:

- Status: `COMPLETED`
- Progress: `100%`
- Entry sample: `9,202` closed 15M candles
- Higher-timeframe sample: `2,300` 1H candles
- Worker research path completed without browser timeout.

## Baseline

- Full sample: `89` trades (`29W / 60L`), win rate `32.6%`.
- Net P/L: `-510.96 USDT`.
- Expectancy: `-0.235R`.
- Profit factor: `0.60`.
- OOS 30%: `27` trades (`7W / 20L`), win rate `25.9%`, net `-243.54 USDT`, expectancy `-0.364R`, PF `0.44`.
- OOS is below the 30-trade minimum and is also materially negative.
- Walk-forward aggregate: `62` trades, expectancy `-0.337R`, PF `0.46`, `FAIL`.

The full-history result is worse than the bounded screening result, so the negative result was not caused by the 5,000-candle cap.

## Candidate comparison visible in the completed job

- `TRIAD_RETEST_HYPOTHESIS`: full `-309.47 USDT`, `-0.292R`, PF `0.40`; OOS `-149.85 USDT`, `-0.862R`, PF `0.00`.
- `TRIAD_TIMING_HYPOTHESIS`: full `-239.05 USDT`, `-0.275R`, PF `0.55`; OOS `-148.08 USDT`, `-0.195R`, PF `0.65`.
- `TRIAD_FOLLOW_THROUGH_HYPOTHESIS`: full `-317.99 USDT`, `-0.307R`, PF `0.50`; OOS `-225.55 USDT`, `-0.506R`, PF `0.27`.
- `MFE_PROFIT_PROTECTION_HYPOTHESIS`: full `-431.80 USDT`, `-0.185R`, PF `0.55`; OOS `-173.08 USDT`, `-0.240R`, PF `0.33`.

All candidates remain rejected. None has positive full-sample/OOS expectancy or PF above 1.

## Decision

ETHUSDT confirms that the current strategy family has no demonstrated edge over a larger history. The asynchronous job infrastructure is working, but the trading logic is not ready for paper promotion. Keep paper approval, Demo/Testnet, and live locked.

The BTCUSDT full-history run remains the last cross-symbol check. It must be read with the same gates; a positive result on one symbol alone would not be enough to promote the shared strategy.
