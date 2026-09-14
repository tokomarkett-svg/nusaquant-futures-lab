# Edge diagnostics decision — 2026-09-14

## Diagnostic result

The latest dashboard screenshot exposes the baseline buckets for one bounded screening run (`48` trades). The symbol selector is outside the crop, so this note records the buckets without guessing the symbol.

### By side / regime

- LONG: `30` trades, net `-255.65 USDT`, expectancy `-0.35R`, PF `0.43`.
- SHORT: `18` trades, net `-218.17 USDT`, expectancy `-0.49R`, PF `0.19`.
- TREND_UP and TREND_DOWN match the corresponding side buckets; neither regime is positive.

Disabling only SHORT would not solve the problem because LONG is also materially negative.

### By quality score

- `72-79`: `9` trades, net `-119.85 USDT`, expectancy `-0.55R`, PF `0.13`.
- `80-89`: `32` trades, net `-217.06 USDT`, expectancy `-0.28R`, PF `0.51`.
- `90-100`: `7` trades, `0%` wins, net `-136.91 USDT`, expectancy `-0.80R`, PF `0.00`.

The score is not calibrated as a probability and high score is not evidence of an edge. The highest bucket is the worst bucket in this sample.

### By exit reason

- STOP_LOSS: `35` trades, `0%` wins, net `-696.92 USDT`, expectancy `-0.82R`, PF `0.00`.
- TAKE_PROFIT: `11` trades, `90.9%` wins, net `+233.54 USDT`, expectancy `+0.89R`.
- TIME_EXIT: `2` trades, net `-10.44 USDT`, expectancy `-0.22R`, PF `0.25`.

The take-profit bucket is an outcome bucket, not a predictive signal; it cannot be used to claim an entry pattern. The stop-loss cluster confirms that entry quality is the main unresolved problem, not merely the stop placement.

### By trigger range and entry distance

- Every trigger-range bucket is negative; the best is `<0.8 ATR` at PF `0.56`.
- The best entry-distance bucket is `0.25-0.5 ATR`: `10` trades, net `-26.21 USDT`, expectancy `-0.10R`, PF `0.75`; still negative and too small to promote.
- The closest-entry bucket `<0.25 ATR` has `27` trades, net `-315.83 USDT`, expectancy `-0.48R`, PF `0.28`.

Do not promote the `0.25-0.5 ATR` bucket as a new candidate from this sample; it would be threshold selection on a small bucket.

### By period

- 2026-07: `8` trades, net `-159.46 USDT`, expectancy `-0.80R`, PF `0.00`.
- 2026-08: `30` trades, net `-299.29 USDT`, expectancy `-0.41R`, PF `0.34`.
- 2026-09: `10` trades, net `-15.98 USDT`, expectancy `-0.06R`, PF `0.85`.

The apparent September improvement is too small and still below PF 1; it is not a robust regime proof.

## Decision

No diagnostic bucket is positive and sufficiently large. The current signal family has no evidence of a reliable pattern. The five tested variants remain rejected, and the strategy family is frozen rather than extended with another hand-picked threshold.

The correct next step is a fresh signal design plus a larger, asynchronous full-history research run. It must be evaluated across both symbols and untouched time periods before any paper promotion. Do not disable a side, trust the score, or narrow entry distance based on these buckets alone.

Paper, Demo/Testnet, and live remain locked.
