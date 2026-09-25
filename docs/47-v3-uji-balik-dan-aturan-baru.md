# 47 — Hasil uji balik & keputusan akhir: mesin tetap teknik asli

## Keputusan pemilik (25/9 malam)
Mesin berjalan **PERSIS teknik yang dipakai saat manual trading** — tanpa tambahan apa pun:
1. Arah trend dari **High/Low 24 jam**; semua coin USDT Binance Futures discan (vol ≥5jt, range ≥3%, data segar).
2. Garis digambar dari rumus asli — LONG: pintu = High − (High−Low)×0.705, manis ×0.786, batal ×0.886; SHORT = cermin dari Low.
3. X menusuk pintu → candle 1 (buntul di pita, buntul ≥8× badan, close paruh) → candle 2 (sah konfirmasinya).
4. **LONG dan SHORT dua-duanya aktif** (short = kebalikan cermin long).
5. Gate searah 1 jam (HIJAU untuk long, MERAH untuk short), notif hanya jika semua sah — sesuai kriteria audit yang disepakati.
6. Entry = close candle 2 · stop = ekor candle 1 · target ±2R · risiko tetap 0,31 USDT.

Tiga tambalan eksperimen yang sempat kupasang (stop pindah garis batal, gate matang 4 jam,
LONG-saja) **sudah dicabut semua** dari mesin. Eksperimen hanya hidup di alat uji balik
(`backtest-pmb.ts`) yang tidak pernah mengirim notif dan tidak menyentuh meja.

## Catatan risiko (arsip apa adanya, bukan dasar mengubah mesin)
Uji balik 20 koin terlikuid ±9 hari (aturan mesin diputar persis ke masa lalu):

| Varian | Tiket | Menang | Ekspektasi |
|---|---|---|---|
| Aturan asli (yang dipakai sekarang) | 44 | 18% | −0,455R |
| Stop di garis batal (eksperimen) | 38 | 26% | −0,211R |
| + gate matang 4 jam (eksperimen) | 31 | 29% | −0,129R |
| + hanya lawan trend hari (eksperimen) | 17 | 35% | +0,059R |

Angka ini disimpan sebagai bahan pemantauan. Sampel kecil (±9 hari, satu kondisi pasar)
tidak boleh langsung jadi vonis untuk mengubah teknik yang sudah diajarkan dan dipahami.

## Hakim yang disepakati
Meja paper menghitung **20 trade disiplin** aturan asli (docs/41). Semua hasil — bagus maupun
jelek — dilaporkan mentah. Kalau 20 trade itu membuktikan mesin rugi terus, keputusan lanjutan
tetap di tangan pemilik, dengan data di meja.
