# 40 — Notifikasi Telegram (gratis): pasang 10 menit

## Biaya: Rp 0
Bot API Telegram gratis, tanpa kartu kredit, tanpa langganan. Yang mengirim pesan adalah worker kita di Railway (sudah jalan).

## Yang dikirim ke HP-mu (hanya yang layak)
1. **🔔 BEL PINTU** — harga menusuk garis pintu **dan** gate searah. Isi: arah, gate, harga, langkah berikutnya. (Bel pintu saat gate belum searah **tidak** dikirim — itu cuma ribut.)
2. **🎯 TIKET SIAP** — paket X→1→2 lengkap dan harga belum lari: entry, stop, target 2R, ukuran coin, pengingat 1% risiko.
3. **⚠️ TIKET TAPI GATE BELUM SEARAH** — tiket terbentuk tapi gate melawan: ditandai **JANGAN EKSEKUSI** (untuk latihan/jurnal).
Satu setup tidak dikirim dua kali (ada dedupe).

## Langkah A — bikin bot Telegram (di HP, 3 menit)
1. Buka Telegram → cari **@BotFather** (centang biru) → ketuk **Start**.
2. Kirim: `/newbot`
3. Nama bot: misal `NusaQuant Alert`
4. Username bot: harus berakhiran `bot`, misal `nusaquant_bri_bot` (kalau ditolak, tambah angka)
5. BotFather membalas **token** panjang seperti `1234567890:AAH...` → **catat, jangan kirim ke siapa pun** (termasuk ke chat ini; masukkan langsung ke Railway).
6. Buka chat bot barumu (BotFather memberi link) → tekan **Start** sekali. (Wajib, kalau tidak bot tak bisa mengirim pesan.)
7. Cari **@userinfobot** → Start → dia membalas **Id: 123456789** → itulah **chat id**-mu.

## Langkah B — pasang di Railway (di HP, 2 menit)
1. Railway → project `producti…` → service **@nusaquant/worker**
2. Tab **Variables** → **New Variable** (tiga kali):
   - `TELEGRAM_BOT_TOKEN` = token dari BotFather
   - `TELEGRAM_CHAT_ID` = id dari @userinfobot
   - `RUN_ALERTS` = `true`
3. (Opsional) `ALERT_POLL_MS` = `120000` (pindai tiap 2 menit; minimum 60 detik)
4. Tekan **Deploy** / tunggu auto-redeploy. Di tab **Logs** akan muncul baris:
   `{"alerts":true,"watch":true,"pollMs":120000,"hasToken":true,...}` → sudah hidup.

## Langkah C — uji
Pesan pertama datang saat ada kandidat layak (bisa beberapa menit, bisa beberapa jam — pasar yang menentukan).
Kalau ingin bukti cepat: kirim pesan apa pun ke bot-mu — bot hanya membalas kalau kita pasang handler, jadi tidak ada balasan; yang benar adalah menunggu log `alerts: scanned … sent …`.

## Catatan keamanan
- Token = kunci kirim pesan. Kalau bocor, orang bisa mengirim pesan seolah dari bot kita (tidak bisa menyentuh dana).
- Tidak ada akses Binance, tidak ada API key, tidak ada perintah trading dari Telegram.
