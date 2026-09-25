# 41 — Kontrak uang sungguhan (dibuat 25/9/2026, atas keputusan pemilik dana)

Pemilik dana memindahkan saldo dari spot ke **futures** untuk menguji sistem dengan uang sungguhan.
Keputusan ini miliknya dan dicatat sebagai keputusan sadar — bukan saran pelatih. Yang pelatih lakukan:
membuat risikonya terukur dan tidak bisa membengkak diam-diam.

## Fakta jujur sebelum mulai (jangan dihapus)
- Bot **belum terbukti untung**: backtest ETH FAIL (win rate 30,7%), armada paper (ZEC/UNI/RUNE) **belum lulus**.
- Yang sudah terbukti hanya: **pagarnya bekerja** (menolak coin jelek, menolak gate salah, menolak entry basi).
- 3 trade real sebelumnya **semuanya di luar aturan** (melawan gate / tidak ada candle 1) — hasilnya kebetulan untung, tapi itu bukan bukti sistem.
- Kesimpulan: uang yang dipakai sekarang = **biaya kuliah**, bukan modal investasi. Kalau habis, itu biaya belajar, bukan kegagalan.

## 6 syarat yang tidak bisa dinegosiasi
1. **Stop wajib dipasang sebelum entry.** Tidak ada stop = tidak ada trade, walau harga "jelas akan naik".
2. **Risiko maksimal 1% per trade** (0,31 USDT dari 31 USDT). Ukuran coin = 1R ÷ jarak entry→stop. Tidak ada "kali ini agak besar".
3. **Maksimal 2 trade/hari. Dua loss beruntun → mati lampu hari itu** (tutup aplikasi, besok lagi).
4. **Leverage ≤ 5x, isolated.** Jangan cross. (Stop sudah menentukan risiko; leverage hanya soal margin.)
5. **Hanya entry dari tiket yang gate-nya searah.** Tiket bertanda "JANGAN EKSEKUSI" = masuk jurnal saja, bukan eksekusi.
6. **Saldo 31 USDT itu batasnya.** Menang tidak menambah setoran; kalah tidak menambah setoran. Evaluasi setelah 20 trade.

## Yang dilarang (biasanya inilah yang membunuh akun)
- Averaging down / menambah posisi saat rugi.
- Memindahkan stop menjauh dari harga.
- Entry tanpa tiket karena "kelihatan bagus".
- Trade setelah 2 loss (balas dendam).
- Menambah leverage karena yakin.
- Menghapus trade jelek dari jurnal.

## Jejak dua jalur
| Jalur | Uang | Aturan | Kapan dipakai |
|---|---|---|---|
| A. Demo Binance | uang demo | sama persis | Untuk melatih **mekanik klik** (SL/TP, ukuran) tanpa biaya salah klik |
| B. Uang pribadi | 31 USDT di futures | 6 syarat di atas | Untuk melatih **emosi** — yang tidak bisa dilatih di demo |

Rekomendasi pelatih: jalankan **A dan B bersamaan tapi kecil**: mekanik dilatih di demo, sedangkan trade sungguhan hanya dari tiket Telegram yang lolos semua pagar. Dengan begitu kesalahan klik tak berbiaya, dan yang kau bayar hanya keputusan — bukan ketidakcakapan.

## Rem darurat
- Saldo turun 30% (≈ 9,3 USDT) dalam kondisi apa pun → **berhenti real, balik demo 20 trade**. Tidak ada pengecualian.
- Sistem rusak/stale data → tidak ada trade (data ≥45 menit = jangan disentuh).
- Ragu antara trade atau tidak → tidak.

## Catatan biaya yang benar-benar ada di futures
- **Fee taker/maker** tiap buka-tutup posisi (kecil, tapi nyata).
- **Funding rate** tiap 8 jam kalau posisi menginap (bisa membayar, bisa menerima).
- **Likuidasi** kalau stop tidak dipasang dan harga melawan jauh — ini yang paling mahal.
Semua sudah dihitung di kalkulator risiko kita; itulah kenapa TP 2R (bukan 1R) supaya biaya tertutup.
