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
| 9 | Paper trading state machine | SELESAI SEBAGIAN | Worker dan paper broker lokal sudah ada; belum terhubung stream/API |
| 10 | Historical data adapter | SELESAI SEBAGIAN | Parser public Binance klines tersedia; dataset persistence belum ada |
| 11 | Backtest dengan fee, funding, spread, slippage | SELESAI SEBAGIAN | Core runner dan cost model tersedia; perlu dataset nyata dan walk-forward |
| 12 | Persistent worker dan market stream | SELESAI SEBAGIAN | REST public klines + polling adapter tersedia; persistent service/WebSocket belum |
| 13 | API start/pause/approval | BELUM | Worker state machine lokal sudah ada; dashboard belum terhubung |
| 14 | Supabase schema dan persistence | SELESAI SEBAGIAN | Migration, RLS, dan setup doc sudah dibuat; client adapter dan Auth belum |
| 15 | Binance Futures Testnet | BELUM | Hanya setelah paper engine stabil |
| 16 | Security audit dan recovery | BELUM | API key, idempotency, reconnect, emergency stop |
| 17 | Vercel deployment | SIAP DIIMPOR | Memerlukan konfigurasi project Vercel; secret tidak boleh masuk repo |
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
