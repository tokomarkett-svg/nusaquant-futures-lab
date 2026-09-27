# Fase lanjutan riset Chris — data nyata dan urutan tanpa MA

> **Catatan pembaruan:** pipeline multi-hari dari transaksi riil sekarang sudah dijalankan. Hasil terbaru dan status promosi ada di `docs/60-champion-real-history-audit-2026-09-28.md`. Bagian "belum terhubung" di bawah menggambarkan status fase sebelumnya.

28 Sep 2026 WIB. **Belum siap mengganti Telegram.** Keputusan pemilik tetap: alarm PMB lama boleh aktif sampai metode video terbukti dan siap; riset baru tidak boleh kirim alarm/order. Metode Chris berasal dari MNQ/NQ; translasi ke Binance Futures memerlukan validasi independen dan GEX ala QQQ/NDX tidak boleh diklaim tersedia untuk altcoin.

## Progres terverifikasi sekarang

1. `tools/champion_archive_probe.py` mengambil arsip aggTrades **USD-M Futures resmi Binance** dan berkas `.CHECKSUM`, memeriksa SHA256, seluruh hari CSV, urutan ID tanpa gap, timestamp, sisi taker dan kecukupan hari. Hanya mengekspor window 5/15 menit bila *seluruh* hari lolos. Arsip mentah dan ekspor di `.cache/champion-archive/`, tidak di-commit.
2. `services/worker/src/champion-archive-evaluate.ts` meneruskan transaksi nyata ke fungsi core *yang sama* dengan prototipe read-only untuk menghitung volume per harga, POC, value area, delta buy/sell. Ini bukan generator Siap.
3. `packages/core/src/champion-context.ts`: mendeteksi HH/HL atau LH/LL dari pivot **candle tertutup 1H/4H** dan swing candle 5m tanpa MA; data future, gap, basi dan warmup kurang ditolak.
4. `packages/core/src/champion-sequence.ts`: urutan fase **konteks → discount/premium di luar value area & pita 0,705–0,886 → absorption → percobaan kedua gagal → delta+harga flip → stop di balik ekstrem → target swing/2R**. Data profil Futures, 20 window partisipasi, waktu dan simbol harus cocok. Bahkan bila lolos, hasilnya `KANDIDAT_RISET` dengan `ready:false`, GEX=`UNKNOWN` — **bukan alarm SIAP**.
5. Tes sintetik LONG dan SHORT, sisi taker, validasi sumber & lookahead, geometri stop/target, skenario salah konteks/flow/data, serta tiga tes parser arsip tanpa jaringan.

### Bukti data riil (bukan hasil trading)

Sampel **BTCUSDT Futures 25 Sep 2026 UTC**: arsip harian SHA256 cocok; **1.253.069** aggTrades dicek, **0 gap ID**. Window `12:00–12:05 UTC` berisi **4.905** transaksi. Hasil core: POC **84.610,0**, value area **84.533,4–84.620,7**, taker-buy **316,014 BTC**, taker-sell **326,162 BTC**, delta **−10,148 BTC**, close **84.613,1** (*di dalam* value area, bukan discount/premium). Ini **tidak** menyatakan LONG atau SHORT; satu window saja belum memenuhi lingkungan, setup, retest, flip, GEX dan uji hasil.

Reproduksi lokal (tidak menggunakan kunci API / order; unduhan mentah ±15 MB):

```bash
python3 tools/champion_archive_probe.py --symbol BTCUSDT --date 2026-09-25 --start-utc 2026-09-25T12:00:00Z --minutes 5 --output .cache/champion-archive/BTCUSDT-2026-09-25T1200.json
node --import tsx services/worker/src/champion-archive-evaluate.ts .cache/champion-archive/BTCUSDT-2026-09-25T1200.json 0.1
python3 -m unittest discover -s tools -p 'test_champion_archive_probe.py' -v
```

Tick size `0.1` adalah parameter contoh BTC pada arsip ini; untuk tiap simbol/tanggal harus dipastikan dari aturan exchange historis. Unduhan arsip cukup besar dan **bukan** bagian dari deployment Railway.

## Mengapa belum bisa disebut selesai / dipakai live

- Kode urutan telah dites sintetik, **belum dijalankan sebagai backtest historis penuh berbasis profil per window**. Berkas `docs/18` mencatat proxy candle lama negatif pada BTC/ETH di 15m dan 5m. Menyalakan Telegram sekarang akan menyesatkan.
- Fungsi konteks terukur ada, tetapi pipeline multi-hari untuk menyediakan profil sesi terdahulu, 20 jendela partisipasi dan sequence per timestamp **belum terhubung**. Penelitian real-data di atas hanya membuktikan ingest + profil satu window.
- Tidak ada signed dealer GEX yang setara QQQ/NDX untuk seluruh pasar koin. Opsi BTC/ETH saja tidak mewakili altcoin; jangan menyulap open interest × gamma menjadi arah tanpa asumsi yang diuji.
- Tahap berikutnya: audit ketersediaan arsip & tick size lintas tanggal/aset, runner historis multi-hari berbasis fungsi core ini, evaluasi OOS/walk-forward setelah biaya, log keputusan dan data hilang; jika berhasil, preview terpisah dulu. **Aktivasi Telegram pengganti memerlukan keputusan baru.**
