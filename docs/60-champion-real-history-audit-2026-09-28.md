# Audit metode Chris tanpa MA — transaksi riil BTC/ETH Futures, 20–25 Sep 2026 UTC

**Status: rumus terimplementasi dalam core bot dan halaman HP → Riset; masih research-only, BUKAN alarm Siap atau order.** Telegram yang ada masih memakai rumus Pintu–C1–C2 lama sesuai pilihan pemilik. Jangan menyamakan deploy kode penelitian dengan strategi terbukti menguntungkan.

## Jalur data dan verifikasi

- `tools/champion_archive_windows.py`: unduh arsip aggTrades USD-M publik Binance + SHA256 resmi (fungsi `download_verified`), cek 288 jendela 5 menit/hari tanpa gap ID, timestamp urut, sisi agresor valid, data tak terpotong. Tulis `.jsonl.gz` dan metadata checksum baru **hanya setelah satu hari penuh lolos**. File besar di `.cache/`, bukan repo atau Railway.
- `services/worker/src/champion-history-replay.ts`: validasi checksum hasil konversi dan 288 windows/hari, bangun footprint dari core yang sama, gabung profil sesi UTC sebelumnya dari transaksi per harga, konstruksi candle 1H/4H dari 5m lengkap, lalu evaluasi tiap 5m hanya dengan bukti yang telah tertutup sebelum keputusan. Laporan JSON kecil disimpan di `reports/local-research-champion-footprint-*.json`.
- `packages/core/src/champion-context.ts` dan `champion-sequence.ts`: struktur swing HH/HL atau LH/LL **tanpa MA**, discount/premium di luar value area, partisipasi, absorption, retest gagal, flip delta+harga, stop/target struktural. Kandidat maksimal `KANDIDAT_RISET`, `ready:false`.
- `/hp/riset`: halaman aplikasi untuk melihat penjelasan rumus dan hasil riset bertanggal, **bukan radar live**, bukan daftar tiket SIAP Telegram.

### Hasil sumber data asli

| USD-M | Trades terverifikasi SHA256 | Jendela 5m | Urutan dengan konteks cukup | Tertahan konteks | Tertahan lokasi | Kandidat |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| BTCUSDT | 9.301.347 | 1.728 | 574 | 562 | 12 | **0** |
| ETHUSDT | 8.968.988 | 1.728 | 574 | 538 | 36 | **0** |

Dari 864 jendela awal per aset, 4H belum memiliki dua swing terkonfirmasi yang cukup sebagai konteks. Angka `tertahan konteks`+`tertahan lokasi` = 574. Jangan mengartikan "nol kandidat" sebagai untung, aman, atau strategi buruk; **belum ada observasi trade untuk menghitung profit factor, expectancy, atau OOS**. Studi proxy candle sebelumnya (`docs/18`) sudah negatif dan tidak diganti dengan klaim baru.

Batas penting: arsip 6 hari ini tidak cukup untuk menguji edge; GEX bertanda posisi dealer seperti pada strategi NQ/QQQ tidak tersedia begitu saja untuk 727 ticker kripto; volume profile sesi UTC adalah **pilihan translasi untuk pasar 24/7**, bukan copy sesi New York. Backtest yang layak butuh rentang jauh lebih panjang, lebih dari satu rezim, biaya/latency, stop-first, OOS/walk-forward, dan data opsi yang sungguh relevan. Tidak melonggarkan aturan pascahasil demi memperbanyak sinyal (menghindari curve fitting).

## Reproduksi (baca-saja; arsip bisa sangat besar)

```bash
# Untuk setiap hari 20 s.d. 25 dan BTCUSDT/ETHUSDT:
python3 tools/champion_archive_windows.py --symbol BTCUSDT --date 2026-09-25 --max-rows 250000
node --import tsx services/worker/src/champion-history-replay.ts .cache/champion-archive BTCUSDT 2026-09-20 2026-09-25 0.1
node --import tsx services/worker/src/champion-history-replay.ts .cache/champion-archive ETHUSDT 2026-09-20 2026-09-25 0.01
python3 -m unittest discover -s tools -p 'test_champion_archive*.py' -v
```

Tick size contoh BTC 0,1 dan ETH 0,01 pada arsip tersebut; verifikasi aturan exchange untuk tanggal/simbol lain. Bila ada jendela yang memuat >250.000 aggTrades, penelitian berhenti (bukan dipotong untuk menghasilkan sinyal palsu).

## Keputusan tetap

Rumus sudah **masuk kode core bot dan Papan aplikasi sebagai penelitian**, tetapi **BELUM** di loop alarm worker. Pintu/C1/C2 lama tetap produksi sementara. Promosi menunggu data + evaluasi yang cukup dan keputusan aktivasi baru; tidak ada order yang dibuat dalam riset ini.
