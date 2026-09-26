# 54 — Perawatan Supabase: kuota terlampaui, batas 27 Sep 2026

Peringatan di dashboard (26/9): *"Organization exceeded its quota in the previous billing cycle.
Projects will be restricted from 27 Sep 2026 if your organization remains over quota."*

## 1. Apa artinya & apa yang kena

Paket gratis Supabase punya batas (ukuran database, egress bulanan, dll). Organisasi
`nusaquant-futures-dev` melewati salah satu batas itu di siklus tagihan lalu. Kalau sampai
**27 Sep masih over**, proyek **dibatasi/di-pause**.

| Kalau Supabase dibatasi | Nasibnya |
|---|---|
| Notif Telegram PMB (bel pintu & tiket) | **TETAP JALAN** — pindai langsung ke Binance, tidak lewat Supabase |
| Papan web & harga live | **TETAP JALAN** — juga baca Binance langsung |
| Meja paper (buka/tutup posisi, jurnal) | ❌ BERHENTI — tulis ke `paper_positions`/`trade_journal` |
| Halaman Posisi / Meja / skor 20-trade | ❌ ERROR baca |
| Ingest lama (arsip candle BTC/ETH) | ❌ BERHENTI |

## 2. Langkah 1 — tahu meter mana yang over

Dashboard Supabase → pilih **organisasi** → **Usage / Billing** (tautan "Review usage" di
banner). Lihat meter yang merah. Dua kandidat umum: **Database size** (paling mungkin —
arsip candle backfill 365 hari itu ratusan ribu baris) atau **Egress**.

## 3. Langkah 2A — kalau Database size over: pangkas data LEGACY

Sistem PMB sekarang hanya memakai **3 tabel**: `bot_sessions`, `paper_positions`,
`trade_journal`. Sisanya arsip riset/mesin lama. Jalankan di **SQL Editor** (yang di dashboard,
persis seperti di screenshot pemilik).

**(a) Lihat pemakan ruang dulu (tidak mengubah apa pun):**

```sql
select relname as tabel,
       pg_size_pretty(pg_total_relation_size(relid)) as ukuran
from pg_catalog.pg_statio_user_tables
order by pg_total_relation_size(relid) desc
limit 15;
```

**(b) Pangkas data legacy lebih tua dari 30 hari (JANGAN sentuh 3 tabel PMB):**

```sql
delete from market_candles     where open_time    < now() - interval '30 days';
delete from equity_snapshots   where captured_at  < now() - interval '30 days';
delete from signal_evaluations where evaluated_at < now() - interval '30 days';
delete from market_metrics     where event_time   < now() - interval '30 days';
delete from market_derivatives where event_time   < now() - interval '30 days';
```

**(c) Kalau meter tetap tinggi setelah hapus** (Postgres menahan ruang untuk dipakai ulang),
kecilkan fisiknya — jalankan sekali, saat sepi (mengunci tabel sebentar):

```sql
vacuum full analyze;
```

Larangan: jangan `delete` pada `paper_positions`, `trade_journal`, `bot_sessions` — itu buku
meja 20-trade kita. VOID-REGRESI & riwayat disiplin harus tetap utuh.

## 4. Langkah 2B — kalau Egress over: matikan pompa data lama di Railway

Di **Railway → worker → Variables**, saklar yang aman dimatikan (mesin lama BTC/ETH sesi
...001/...002 sudah tidak dipakai teknik PMB):

```
RUN_MARKET_INGEST=false   (berhenti menulis candle arsip)
RUN_MARKET_WATCH=false    (berhenti poll terus-menerus)
RUN_RADAR=false           (radar lama — kecil, tapi boleh dimatikan)
RUN_RESEARCH_JOBS=false   (riset belakangan)
```

**JANGAN disentuh (wajib tetap):**

```
RUN_ALERTS=true   (notifikasi PMB)
RUN_DESK=true     (meja paper otomatis)
PMB_NOTIF=1       (kalau mau notif nyala)
```

Setelah mengubah variabel → Railway redeploy otomatis.

## 5. Langkah 2C — cara paling gampang (berbiaya)

Upgrade ke **Pro ($25/bln)** dari banner → batas naik, tidak ada gangguan apa pun.
Cocok kalau tidak mau repot; untuk latihan paper, opsi pangkas di atas gratis dan cukup.

## 6. Setelah beres — buktikan dari HP

Mode HP → Beranda → **🩺 Cek Sistem**: semua baris harus ✅ (papan, harga, Supabase meja,
Supabase skor, worker Railway, mesin PMB). Itu bukti Supabase tidak dibatasi dan seluruh
rukun sistem jalan.
