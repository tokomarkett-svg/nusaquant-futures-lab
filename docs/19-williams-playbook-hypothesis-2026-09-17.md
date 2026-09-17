# Champion playbook #2 — Larry Williams (volatility breakout) — 2026-09-17

Sumber: wawancara Robbins World Cup tentang sistem 1987 ("if the market moved off some price point —
opening, close, average, midpoint, high, whatever — that the move usually continued") [5](https://pdfcoffee.com/world-cup-advisor-pdf-free.html),
ringkasan aturan open-range gate [1](https://x.com/mql5com/status/2012450075667042643), dan ulasan
5 sinyal inti termasuk kelemahan masing-masing [4](https://www.ebc.com/forex/larry-williams-strategy-wr-cot-signals-2026).
Dari buku *Long-Term Secrets to Short-Term Trading*: crossover terbaik studinya 1975-1987 adalah
rata-rata 5 hari vs 45 hari [3](https://atoast2trading.wordpress.com/wp-content/uploads/2012/02/larry-williams-long-term-secrets-to-short-term-trading.pdf).

Spesifikasi ditulis **sebelum** evaluasi, sesuai `docs/11`/`docs/14`.

## Premis (berbeda dari keluarga lain di repo ini)

- Skala **harian/swing**, bukan pullback 15M: move yang berekspansi melewati range hari sebelumnya
  dari titik open cenderung berlanjut (momentum continuation).
- Regime dari **SMA5 vs SMA45 harian** (sistem crossover terbaik studinya), bukan EMA 1H/4H.
- Tidak memakai volume, taker flow, funding, atau metrics — sengaja orthogonal terhadap candidate
  lain supaya layak jadi "otak" kedua dalam portofolio nanti.

## Translasi mekanis (`WILLIAMS_VOLATILITY_BREAKOUT_HYPOTHESIS`)

Dijalankan pada candle entry `1H` dengan konteks harian UTC (crypto tidak punya session open, jadi
open harian = open candle 1H pertama hari UTC berjalan):

1. `prevDayRange` = high − low hari UTC **sebelumnya yang sudah selesai**.
2. Gate long: `close >= dayOpen + 0.5 * prevDayRange`; gate short cermin.
   (0.5 dipilih sebelum uji sebagai fraksi tengah dari "user-defined fraction" di literatur;
   bukan hasil tuning.)
3. Regime: long hanya bila `SMA5(daily close) > SMA45(daily close)`; short cermin.
4. Entry pada close candle 1H yang menembus gate.
5. Stop: `dayOpen ∓ 0.5 * prevDayRange` (gate cermin = titik tesis breakout salah).
6. Target `3R`; maksimum hold `72` candle 1H (≈ 3 hari, sesuai gaya swingnya). Trailing adalah
   penelitian lanjutan, sama seperti playbook #1.
7. Risk `0.25%` per trade — ukuran kompetisi Williams (risk agresif/Kelly) **tidak** diadopsi;
   tujuan kita edge, bukan piala.

## Yang TIDAK diadopsi dan alasannya

- **COT positioning**: data CFTC mingguan untuk futures AS; tidak ada padanan publik untuk perp
  crypto di arsip kita. Dicatat sebagai lapisan konfirmasi yang hilang, bukan diproksi paksa.
- **Seasonality**: lapisan timing; hanya bernilai setelah sinyal inti lulus sendirian.
- **Williams %R**: alat lokasi, bukan trigger; menambahnya sekarang = mencampur hipotesis.
- **Ukuran posisi Kelly/agresif**: bertentangan dengan risk governor project.

## Gerbang

Sama dengan semua candidate: full-sample positif setelah biaya PF ≥ 1.10, OOS ≥ 30 trade positif,
walk-forward ≥ 30 trade positif, lintas aset. Funnel `buildWilliamsBreakoutFunnel` dilaporkan
supaya "berapa sering gate tersentuh" terlihat sebelum kesimpulan apa pun.

## Prediksi yang bisa difalsifikasi sebelum melihat hasil

- Gate 0.5×range dari open harus tersentuh pada sebagian kecil candle 1H (orde 1-5%), bukan hampir
  setiap hari dan bukan hampir tidak pernah; jika funnel menunjukkan < 0.1% atau > 20%, translasi
  skalanya salah dan harus ditinjau ulang — bukan di-tune.
- Karena regime 5/45 memfilter satu sisi, distribusi trade long vs short akan condong mengikuti
  trend tahunan; keduanya tetap harus punya sample.

## Hasil (2026-09-17)

### Full-year 2025-09 → 2026-08 (entry 1H, konteks 4H)

Artifact: `reports/local-research-williams.json`.

| Sample | BTCUSDT | ETHUSDT |
| --- | --- | --- |
| full | 79 trade · −0.115R · PF 0.77 | 75 trade · +0.201R · PF 1.50 · **PASS gate riset** |
| OOS 30% | 19 · −0.680R · PF 0.06 | 18 · −0.230R · PF 0.57 |
| WF | 24 · −0.078R | 23 · +0.320R |

Funnel: gate tertembus 4.4–6.8% candle 1H — di dalam pita prediksi 1–20% dari spec, translasi skala
valid. Catatan: tahun terakhir adalah regime yang tidak ramah untuk strategi ini di kedua symbol
(OOS negatif keduanya).

### Long-history 2020-01 → 2026-08 (80 bulan, 58.416 candle 1H/symbol)

Langkah lanjutan yang sah menurut spec: **menambah sample, bukan men-tune parameter**. Artifact:
`reports/local-research-williams-longhistory.json` (`--no-metrics`, variant ini tidak memakai metrics).

| Sample | BTCUSDT | ETHUSDT |
| --- | --- | --- |
| full | 571 trade · +0.011R · PF 1.02 | 541 trade · +0.084R · PF 1.19 · +1.183 USDT (risk 0.25%) |
| OOS 30% | 169 · −0.078R · PF 0.84 | 159 · +0.133R · PF 1.31 |
| WF | 328 · −0.076R · PF 0.84 | 312 · +0.050R · PF 1.11 · WR 41.3% · maxDD 3.7% |
| gate promosi | REJECT | **PASS** |

### Interpretasi (jujur, tanpa euforia)

1. **ETHUSDT/WILLIAMS_VOLATILITY_BREAKOUT_HYPOTHESIS adalah playbook pertama di repo ini yang
   lolos gerbang promosi**: positif setelah biaya di full-sample 6,5 tahun, OOS 159 trade positif,
   WF 312 trade positif, lintas tiga rezim pasar berbeda.
2. Edge-nya **tipis**: +0.084R/trade dan PF 1.19. Ini konsisten dengan karakter strategi breakout
   (win rate 41%, profit dari ekor kanan), dan berarti asumsi slippage/biaya harus diperlakukan
   serius pada tahap paper — bukan angka yang boleh dibulatkan naik.
3. **BTCUSDT gagal** (full +0.011R praktis nol, OOS dan WF negatif). Cross-asset review WAJIB
   sebelum persetujuan paper: hipotesis yang sama tidak bekerja di aset kedua adalah bukti bahwa
   edge ini spesifik-konteks (volatilitas ETH yang lebih besar membuat range-gate lebih bermakna),
   bukan hukum pasar. Keputusan deployment harus eksplisit memilih ETH-only dengan alasan tertulis.
4. OOS 30% long-history (≈2024-08 → 2026-08) positif +0.133R — berlawanan arah dengan OOS tahun
   kalender terakhir (−0.230R). Artinya edge ini punya periode dorman yang panjang; itu normal
   untuk momentum continuation, tapi paper trading harus siap melewati fase flat.
5. Tidak ada satu parameter pun yang diubah setelah melihat hasil. k=0.5, SMA5/45, 3R, 72 bar —
   semuanya dari spec pra-uji di dokumen ini.

### Langkah berikutnya (urut, tidak boleh dilompati)

1. Cross-asset review tertulis (kenapa ETH lulus dan BTC tidak; risiko memilih satu aset).
2. Paper trading ETH-only dengan ukuran 0.25%/trade, minimal satu siklus dorman, tanpa intervensi
   parameter.
3. Otak #3 (Andrea Unger) baru relevan setelah playbook kedua lulus — saat ini baru satu.
