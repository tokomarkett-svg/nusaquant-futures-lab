# Bot Controls v0.1

Dashboard sekarang memiliki control session untuk paper mode:

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

Railway worker menjalankan control consumer setiap beberapa detik. Saat session `RUNNING`, worker membaca candle closed terbaru dari `market_candles` untuk `1h` dan `15m`, menjalankan intelligence engine, lalu menyimpan hasil audit ke `signal_evaluations`. Satu evaluasi hanya dibuat untuk candle `15m` terbaru selama proses worker tersebut berjalan.

Jika hasil memasuki tahap `WAITING_APPROVAL`, worker memperbarui session dan dashboard menampilkan `Approve paper entry`. Approval hanya diterima jika engine memang memiliki signal valid yang menunggu persetujuan.

## Batasan versi ini

- Control dan execution hanya untuk paper session.
- Belum mengirim order Binance.
- Paper signal, paper order, paper position, journal, dan equity snapshot sekarang dipersistenkan melalui worker service-role; posisi terbuka dipulihkan saat worker restart.
- Sebelum live, wajib ditambahkan Supabase Auth, user ownership, audit log, CSRF/origin protection, durable command queue, dan rekonsiliasi position state yang lebih ketat.

Jika service-role key belum ada di Vercel, dashboard akan menampilkan `Bot control API belum siap` dan tombol tidak aktif. Itu kondisi aman.
