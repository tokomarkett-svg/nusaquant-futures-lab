# Bot Controls v0.1

Dashboard sekarang memiliki control session untuk paper mode:

- `Start observation` → status session menjadi `RUNNING`;
- `Pause new entries` → status menjadi `PAUSED`;
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

## Batasan versi ini

- Control ini hanya untuk paper session.
- Belum mengirim order Binance.
- Worker belum membaca command session secara persistent.
- Sebelum live, wajib ditambahkan Supabase Auth, user ownership, audit log, CSRF/origin protection, dan worker command consumer.

Jika service-role key belum ada di Vercel, dashboard akan menampilkan `Bot control API belum siap` dan tombol tidak aktif. Itu kondisi aman.
