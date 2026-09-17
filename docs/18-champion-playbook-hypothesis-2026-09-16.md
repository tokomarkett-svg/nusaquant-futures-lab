# Champion playbook #1 — Chris Creamer (Robbins World Cup) — 2026-09-16

Sumber: wawancara "Trading WORLD CHAMPION Reveals the Orderflow Strategy That Won the Robbins Cup
(Step-by-Step)" (Chris Creamer, @thraxxtrades) — ringkasan publik [1](https://youtubesummary.com/summary/PL7LKUsCgIQ)
dan breakdown 4 langkah [4](https://x.com/IQCapital_io/status/2087500226365919704), video asli
[3](https://www.youtube.com/watch?v=PL7LKUsCgIQ).

Dokumen ini adalah **spesifikasi hipotesis yang ditulis sebelum implementasi**, sesuai aturan riset
project (`docs/11`, `docs/14`). Bukan hasil tuning.

## Playbook asli (ringkas)

1. **Environment (sebelum open):** arah tren dari 1H+4H; karakter hari dari gamma exposure (GEX)
   opsi — positif = chop/failed breakout, negatif = move cepat.
2. **Location:** hanya ikut arah struktur value; pada value-up jangan beli di premium. Tunggu
   pullback ke zona discount yang ditandai fib `0.705 / 0.788 / 0.886` dari swing low → swing high.
   Zona harus **di luar value area**. Tembus `0.886` = batal.
3. **Confirmation (order flow):** absorption di ekstrem (seller agresif, delta negatif berat, harga
   tidak turun). Absorption ≠ otomatis reversal: butuh dominance shift — seller mencoba lagi dan
   gagal lebih tinggi, lalu candle flip bullish.
4. **Entry & risk:** masuk saat flip; stop di belakang ekstrem seller yang gagal (harga tepat di mana
   ide salah); target swing point terdekat, trailing; tipikal `1.5R–2R`. Filter partisipasi: volume
   mati = tidak trade. Setelah **2 loss beruntun**, shut off (mencegah tilt / bad loss).

## Translasi ke mesin kita (15M/1H, BTC/ETH perp, candle closed, taker flow tersedia)

Komponen yang **tidak** bisa direplikasi dan penggantinya — dicatat, bukan disembunyikan:

| Komponen asli | Ketersediaan di data kita | Keputusan translasi |
|---|---|---|
| Footprint / delta per harga | Tidak ada (kita punya taker buy volume per candle) | Delta candle = `2*takerBuyVolume - volume`; absorption didefinisikan dari rasio taker + posisi close di range |
| Value area (volume profile) | Tidak ada profile per harga | VWAP lookback sebagai garis "value"; zona beli wajib di bawah VWAP (discount), zona jual di atas |
| GEX opsi (regime hari) | Tidak ada untuk crypto di arsip ini | **Dihilangkan**, bukan diganti paksa. Diuji tanpa komponen ini; jika lulus, GEX-proxy adalah penelitian terpisah |
| Eksekusi intrabar diskresi | Mesin kita candle-closed | Semua konfirmasi wajib candle closed; stop-first jika stop dan target satu candle |

Aturan teruji (`CHAMPION_ABSORPTION_REVERSION_HYPOTHESIS`), sisi long (short cermin):

1. Struktur 1H bullish: `EMA50 > EMA200` (pengganti "1H+4H trend up").
2. Swing dari 60 candle 15M terakhir: `swingLow`, `swingHigh`. Fib level
   `L(x) = swingHigh - (swingHigh - swingLow) * x` untuk `x in {0.705, 0.788, 0.886}`.
3. Location: close candle absorption berada di `[L(0.886), L(0.705)]` **dan** di bawah VWAP(60).
   Close di bawah `L(0.886)` = invalid, sesuai aturan kerasnya.
4. Partisipasi: volume candle absorption `>= 1.0 x` rata-rata 20 candle.
5. Absorption: rasio taker buy `<= 0.40` (delta negatif berat) tetapi `close >= low + 0.45*range`
   (tekanan jual tidak diberi hadiah).
6. Dominance shift + second failure: dalam maksimal 3 candle setelah absorption, muncul candle dengan
   `low > absorption.low` (seller gagal lebih tinggi) dan `close > open` dan `close > absorption.high`
   (flip bullish). Entry pada close candle itu.
7. Stop: `absorption.low - 0.15 * ATR15` — tepat di bawah titik ide terbukti salah.
8. Target: `min(swingHigh, entry + 2R)`.
9. Risk governor tambahan: setelah 2 loss beruntun, tidak ada entry baru sampai hari (Asia/Jakarta)
   berikutnya. Ini mekanisasi aturan "shut off after 2 losses"-nya.

Sisi short: struktur bearish; zona premium `[H(0.705), H(0.886)]` di atas VWAP; rasio taker `>= 0.60`
dengan `close <= low + 0.55*range`; flip bearish `high < absorption.high`, `close < absorption.low`;
stop `absorption.high + 0.15*ATR`; target `max(swingLow, entry - 2R)`.

## Yang TIDAK dilakukan

- Tidak memakai angka kemenangan atau ukuran posisi juara (kompetisi memakai risiko agresif; kita
  tetap `0.25%` per trade — tujuan kita edge, bukan piala).
- Tidak menyalak target/trailing diskresioner; versi backtest memakai target fixed `min(swing, 2R)`.
  Trailing adalah penelitian lanjutan jika fixed target lulus.
- Tidak mencampur playbook ini dengan keluarga Triad yang sudah dipensiunkan.

## Gerbang yang wajib dilalui sebelum paper

Sama dengan candidate lain: full-sample positif setelah biaya dengan PF `>= 1.10`, OOS `>= 30` trade
positif, walk-forward `>= 30` trade positif, dan funnel menunjukkan sample yang bisa dicapai. Satu
playbook lulus di satu symbol saja tidak cukup; harus lintas aset.

## Otak #2 dan #3 (rencana, bukan janji)

- **#2 Larry Williams:** volatility breakout dari titik harga (open/close/average) dengan money
  management bertahap — diuji sebagai hipotesis terpisah, bukan sebagai pelengkap yang menyelamatkan
  playbook #1.
- **#3 Andrea Unger:** portofolio multi-strategi dengan risk-first dan diversifikasi lintas market —
  relevan setelah minimal dua playbook independen lulus, karena diversifikasi tanpa edge individual
  hanya membagi kerugian.

## Hasil full-history (dijalankan setelah spesifikasi, 2026-09-16)

Periode 2025-09-01 → 2026-08-31, sumber arsip resmi Binance, biaya konservatif tidak berubah.
Mentah: `reports/local-research-champion.json`.

| Symbol | Trades | Net P/L | Expectancy | PF | OOS trades | OOS R | WF trades | WF R | Gate |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---|
| BTCUSDT | 25 | -81.89 | -0.131R | 0.71 | 8 | -0.495R | 16 | -0.286R | NOT_READY_SAMPLE |
| ETHUSDT | 24 | -54.97 | -0.091R | 0.82 | 14 | +0.060R | 20 | -0.140R | NOT_READY_SAMPLE |

Funnel (dari 34.960 candle dievaluasi per symbol):

```text
BTC  long : struktur 15.688 (44,9%) -> absorption+zona+partisipasi 74 (0,21%) -> flip 17 (0,05%)
BTC  short: struktur 18.556 (53,1%) -> absorption+zona+partisipasi 98 (0,28%) -> flip 19 (0,05%)
ETH  long : struktur 15.048 -> 57 -> 13
ETH  short: struktur 19.196 -> 68 -> 9
```

### Cara membaca hasilnya

1. **Ini candidate terbaik yang pernah diuji project ini.** Full-sample expectancy `-0.09..-0.13R`
   dan PF `0.71-0.82` jauh di atas keluarga Triad (`-0.18..-0.28R`, PF `0.4-0.7`) dan dua orderbook
   candidate (`-0.4..-1.05R`). OOS ETH bahkan sedikit positif (`+0.06R`).
2. **Tetapi tidak bisa dipromosikan, dan tidak boleh.** Full sample masih negatif, dan OOS `8`/`14`
   trade jauh di bawah minimum 30. Statusnya `NOT_READY_SAMPLE` — sistem dengan benar menolak
   menyimpulkan apa-apa.
3. **Penyebabnya resolusi data, bukan semata aturan.** Playbook juara ini hidup di footprint: delta
   per level harga, absorption yang terlihat tick-by-tick. Candle 15M closed hanya aproksimasi kasar,
   sehingga konfirmasi "sniper" hanya muncul ~0,05% candle. Menaikkan sample dengan melonggarkan
   aturan (misal taker ratio 0.45, atau mengabaikan zona fib) adalah tuning untuk mempercantik metrik —
   dilarang oleh konstitusi project ini.

### Keputusan

- `CHAMPION_ABSORPTION_REVERSION_HYPOTHESIS` tetap **research-only**. Paper/Testnet/live terkunci.
- Jalur yang sah untuk mengujinya lagi (pilih salah satu, masing-masing perubahan terpisah):
  1. **Interval riset 5M** untuk BTC/ETH dari arsip resmi (sample 3x; biaya compute dan storage naik;
     funnel harus diperiksa ulang sebelum conclusions apa pun), atau
  2. **Sumber footprint/orderbook** yang jujur terhadap premis asli (data tick), sebagai fase
     execution-model terpisah sesuai preseden `docs/14` tentang hftbacktest.
- Otak #2 (Larry Williams) dan #3 (Andrea Unger) tetap dalam antrean dengan proses yang sama:
  spesifikasi tertulis dulu, lalu gerbang yang sama. Diversifikasi hanya bernilai jika ada minimal dua
  playbook yang lulus sendirian.

## Addendum 2026-09-17: jalur 5M diuji dan DITOLAK oleh datanya sendiri

Jalur sah #1 dari addendum sebelumnya ("interval riset 5M") sudah dieksekusi penuh:
`--entry=5m --higher=1h`, full-year 2025-09 → 2026-08, kedua symbol, aturan tidak diubah sama
sekali. Artifact: `reports/local-research-champion-5m.json`.

| Sample | BTC 5M | BTC 15M (referensi) | ETH 5M | ETH 15M (referensi) |
| --- | --- | --- | --- | --- |
| full | 38 trade · −0.170R · PF 0.59 | 25 · −0.131R · PF 0.71 | 38 · −0.130R · PF 0.74 | 24 · −0.091R · PF 0.82 |
| OOS 30% | 10 · −0.456R · PF 0.23 | 8 · −0.495R | 13 · −0.185R · PF 0.60 | 14 · +0.060R |
| WF | 26 · −0.395R | 25 · −0.140R | 21 · −0.238R | 20 · −0.140R |

Funnel 5M (dari ~105 ribu candle entry): struktur long 44.81% (BTC) → absorption 0.49% → flip
0.12%; short 53.00% → 0.56% → 0.13%. Materi baku flip naik ~2x lipat dibanding 15M (0.05%) seperti
yang diprediksi addendum — tetapi setiap trade tambahannya justru rugi.

Kesimpulan jujur: resolusi 15M **bukan** alasan playbook ini gagal. Pada 5M, proxy absorption dari
agregat 1-menit menangkap lebih banyak "flip" yang ternyata noise, dan biaya per trade memakan edge
yang tipis. Sample sekarang cukup (38+38 trade, semua gerbang gagal karena ekspektansi negatif,
bukan karena jumlah). Jalur 5M **ditutup**; satu-satunya jalur tersisa untuk premis aslinya adalah
sumber footprint/orderbook tick (jalur #2, fase execution-model terpisah sesuai `docs/14`) — dan itu
hanya layak dikerjakan jika ada alasan baru, bukan untuk menyelamatkan hasil lama.
