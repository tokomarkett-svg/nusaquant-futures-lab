# 47 — v3: hasil uji balik & mengapa mesin diubah

## Kronologi singkat
Notif FLOKI (short) kena stop → kamu minta strategi dianalisis ulang, "jangan ngawur". Maka strategi
diputar ulang ke masa lalu (uji balik, aturan mesin PERSIS) di 20 koin terlikuid, ±9 hari candle 15m.

## Hasil uji balik (jujur-jujurnya)

| Varian | Tiket | Menang | Ekspektasi |
|---|---|---|---|
| Mesin lama (stop buntut candle) | 44 | 18% | **−0,455R (rugi)** |
| Stop pindah ke garis BATAL | 38 | 26% | −0,211R |
| Batal + gate matang 4 jam | 31 | 29% | −0,129R |
| **Batal + matang + hanya lawan trend hari** | **17** | **35%** | **+0,059R** |
| — di dalamnya: LONG saja | 12 | **42%** | **+0,250R** |
| SHORT (semua varian) | 5–11 | 10–20% | selalu rugi |

## Kesimpulan
1. SHORT di atas range dalam pasar naik = pendarah darah → **short dinonaktifkan sementara** (`PMB_SIDES=LONG`).
2. Stop di buntut candle terlalu sempit — gampang dicukur noise → **stop pindah ke garis BATAL** (struktural).
3. Gate muda sering berbalik → **gate harus matang** (warna sama ≥4 jam beruntun).
4. Sampaian "lawan/searah trend hari" menarik tapi sampelnya kecil (17 tiket) → **belum** dijadikan aturan;
   dipantau lewat jurnal nyata + uji balik diperdalam.

## Yang berubah di mesin (v3)
- `PMB_STOP_MODE=batal` (default) → SL di garis batal; TP tetap 2R dari jarak baru; ukuran dari jarak baru (risiko tetap 0,31 USDT)
- `PMB_GATE_MATANG_JAM=4` (default) → notif & meja hanya untuk gate yang warnanya stabil 4 jam
- `PMB_SIDES=LONG` (default) → notif & meja hanya LONG. Untuk membuka short lagi: ubah jadi `LONG,SHORT`
- Semua bisa dimatikan/diubah di Railway Variables tanpa deploy ulang kode
- Tes: 32 core + 72 worker lulus (termasuk tes profil lama yang dijaga tetap bisa dijalankan)

## Peringatan jujur
+0,06R dari 17 tiket itu **belum cukup** untuk klaim "cuan". Standar kita (docs/41): minimal 20 trade disiplin
Nyata di meja paper + datanya konsisten. Kalau 20 trade ke depan ekspektasinya tetap di bawah −0,1R,
strategi berhenti lagi dan diuji ulang. Uang sungguhan tetap terkunci sampai meja membuktikan.
