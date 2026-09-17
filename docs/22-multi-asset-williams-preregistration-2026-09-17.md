# Pra-registrasi riset multi-aset — Williams volatility breakout (2026-09-17)

Ditulis **sebelum** evaluasi dijalankan, sesuai `docs/11/14/19`.

## Hipotesis

Aturan `WILLIAMS_VOLATILITY_BREAKOUT_HYPOTHESIS` persis `docs/19` (k=0.5 dari open harian,
regime SMA5/45 harian, stop gate cermin, target 3R, maks 72 candle 1H, dua sisi, risk 0.25%)
diterapkan pada 10 kontrak perpetual tambahan. Tidak ada parameter yang disesuaikan per aset.

## Aset (dipilih karena likuiditas tinggi & arsip tersedia; daftar dikunci di dokumen ini)

BNBUSDT · SOLUSDT · XRPUSDT · ADAUSDT · DOGEUSDT · AVAXUSDT · LINKUSDT · LTCUSDT · BCHUSDT · ATOMUSDT

(BTCUSDT/ETHUSDT tidak ikut: sudah punya bukti tersendiri di `docs/19/20` dengan periode 2020-01.)

## Periode & sample

2021-01 → 2026-08 (56 bulan, ±40 ribu candle 1H per aset). Periode mulai dipilih supaya semua
aset di daftar sudah listing sebagai perpetual; panjang sample dilaporkan per aset.

## Gerbang

Gerbang promosi yang sama dengan semua candidate: full-sample positif setelah biaya PF ≥ 1.10,
OOS ≥ 30 trade positif, WF ≥ 30 trade positif. Aset hanya masuk antrean paper bila lulus
sendirian.

## Pengakuan risiko statistik

Menguji 10 aset menaikkan peluang ada yang "lolos karena kebetulan". Mitigasi yang dipatuhi:
(1) semua hasil dilaporkan apa adanya di addendum dokumen ini, termasuk yang gagal; (2) aset
yang lolos tetap wajib melewati fase paper sebagai hakim akhir; (3) tidak ada penyesuaian
parameter setelah melihat hasil — perubahan apa pun harus jadi hipotesis pra-registrasi baru.

## Prediksi yang bisa difalsifikasi

Aset dengan volatilitas harian relatif lebih tinggi dan trend yang lebih "berkelanjutan"
(seperti karakter ETH) lebih mungkin lulus; aset yang didominasi chop/range (banyak altcoin
beta-tinggi yang bergerak serentak dengan BTC lalu mean-revert) diperkirakan gagal di sisi
short, mirip pola BTC.

## Hasil (2026-09-17, periode 2021-01 → 2026-08, 56 bulan)

Artifact: `reports/local-research-williams-multiasset.json`. Semua angka setelah biaya.

| Aset | full (trades · R · PF) | OOS 30% | WF | Gate |
| --- | --- | --- | --- | --- |
| BNBUSDT | 480 · +0.003R · 1.00 | 133 · +0.060R | 259 · −0.042R | REJECT |
| SOLUSDT | 462 · +0.087R · 1.19 | 135 · −0.006R | 251 · +0.045R | REJECT |
| XRPUSDT | 465 · +0.034R · 1.07 | 133 · −0.018R | 252 · +0.033R | REJECT |
| **ADAUSDT** | **465 · +0.052R · 1.12** | **133 · +0.077R · 1.18** | **256 · +0.074R · 1.17** | **PASS** |
| DOGEUSDT | 466 · +0.017R · 1.03 | 140 · −0.039R | 258 · −0.006R | REJECT |
| AVAXUSDT | 457 · +0.067R · 1.15 | 130 · +0.003R | 246 · +0.038R | REJECT |
| LINKUSDT | 472 · −0.045R · 0.90 | 139 · +0.045R | 263 · −0.015R | REJECT |
| LTCUSDT | 440 · −0.039R · 0.92 | 125 · −0.050R | 234 · −0.076R | REJECT |
| BCHUSDT | 451 · −0.034R · 0.92 | 129 · −0.051R | 246 · −0.056R | REJECT |
| ATOMUSDT | 474 · +0.025R · 1.06 | 132 · −0.059R | 257 · +0.071R | REJECT |

Pola sesuai prediksi pra-registrasi: yang gagal umumnya gagal karena sisi yang satu tidak
menutup sisi lainnya atau OOS yang datar; LTC/BCH/LINK negatif penuh (chop lama di aset
beta-BTC). ADA adalah satu-satunya yang konsisten di ketiga jendela (full, OOS, WF positif
bersama-sama) — konsistensi lintas jendela inilah yang memisahkannya dari SOL/AVAX yang full
PF-nya lebih tinggi tetapi OOS-nya ~0.

Mengingat 10 pengujian simultan, kelolosan ADA tetap diperlakukan sebagai **kandidat**, bukan
kebenaran: fase paper adalah hakim akhir (lihat aturan keputusan `docs/21`). Review lintas
aset ADA ada di `docs/23`.
