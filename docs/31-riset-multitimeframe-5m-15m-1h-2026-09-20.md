# Riset Multi-Timeframe 5m–15m–1H ("Jalur Cepat") — 2026-09-20

Permintaan murid: sinyal lebih cepat; pelajari referensi trader ternama soal tangga 5m/15m/1H (GitHub & sumber lain). Status: EDUKASI / PAPER saja.

## 1. Alexander Elder — Triple Screen (buku *Trading for a Living*, 1993)

- Tiga "layar" dengan rasio ±4–5× antar timeframe: layar 1 = trend (tide), layar 2 = koreksi/taktis, layar 3 = eksekusi presisi.
- Edisi yang disebut eksplisit: swing = weekly/daily/intraday; day trader = daily/4H/15m; **scalper = 4H/1H/5m**. Adaptasi kita: **1H (trend) → 15m (zona) → 5m (trigger)** = rasio ±4× dan ±3×, sejalan prinsip Elder.
- Layar 3: entry hanya setelah price action memvalidasi ("the market must come to you") — sama dengan aturan candle 1 + candle 2 kita.
- Realita frekuensi (penting untuk ekspektasi): "Typical 1–2 weeks between valid setups per instrument… scan 20–30 instruments… **3–5 setups per week across broad watchlist is normal**. Less trading activity but higher quality is the system's trade-off."
- Sumber: [dailyforex](https://www.dailyforex.com/forex-articles/2020/09/elder-triple-screen-system/151378), [takeprofitapp](https://takeprofitapp.com/en/learn/triple-screen-trading-system), [atas.net](https://atas.net/blog/multiple-time-frames-how-to-use-them-in-your-trading/), [blueberrymarkets](https://blueberrymarkets.com/market-analysis/mastering-the-triple-screen-trading-strategy/)

## 2. ICT / Smart Money Concepts (Michael Huddleston)

- Bias & zona dari HTF (1H/15m demand/order block), konfirmasi entry dari LTF (15m/5m) lewat **Change of Character (CHoCH)** = "flip" — keluarga yang SAMA dengan candle 1 (sweep/absorption) + candle 2 (struktur patah ke arah kita) yang kita pakai.
- Entry setelah sweep dengan stop di bawah sweep low; SMT/eksekusi "15-minute is the highest I would go; 5-minute and 3-minute are sharper".
- **Continuation Entry Model**: saat trend kuat/parabolik dan harga tidak kembali ke zona HTF, pro masuk dari zona demand BARU di LTF setelah break of structure — jawaban untuk pasar yang "tidak pernah turun ke zona kita".
- Sumber: [completetradersedge](https://completetradersedge.com/liquidity-ict-concepts-smart-money/), [gist.ly SMC continuation](https://gist.ly/youtube-summarizer/mastering-smart-money-concepts-continuation-entry-strategy), [innercircletrader.net SMT](https://innercircletrader.net/tutorials/ict-smt-divergence-smart-money-technique/)

## 3. GitHub / open source

- EA MTF SMC: HTF H4/H1 = trend, M15/M5 = zona premium/discount, M1 = trigger; risk fixed 1% — arsitektur sama dengan tangga kita. [SiyabongaDlamini/SmartMoney.MQ5](https://github.com/SiyabongaDlamini/SmartMoney.MQ5)
- Indikator SMC MT5 multi-timeframe + alert + risk management. [lesleyjj SMCIndicator](https://lesleyjj.github.io/SMCIndicator-public/)
- Port Python LuxAlgo SMC (struktur, BOS/CHoCH, order block) + ranking universe jarak ke order block. [makeitcount89/Trading-Smart-Money](https://github.com/makeitcount89/Trading-Smart-Money)

## 4. Adaptasi kita — SISTEM B "Jalur Cepat" (PAPER ONLY)

| Layar | TF | Tugas |
|---|---|---|
| 1 | 1H | Gate trend: harga > MA99 & MA25 > MA99 |
| 2 | 15m | Zona: kaki swing low→swing high terakhir yang **range ≥ 3%** (filter noise); fib 0.705/0.786/0.886 |
| 3 | 5m | Trigger: candle 1 (wick bawah panjang, close paruh atas) + candle 2 (close di atas puncak 1) → entry di close candle 2 |

- Stop = bawah wick candle 1 (5m). Target = 2R. Risiko 1% per trade. Max 2 trade/hari. 2 loss beruntun = mati lampu. Jurnal wajib.
- Kalau harga bikin high 15m baru → kaki diukur ulang (zona ikut naik = gaya continuation).
- Sistem A (4H/1H-zona/15m-trigger) tetap sistem utama; Sistem B = lab latihan memperbanyak jam terbang.
- Trade-off jujur: sinyal lebih sering, tapi noise lebih banyak, kualitas per trade lebih rendah, butuh waktu layar lebih banyak.

## 5. Aturan LANTAI & ATAP (ide murid, 20/9, diverifikasi pelatih)

Murid menggambar zona long (lantai) dan zona short (atap) sekaligus di coin yang sama dan menyimpulkan: zona lawan = tempat hati-hati. Diverifikasi & dirapikan:

- Zona lawan BUKAN stop loss. Stop loss tetap: wick candle 1 sisi sendiri + garis batal sisi sendiri.
- Zona lawan = area TAKE PROFIT / waspada:
  - Long: target = mana yang lebih dulu: 2R ATAU zona short (pintu–manis). Kalau 2R jatuh sebelum zona short → ambil 2R. Kalau 2R melewati zona short → TP di zona short (atau setengah di manis, sisa 2R dengan stop diketatkan).
  - Short: cermin persis (target = 2R atau zona long).
- Harga di antara dua zona = koridor netral: tidak ada entry baru; alarm di dua pintu.
- Gate tetap penentu arah: hijau → eksekusi hanya sisi long; zona short hanya jadi peta target.

## 7. Insiden live pertama (20/9 ~12:00 WIB)

Murid membuka SHORT ONT SUNGGUHAN di 0.05470 (candle 2-short 15m valid 11:45) meski (a) kesepakatan paper-only sampai lulus 20 trade dan (b) gate 1H HIJAU (lawan trend). Teknik eksekusi benar; disiplin dilanggar 2x. Keputusan pelatih: tutup posisi di market segera (profit kecil ±0.14) karena posisi off-plan; untung dari trade di luar rencana = racun psikologi (mengajarkan otak bahwa melanggar aturan diberi hadiah). Setelah itu: WAJIB mode demo sampai lulus 20 trade terjurnal. Pintu demo Binance: halaman futures → menu → "Demo Trading".

## 8. ANCHOR RESMI SISTEM B: High/Low 24 jam (ide murid, 20/9, disahkan pelatih)

Murid mengusulkan memakai "High 24 jam / Low 24 jam" yang tertera di header Binance sebagai anchor zona. Disahkan dengan 3 pagar:
1. **Range ≥ 3%** dari harga (kalau kurang = hari terlalu sepi → zona tidak sah, skip atau pakai anchor swing).
2. **Gambar sekali per sesi**; gambar ulang HANYA kalau harga memecah anchor (high/low baru) — zona bukan tato, tapi juga bukan baling-baling.
3. Gate & trigger tidak berubah. Sistem A tetap pakai anchor kampanye (swing 2-2 di 1H).

Rutinitas harian: buka coin → baca High/Low 24 jam → hitung pintu/manis/batal → cek ≥3% → pasang alarm di pintu → tunggu.

Contoh live 20/9 sore: RUNE high 0.65 / low 0.598 (range 8.4%) → pintu 0.6133 / manis 0.6091 / batal 0.6039.

## 9. Angka latihan RUNE (18–20/9)

- Gate 1H: HIJAU.
- Kaki 15m (range ≥3%): L=0.479 → H=0.545 → pintu 0.4985 / manis 0.4931 / batal 0.4865.
- Alarm bell di 0.4985; setelah bunyi → buka 5m → cari candle 1 & 2.
