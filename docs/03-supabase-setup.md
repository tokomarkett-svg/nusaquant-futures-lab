# Supabase Setup

## Status

Supabase repository integration saja belum otomatis menghubungkan aplikasi ke database. Kita tetap perlu membuat project database, menjalankan migration, lalu memasukkan environment variables ke deployment.

## 1. Buat atau pilih project Supabase

Pastikan project berada di akun yang benar. Jangan memakai database production untuk pengujian pertama jika belum ada backup.

## 2. Jalankan migration

Buka:

```text
Supabase Dashboard → SQL Editor → New query
```

Salin isi file berikut dan jalankan:

```text
supabase/migrations/20260909000000_initial_schema.sql
```

Setelah selesai, cek menu **Table Editor**. Tabel minimum yang harus terlihat:

- `bot_sessions`
- `market_candles`
- `market_plans`
- `opportunity_windows`
- `signal_evaluations`
- `paper_orders`
- `paper_positions`
- `trade_journal`
- `equity_snapshots`

## 3. Environment variables

Dari Supabase:

```text
Project Settings → Data API
```

Siapkan nilai berikut di Vercel Environment Variables dan worker hosting:

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
```

`SUPABASE_SERVICE_ROLE_KEY` hanya boleh berada di worker/server. Jangan memakai prefix `NEXT_PUBLIC_` untuk service role key.

## 4. RLS

Migration mengaktifkan Row Level Security.

- Browser memakai user session dan hanya boleh membaca data milik user.
- Worker memakai service-role key di server.
- Market candles boleh dibaca umum karena bukan data rahasia, tetapi insert sebaiknya dilakukan oleh worker.

Jika aplikasi belum memiliki login, jangan membuka policy write publik. Tambahkan Supabase Auth sebelum menyimpan data user.

## 5. Verifikasi

Setelah migration:

1. cek tidak ada error SQL;
2. cek RLS aktif;
3. buat satu user Auth untuk pengujian;
4. masukkan env vars ke Vercel Preview terlebih dahulu;
5. jangan memasukkan API key Binance pada tahap ini;
6. jalankan health check database dari server, bukan dari browser dengan service role.

## 6. Setelah database siap

Urutan implementasi:

```text
DB health check
→ candle ingestion
→ signal persistence
→ paper order persistence
→ start/pause/approve command
→ dashboard reads real paper state
```
