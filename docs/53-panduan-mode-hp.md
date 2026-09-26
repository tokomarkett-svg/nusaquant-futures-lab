# 53 — Panduan Mode HP (`/hp`): pasang, pakai, baca

Aplikasi HP NusaQuant sudah **tuntas dibangun** (Tahap A–D dokumen 52). Semuanya lapisan
tampilan di atas API yang sama dengan papan web & notif Telegram — **mesin, garis, dan aturan
teknik tidak disentuh**. Panduan ini untuk pemilik, ditulis sesingkat mungkin.

## 1. Pasang di HP (sekali saja)

1. Buka alamat web NusaQuant di Chrome HP (login seperti biasa).
2. Pastikan menu **⋮ → Situs desktop TIDAK dicentang** (kalau dicentang, halaman tampil sempit
   dan ada banner kuning yang menuntun memperbaikinya).
3. Masuk ke alamat web + `/hp` (atau ketuk tombol **📱 Mode HP** di beranda).
4. Menu **⋮ → Tambahkan ke layar utama** → beri nama → pasang.
5. Hapus shortcut lama bila ada. Ikon baru membuka **langsung Mode HP** full-screen
   (manifest `start_url: /hp`, service worker `nq-v2` — offline pun tetap buka halaman terakhir).

## 2. Empat tab

| Tab | Isi | Sumber data |
|---|---|---|
| 🏠 **Beranda** | Tiket sah terbaik (kartu gelap, tombol SALIN ORDER) atau "Belum ada paket sah". Di bawahnya bel pintu yang nonton | `/api/nominasi` |
| 📊 **Papan** | Semua koin papan + kotak cari + chip filter + pita posisi harga BATAL↔PINTU | `/api/nominasi` |
| 💼 **Posisi** | Posisi paper meja yang berjalan + **R hidup** (harga segar 5 dtk) + bar SL↔TP | `/api/meja` + `/api/harga` |
| 📓 **Meja** | Progres 20-trade disiplin + kotak hari ini + **riwayat 20 trade terakhir** | `/api/meja/skor` + `/api/meja/riwayat` |

Ketuk koin di mana pun → **chart 48 candle + garis PINTU/MANIS/BATAL + penanda X·1·2**,
kartu tiket, tombol salin (`/hp/koin/<SYMBOL>`, TF bisa diganti 5m/15m/1h/4h).

## 3. Alur harian

```
Notif 🎯 SIAP ENTRI (Telegram)
   └─ ketuk tautan → chart + garis + X·1·2 di app
        └─ cek 4 pagar: 🎯 sah · gate searah ✔ · bukan 💀 PADAM · umur ≤3 candle
             └─ 📋 SALIN ORDER → tempel di Binance (manual, stop SEBELUM entry)
                  └─ 💼 Posisi memantau R hidup → 📓 Meja mencatat ke skor 20 trade
```

## 4. Cara baca badge (sama persis dengan notif Telegram)

- **🎯 SIAP ENTRI** — paket X→C1→C2 sah & boleh dieksekusi (cek umur tiket `x/3 candle`).
- **🔥 MENYALA** — harga di dalam pita pintu–batal, **belum berarti sah**; nonton.
- **💀 PADAM** — zona kena BATAL: **mati** sampai High/Low 24 jam bergeser. Jangan entri sisi itu.
- **abu (SIMAK/DISIMAK)** — nonton dari jauh.
- Chip ungu **SAHAM / KOMODITAS** — perp saham/emas/gas: cari di **menu Futures Binance**,
  bukan di daftar koin kripto.
- Header **FUTURES ✔** = data sama dengan chart futures-mu. Kalau muncul **⚠ SPOT** — fapi
  sedang diblokir dari server; angka bisa beda, sebaiknya jangan eksekusi dulu.

## 5. Rumah tangga teknis (untuk pengingat)

- Deploy: Vercel (web) & Railway (worker) otomatis mengikuti `main`.
- Kalau notif dibisukan: variabel Railway `PMB_NOTIF=1` untuk menyalakan lagi.
- Skor meja mulai bersih setelah aturan mesin berganti: `POST /desk/bersih { token }`
  (VOID-REGRESI tampil di riwayat tapi tidak masuk skor).
- Laporan audit entri: `docs/51`. Desain & rencana tahap: `docs/52`.
