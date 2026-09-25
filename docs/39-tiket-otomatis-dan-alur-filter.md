# 39 — Tiket otomatis (entry/SL/TP) & alur filter pemindaian

## A. Tiket otomatis — BISA, sudah jalan 25/9

Setiap kandidat yang paketnya lengkap (X → candle 1 → candle 2) langsung dihitung tiketnya:

| Bagian | Rumus | Contoh uji (data buatan) |
|---|---|---|
| Entry | close candle 2 | 101.20 |
| Stop | ujung buntut candle 1 | 96.40 |
| Jarak (1R) | entry − stop | 4.80 |
| Target | entry + 2 × jarak (2R) | 110.80 |
| Ukuran coin | 0,31 USDT ÷ jarak | 0,0646 coin |
| Risiko / imbalan | 0,31 USDT → 0,62 USDT | RR 2:1 |

Cermin short identik (entry 93.40 · stop 97.60 · target 85.00 · ukuran 0,0738) — dibuktikan tes
`apps/web/lib/ticket.test.ts` (4 tes, semua lulus).

### Pagar pengaman di dalam tiket (semuanya otomatis)
1. **Anti-nyangkut:** kalau harga sudah berjalan **> 0,5R** dari entry → tiket ditandai *TIDAK BISA DIEKSEKUSI LAGI*, "jangan dikejar, tunggu setup baru". (Live hari ini: COTI & TRUMP punya tiket tapi langsung ditandai basi.)
2. **Basi candle:** candle 2 sudah > 3 candle → tiket dianggap basi.
3. **Geometri stop:** stop wajib di sisi yang benar terhadap entry.
4. **Stop vs garis batal:** kalau stop berada di luar garis batal → peringatan "setup lemah".
5. **Kedaluwarsa:** setup > 12 candle sejak X → gugur (aturan lama, sekarang dihitung mesin).
6. **Tanpa paket = tanpa tiket.** Tidak ada tiket baru kalau candle 1 belum sah (buntut <2×, doji, close salah paruh).

## B. Alur filter pemindaian (jawaban "semua coin atau koin tertentu?")

**Semua coin dipindai, lalu disaring bertingkat.** Bukan daftar tetap — daftar berubah tiap 60 detik.

```
SEMUA pair USDT di Binance (spot mirror)   ± 669 pair
        ↓ buang stablecoin (USDC/FDUSD/TUSD/DAI/EUR/TRY…) & token leveraged (UP/DOWN/BULL/BEAR)
        ↓ wajib likuiditas ≥ 5 juta USDT / 24 jam          → ± 103 pair
        ↓ wajib range 24 jam ≥ 3%                          → ± 89 pair
        ↓ urutkan yang paling dekat ke salah satu pintu
        ↓ 40 teratas dicek candle 15m & 1H-nya (data wajib ≤ 45 menit)  → buang coin "zombie"
        ↓ hitung gate 1H + umur sentuhan + X/1/2 + tiket
PAPAN: ± 38 baris
```

Tiga hal penting:
1. **Papan ≠ armada paper.** Papan memindai seluruh pasar (alat matamu). Armada paper (ETH 002, ADA 003, ZEC 004, UNI 005, RUNE 006) adalah sesi bot di Supabase yang evaluasinya jalan terus — dua hal berbeda.
2. Coin yang **hanya ada di futures tanpa spot** tidak muncul, karena sumber data kita mirror spot (host futures diblokir). Praktisnya hampir semua perp punya spot.
3. Pagar **≥45 menit** yang membuang coin zombie (contoh nyata: TONUSDT — ticker hidup, candle mandek 30 Juni).

## C. "Live entry langsung" — jalur bertahap (aman)

| Tahap | Isi | Status |
|---|---|---|
| 0 | Tiket otomatis + papan + harga live | ✅ selesai hari ini |
| 1 | Notifikasi (Telegram) begitu candle 2 close — biar tak telat walau HP tak dibuka | belum (butuh bot token) |
| 2 | **Auto paper entry**: bot membuka posisi paper sendiri di close candle 2, SL/TP sesuai tiket, tercatat di jurnal | belum (butuh Supabase, sudah ada di Railway) |
| 3 | Real kecil, **tetap tombol approve manual**, setelah 20 trade disiplin lulus | tergantung kamu |

Pagar yang tidak berubah: tidak ada order otomatis ke uang asli, tidak ada private API tanpa izin eksplisitmu.
Tahap 1 & 2 yang disarankan berikutnya — keduanya masih murni paper.
