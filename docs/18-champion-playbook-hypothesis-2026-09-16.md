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
