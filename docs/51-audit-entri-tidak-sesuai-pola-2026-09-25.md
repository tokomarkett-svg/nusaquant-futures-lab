# 51 — Audit "entri tidak sesuai pola": tiga bug ditemukan, dipasangi perbaikan

Keluhan pemilik (25/9): **entri bot tidak sesuai pola Pintu–Manis–Batal yang diajarkan** —
garis harus dari rumus `High − (High−Low)×0.705 / ×0.786 / ×0.886` (SHORT = cermin dari Low),
lalu mesin membaca **X → candle 1 → candle 2** baru layak entri.

Diaudit seluruh alur (garis → X/C1/C2 → tiket → notif → meja → demo). Hasilnya:

## A. Rumus garis — BENAR sejak awal (bukan sumber masalah)

Contoh hitung pemilik diverifikasi persis sama dengan `computeZones` (packages/core/src/zones.ts):

```
range  = 0.6273 − 0.3926 = 0.2347
pintu  = 0.6273 − 0.2347×0.705 = 0.4618   ✓
manis  = 0.6273 − 0.2347×0.786 = 0.4428   ✓
batal  = 0.6273 − 0.2347×0.886 = 0.4194   ✓
```

Rasio 0.705/0.786/0.886, urutan X→C1→C2, SL ekor C1, TP 2R, risiko 0,31 — semua sesuai dokumen
ajaran (docs/28, docs/34, docs/49). **Yang salah bukan rumusnya, tapi DATA dan DUA ATURAN BACA.**

## B. BUG #1 (paling besar): mesin notif & meja membaca pasar SPOT, bukan FUTURES

Sejak fapi diblokir (HTTP 451) pertengahan September, klien pemindaian default ke mirror
`data-api.binance.vision` = pasar **SPOT**. Akibatnya:

1. **Garis pintu/manis/batal dihitung dari High/Low 24 jam SPOT**, sementara pemilik menggambar
   garis dari chart **FUTURES**. Dua pasar = dua angka. Bukti live 25/9 (jembatan futures Railway
   vs mirror spot, koin likuid range ≥3%):

   | Koin | High 24j FUTURES | High 24j SPOT | Garis pintu FUTURES | Garis pintu SPOT | Selisih |
   |---|---|---|---|---|---|
   | LITUSDT | 5.5022 | 0.755 | 4.9207 | 0.68521 | **86,1%** |
   | XMRUSDT | 582.54 | 119.6 | 556.1 | 113.11 | **79,7%** |
   | SANDUSDT | 0.04635 | 0.0496 | 0.043403 | 0.044446 | 2,4% |
   | median 160 koin | | | | | 0,12% |

   Kecil-kecil sering beda; di koin tertentu (spot tua/delisted) BEDA HAMPIR SEMUA. Ini persis
   pengalaman "angka notif tidak cocok dengan garis di chart".
2. **122 koin perp likuid (vol ≥5jt) tidak pernah dipindai sama sekali** karena tidak ada di spot —
   antara lain 1000PEPEUSDT, 1000FLOKIUSDT, 1000SHIBUSDT, FARTCOINUSDT, dan perp saham
   (AAPLUSDT, COINUSDT, dst). Setup di koin-koin itu tidak pernah muncul.
3. Volume likuiditas ≥5jt juga diukur di pasar yang salah.
4. Ironisnya: **jembatan futures di worker sudah hidup** (`/data/tickers` dsb. — dipakai papan web
   dan `audit-teknik.ts`), jadi alat audit memverifikasi aturan di data FUTURES sementara notif
   live dihitung dari SPOT → "audit bilang sah, chart bilang beda".

**Perbaikan:** klien pemindaian (notif, meja, papan-json) sekarang **futures dulu**
(`fapi.binance.com`, env `SCAN_BINANCE_BASE_URL` bila perlu diubah), otomatis jatuh ke mirror spot
hanya bila fapi tak terjangkau — dan setiap notif menandai sumber datanya:
`📊 Data FUTURES — sama dengan chart futures-mu` atau
`⚠ Data SPOT (futures tak terjangkau) — garis bisa BEDA dengan chart futures-mu`.
Failover dibuat sticky (host yang terbukti hidup dicoba lebih dulu) supaya hemat waktu & rate-limit.

## C. BUG #2: candle X dirangkap jadi candle 1 → entri prematur satu candle

Kamus ajar (docs/34): **X = bel pintu, bentuk BEBAS**; candle 1 = bukti pertarungan (buntut ≥2×
badan di pita, close paruh luar) yang **muncul setelah X**. Kode lama mencari candle 1 MULAI DARI
candle X sendiri — kalau X kebetulan berbentuk hammer sempurna, X langsung dihitung candle 1 dan
candle sesudahnya menjadi candle 2 → **bot menyuruh entri satu candle lebih awal dari pola manual**.

**Perbaikan:** pencarian candle 1 dimulai di candle SETELAH X. Tes penjaga ditambahkan
(X berbentuk hammer sempurna → tetap ditolak sebagai C1).

## D. BUG #3: garis BATAL bisa "bangkit" kembali hanya karena harga balik

Aturan ajar: candle TERTUTUP menembus BATAL = zona **MATI**, tunggu zona baru (High/Low 24 jam
bergeser). Kode lama hanya mengecek candle TERAKHIR — kalau harga menembus batal lalu balik satu
candle, zona dianggap hidup lagi dan bot bisa menyuruh entri **di zona yang sebenarnya sudah mati**
(di chart pemilik garis batalnya sudah ditembus).

**Perbaikan:** semua candle tertutup sejak zona ini lahir (sejak bar yang mencetak anchor
High/Low-nya) ikut diperiksa; zona tetap mati sampai anchor bergeser. Tes penjaga: (a) tembus batal
di tengah jendela + harga balik → tetap mati; (b) High baru terbentuk → zona baru, sisi dinilai lagi.

## E. Perbaikan kecil yang ikut dipasang

1. Teks notif gate selama ini bisa tampil `Gate 1H KUNING ✔`/`MERAH ✔` padahal yang lolos adalah
   aturan ungu (harga jelas di sisi MA99) → sekarang ditulis `Gate 1H <warna> · MA99 searah ✔`
   supaya tidak saling bertentangan.
2. `npm test` di akar selalu GAGAL karena workspace web tidak punya file test (glob kosong) —
   sekarang dilewati dengan pesan, bukan error.
3. `/data/papan-json` ikut memakai klien futures + menandai `market` per baris.

## F. Yang TIDAK diubah (tetap persis teknik)

Rasio 0.705/0.786/0.886 · High/Low 24 jam bergulir · urutan X→C1→C2 · syarat sah C1 (buntut ≥2×
badan di pita pintu–batal, badan ≥8% range, close paruh luar) · C2 wajib tembus puncak C1 + merebut
pintu + close paruh luar · entry = close C2 · SL = ekor C1 · TP 2R · risiko 0,31 USDT · arah hari
WIB · aturan ungu 0,5% (15m & 1H) · anti-basi (maks 3 candle) · anti-nyangkut (0,5R) · maks 2
trade/hari · 2 loss beruntun = meja tutup.

## G. Validasi

- typecheck core + web + worker: pass
- test core: 36 pass (3 tes penjaga baru) · worker: 72 pass
- uji live end-to-end dari jaringan yang diblokir fapi: mesin jatuh ke mirror, kandidat tetap
  terbaca dan berlabel SPOT (di Railway fapi terjangkau → berlabel FUTURES)

## H. Dampak yang harus diharapkan pemilik

1. Angka notif = angka chart futures (beda hanya bila muncul tanda `⚠ Data SPOT`).
2. Entri tidak lagi muncul satu candle lebih awal dari pola X→C1→C2.
3. Tidak ada lagi tiket di zona yang batal-nya sudah tertembus lalu "hidup" kembali.
4. Koin futures-only (1000PEPE, FARTCOIN, perp saham, dll.) sekarang ikut dipindai.
5. Notif bisa berubah frekuensinya (lebih banyak koin dipindai, tapi zona mati tidak lagi bangkit) —
   itu efek aturan yang benar, bukan rusak.
