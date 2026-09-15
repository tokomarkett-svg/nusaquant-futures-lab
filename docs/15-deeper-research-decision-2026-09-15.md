# Deeper research decision — 2026-09-15

## Why the previous result was not enough

The dashboard called the current dataset full-history, but the worker backfill default was 90 days. That is too narrow for a strategy decision. The project now defaults the one-time backfill to 365 days, supports up to 730 days, and shows the actual period in the dashboard.

The paper/live ingestion path remains separate. A longer research backfill must not block the paper heartbeat.

## New independent hypothesis tested

`VOLATILITY_EXPANSION_BREAKOUT_HYPOTHESIS`

Premise:

- 1H ADX at least 20;
- price on the correct side of 1H EMA50;
- 15M close breaks the prior 20-candle Donchian high/low;
- current candle range is at least 1.1 ATR;
- volume is at least 1.2 times the 20-candle average;
- stop is 1.5 ATR and target is 2R;
- closed-candle OHLC execution, stop-first if stop and target are both touched.

This is not a retune of Triad and is not enabled for paper/live.

## Exploratory one-year result from official Binance bulk futures klines

Data source: `data.binance.vision`, USD-M futures, BTCUSDT and ETHUSDT, September 2025 through August 2026; 35,040 15M candles and 8,760 1H candles per symbol. Costs used the existing conservative fee, slippage, funding, and stop-first model.

### BTCUSDT

- Full: 566 trades, `-2368.74 USDT`, `-0.190R`, PF `0.68`.
- OOS 30%: 180 trades, `-1339.37 USDT`, `-0.318R`, PF `0.49`.
- 3-fold walk-forward aggregate: 351 trades, `-1994.56 USDT`, `-0.236R`, PF `0.61`.

### ETHUSDT

- Full: 525 trades, `-1832.55 USDT`, `-0.153R`, PF `0.74`.
- OOS 30%: 160 trades, `-336.02 USDT`, `-0.084R`, PF `0.85`.
- 3-fold walk-forward aggregate: 321 trades, `-991.97 USDT`, `-0.124R`, PF `0.78`.

## Decision

The OHLCV-only breakout family is rejected on both assets. It is not allowed into paper approval. This is a useful failure: it survives a longer and more realistic history but does not produce an edge after costs.

The evidence now points away from adding another arbitrary price-only threshold. The next research branch should add an independent, causal derivatives feature—funding rate first, then open interest when enough history exists. Binance provides a public funding-rate history endpoint; open-interest history has a much shorter availability window, so it must not be presented as a one-year feature until the local store has enough observations.

No strategy is promoted merely because the bot is technically functioning. A technically healthy bot with no validated edge must remain observation-only.
