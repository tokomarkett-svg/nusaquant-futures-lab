# NusaQuant Triad Intelligence Doctrine v0.1

Dokumen ini menerjemahkan prinsip publik tiga trader menjadi modul yang dapat diuji. Ini bukan klaim bahwa bot mengetahui pikiran pribadi mereka dan bukan jaminan performa.

## 1. Jesse Livermore — Price and Trend Engine

### Prinsip yang dioperasionalkan

- mengikuti trend yang jelas;
- membaca price action dan pivot;
- mengonfirmasi breakout dengan candle close dan volume;
- tidak averaging posisi yang sedang rugi;
- memotong loss sesuai invalidasi;
- memberi ruang kepada posisi yang menang melalui target dan trailing rule.

### Output modul

```text
trendBias
structureBias
pivotLevel
breakoutState
volumeConfirmation
candleConfirmation
candidateDirection
```

Modul tidak boleh membuka order sendiri. Ia hanya menghasilkan kandidat dan bukti.

## 2. Paul Tudor Jones — Regime and Volatility Engine

### Prinsip yang dioperasionalkan

- strategi harus menyesuaikan regime;
- volatilitas mengubah ukuran risiko;
- kondisi risk-off dapat memblokir entry;
- modal dijaga ketika market tidak jelas;
- prediksi tidak boleh mengalahkan data baru.

### Regime awal

```text
TREND_UP
TREND_DOWN
RANGE
HIGH_VOLATILITY
LOW_LIQUIDITY
RISK_OFF
UNCERTAIN
```

Untuk crypto, macro filter dapat menggunakan data yang tersedia seperti BTC trend, market breadth, funding, open interest, volatility, dan event calendar. Data macro tidak boleh dipalsukan jika adapter belum tersedia.

## 3. Stanley Druckenmiller — Conviction and Allocation Engine

### Prinsip yang dioperasionalkan

- conviction berasal dari alignment bukti dan catalyst, bukan perasaan;
- reward harus asimetris terhadap risiko;
- ukuran posisi dihitung dari stop distance dan risk budget;
- conviction tidak dapat melewati batas risiko;
- low-conviction setup ditolak atau hanya diamati.

### Output modul

```text
qualityScore
expectedValueAfterCosts
riskBudget
positionSize
allocationTier
```

Skor bukan probabilitas menang sampai dikalibrasi dengan out-of-sample data.

## 4. Risk Governor — Hak Veto

Risk governor berada di luar tiga modul dan memiliki hak veto:

- daily loss limit tercapai;
- data stale atau tidak lengkap;
- stop loss tidak dapat dihitung;
- risk-reward tidak memenuhi syarat;
- exposure dan korelasi terlalu tinggi;
- slippage/spread melewati batas;
- koneksi exchange bermasalah;
- cooldown atau emergency stop aktif.

Jika satu risiko kritis gagal:

```text
NO_TRADE
```

## 5. Cara Menggabungkan Modul

```text
Price engine      → menemukan kandidat
Regime engine     → menentukan apakah kondisi mendukung
Conviction engine → menilai kualitas dan ukuran risiko
Risk governor     → menyetujui atau menolak
Trigger engine    → menunggu candle/price trigger
Execution engine  → mengirim paper/testnet/live order sesuai mode
```

## 6. State Decision

```text
OBSERVE
SETUP
WAIT_CONFIRMATION
ENTRY_READY
NO_TRADE
POSITION_OPEN
EXIT
PAUSED
```

`ENTRY_READY` hanya boleh muncul jika context, setup, trigger, biaya, dan risiko telah lulus. Waktu hanya menjadi watch window dan tidak boleh menjadi alasan tunggal untuk entry.

## 7. Aturan Anti-Halusinasi Sinyal

Bot harus menghasilkan `NO_TRADE` jika:

- tidak memiliki data historis minimum;
- indikator belum warm-up;
- candle belum close;
- evidence saling bertentangan;
- window waktu belum memiliki sampel cukup;
- expected value setelah fee/funding/slippage tidak positif dengan buffer;
- entry sudah terlalu jauh dari zona;
- setup tidak dapat dijelaskan dalam jurnal.
