# Cross-asset review — ADAUSDT/WILLIAMS_VOLATILITY_BREAKOUT_HYPOTHESIS (2026-09-17)

Pasangan `docs/22` (pra-registrasi + hasil 10 aset). ADA satu-satunya yang lolos gerbang
promosi pada periode 2021-01 → 2026-08 (465 trade · +0.052R · PF 1.12; OOS 133 trade +0.077R;
WF 256 trade +0.074R).

## Bukti

| | ADAUSDT | pembanding ETHUSDT | pembanding BTCUSDT |
| --- | --- | --- | --- |
| sisi LONG | 161 · +6.9R | 283 · +48.1R | 303 · +25.4R |
| sisi SHORT | 304 · **+17.4R** | 258 · −2.5R | 268 · −19.4R |
| tahun positif | **6/6** (2021-2026) | 6/7 | 5/7 |
| median range harian | **5.89%** | 5.00% | 3.76% |
| exits TP/SL/TIME | 31/167/267 | 48/203/290 | 49/228/294 |

## Interpretasi

1. **Kedua sisi bekerja** — kebalikan dari ETH (long-driven) dan BTC (short meracuni). Ini
   profil paling seimbang dari semua aset yang pernah diuji playbook ini.
2. **Stabilitas tahunan sempurna di sampel**: tidak ada tahun negatif, termasuk 2022 (bear)
   dan 2023 (chop) — sisi short ADA yang kuat menjelaskan 2022 (+1.6R saat ETH +0.4R dan BTC −0.3R).
3. **Konsisten dengan premis**: range harian relatif tertinggi (5.89%) di antara aset yang
   diuji; strategi ekspansi range bekerja paling baik tepat di aset dengan range terbesar.
4. Ekspektansi tetap tipis (+0.052R/trade) — asumsi biaya tetap krusial; paper adalah uji
   asumsi itu.

## Keputusan

- **ADAUSDT disetujui masuk antrean paper trading**, aturan persis `docs/19`, mode
  PAPER_APPROVAL, risk 0.25%, sesi terpisah dari ETH.
- ADA + ETH bersama memberi diversifikasi profil (ETH long-driven, ADA two-sided) — tetapi
  keduanya tetap satu aturan yang sama; korelasi antar-trade tidak diestimasi di sini dan
  harus dipantau saat paper (bila drawdown keduanya bersamaan, catat di logbook).
- Tidak ada parameter yang diubah. Aset yang REJECT di `docs/22` tetap terkunci.
