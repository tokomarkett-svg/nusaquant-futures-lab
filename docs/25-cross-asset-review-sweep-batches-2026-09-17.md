# Cross-asset review — sweep universe batch 1+2 (ZEC, UNI, RUNE) · 2026-09-17

Melanjutkan `docs/24` §4. Batch 1 (12 aset) + batch 2 (10 aset), periode 2021-01 → 2026-08,
aturan Williams persis `docs/19`. Artifact: `reports/local-research-williams-sweep-b1.json`
dan `-b2.json`. Tiga aset lolos gerbang promosi; semuanya tetap wajib review ini sebelum paper.

## Ringkasan yang lolos

| | ZECUSDT | UNIUSDT | RUNEUSDT |
| --- | --- | --- | --- |
| full | 460 · +0.068R · PF 1.16 | 482 · +0.059R · PF 1.13 | 473 · +0.112R · PF 1.27 |
| OOS 30% | 127 · +0.138R · PF 1.35 | 138 · +0.103R · PF 1.24 | 137 · +0.066R · PF 1.15 |
| WF | 250 · +0.060R | 261 · +0.094R | 257 · +0.140R · PF 1.34 |
| sisi L / S | +13.3R / +18.2R | +8.8R / +19.4R | +25.7R / +27.1R |
| tahun positif | 5/6 (2023 −7.3R) | 4/6 (2021 −3.0R, 2026 −5.4R) | **6/6** |
| median range harian | 7.28% | 6.95% | 7.82% |

## Yang hampir tapi tidak

- ALGO: OOS +0.065R & WF +0.095R tetapi full PF 1.07 < 1.10 → REJECT.
- DASH: semua jendela positif tetapi full PF tepat di bawah ambang → REJECT.
- CHZ: full PF 1.30 tetapi OOS −0.017R → REJECT (edge tidak bertahan di jendela terakhir).
- FIL/AXS/DOT: full bagus, OOS negatif tajam → REJECT (edge kadaluarsa).

## Interpretasi

1. Pola yang sama dengan ADA terulang: yang lolos punya **dua sisi untung** dan range harian
   relatif besar (≥ ~7%) — strategi ekspansi range bekerja di aset yang benar-benar bergerak.
2. RUNE adalah profil terkuat setelah ETH (6/6 tahun, dua sisi seimbang). ZEC solid dengan satu
   tahun dorman (2023). UNI paling lemah di antara yang lolos (2 tahun negatif) — perlakukan
   sebagai anggota portofolio dengan keyakinan terendah; pantau khusus di paper.
3. Dengan 34 aset teruji dan 5 lolos, tingkat kelolosan ~15% konsisten dengan edge kontekstual,
   bukan kebetulan massal; tetap: paper adalah hakim akhir, dan korelasi antar-aset (semua
   crypto beta-BTC) berarti drawdown bisa datang bersamaan — catat di logbook.

## Keputusan

- **ZECUSDT (sesi ...004), UNIUSDT (sesi ...005), RUNEUSDT (sesi ...006) disetujui masuk
  antrean paper**, aturan persis, mode PAPER_APPROVAL, risk 0.25% per sesi.
- Portofolio paper kini 5 playbook (ETH, ADA, ZEC, UNI, RUNE). Daily profit lock berlaku per
  sesi; bila ingin lock agregat, itu fitur baru yang harus dispesifikasi terpisah.
- Aset REJECT di batch ini terkunci; tidak ada parameter yang diubah pasca-hasil.

## Addendum: batch 3 (25 aset; kohort sesuai umur listing) · 2026-09-17

SAND (2021-01 → 2026-08); 15 aset (2024-01 → 2026-08); 9 aset (2025-01 → 2026-08).
HYPE & ASTER dieksklusi (arsip < 2025-01, sample tak berarti). Artifact:
`reports/local-research-williams-sweep-b3{a,b,c}.json`. **Tidak ada yang lolos.**

| Aset | full | OOS | WF | vonis |
| --- | --- | --- | --- | --- |
| SAND | 455 · +0.134R · 1.32 | 131 · +0.045R · **1.09** | 252 · +0.123R | REJECT (OOS PF sejenggot di bawah 1.10) |
| CAKE | 202 · +0.088R · 1.19 | 57 · −0.044R | 104 · +0.050R | REJECT |
| RAY | 0 trade | – | – | NOT_READY_SAMPLE |
| STX | 211 · +0.075R · 1.18 | 57 · −0.013R | 108 · +0.157R | REJECT |
| RNDR | 39 · −0.009R | – | – | REJECT |
| GALA | 223 · +0.054R · 1.13 | 63 · −0.001R | 116 · −0.013R | REJECT |
| ENS | 210 · +0.002R | 51 · −0.151R | 109 · +0.027R | REJECT |
| IMX | 209 · −0.017R | 56 · −0.148R | 101 · +0.020R | REJECT |
| PENDLE | 217 · −0.041R | 53 · −0.099R | 110 · −0.010R | REJECT |
| JUP | 197 · +0.032R | 51 · +0.009R | 103 · +0.187R | REJECT (full PF < 1.10) |
| LDO | 210 · −0.018R | 53 · +0.003R | 108 · +0.004R | REJECT |
| WLD | 217 · +0.078R · 1.17 | 50 · +0.024R · 1.05 | 103 · +0.078R | REJECT (OOS PF < 1.10) |
| ORDI | 204 · −0.040R | 53 · +0.130R | 101 · −0.030R | REJECT |
| PYTH | 207 · +0.042R | 51 · −0.002R | 104 · +0.024R | REJECT |
| KAS | 200 · +0.030R | 49 · −0.118R | 101 · +0.044R | REJECT |
| ONDO | 209 · +0.039R | 52 · −0.037R | 113 · +0.049R | REJECT |
| POL | 131 · +0.023R | 31 · −0.249R | 57 · −0.062R | REJECT |
| TON | 114 · +0.050R | 14 (tipis) | 38 · +0.104R | REJECT (OOS < 30 trade) |
| ENA | 133 · +0.132R · 1.33 | 31 · −0.021R | 54 · +0.097R | REJECT |
| STRK | 126 · −0.044R | 30 · −0.060R | 52 · −0.039R | REJECT |
| TAO | 126 · −0.098R | 30 · −0.263R | 52 · −0.087R | REJECT |
| TRUMP | 124 · +0.115R · 1.30 | 31 · +0.165R · 1.40 | 48 · +0.024R · 1.06 | REJECT (WF PF < 1.10) |
| PENGU | 126 · +0.020R | 27 · +0.094R | 54 · −0.012R | REJECT |
| VIRTUAL | 138 · −0.089R | 35 · −0.329R | 63 · −0.271R | REJECT |
| S | 121 · +0.112R · 1.28 | 26 · +0.172R | 47 · +0.056R · 1.14 | REJECT (OOS < 30 trade) |

Total kumulatif: **59 aset diuji, 5 lolos** (ETH, ADA, ZEC, UNI, RUNE) ≈ 8.5% — konsisten
dengan edge kontekstual yang langka. Fleet paper tetap lima; tidak ada yang "diselamatkan".
