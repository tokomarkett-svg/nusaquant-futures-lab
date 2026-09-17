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
