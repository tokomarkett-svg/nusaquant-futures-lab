# NusaQuant Futures Lab

NusaQuant Futures Lab adalah proyek riset dan pengembangan platform analisis serta paper trading untuk Binance USDⓈ-M Futures.

> Proyek ini bersifat edukasi dan riset. Tidak ada jaminan profit. Mode awal adalah paper trading; koneksi ke akun real tidak termasuk dalam MVP.

## Tujuan MVP

- Memvalidasi data market.
- Mengklasifikasikan kondisi market.
- Menghasilkan keputusan LONG, SHORT, atau NO_TRADE.
- Menghitung stop loss dan ukuran posisi berbasis risiko.
- Menjalankan paper trading.
- Mencatat sinyal, posisi, P/L, biaya, dan error.

## Arsitektur Awal

```text
apps/web       Dashboard Next.js dan API ringan
packages/core  Indikator, signal engine, risk engine, dan tipe data
services/worker Paper trading worker dan position manager
```

## Status

Tahap 1: spesifikasi MVP — selesai  
Tahap 2: repository dan struktur proyek — selesai  
Tahap 3: intelligence layer, opportunity planner, dan paper worker — fondasi selesai  
Tahap 4: public market adapter dan cost-aware backtest — fondasi selesai  
Tahap 5: Supabase health check dan candle ingestion adapter — fondasi selesai  
Tahap 6: persistent stream, API controls, dan dataset nyata — berikutnya

## Konfigurasi Awal

- Pair: BTCUSDT dan ETHUSDT
- Tren: timeframe 1H
- Entry: timeframe 15M
- Strategi: trend-following pullback
- Mode: paper trading
- Risiko awal simulasi: 0,25% per transaksi

## Keamanan

- Jangan memasukkan `.env` ke Git.
- Jangan menyimpan API secret di frontend, log, atau repository.
- Binance Testnet harus digunakan sebelum akun real.
- Withdrawal permission API harus dinonaktifkan.

Dokumen spesifikasi lengkap berada di `docs/01-spesifikasi-mvp-futures-bot.md`.
