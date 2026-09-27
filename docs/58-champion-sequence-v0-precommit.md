# Praregistrasi hipotesis Chris-style pada kripto (riset saja)

Tanggal 28 Sep 2026 WIB. **Tidak mengubah alarm lama.** Video Chris Creamer aslinya bersifat diskresioner pada MNQ/NQ dengan footprint, volume profile dan konteks opsi indeks. Aturan di bawah adalah **translasi falsifiable** untuk Binance USD-M, bukan klaim menyalin tepat atau menjamin profit. Aturan dibekukan sebelum diuji pada data riil. Berbeda dari studi lama `docs/18`, ini tidak memakai EMA, MA25, MA99 maupun VWAP pengganti profile.

## Kebutuhan data (fail closed)
- Trade-by-price Futures lengkap dari aggTrades bertanda buyer maker dan volume per harga. Profil *prior session* selesai **sebelum** absorption; tidak boleh memakai transaksi masa depan untuk menentukan value area. Jendela 5m absorption, retest, dan flip semuanya selesai dan tidak bercampur symbol.
- Konteks struktur swing 1H dan 4H diverifikasi memakai candle tertutup yang sudah diketahui sebelum absorption; kedua timeframe harus sama arah. Pada implementasi evaluasi murni, struktur disuplai eksplisit beserta `asOf`, lalu diuji bahwa `asOf <= absorption.start` (penghitung pivot dari arsip adalah langkah terpisah, bukan diasumsikan tersedia).
- Rata-rata partisipasi dari **20 jendela 5m sebelum absorption** yang berurutan dan lengkap. Tick size asli dan penutupan candle 5m valid.
- Rezim GEX ala QQQ/NDX video tidak tersedia sebagai signed dealer exposure untuk seluruh altcoin Binance; statusnya **UNKNOWN** hingga diukur dari data opsi yang sebanding. Tidak mengarangnya dari warna candle atau OI×gamma tanpa asumsi posisi dealer.

## Urutan yang dibekukan untuk candidate LONG (SHORT cermin)
1. Struktur 1H dan 4H keduanya HH/HL (short LL/LH).
2. Zona diskon: close absorption **di bawah valueAreaLow** profil terdahulu dan di antara retracement 0,705 dan 0,788–0,886 dari ayunan high–low yang sudah diketahui. Untuk prototipe gunakan pita 0,705 sampai 0,886, level tengah 0,788 dicatat; ini bukan PMB 0,786.
3. Partisipasi absorption >= rata-rata 20 jendela sebelumnya; footprint delta absorption **negatif** dan close tidak di 45% dasar candle. SHORT sebaliknya delta positif dan close berada pada 55% bawah.
4. Retest pada candle berikutnya: seller masih agresif (delta < 0) tetapi low **lebih tinggi** dari low absorption; short: buyer masih agresif (delta > 0) tetapi high lebih rendah. Candle kedua yang gagal tidak boleh digabung dengan candle absorption.
5. Flip pada candle 5m berikutnya: delta berbalik positif, candle hijau dan close > high retest; low tidak menembus low absorption. SHORT cermin: delta negatif, candle merah, close < low retest, high tidak menembus high absorption.
6. Kandidat riset: entry = close flip, stop = satu tick di luar ekstrem absorption; target = paling dekat antara swing high/low sebelumnya dan 2R. Jika target <1,5R atau geometri salah => TOLAK. Tak ada order, Telegram, atau label SIAP dari aturan ini.

Seluruh ambang adalah **pilihan rekayasa untuk hipotesis riset**, bukan kutipan angka jaminan dari Chris; perubahan memerlukan versi baru dan pengujian OOS yang belum dilihat. Dalam produksi: old PMB tetap alarm seperti keputusan pemilik sampai metode baru lolos evaluasi historis & forward, data coverage, profil GEX relevan, serta izin aktivasi terpisah.
