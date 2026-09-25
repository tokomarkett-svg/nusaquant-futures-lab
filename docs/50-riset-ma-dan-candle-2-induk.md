# 50 — Riset MA (pilih TF pakai data) + aturan Candle 2 "Induk"

Pertanyaan pemilik (25/9 malam): MA bagusnya di 15 menit atau TF lain? MA bisa berbalik sebelum
High/Low tersentuh — harus dipahami. Candle 2 itu "induk" — dari dia kelihatan layak/tidak entri.

## 1. Riset MA — diuji di data sendiri (20 koin terlikuid, ±9 hari, alat uji balik)

| Konfigurasi | Tiket | Menang | Ekspektasi |
|---|---|---|---|
| Tanpa filter MA (baseline) | 44 | 18% | −0,455R |
| **MA 1H wajib searah** saat entry | 32 | 22% | **−0,344R** (lebih baik 0,11R) |
| MA 1H **+** MA 15m (25/99) wajib searah | 3 | 33% | 0,000R (sampel terlalu kecil untuk vonis) |

Kesimpulan jujur:
- **MA 1H = saringan ARAH.** Wajib searah — dia membuang tiket terburuk (baseline −0,455 → −0,344).
- **MA 15m = saringan TERAKHIR (konfirmasi eksekusi).** Dipasang berlapis, sinyal jadi SANGAT LANGKA
  (3 tiket dalam 9 hari di 20 koin!). Itu jawaban untuk "masa nggak ada yang cocok": yang benar-benar
  pas memang langka — dua TF harus sepakat, arah hari harus sepakat, baru pola X/C1/C2.
- Pola ini bukan karangan: TF besar untuk arah + TF kecil untuk eksekusi = prinsip baku
  *multiple timeframe confluence* (Alexander Elder — Triple Screen; Linda Raschke — trend di TF besar,
  trigger di TF kecil). MA 25/99 1H + MA 25/99 15m versi kita.
- SHORT tetap buruk bahkan saat searah gate (0% menang, −1,0R di config gate) — dicatat apa adanya.

## 2. "MA bisa berbalik sebelum High/Low tersentuh / sebelum batal kedaluwarsa" — BENAR

Maka: mesin **menilai ulang tiap jam** saat memindai. MA yang sudah berbalik = sisi itu DITOLAK saat
itu juga (tidak ada MA yang "terkunci"). Zona pintu/manis/batal sendiri mengikuti High/Low 24 jam yang
bergulir — begitu MA berbalik sebelum harga sampai ke zona, tidak akan ada notif dari sisi itu.

## 3. Candle pembantu & C2 sebagai "induk" — aturan baru yang dipasang

Anchors TIDAK berubah: pintu 0.705 · manis 0.786 · batal 0.886 · X → C1 → C2.
Yang baru: C2 (candle induk) sekarang wajib lolos 2 ukuran kelayakan, kalau tidak paket DITOLAK:
1. **Merebut pintu**: close C2 kembali menembus garis pintu (long: di atas pintu; short: di bawah pintu).
   Breakout yang tidak merebut garis = tembusan tanpa kekuasaan.
2. **Close paruh luar C2**: close di paruh luar range C2 sendiri → buntut lawan pendek, tenaga benar.

Candle pembantu yang sudah dihitung mesin: C1 = hammer penolakan (buntut di pita, ≥2× badan, close paruh
luar); C2 = breakout kuat (2 ukuran baru di atas). Tes penjaga ditambahkan (C2 belum merebut pintu → tolak).

## 4. Status
- Notif: NYALA (perintah pemilik), dengan semua filter: arah hari → MA 1H → MA 15m → garis → X/C1/C2(+kualitas) → anti-basi → anti-nyangkut.
- Dampak yang harus diharapkan: notif LEBIH JARANG. Itu fitur, bukan bug.
