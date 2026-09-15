# External research review and adopted improvements — 2026-09-15

## Repositories/frameworks reviewed

### Freqtrade

Adopted ideas:

- lookahead-analysis as a required check against indicators/signals seeing future candles;
- recursive/warmup analysis so indicator values do not depend incorrectly on the number of startup candles;
- explicit separation between backtest, dry-run, and live validation;
- no parameter search is accepted without re-running the same configuration on untouched data.

Not adopted:

- copying community strategies or hyperopt results;
- using hyperoptimization to rescue a negative strategy family.

### NautilusTrader

Adopted idea:

- research/backtest and live execution should share event and fill semantics as closely as possible. The current worker previously checked only candle close for paper exits while backtest checked candle high/low. That mismatch has now been fixed: paper candle marking uses high/low, applies conservative stop-first ordering, and shares the same stop/target semantics as the simulator.

Not adopted:

- replacing the existing TypeScript core with a new trading framework before the strategy premise is proven.

### hftbacktest

Finding:

- high-frequency research needs latency, order-book, queue-position, and fill models.

Decision:

- do not import HFT complexity into this 15M market-order research prematurely. If the strategy later uses limit orders or shorter timeframes, add a separate execution-model phase rather than pretending OHLC bars model queue position.

### Purged/embargo validation and Deflated Sharpe / PBO research

Adopted ideas:

- multiple candidate trials create selection bias;
- chronological OOS alone is not enough after repeated hypothesis selection;
- future label horizons should be separated from validation windows with a purge/embargo rule;
- a selected result should be discounted for the number of trials rather than treated as a fresh discovery.

Decision:

- keep the current family retired;
- record all rejected candidates;
- add purge/embargo and trial-count metadata before selecting a new strategy family;
- do not call a near-zero OOS result an edge.

## Concrete code change completed

Commit `4148aad` aligns paper execution with backtest candle semantics:

- paper worker now accepts candle `high`, `low`, and `close`;
- stop-loss and take-profit are checked against intrabar high/low;
- if both are touched in one candle, stop-loss is conservatively first;
- a regression test covers the intrabar stop case;
- research jobs continue in a worker thread so paper heartbeat is not blocked.

## Current research decision

The full-history BTC and ETH results remain negative. No external repository provided a trustworthy shortcut to a profitable pattern. External projects mainly reinforce that execution parity, lookahead checks, realistic fills, and multiple-testing controls matter more than copying a strategy.

The next new signal family must be hypothesis-driven, independently documented, and evaluated with the full-history asynchronous worker. Paper, Demo/Testnet, and live remain locked.
