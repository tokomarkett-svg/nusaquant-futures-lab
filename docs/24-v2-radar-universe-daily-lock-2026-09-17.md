# v2 — Radar universe, chart hidup, daily profit lock (2026-09-17)

Menjawab visi pengguna: bot **menyimak banyak coin** sekaligus, dashboard **terlihat hidup**
(chart candle + radar), hasil **kecil tapi konsisten**, dan **stop saat target harian tercapai** —
tanpa mengorbankan disiplin bukti.

## 1. Radar universe (observe many, trade few)

- Universe: top 80 perpetual USDT-M menurut volume quote 24 jam, diambil worker saat start
  (`/fapi/v1/ticker/24hr`, stablecoin/pegged/RWA saham dieksklusi). Fallback pra-registrasi:
  `RADAR_UNIVERSE_FALLBACK` (80 simbol) di `services/worker/src/radar.ts`. Override: env
  `RADAR_SYMBOLS`.
- Tiap poll (default 5 menit, env `RADAR_POLL_MS`): worker membaca kline harian per simbol dan
  menghitung regime SMA5/45 harian, range hari sebelumnya, jarak harga ke gate 0.5×range dari
  open hari ini (persis aturan Williams), lalu upsert ke tabel `market_radar`
  (migrasi `20260917000000_market_radar.sql`).
- Dashboard menampilkan radar: regime, jarak ke gate searah regime, dan badge MENYALA bila gate
  sudah tertembus hari ini. **Radar hanya mengamati.** Eksekusi tetap hanya untuk playbook yang
  lulus gerbang riset (`docs/11/14/19`); radar tidak mengirim order.
- Ini memisahkan dua hal yang pengguna minta: "nyimak semua" (radar) vs "trading bukan asal-asalan"
  (gerbang riset).

## 2. Chart candle di dashboard

Komponen `CandleChart` membaca `market_candles` (15m/1h) dari Supabase, render SVG inline,
refresh 60 detik. Murni tampilan; tidak memengaruhi keputusan.

## 3. Daily profit lock ("tercapai, stop, besok lagi")

- Engine: `dailyProfitLockUsdt` (env worker `DAILY_PROFIT_LOCK_USDT`, USDT). Bila P/L terealisasi
  harian ≥ lock, entry baru diblokir sampai ganti hari (posisi terbuka tetap dipantau; SL/TP jalan).
- Ini governor risiko sesuai selera pengguna, BUKAN tuning sinyal. Konsekuensi yang diakui:
  statistik paper akan mencakup governor ini; vonis paper berlaku untuk paket
  (aturan + governor), dan itu konsisten.
- Batas rugi harian tetap ada (session `daily_loss_limit`, default 1%; bisa diperketat via SQL
  per sesi — disarankan 0.005 untuk selera "rugi kecil").

## 4. Rencana sweep universe (batch riset)

- Setelah radar hidup, sweep riset Williams dijalankan pada universe yang sama (batch ±10-15
  simbol per sesi kerja), periode 2021-01 → 2026-08, gerbang sama, semua hasil dilaporkan
  (preseden `docs/22`). Yang lulus menambah sesi paper; yang gagal dikunci.
- Catatan statistik: semakin banyak pengujian simultan, semakin penting fase paper sebagai hakim
  akhir; tidak ada penyesuaian parameter pasca-hasil.

## 5. Ekspektasi "100rb/hari" — kontrak kejujuran

- Tidak ada strategi yang hijau setiap hari. Yang valid: rata-rata bulanan positif dengan varians
  yang mengecil seiring jumlah coin lulus bertambah (diversifikasi).
- Pada equity 10k USDT & risk 0.25%/trade, 1 coin lulus ≈ +2 USDT/trade ≈ 6-7 trade/bulan.
  Rata-rata ±100rb IDR/hari butuh ±10-15 coin lulus — maka sweep universe besar adalah inti
  roadmap, bukan aksesori. Hari merah tetap ada; konsistensi dinilai mingguan/bulanan.
