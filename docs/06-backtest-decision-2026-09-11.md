# Backtest decision — 2026-09-11

## Scope

Production observation remains limited to `BTCUSDT` and `ETHUSDT`. The screenshots were rerun after the gross execution audit was deployed. No Testnet, live order, private Binance API, or additional futures symbol is enabled.

## BTCUSDT baseline

- Sample: 8,742 candles on 15M; 2,185 candles on 1H.
- Trades: 85 (`24W / 61L`); win rate `28.2%`.
- Net P/L: `-616.71 USDT`.
- Expectancy: `-0.299R`.
- Profit factor: `0.48`.
- Max drawdown: `-729.87 USDT` (`-7.30%`).
- Gross P/L before costs: `-77.67 USDT`.
- Gross expectancy: `-0.038R`.
- Gross profit factor: `0.90`.
- Total costs: `539.04 USDT`; average cost `6.34 USDT/trade`.
- Exit distribution: `58` stop losses (`68.2%`), `22` take profits (`25.9%`), `5` time exits (`5.9%`).
- OOS: `27` trades, net `-163.54 USDT`, expectancy `-0.243R`, PF `0.56`; `NOT READY` because the OOS trade sample is below 30.
- Timing hypothesis: rejected; full sample PF `0.48`, expectancy `-0.301R`; OOS PF `0.43`, expectancy `-0.324R`.

## ETHUSDT baseline

- Sample: 8,741 candles on 15M; 2,185 candles on 1H.
- Trades: 82 (`28W / 54L`); win rate `34.1%`.
- Net P/L: `-430.17 USDT`.
- Expectancy: `-0.213R`.
- Profit factor: `0.63`.
- Max drawdown: `-496.32 USDT` (`-4.96%`).
- Gross P/L before costs: `-5.59 USDT`.
- Gross expectancy: `-0.003R`.
- Gross profit factor: `0.99`.
- Total costs: `424.58 USDT`; average cost `5.18 USDT/trade`.
- Exit distribution: `54` stop losses (`65.9%`), `27` take profits (`32.9%`), `1` time exit (`1.2%`).
- OOS: `27` trades, net `-192.68 USDT`, expectancy `-0.287R`, PF `0.51`; `NOT READY` because the OOS trade sample is below 30.
- Timing hypothesis: rejected; full sample PF `0.59`, expectancy `-0.248R`; OOS PF `0.42`, expectancy `-0.371R`.

## Decision

Both baseline strategies remain `RESEARCH GATE FAIL`.

- BTC has negative gross edge before costs (`gross PF 0.90`, gross expectancy `-0.038R`). Costs make the loss materially worse.
- ETH is approximately flat before costs but still negative (`gross PF 0.99`, gross expectancy `-0.003R`). Costs consume the already absent edge.
- Both OOS slices are below the minimum 30-trade sample and negative; neither is ready for paper promotion.
- The research-only timing and retest candidates remain rejected and are not promoted.
- `NO_TRADE` is a valid risk decision. The latest dashboard shows fresh candles, no open paper position, and a veto because the current regime/structure is not aligned with trend-following.

## Next allowed research gate

Do not perform random parameter tuning. A future candidate may only be considered after a predeclared test shows all of the following:

1. Positive gross expectancy and gross PF above 1.
2. Positive net expectancy and net PF above 1 after the configured costs.
3. At least 30 OOS trades.
4. Positive OOS expectancy and PF above 1.
5. Positive or stable walk-forward results across folds.
6. No increase in unsupported symbols or execution permissions.

Until those conditions are met, remain in observation/research mode and keep all Testnet/live escalation locked.
