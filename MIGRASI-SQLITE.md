# Migrasi NusaQuant: Supabase → SQLite Lokal

Panduan sederhana untuk orang awam. Tidak ada istilah teknis yang tidak dijelaskan.

## Intinya apa?

Dulu NusaQuant menyimpan data di **Supabase** — database di internet (cloud) yang butuh akun, API key, dan kuota bulanan. Kuotanya habis, layanannya tidak bisa dipakai lagi.

Sekarang datanya disimpan di **SQLite** — database berupa **satu file di komputer/server sendiri**. Tidak perlu akun, tidak perlu internet khusus, tidak ada kuota.

> Analogi: dulu menyewa gudang di kota lain (Supabase), sekarang gudangnya ada di rumah sendiri (SQLite).

## File database

- Lokasi diatur lewat `SQLITE_PATH`. Kalau tidak diisi, default-nya `./data/nusaquant.db` (folder `data` di tempat aplikasi dijalankan).
- Folder induk dibuat otomatis kalau belum ada.
- Skema (struktur tabel) dibuat otomatis saat aplikasi pertama kali jalan — diambil dari `packages/db/src/schema.sql`.
- **Mode tulis cepat (WAL) aktif**, jadi web dan worker bisa membaca/menulis bersamaan.

## Cara backup (penting!)

Berhentikan dulu web & worker, lalu salin 3 file ini ke tempat aman:

```
data/nusaquant.db
data/nusaquant.db-wal
data/nusaquant.db-shm
```

Untuk restore: berhentikan aplikasi, salin kembali ketiga file, jalankan lagi.

## Login operator (pengganti Supabase Auth)

Dulu login pakai Supabase Auth (magic link email). Sekarang pakai **kata sandi operator** yang hash-nya disimpan di server.

Dua environment variable yang wajib diisi (di server/Vercel, JANGAN di-commit):

| Variable | Isi |
|---|---|
| `OPERATOR_PASSWORD_HASH` | Hash kata sandi, format `$scrypt$N=16384,r=8,p=1$<salt>$<hash>` |
| `OPERATOR_SESSION_SECRET` | String acak, minimal 16 karakter |

### Membuat hash kata sandi

```bash
npm run hash-password --workspace @nusaquant/db
```

Masukkan kata sandi saat diminta, lalu tempel hasilnya ke `OPERATOR_PASSWORD_HASH`.
**Jangan pernah** menaruh kata sandi mentah di file, chat, atau GitHub.

### Membuat session secret

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### Cara kerja login (ringkas)

1. Operator memasukkan kata sandi di halaman persetujuan.
2. Server mencocokkan dengan hash (scrypt). Salah → ditolak.
3. Benar → server memberi **cookie sesi** (`nq_operator`, `httpOnly`, `SameSite=Lax`, 12 jam).
4. Kalau env auth belum diisi lengkap, semua endpoint sensitif **menolak total (fail closed)** — tidak ada jalan pintas.
5. Aksi sensitif (demo/testnet) juga dicek **same-origin**: hanya boleh dari halaman web sendiri, bukan situs lain.

## Menjalankan

```bash
npm install

# 1) Worker (pindai pasar, paper trading, Telegram)
SQLITE_PATH=./data/nusaquant.db npm run dev --workspace @nusaquant/worker

# 2) Web (dashboard)
SQLITE_PATH=./data/nusaquant.db \
OPERATOR_PASSWORD_HASH='<hash dari langkah di atas>' \
OPERATOR_SESSION_SECRET='<secret acak>' \
npm run dev --workspace @nusaquant/web
```

Web dan worker **harus menunjuk ke file database yang sama** supaya datanya sinkron.

## Tabel yang dimigrasikan

| Tabel | Isi |
|---|---|
| `bot_sessions` | Sesi bot (status, mode, simbol, risk) |
| `market_candles` | Arsip candle Binance |
| `signal_evaluations` | Hasil evaluasi sinyal |
| `paper_orders` | Order paper (simulasi) |
| `paper_positions` | Posisi paper terbuka/tertutup |
| `trade_journal` | Jurnal semua aksi |
| `equity_snapshots` | Snapshot ekuitas berkala |
| `research_backtest_jobs` | Antrean riset backtest |
| `market_derivatives` | Funding rate & open interest |
| `market_metrics` | Metrik long/short ratio |
| `market_radar` | Radar pasar per simbol |
| `manual_execution_approvals` | Persetujuan eksekusi manual/demo |

Dua tabel arsip lama **tidak dibawa** karena tidak dipakai kode mana pun: `market_plans` dan `opportunity_windows`.

## Feed hanya kripto futures USDT

Seluruh jalur data (worker proxy `/data/tickers`, `/data/prices`, radar, tiket manual, alert-check) sekarang memakai satu filter terpusat: `isCryptoFuturesUsdtSymbol`.

Yang **ditolak**: XAU, XAG, SOXL, NVDA, TSLA, saham/ETF lain, dan simbol non-kripto apa pun — walau namanya berakhiran `USDT`.

## Live trading: TETAP TERKUNCI

- Route `/api/meja/live` mengembalikan **HTTP 423** (terkunci).
- Tidak ada kredensial mainnet di kode mana pun.
- Hanya pemilik yang boleh memutuskan membuka kunci ini nanti, lewat review kode terpisah.

## Rollback (kembali ke Supabase)

1. Checkout kode sebelum migrasi: `git checkout main` (atau commit sebelum branch ini).
2. Isi kembali env `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY`.
3. Data yang sudah masuk SQLite tidak otomatis pindah — ekspor manual bila perlu.

## Yang jangan dilakukan dulu

- **Jangan hapus project Supabase / akun Railway** sebelum sistem SQLite ini stabil di server baru (Oracle VPS masih menunggu).
- Jangan mengaktifkan `DEMO_EXECUTION_ENABLED=1` sebelum auth operator dan checklist kesiapan lolos.
- Jangan meng-commit file `.db` ke GitHub.

## File penting migrasi ini

- `packages/db/src/schema.sql` — struktur tabel SQLite
- `packages/db/src/schema-embed.ts` — skema yang ikut terbundel Next.js (dibuat otomatis; jangan edit manual — jalankan `npm run embed-schema --workspace @nusaquant/db` setelah mengubah `schema.sql`)
- `packages/db/src/index.ts` — API database
- `packages/db/src/hash-password.ts` — pembuat hash kata sandi operator
- `apps/web/lib/operator.ts` — auth operator + cookie sesi
- `apps/web/lib/webdb.ts` — koneksi database untuk web
- `services/worker/src/db.ts` — koneksi database untuk worker
