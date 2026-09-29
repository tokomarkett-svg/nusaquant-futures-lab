# Pengaturan Database (dulu: Supabase Setup)

> **Dokumen ini sudah tidak berlaku.** NusaQuant tidak lagi memakai Supabase.
> Database sekarang adalah **SQLite lokal** — satu file, tanpa akun cloud, tanpa kredensial.
> Lihat panduan lengkap: [`MIGRASI-SQLITE.md`](../MIGRASI-SQLITE.md).

## Yang menggantikan langkah Supabase lama

| Dulu (Supabase) | Sekarang (SQLite) |
|---|---|
| Buat project di dashboard Supabase | Tidak perlu — file dibuat otomatis |
| Jalankan migration SQL di SQL Editor | Skema dibuat otomatis saat aplikasi pertama berjalan (`packages/db/src/schema.sql`) |
| `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` | `SQLITE_PATH=./data/nusaquant.db` (opsional; ini default-nya) |
| Supabase Auth (magic link / OTP) | Auth operator lokal: `OPERATOR_PASSWORD_HASH` + `OPERATOR_SESSION_SECRET` |
| Backup via dashboard | Salin file `nusaquant.db`, `nusaquant.db-wal`, `nusaquant.db-shm` |

Folder `supabase/migrations/` dipertahankan sebagai arsip referensi skema Postgres lama.

## Membuat hash kata sandi operator

```bash
npm run hash-password --workspace @nusaquant/db
```

Tempel hasilnya ke `OPERATOR_PASSWORD_HASH`. Jangan menaruh kata sandi mentah di file mana pun.
