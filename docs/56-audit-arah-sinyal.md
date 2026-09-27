# Audit arah LONG/SHORT — 28 Sep 2026 WIB

## Gejala dan batas pembuktian
Pemilik melaporkan Telegram pernah menyebut SHORT saat harga kemudian naik, dan LONG saat harga kemudian turun. Tanpa simbol, waktu WIB, harga saat alarm, dan screenshot pesan + chart **Futures USDT-M** pada timeframe 15m/1H, kejadian historis tertentu belum bisa direkonstruksi. Pergerakan *sesudah* alarm berlawanan dengan tiket adalah sinyal rugi, belum otomatis bukti tanda LONG/SHORT terbalik.

## Bug nyata yang ditemukan
Sebelum patch, worker dan web menilai `gateAlign` cukup ketika close 15m dan 1H berada ≥0,5% di sisi MA99, tetapi `gateFromCandles` menamai gate 1H HIJAU/MERAH hanya jika MA25 **juga** berada di sisi MA99 yang benar. Ini membuat `gateAlign=true` ketika gate KUNING dan berisiko menghasilkan teks `gate KUNING · MA99 searah ✔` jika ada paket X→C1→C2 yang lengkap. Pada snapshot produksi sebelum patch ditemukan dua contoh ketidaksesuaian: **NOMUSDT LONG gate KUNING** dan **XPLUSDT SHORT gate KUNING**. Keduanya *tidak* dalam status SIAP pada saat itu; ini bukti inkonsistensi gerbang, **bukan** bukti bahwa notifikasi lama untuk dua simbol itu salah.

## Tindakan
- Core baru `gateAlignForSide` menjadi sumber tunggal: gate MA25/MA99 **1H dan 15m** harus berwarna sesuai sisi, close keduanya minimal 0,5% di sisi MA99; syarat arah hari WIB, candle tertutup/segar, zona X→C1→C2, dan anti-kejar tetap berlaku.
- Scanner worker, verifikasi ulang `manualTicket` web, pengesahan SIAP aplikasi, payload worker, dan pesan alarm mewajibkan gate sesuai sisi. Tahap Pintu/C1/C2 tetap muncul walau gate belum lolos.
- Di Papan, koin yang belum diperiksa mendalam tidak lagi diberi badge BUY/SELL dugaan yang berasal dari *jarak ke pintu*, karena itu bisa berbeda dari arah bot. Detail koin mengutamakan sisi tiket terverifikasi/gate searah sebelum pola sisi lawan.
- Teks pesan sapa menjelaskan hanya SIAP yang menjadi alarm entri; tidak lagi menjanjikan BEL PINTU.
- Tes regresi LONG dan SHORT gate KUNING menolak alarm walaupun harga melampaui MA99, dan memastikan skenario gate HIJAU/MERAH searah tetap lolos.

## Hal yang **tidak** bisa dijamin oleh rumus
SHORT berarti hipotesis turun dan stop/target di sisi yang tepat, **bukan jaminan** harga pasti turun. Harga setelah alarm dapat membalik dengan cepat; pasar Futures dan Spot, atau timeframe berbeda, juga tidak selalu sama. Pagar ini mengurangi sinyal gate yang kontradiktif, tidak menjadikan strategi prediktif tanpa salah. Riset lama (`docs/50-riset-ma-dan-candle-2-induk.md`) sendiri menunjukkan sampel SHORT historis lemah; jangan menyebut sinyal otomatis terbukti profitable tanpa uji out-of-sample dan data pesan.

## Audit kasus spesifik berikutnya
Simpan screenshot Telegram asli yang memuat simbol, sisi, waktu WIB dan angka entry/SL/TP; sertakan screenshot chart **Binance Futures USDT-M** 15m/1H pada waktu **alarm dikirim** (bukan hanya hasil setelah harga bergerak). Cocokkan open 00:00 WIB, MA25/MA99 kedua timeframe, X/C1/C2 candle tertutup, High/Low 24h, umur tiket, dan harga saat pesan dikirim. Jangan jalankan order untuk pengujian ini.
