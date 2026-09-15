# Cross-asset full-history strategy decision — 2026-09-15

## BTCUSDT completed job

- Sample: `9,204` closed 15M candles and `2,300` 1H candles.
- Baseline: `87` trades (`26W / 61L`), win rate `29.9%`.
- Net P/L: `-585.18 USDT`.
- Expectancy: `-0.276R`.
- PF: `0.51`.
- Walk-forward aggregate: `53` trades, expectancy `-0.378R`, PF `0.37`, `FAIL`.
- OOS has `27` trades and remains below the 30-trade minimum; it is negative and does not support promotion.

Visible candidate comparison:

- Retest: full `-353.13 USDT`, `-0.435R`, PF `0.32`; OOS `-69.57 USDT`, `-0.309R`, PF `0.46`.
- Timing: full `-297.58 USDT`, `-0.301R`, PF `0.48`; OOS `-86.94 USDT`, `-0.290R`, PF `0.48`.
- Follow-through: full `-614.65 USDT`, `-0.563R`, PF `0.22`; OOS remains negative.
- MFE protection: full `-497.81 USDT`, `-0.210R`, PF `0.48`; OOS `-28.73 USDT`, `-0.036R`, PF `0.88`.

The MFE candidate is closer to breakeven in the visible BTC OOS slice but is still negative, has PF below 1, and does not satisfy the OOS sample requirement. It is rejected.

## ETHUSDT completed job

- Sample: `9,202` closed 15M candles and `2,300` 1H candles.
- Baseline: `89` trades (`29W / 60L`), net `-510.96 USDT`, expectancy `-0.235R`, PF `0.60`.
- OOS: `27` trades, net `-243.54 USDT`, expectancy `-0.364R`, PF `0.44`.
- Walk-forward aggregate: `62` trades, expectancy `-0.337R`, PF `0.46`, `FAIL`.
- All four research candidates remained negative in full sample and OOS; none passed PF/expectancy gates.

## Cross-asset decision

Both BTCUSDT and ETHUSDT fail the same full-history research gates. The negative result is not caused by the bounded 5,000-candle screening sample or by browser timeout. The current Triad strategy family has no demonstrated cross-asset edge.

Retire the family from promotion research:

- no baseline promotion;
- no timing, retest, follow-through, or MFE promotion;
- no paper approval based on these signals;
- Demo/Testnet/live remain locked.

## Next phase

The async full-history worker is now the trusted research path. Any new signal family must be designed from a distinct market premise, then run on both symbols with the same full-history, OOS, and walk-forward gates. Do not add another threshold to the retired Triad family.
