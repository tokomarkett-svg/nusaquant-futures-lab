# 36 — Bangunkan Bot: langkah 25/9/2026 (dari parkir → paper aktif)

## A. Apa yang rusak (diagnosis, terbukti dari kode)
Worker hidup (heartbeat jalan) **tapi buta**: sejak 17/9 12:45 tidak ada candle baru masuk.
Penyebab: klien data menembak `fapi.binance.com`, dan host itu sejak pertengahan September
mengembalikan **HTTP 451 (blokir untuk IP server)** → setiap fetch gagal → dashboard bilang STALE.

## B. Apa yang sudah diperbaiki (commit 1f98e6a + d35505a)
1. Sumber data pindah ke **mirror publik `data-api.binance.vision`** (klines spot ≈ perp; cukup untuk lab paper).
2. **Fallback otomatis**: kalau host utama gagal (451/403/5xx) klien lompat sendiri ke mirror.
   → Jadi env lama di Railway (`BINANCE_BASE_URL=https://fapi.binance.com`) tidak lagi jadi masalah.
3. Jendela ingest dinaikkan: **1000 candle** per interval (15m ≈ 10,4 hari) → celah 17/9 → sekarang terisi otomatis.
4. Log baru: tiap siklus ingest menulis `source: {baseUrl, fallbackBaseUrl}` + jumlah candle, jadi kita bisa lihat asal data.
5. Tes: 41/41 lulus (2 tes baru khusus fallback & error non-retryable).

## C. Langkah user (kerjakan urut, ±10 menit)
1. Tunggu **1–2 menit** (Railway auto-deploy dari GitHub `main`).
2. Buka Railway → service worker → tab **Deployments** → pastikan deploy terbaru = **Success**.
3. Buka dashboard `nusaquant...vercel.app` → refresh.
4. Cek 4 tanda sehat:
   - `Data Supabase live` → jam candle berubah jadi **jam sekarang** (bukan 17/9 12:45).
   - `Worker heartbeat` → detik/“baru saja”.
   - `Next 15m evaluation` → hitungan menuju candle berikutnya (bukan STALE).
   - `Rule status` → tetap "Struktur market belum searah dengan tren utama" = normal (belum ada setup).
5. Kalau **masih STALE** setelah 5 menit: Railway → service worker → **Redeploy** sekali, lalu cek tab Logs;
   cari baris `"source":{"baseUrl":"https://fapi.binance.com","fallbackBaseUrl":"https://data-api.binance.vision"}`
   (boleh juga langsung kirim screenshot log ke sini, aku bacakan).
6. Setelah data hijau → **Start observation** untuk sesi paper. Mulai dari yang sudah lolos gate riset:
   **ZEC (004), UNI (005), RUNE (006)**. ETH tetap **tidak** (backtest FAIL 30.7% → bukan kandidat promosi).
7. Jurnal bot: catat tanggal mulai, simbol, dan biarkan jalan ≥ 1 minggu sebelum kita nilai ulang.

## D. Pagar yang tidak berubah
- **Paper dulu**, tidak ada order uang asli dari bot. Real-money hanya setelah promosi lolos backtest + paper.
- Backtest FAIL = pagar bekerja, bukan kerusakan. ETH tetap di radar sebagai pengamat.
- Bot hanya *mengusulkan*; **Approve paper entry** tetap manual olehmu (menu Bot control).
- Radar SHORT menyala = informasi, belum izin entry.
