# Manual entry: alarm → login web → one approval → Binance Demo

Status 27 September 2026: **mainnet/uang asli terkunci secara permanen dalam rilis ini**. Kunci `BINANCE_API_KEY`/`BINANCE_API_SECRET` (jika ada) tidak dipakai. Worker hanya mengirim request privat ke host tetap `https://testnet.binancefuture.com` memakai `BINANCE_TESTNET_API_KEY`/`BINANCE_TESTNET_API_SECRET` yang berada di Railway. `DEMO_EXECUTION_ENABLED` default off pada **kedua** layanan.

## Alur teknis

1. PMB/Telegram tetap hanya memberi alarm. Pesan SIAP ENTRI mengarah ke `/hp/entri?symbol=...&side=...`. Tidak ada auto-entry pada bot atau Telegram.
2. Pemilik login melalui **Magic Link bawaan Supabase Auth** (tidak perlu Custom SMTP). Tautan mengarah kembali ke halaman persetujuan; API memverifikasi JWT dengan `getUser` dan mencocokkan email tervalidasi dengan `OPERATOR_EMAIL` server-side. Email lain/tanpa autentikasi ditolak. Tidak ada token Binance di web atau browser.
3. Tombol **Periksa tiket** memindai ulang data Futures, candle tertutup, arah hari WIB + MA99 15m/1H, X→C1→C2, batas 3 candle, serta daftar simbol Testnet (gagal baca = tolak). Tiket lama tidak boleh diulang.
4. Pemilik membaca entry/SL/TP/ukuran, mencentang persetujuan dan mengetik `DEMO <SYMBOL> <SIDE>`. POST dilindungi Origin, JWT, pemeriksaan ulang tiket, kuota dan reservasi satu kali dalam `manual_execution_approvals` (unik per setup). Status tak pasti = REVIEW dan menghentikan order berikutnya hingga ditangani manual.
5. Worker (hanya bila env `DEMO_EXECUTION_ENABLED=1`) memeriksa akun privat baca-saja, One-way mode, tidak ada posisi/order sebelumnya, MARKET_LOT_SIZE/MIN_NOTIONAL, risiko 0,31 USDT dan selisih harga Testnet ≤0,5R. Entry MARKET ber-client-ID deterministik; SL dan TP melalui **Algo Order API**. Hanya melapor sukses jika kedua ID terlihat aktif di bursa. Bila proteksi gagal, coba tutup reduce-only, batalkan semua order dan verifikasi flat; bila belum pasti, kirim alarm insiden.
6. Jurnal mencatat harga fill aktual. Saat exit, worker memeriksa posisi bursa sudah flat dan order Algo tersisa sudah dibatalkan **sebelum** menandai jurnal CLOSED. Gagal tutup = tetap OPEN dan alarm manual.

## Langkah aktivasi bertahap (jangan melewati tahap)

1. Deploy dengan env Demo tetap **off**. Lihat `/health/testnet` worker: `configured`, `authenticated`, `oneWay` dan `enabled`. Endpoint ini hanya GET bertanda tangan (cache 60 detik) dan **tidak** mengekspos saldo/API key. `ok:true` bukan bukti order end-to-end.
2. Pastikan Railway punya kunci **Futures Demo/Testnet** yang masih berlaku, `EXEC_TOKEN` web→worker, Telegram, dan Supabase. Jangan tulis secret dalam chat/log. Jika `configured:false`, periksa ENV Railway. Jika `authenticated:false`, periksa izin kunci/IP/sumber akun; jangan mengaktifkan order.
3. Terapkan migrasi `supabase/migrations/20260927000000_manual_execution_approvals.sql` melalui proses migrasi yang terotorisasi. Jangan aktifkan DEMO jika tabel belum dibuat dan RLS belum dicek.
4. Buat/undang **satu pengguna operator** Supabase Auth dengan email milik pemilik dan pastikan sudah confirmed. **Jangan ubah Email Templates atau menekan Set up SMTP**: template Magic Link bawaan cukup. Di Supabase **Authentication → URL Configuration → Redirect URLs**, izinkan `https://web-gray-eta-79.vercel.app/hp/entri**` (domain produksi yang dipakai; jangan izinkan wildcard domain luas). Isi **`OPERATOR_EMAIL` di Vercel** dengan email yang sama dan redeploy. Verifikasi tautan login kembali ke halaman `/hp/entri`, penolakan email lain, dan tampilan tiket. Tidak perlu membagikan password/link lewat chat.
5. Pastikan `WORKER_DATA_URL` dan `WORKER_EXEC_TOKEN` di Vercel sudah sesuai dengan worker Railway; kemudian set `DEMO_EXECUTION_ENABLED=1` di **Railway worker dan Vercel web**. Aktifkan hanya setelah review keamanan dan tes stubs, dan nonaktifkan kembali bila ada posisi/order tak pasti.
6. Tunggu tiket sah asli dari alarm. Pemilik sendiri menyetujui **satu** trade Testnet, lalu cek di Binance Demo: posisi fill, dua algo SL/TP, jurnal, dan penutupan/pembatalan order sisa. Jika minNotional Testnet tidak cocok dengan risiko 0,31 USDT, **lewati**, bukan memperbesar posisi.
7. Bila status `REVIEW` muncul, periksa Binance Testnet posisi/order dan ledger secara manual. Jangan reset flag sebelum akun terbukti flat dan tidak ada order menggantung; jangan mengulang setup yang sama. Simpan catatan insiden.

## Uang asli

`/api/meja/live` dan `/exec/live` selalu mengembalikan HTTP **423**. Tidak ada adapter Binance mainnet, tidak ada auto-promotion lewat env, tidak ada jalur tombol Live. Rilis mainnet terpisah **baru** dapat dipertimbangkan sesudah satu siklus Demo (entry + proteksi + exit + rekonsiliasi), jurnal 20 trade, evaluasi risiko/hasil, autentikasi & rekonsiliasi produksi, serta persetujuan baru dari pemilik. Perbedaan harga Futures utama vs Testnet dapat menyebabkan tiket ditolak secara aman.
