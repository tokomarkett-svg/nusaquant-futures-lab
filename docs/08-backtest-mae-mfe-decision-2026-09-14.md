# MAE/MFE backtest decision — 2026-09-14

## Scope

The latest dashboard run completed successfully on a bounded screening sample of `5,000` closed 15M candles and `2,000` 1H candles for the selected symbol. The selector is not visible in the screenshot crop, so this note does not guess BTCUSDT or ETHUSDT.

This is a screening result, not a promotion result. The temporal OOS slice contains only `13` trades and therefore does not satisfy the minimum 30-trade OOS gate.

## Baseline result

- Full sample: `48` trades (`11W / 37L`), win rate `22.9%`.
- Net P/L: `-473.82 USDT`.
- Max drawdown: `-545.94 USDT` (`5.46%`).
- Profit factor: `0.34`.
- In-sample: `35` trades, net `-402.48 USDT`, expectancy `-0.469R`, PF `0.28`.
- OOS: `13` trades, net `-74.33 USDT`, expectancy `-0.229R`, PF `0.54`; `NOT READY` due to insufficient OOS sample and negative metrics.

### Execution audit

- Gross P/L before costs: `-142.30 USDT`.
- Total costs: `331.52 USDT`.
- Net P/L after costs: `-473.82 USDT`.
- Gross expectancy: `-0.118R`.
- Gross PF: `0.69`.
- Stop loss: `35` trades (`72.9%`).
- Take profit: `11` trades (`22.9%`).
- Time exit: `2` trades (`4.2%`).

The signal has negative expectancy before costs, so costs are not the only problem. Costs materially worsen the result and must remain in every research gate.

## MAE/MFE finding

- Average MFE: `0.91R`.
- Average MAE: `1.01R`.
- Stop-loss trades that reached at least `+0.5R`: `20 / 35` (`57.1%`).
- Stop-loss trades that reached at least `+1R`: `10 / 35`.
- Average MFE before stop-loss: `0.66R`.
- Average MAE at stop-loss: `1.26R`.
- Average MFE at take-profit: `1.68R`.
- Average MFE at time exit: `0.87R`.

## Decision

The baseline remains rejected. The result does not justify widening the stop mechanically: although many stop-loss trades had some favorable excursion, the average MFE before stop was only `0.66R`, the average MAE at stop was `1.26R`, and gross PF was already below 1.

The finding supports one structured, research-only exit hypothesis: test whether protecting a trade after it reaches a predefined half-risk favorable excursion can reduce the large stop-loss cluster. This must be compared against the unchanged baseline with the same costs, OOS, and walk-forward gates. It must not be enabled in paper/live automatically.

The existing timing/retest/follow-through entry candidates remain rejected. Do not approve paper entries based on this screening run.
