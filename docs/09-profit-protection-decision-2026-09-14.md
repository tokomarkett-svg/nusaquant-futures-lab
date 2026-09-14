# Profit-protection hypothesis decision — 2026-09-14

## Result

The dashboard was run for both available symbols. The screenshots do not show the symbol selector, so the two runs are recorded as Run A and Run B without guessing the symbol.

### Run A — visible candidate result

- Baseline: `48` trades, `11W / 37L`, net `-473.82 USDT`, expectancy `-0.404R`, PF `0.34`.
- Timing candidate: `20` trades, net `-237.17 USDT`, expectancy `-0.479R`, PF `0.25`; OOS `6` trades, net `-11.74 USDT`, expectancy `-0.078R`, PF `0.80`.
- Retest candidate: `19` trades, net `-262.72 USDT`, expectancy `-0.560R`, PF `0.18`; OOS `6` trades, net `-58.08 USDT`, expectancy `-0.388R`, PF `0.31`.
- Follow-through candidate: `27` trades, net `-375.98 USDT`, expectancy `-0.567R`, PF `0.20`; OOS `5` trades, net `-90.39 USDT`, expectancy `-0.726R`, PF `0.00`.
- Profit-protection candidate visible full sample: `56` trades, `9W / 47L`, win rate `16.1%`; lower card values are outside the crop.

### Run B — visible candidate result

- Baseline: `53` trades, `14W / 39L`, net `-462.01 USDT`, expectancy `-0.356R`, PF `0.43`.
- Timing candidate: `19` trades, `4W / 15L`, net `-194.20 USDT`, expectancy `-0.412R`, PF `0.38`; OOS `5` trades, net `-103.27 USDT`, expectancy `-0.830R`, PF `0.00`.
- Retest candidate: `17` trades, `2W / 15L`, net `-269.54 USDT`, expectancy `-0.642R`, PF `0.16`; OOS `4` trades, net `-83.38 USDT`, expectancy `-0.838R`, PF `0.00`.
- Follow-through candidate: `26` trades, `6W / 20L`, net `-319.83 USDT`, expectancy `-0.499R`, PF `0.27`; OOS `10` trades, net `-127.13 USDT`, expectancy `-0.511R`, PF `0.28`.
- Profit-protection candidate visible full sample: `56` trades, `7W / 49L`, win rate `12.5%`, net `-375.04 USDT`; still marked `CANDIDATE REJECTED FOR NOW`.

## Decision

`MFE_PROFIT_PROTECTION_HYPOTHESIS` is rejected. It may reduce the absolute loss in Run B versus its baseline, but it does not produce positive expectancy, positive profit factor, or a reliable OOS sample. A loss reduction is not an edge and must not be promoted.

All tested variants are now rejected:

- baseline;
- timing;
- retest;
- follow-through;
- MFE profit protection.

The current strategy family is retired from promotion research. Do not add another stop/entry threshold to this same family without a new diagnostic rationale; repeated variants would create multiple-testing/overfitting risk.

## Next research decision

The next candidate must be a fresh signal design backed by `bySide`, `byRegime`, `byExitReason`, and time-period diagnostics. It must be evaluated as a new family with untouched OOS data and the same full-sample/OOS/walk-forward gates. Paper, Demo/Testnet, and live remain locked.
