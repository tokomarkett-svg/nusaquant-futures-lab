# Bot Controls v0.1

Dashboard sekarang memiliki control session untuk paper mode pada BTCUSDT dan ETHUSDT:

- `Start observation` → status session menjadi `RUNNING`;
- `Pause new entries` → status menjadi `PAUSED`;
- `Approve paper entry` → status sementara menjadi `POSITION_OPEN`; worker hanya membuka paper position jika memang ada signal yang sedang menunggu approval;
- `Emergency stop` → status menjadi `EMERGENCY`.

Endpoint:

```text
GET  /api/bot/session
POST /api/bot/session
```

## Environment tambahan di Vercel

Endpoint control server memakai service-role key untuk membuat dan memperbarui satu paper session. Tambahkan environment variable berikut hanya pada Vercel server project `web`:

```env
SUPABASE_SERVICE_ROLE_KEY=
```

Jangan gunakan prefix `NEXT_PUBLIC_`. Key ini tidak boleh tampil di browser, GitHub, atau chat.

## Alur worker

Railway worker menjalankan control consumer setiap beberapa detik untuk dua session terpisah: BTCUSDT dan ETHUSDT. Saat session `RUNNING`, worker membaca candle closed terbaru dari `market_candles` untuk `1h` dan `15m`, menjalankan intelligence engine, lalu menyimpan hasil audit ke `signal_evaluations`. Satu evaluasi hanya dibuat untuk candle `15m` terbaru selama proses worker tersebut berjalan.

Jika hasil memasuki tahap `WAITING_APPROVAL`, worker memperbarui session dan dashboard menampilkan `Approve paper entry`. Approval hanya diterima jika engine memang memiliki signal valid yang menunggu persetujuan.

## Backtest gate

Dashboard memiliki `Backtest gate` untuk BTCUSDT dan ETHUSDT. Backtest membaca candle Supabase, memakai fee, slippage, funding, risk fraction, dan asumsi konservatif saat stop serta target tersentuh pada candle yang sama. Hasil hanya laporan penelitian; tidak mengubah paper session dan tidak mengirim order.

Untuk memperbesar sample sebelum mengambil keputusan, worker menyediakan one-time historical backfill:

```bash
npm run ingest:backfill --workspace @nusaquant/worker
```

Gunakan `BACKFILL_DAYS` (default 365, maksimum 730) dan jalankan sebagai job satu kali, bukan loop permanen. Setelah selesai, kembalikan worker ke `ingest:watch`. Backfill lebih panjang diperlukan agar full-history research tidak hanya mewakili sekitar 90 hari terakhir.

Untuk historical research yang lebih dapat dipertanggungjawabkan, gunakan `npm run research:backfill` dari workspace worker. Script ini mengambil bulk public USD-M futures klines dari `data.binance.vision`, bukan private API, dan menyimpan dengan `source=BINANCE_BULK_ARCHIVE`. Atur `RESEARCH_ARCHIVE_START`, `RESEARCH_ARCHIVE_END`, `RESEARCH_ARCHIVE_SYMBOLS`, dan `RESEARCH_ARCHIVE_INTERVALS`; jalankan sebagai one-shot job, jangan aktifkan di watch loop.

## Batasan versi ini

- Control dan execution hanya untuk paper session.
- Belum mengirim order Binance.
- Paper signal, paper order, paper position, journal, dan equity snapshot sekarang dipersistenkan melalui worker service-role; posisi terbuka dipulihkan saat worker restart.
- Sebelum live, wajib ditambahkan Supabase Auth, user ownership, audit log, CSRF/origin protection, durable command queue, dan rekonsiliasi position state yang lebih ketat.

Jika service-role key belum ada di Vercel, dashboard akan menampilkan `Bot control API belum siap` dan tombol tidak aktif. Itu kondisi aman.
