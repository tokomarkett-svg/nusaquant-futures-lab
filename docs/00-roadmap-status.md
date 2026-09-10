# NusaQuant Futures Lab — Roadmap dan Status

**Tanggal audit:** 9 September 2026  
**Versi kerja:** 0.2.0  
**Prinsip:** paper trading terlebih dahulu; tidak ada klaim profit dan tidak ada akun real pada MVP.

## Status keseluruhan

| Tahap | Area | Status | Catatan |
|---|---|---:|---|
| 1 | Nama, tujuan, dan batasan produk | SELESAI | NusaQuant Futures Lab |
| 2 | Spesifikasi MVP | SELESAI | `docs/01-spesifikasi-mvp-futures-bot.md` |
| 3 | Repository Git dan struktur monorepo | SELESAI | Branch lokal `main` |
| 4 | Dashboard UI/UX awal | SELESAI | Masih menggunakan data demo |
| 5 | Indikator dasar dan risk calculation | SELESAI | EMA, RSI, ATR, ADX, volume |
| 6 | Intelligence layer | SELESAI SEBAGIAN | Price action, candle, structure, timing sudah ada |
| 7 | Triad doctrine | SELESAI SEBAGIAN | Doktrin v0.1 dan modul intelligence sudah ditulis; kalibrasi statistik masih berjalan |
| 8 | Daily opportunity planner | SELESAI SEBAGIAN | Planner dan status window sudah ada; profile nyata menunggu data backtest |
| 9 | Paper trading state machine | SELESAI SEBAGIAN | Worker, paper broker, restore state, cost accounting, daily-loss guard, dan lifecycle smoke test tersedia |
| 10 | Historical data adapter | SELESAI SEBAGIAN | Parser public Binance klines, backfill, dan worker ingestion tersedia; monitoring production masih berjalan |
| 11 | Backtest dengan fee, funding, spread, slippage | SELESAI SEBAGIAN | Runner cost-aware, temporal OOS, walk-forward, dan gross/net audit tersedia; research gate BTC/ETH masih FAIL |
| 12 | Persistent worker dan market stream | SELESAI SEBAGIAN | REST public klines + polling worker berjalan di Railway; WebSocket belum diperlukan untuk observation MVP |
| 13 | API start/pause/approval | SELESAI SEBAGIAN | Dashboard sudah terhubung ke paper session BTCUSDT/ETHUSDT; production smoke membutuhkan observasi berkelanjutan |
| 14 | Supabase schema dan persistence | SELESAI SEBAGIAN | Schema, RLS, signal/paper persistence, journal, equity snapshot, dan worker restore tersedia |
| 15 | Binance Futures Testnet | BELUM | Tetap dikunci sampai research dan paper gate lulus |
| 16 | Security audit dan recovery | SELESAI SEBAGIAN | API key tetap server-only, emergency stop, stale-data guard, dan restore tersedia; review escalation belum |
| 17 | Vercel deployment | SELESAI | Deployment dashboard berhasil; secret tetap di environment server dan tidak masuk repository |
| 18 | Live trading | TIDAK DIMULAI | Tidak boleh sebelum fase sebelumnya lulus |
| 19 | Komersialisasi | BELUM | Perlu performa teruji, dokumentasi, terms, privacy, risk disclosure, dan review hukum |

## Urutan pembangunan yang disepakati

```text
A. Product doctrine dan risk contract
B. Core data model dan state machine
C. Historical data adapter
D. Backtest dan opportunity statistics
E. Daily market plan / watch windows
F. Paper broker dan dashboard controls
G. Real-time stream worker
H. Binance Futures Testnet adapter
I. Security, observability, and recovery
J. Vercel deployment dan closed beta
K. Live mode hanya setelah approval dan audit
```

## Definisi selesai untuk MVP aman

MVP belum disebut siap jika hanya dapat menampilkan sinyal. MVP aman minimal harus:

- menggunakan candle yang sudah close untuk signal;
- memiliki status `NO_TRADE`;
- memiliki state machine yang dapat dipulihkan setelah restart;
- memiliki risk cap dan daily loss limit;
- memiliki paper broker dengan fee dan slippage simulasi;
- menyimpan alasan keputusan;
- menghitung watch window dari data historis yang cukup;
- tidak mengirim order real;
- memiliki test untuk duplicate order, partial state, stop loss, dan pause;
- lulus typecheck, test, build, dan audit dependency.

## Kontrak keputusan bot

Bot tidak mengeluarkan prediksi pasti. Bot mengeluarkan:

```text
OBSERVE
SETUP
WAIT_CONFIRMATION
ENTRY_READY
NO_TRADE
POSITION_OPEN
EXIT
PAUSED
```

Waktu hanya menjadi prioritas pengamatan. Waktu tidak pernah menjadi alasan tunggal untuk membuka posisi.


## Status riset terbaru — 11 September 2026

- BTCUSDT baseline: gross PF `0.90`, gross expectancy `-0.038R`, net PF `0.48`; research gate `FAIL`.
- ETHUSDT baseline: gross PF `0.99`, gross expectancy `-0.003R`, net PF `0.63`; research gate `FAIL`.
- Kedua OOS slice memiliki 27 trade dan expectancy negatif; status formal tetap `NOT READY` karena sample OOS di bawah 30.
- `TRIAD_TIMING_HYPOTHESIS` dan `TRIAD_RETEST_HYPOTHESIS` tetap research-only dan ditolak.
- Dashboard menunjukkan candle fresh, `NO_TRADE` yang valid, dan tidak ada posisi paper terbuka.
- Smoke test lifecycle paper lokal mencakup approval, open, costed stop, cooldown, restore, dan daily-loss block.

### Langkah setelah ini

1. Pertahankan BTCUSDT dan ETHUSDT dalam observation/research mode.
2. Jangan tuning parameter secara acak dan jangan mempromosikan candidate yang gagal OOS.
3. Kumpulkan data observasi yang lebih panjang sebelum membuat satu hipotesis baru yang telah didefinisikan sebelumnya.
4. Uji hipotesis baru dengan gross/net audit, minimal 30 trade OOS, dan walk-forward sebelum mempertimbangkan paper promotion.
5. Testnet dan live tetap terkunci.
