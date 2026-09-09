# Spesifikasi MVP Futures Bot

**Status:** Draft v0.1  
**Tanggal:** 9 September 2026  
**Tujuan:** Membuat fondasi bot analisis dan paper trading untuk Binance USDⓈ-M Futures dengan penekanan pada kualitas sinyal, manajemen risiko, dan keamanan.

> Dokumen ini adalah rancangan teknis awal. Bot tidak menjamin profit dan tidak boleh langsung digunakan dengan dana riil sebelum melewati backtest, paper trading, audit, dan pengujian Testnet.

---

## 1. Tujuan Produk

Membangun sistem yang mampu:

1. Mengambil dan memvalidasi data candle pasar.
2. Mengidentifikasi kondisi market: tren naik, tren turun, sideways, volatilitas tinggi, atau tidak pasti.
3. Mencari setup trading berbasis trend-following pullback.
4. Memberikan sinyal LONG, SHORT, atau NO TRADE dengan alasan yang dapat dijelaskan.
5. Menghitung stop loss, take profit, dan ukuran posisi berdasarkan risiko.
6. Menjalankan paper trading dan mencatat seluruh transaksi.
7. Menyediakan fondasi untuk pengujian Binance Futures Testnet di tahap berikutnya.

## 2. Batasan MVP

### Termasuk

- Pair awal: BTCUSDT dan ETHUSDT.
- Market: Binance USDⓈ-M Futures.
- Analisis tren: timeframe 1 jam.
- Analisis entry: timeframe 15 menit.
- Indikator: EMA, ADX, RSI, ATR, dan volume.
- Mode utama: paper trading.
- Satu posisi aktif per pair.
- Margin isolated pada tahap integrasi exchange.
- Pencatatan sinyal, order simulasi, posisi, P/L, dan alasan keputusan.
- Dashboard sederhana untuk status bot dan riwayat trade.

### Tidak termasuk dalam MVP

- Jaminan profit.
- Auto-trading akun real.
- Withdrawal atau pemindahan dana.
- Multi-user dan billing.
- Machine learning yang mengubah parameter secara otomatis.
- Trading pada semua pair secara serentak.
- Copy trading.

## 3. Konfigurasi Risiko Awal

Nilai berikut adalah parameter awal untuk pengujian, bukan rekomendasi keuangan pribadi:

```text
Risiko per transaksi       : 0,25% dari ekuitas paper account
Batas kerugian harian      : 1% dari ekuitas awal hari
Risiko total posisi aktif  : maksimal 0,50%
Posisi aktif per pair      : maksimal 1
Leverage simulasi          : dibatasi, tidak menentukan risiko
Stop loss                  : wajib sebelum posisi dianggap aktif
Cooldown setelah loss      : minimal 3 candle entry timeframe
```

Jika batas kerugian harian tercapai, sistem tidak boleh membuka posisi baru sampai periode trading berikutnya.

## 4. Arsitektur Keputusan Bot

```text
Market data
    ↓
Data validation
    ↓
Market regime classifier
    ↓
Setup detector
    ↓
Signal scorer
    ↓
Expectancy and cost filter
    ↓
Risk engine
    ↓
Paper execution engine
    ↓
Position manager
    ↓
Journal, metrics, and alerts
```

Bot harus dapat mengembalikan tiga keputusan:

```text
LONG
SHORT
NO_TRADE
```

`NO_TRADE` adalah keputusan valid ketika data, kondisi market, kualitas setup, atau risiko tidak memenuhi syarat.

## 5. Kualitas Data

Sebelum indikator dihitung, sistem harus memeriksa:

- candle tersusun berdasarkan waktu;
- tidak ada candle duplikat;
- tidak ada candle yang hilang tanpa ditandai;
- candle yang digunakan sudah selesai/closed;
- timestamp sesuai waktu server;
- harga, high, low, dan volume valid;
- data tidak stale;
- pair aktif dan dapat diperdagangkan.

Jika validasi gagal, sistem harus menghasilkan `NO_TRADE` dan mencatat penyebabnya.

## 6. Klasifikasi Kondisi Market

### Tren naik

Kondisi awal yang diusulkan:

```text
EMA 50 pada 1H > EMA 200 pada 1H
ADX 1H memenuhi ambang minimum
```

### Tren turun

```text
EMA 50 pada 1H < EMA 200 pada 1H
ADX 1H memenuhi ambang minimum
```

### Sideways atau tidak pasti

Jika kondisi tren tidak memenuhi syarat atau ADX terlalu rendah, bot tidak menggunakan strategi trend-following dan default-nya adalah `NO_TRADE`.

### Volatilitas ekstrem

ATR dibandingkan dengan riwayat ATR. Jika volatilitas berada di luar batas pengujian, bot menurunkan risiko atau tidak mengambil entry baru.

> Nilai EMA, ADX, dan batas ATR belum dianggap optimal. Semua parameter akan diuji, bukan diasumsikan benar sejak awal.

## 7. Aturan Setup Long Awal

Sebuah setup long dapat dipertimbangkan jika:

1. Tren 1H bullish.
2. Harga 15M berada di atas area EMA 50 atau kembali menguji area tersebut.
3. Terjadi pullback, bukan candle kenaikan ekstrem yang sudah jauh dari area setup.
4. Struktur harga membentuk higher low atau candle konfirmasi bullish.
5. Momentum RSI 15M mendukung pemulihan, bukan kondisi terlalu lemah.
6. ADX dan volume memenuhi ambang validasi.
7. Stop loss dan target memberikan rasio risiko/imbalan minimum yang ditetapkan.
8. Tidak ada posisi aktif atau order pending pada pair tersebut.
9. Biaya, spread, dan estimasi slippage masih dapat diterima.

## 8. Aturan Setup Short Awal

Kebalikan dari long:

1. Tren 1H bearish.
2. Harga 15M berada di bawah area EMA 50 atau melakukan retest dari bawah.
3. Terjadi pullback yang wajar.
4. Struktur harga membentuk lower high atau candle konfirmasi bearish.
5. Momentum RSI 15M mendukung pelemahan.
6. ADX dan volume memenuhi ambang validasi.
7. Stop loss dan target memenuhi rasio minimum.
8. Tidak ada posisi aktif atau order pending.
9. Biaya, spread, dan slippage masih dapat diterima.

## 9. Sistem Skor Sinyal

Contoh bobot awal:

```text
Arah tren timeframe 1H sesuai       +2
Struktur harga valid                +2
Pullback ke area yang direncanakan  +1
Momentum RSI sesuai                 +1
ADX mendukung                       +1
Volume mendukung                    +1
Rasio risiko/imbalan memenuhi       +2
```

Syarat minimum entry akan ditentukan melalui backtest dan validasi out-of-sample. Skor tidak boleh dianggap sebagai probabilitas menang sebelum dikalibrasi.

## 10. Stop Loss, Target, dan Ukuran Posisi

### Stop loss

Stop loss awal menggunakan kombinasi struktur harga dan ATR. Contoh konsep:

```text
Long  : di bawah swing low dan memiliki jarak minimum berbasis ATR
Short : di atas swing high dan memiliki jarak minimum berbasis ATR
```

### Target

Manajemen awal yang akan diuji:

- target pertama pada kelipatan risiko tertentu;
- penutupan sebagian posisi jika target pertama tercapai;
- trailing stop untuk sisa posisi;
- tidak memindahkan stop loss semakin jauh dari entry.

### Ukuran posisi

```text
Nilai risiko = ekuitas × risiko per transaksi
Ukuran posisi = nilai risiko ÷ jarak entry ke stop loss
```

Ukuran posisi harus dibatasi lagi oleh aturan minimum/maksimum quantity dan notional dari exchange.

## 11. Kondisi Penolakan Sinyal

Sinyal harus ditolak jika:

- data tidak valid atau terlambat;
- skor di bawah ambang;
- expectancy setelah biaya tidak memadai;
- stop loss terlalu dekat atau terlalu jauh;
- rasio risiko/imbalan tidak memenuhi aturan;
- daily loss limit tercapai;
- terdapat posisi berkorelasi berlebihan;
- spread/slippage melebihi batas;
- terjadi cooldown;
- bot sedang dalam mode pause atau emergency stop.

## 12. State Machine Posisi

```text
FLAT
  → SETUP_DETECTED
  → ENTRY_PENDING
  → POSITION_OPEN
  → PARTIAL_EXIT atau TRAILING
  → POSITION_CLOSED
  → COOLDOWN
  → FLAT
```

Setiap perpindahan status harus dicatat dengan timestamp dan alasan.

## 13. Keamanan dan Circuit Breaker

Sistem wajib memiliki:

- emergency stop untuk menonaktifkan entry baru;
- validasi agar order tidak terkirim dua kali;
- rekonsiliasi status posisi dengan exchange pada integrasi Testnet;
- penanganan partial fill;
- penanganan koneksi terputus;
- pencatatan error tanpa menyimpan secret;
- batas kerugian harian;
- stop loss wajib;
- mode paper trading sebagai default.

API key tidak boleh berada di frontend, repository, log, atau file yang dikomit ke GitHub. Untuk tahap exchange, withdrawal permission harus dinonaktifkan.

## 14. Pengujian

Urutan pengujian:

1. Unit test indikator dan perhitungan risiko.
2. Backtest dengan fee, funding, spread, dan slippage.
3. Out-of-sample test.
4. Walk-forward test.
5. Paper trading.
6. Binance Futures Testnet.
7. Audit keamanan dan rekonsiliasi order.
8. Live dengan modal sangat kecil hanya setelah persetujuan dan evaluasi.

Metrik minimum yang dicatat:

- net P/L;
- profit factor;
- expectancy;
- maximum drawdown;
- win rate;
- average win/loss;
- biaya trading;
- funding fee;
- slippage;
- jumlah trade;
- performa per regime market;
- error eksekusi.

## 15. Kriteria Selesai MVP

MVP dianggap siap untuk paper trading jika:

- data candle dapat divalidasi;
- sinyal memiliki alasan yang dapat dijelaskan;
- bot dapat menghasilkan `NO_TRADE`;
- ukuran posisi dan stop loss dihitung konsisten;
- tidak ada duplikasi order simulasi;
- seluruh trade tercatat;
- batas rugi harian berjalan;
- restart aplikasi tidak merusak status paper position;
- dashboard menampilkan status dan riwayat;
- unit test dan simulasi utama lulus.

## 16. Keputusan yang Masih Perlu Dikonfirmasi

- Nama proyek dan nama repository.
- Apakah pair awal hanya BTCUSDT dan ETHUSDT.
- Apakah timeframe 1H/15M tetap digunakan.
- Apakah paper trading memakai saldo simulasi tertentu.
- Apakah dashboard memerlukan login sejak MVP pertama.
- Apakah notifikasi awal menggunakan Telegram atau hanya dashboard.
