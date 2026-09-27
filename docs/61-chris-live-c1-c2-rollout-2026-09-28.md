# Chris Crypto — implementasi close C2 & status deploy (28 Sep 2026)

**Bukan metode 1:1 MNQ/Nasdaq.** Adaptasi ke USD-M Binance Futures: swing 1H/4H tertutup (tanpa MA), value area rolling 1 jam dari transaksi aggTrades asli, absorption 5m, percobaan kedua gagal, flip delta+harga 5m, C1 = candle 15m yang memuat flip, C2 = **candle 15m tepat berikutnya**. LONG hanya jika C2 **tutup > high C1**; SHORT hanya jika C2 **tutup < low C1**. Sentuh/wick/close sama dengan batas, atau candle yang lebih lambat, batal. Gamma/dealer GEX tidak diketahui (UNKNOWN), **bukan nol**. Target swing minimal 1,5R, harga sekarang harus masih di sisi benar batas dan dekat close C2 (≤0,5R). Umur tiket maksimal 3 × 15 menit setelah C2 close.

Collector membaca `/fapi/v1/aggTrades` paginated + ID berturut; persilangan ID antarcandle dan volume/ekstrem terhadap 5m kline Futures dicek. Jika akses FAPI terganggu, satu halaman hilang, ID putus, atau data beda, rantai dihapus; **tidak** melakukan fallback Spot atau mengarang footprint dari OHLC/mark price. Worker menghangatkan minimum 23 jendela 5m terus-menerus (sekitar 2 jam sejak mulai), dan reset sesudah downtime/gap. Cakupan awal maksimal empat simbol kripto `CHAMPION_SYMBOLS` (default BTCUSDT,ETHUSDT); seluruh pasar lain tetap ada di papan alarm lama. Tidak ada data lama yang di-backfill otomatis untuk alarm.

Worker menghidupkan pemantau baru bersama `RUN_ALERTS=true` dan memakai `PMB_NOTIF=1` yang sama; alarm lama **tetap berjalan**. C1 Telegram menyebut angka batas dan **pantau bukan tiket**. SIAP Telegram baru dikirim bila `/api/chris` Vercel mengembalikan keputusan identik dari snapshot worker yang masih segar. HP: `/hp/siap-chris` menyajikan sumber keputusan yang sama, tidak menghitung ulang via MA. Halaman tidak memberi tombol order metode baru: rute order lama masih memakai PMB; **jangan** menyalurkan sinyal Chris ke order PMB. Order tetap terkunci sampai jalur login/persetujuan per tiket Chris dibangun, mainnet tetap terkunci.

Riset arsip 20–25 Sep BTC/ETH menghasilkan nol kandidat; itu bukan syarat untuk menjalankan rumus tetapi juga **bukan bukti profitabilitas**. Alarm hanya bukti bahwa kondisi terukur terpenuhi, bukan hasil trading.

## Syarat operasional pasca-push

1. Pastikan deploy Vercel & Railway sukses **untuk commit ini**. Uji `/api/chris`, `/hp/siap-chris`, `/data/champion-json`, `/health/runtime` (jangan hanya memeriksa HTTP 200: lihat `rows[].status`, `windows`, `decision`).
2. Periksa Binance Futures aggTrades + exchangeInfo dapat diakses dari **Railway**; akses FAPI dari sandbox lokal bisa HTTP 451 dan tidak membuktikan Railway bisa. Jika status `data Futures ditahan`, jangan bilang alarm baru aktif.
3. Tunggu warmup ≥23 jendela lengkap (~2 jam), tes C1 Telegram pantau dan perbandingannya dengan app, lalu C2 close valid/invalid, harga berbalik, putus data, dan expiry. Tanpa pola nyata tidak ada alarm dan tidak boleh memalsukan kandidat.
4. Periksa alarm lama masih hidup. Jangan membuka order Chris atau mainnet tanpa keputusan eksplisit terpisah.
