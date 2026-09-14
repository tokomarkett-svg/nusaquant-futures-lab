# Follow-through research decision — 2026-09-14

## Result shown in the latest dashboard screenshot

The symbol selector is outside the crop, so this note records the displayed research result without guessing the symbol.

### Baseline

- Full sample: `87` trades (`26W / 61L`), win rate `29.9%`.
- In-sample: `60` trades (`16W / 44L`), net `-477.03 USDT`, expectancy `-0.325R`, PF `0.44`.
- OOS: `27` trades (`10W / 17L`), net `-113.57 USDT`, expectancy `-0.168R`, PF `0.68`; still `NOT READY` because OOS is below 30 trades.
- Gross P/L before costs: `-30.70 USDT`.
- Total costs: `554.58 USDT`.
- Net P/L after costs: `-585.18 USDT`.
- Gross expectancy: `-0.014R`.
- Gross profit factor: `0.96`.
- Exit distribution: `58` stop losses (`66.7%`), `24` take profits (`27.6%`), `5` time exits (`5.7%`).

### Existing research candidates

- `TRIAD_TIMING_HYPOTHESIS`: rejected. Full candidate `40` trades, net `-297.58 USDT`, expectancy `-0.301R`, PF `0.48`; OOS `12` trades, net `-86.94 USDT`, expectancy `-0.290R`, PF `0.48`.
- `TRIAD_RETEST_HYPOTHESIS`: rejected. Full candidate `33` trades, net `-353.13 USDT`, expectancy `-0.435R`, PF `0.32`; OOS `9` trades, net `-69.57 USDT`, expectancy `-0.309R`, PF `0.46`.

### New follow-through candidate

The visible candidate full sample has `45` trades (`6W / 39L`), net `-614.65 USDT`, and expectancy `-0.563R` in the visible portion. It is materially worse than baseline and remains marked `CANDIDATE REJECTED FOR NOW`.

## Decision

`TRIAD_FOLLOW_THROUGH_HYPOTHESIS` is rejected. It is not promoted to paper, Demo/Testnet, or live. The baseline also remains rejected because gross PF is below 1 and gross expectancy is negative before costs.

The latest result is not a software failure:

- gross edge is already negative/near-zero before costs;
- the OOS result remains negative and below the minimum sample;
- stop losses remain dominant;
- the candidate worsens the loss rather than improving generalization.

## Next action

Do not wait for this strategy to repair itself and do not tune thresholds randomly. Freeze the baseline and all three rejected candidates. The next research step must be a newly defined structural hypothesis supported by a diagnostic observation, followed by the same full-sample, OOS, and walk-forward gates. Demo/Testnet/live remain locked.
