# 37 — Papan pantau gate & bukti perbaikan data (25/9/2026, 08:10 WIB)

Dijalankan **pakai kode bot sendiri** (`packages/core` + `services/worker`) langsung ke mirror publik.
Jadi angka di bawah bukan opini — ini yang akan dilihat worker setelah deploy selesai.

## 1. Bukti celah data 17/9 → 25/9 akan terisi

| Cek | Hasil | Arti |
|---|---|---|
| Ambil 15m `limit=1000` | **999 candle** | jendela maksimal 1000 baris |
| Candle tertua | **2026-09-14 15:15 UTC** | mundur **10,4 hari** |
| Data terakhir di dashboard | 17/9 12:45 | celah hanya 8 hari → **masuk semua** ✔ |

Kesimpulan: begitu worker baru nyala sekali, celah 17/9 otomatis terisi tanpa backfill manual.
(Env `INGEST_KLINE_LIMIT` tidak diset di docs deploy → default baru 1000 berlaku. Kalau suatu saat
diisi manual, syaratnya ≥ 1000.)

Ambang dashboard: candle terbaru > 45 menit = **STALE**. Setelah ingest jalan, 15m terbaru ≈ 15–30 menit
→ harus balik **ACTIVE**.

## 2. Papan gate hari ini (harga & MA dari 1H/4H candle tertutup)

| Coin | Harga | Range 24j | Gate 1H | Gate 4H | Zona long (pintu/manis/batal) | Zona short |
|---|---|---|---|---|---|---|
| ETH | 2695.03 | 3.93% | 🔴 MERAH | 🟢 HIJAU | 2631.38 / 2622.80 / 2612.22 | 2674.77 / 2683.35 / 2693.93 |
| ADA | 0.25160 | 7.63% | 🟡 KUNING | 🟢 HIJAU | 0.23856 / 0.23701 / 0.23509 | 0.24644 / 0.24799 / 0.24991 |
| ZEC | 1551.08 | 7.59% | 🟡 KUNING | 🟢 HIJAU | 1491.64 / 1482.10 / 1470.34 | 1539.88 / 1549.42 / 1561.18 |
| UNI | 9.210 | 7.35% | 🔴 MERAH | 🟢 HIJAU | 8.98672 / 8.93188 / 8.86418 | 9.26429 / 9.31912 / 9.38682 |
| RUNE | 0.63900 | 5.95% | 🟢 HIJAU | 🟢 HIJAU | 0.61621 / 0.61313 / 0.60933 | 0.63179 / 0.63487 / 0.63867 |
| ONT | 0.05771 | 7.21% | 🟢 HIJAU | 🟢 HIJAU | 0.05545 / 0.05511 / 0.05469 | 0.05715 / 0.05749 / 0.05791 |
| NEAR | 4.615 | 15.75% | 🟢 HIJAU | 🟢 HIJAU | 4.31447 / 4.25558 / 4.18288 | 4.61253 / 4.67142 / 4.74412 |

Semua coin range ≥ 3% ✔ (tidak ada yang sepi hari ini).

## 3. Bacanya gimana

- **Sistem A (gate = 4H):** SEMUA 🟢 → semua coin sah dicari **sisi long** hari ini; tinggal tunggu
  1H masuk zona lalu 15m memicu.
- **Sistem B (gate = 1H):** RUNE, ONT, NEAR 🟢 (cari long). ETH & UNI 🔴 (kalau praktik, sisi **short**).
  ADA & ZEC 🟡 → **no trade**, tunggu.
- **Pelajaran penting dari NEAR:** kemarin di screenshot-mu gate 1H = MERAH (harga 4.386 di bawah MA99).
  Hari ini harga naik ke 4.615 → gate berbalik 🟢. **Gate itu hidup** — makanya dicek ulang tiap sesi,
  bukan dihafal.
- **Pelajaran dari zona RUNE:** PR-mu kemarin (pintu 0.6133) vs hari ini (0.6162) — anchor bergeser naik,
  zona ikut naik. Zona bukan tato: setiap sesi, ukur ulang dari High/Low 24j terbaru.
- **Kandidat latihan terbaik hari ini:** RUNE (dua gate hijau, zona long ditempel dari bawah) dan NEAR
  (range 15,75%, paling hidup). ONT gate dua-duanya hijau tapi volume 24j cuma 0,7jt USDT → likuiditas tipis,
  waspada.

## 4. Sisa langkah yang butuh tanganmu (bot)

1. Railway → Deployments → pastikan `d35505a` **Success** (kalau belum, Redeploy).
2. Dashboard → refresh → "Data Supabase live" harus berubah jadi **jam sekarang**, bukan 17/9 12:45.
3. Data hijau → **Start observation** untuk fleet paper (ZEC 004, UNI 005, RUNE 006). ETH tidak.
4. Kirim screenshot dashboard → aku bacakan sehat/tidak.
