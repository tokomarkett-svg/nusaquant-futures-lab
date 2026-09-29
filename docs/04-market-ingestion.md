# Market Ingestion — Tahap Berikutnya

Worker sekarang memiliki command untuk mengambil candle publik Binance Futures dan menyimpan candle tertutup ke database SQLite lokal.

## Environment worker

```env
SQLITE_PATH=./data/nusaquant.db
BINANCE_BASE_URL=https://fapi.binance.com
SYMBOLS=BTCUSDT,ETHUSDT
RUN_MARKET_INGEST=true
RUN_MARKET_WATCH=false
INGEST_INTERVAL_MS=60000
```

Tidak ada kredensial database: SQLite adalah file lokal. Jaga file `.db`/`.db-wal`/`.db-shm` seperti menjaga data penting — jangan diunggah ke GitHub atau chat.

## Menjalankan ingestion secara lokal

Dari root repository:

```bash
npm install
SQLITE_PATH="./data/nusaquant.db" \
RUN_MARKET_INGEST=true \
SYMBOLS="BTCUSDT,ETHUSDT" \
npm run ingest --workspace @nusaquant/worker
```

Worker akan mengambil candle closed:

```text
BTCUSDT 15m
BTCUSDT 1h
ETHUSDT 15m
ETHUSDT 1h
```

lalu melakukan upsert ke tabel `market_candles`.

## Verifikasi di SQLite

Dengan `sqlite3` CLI:

```bash
sqlite3 ./data/nusaquant.db "select symbol, interval, count(*) from market_candles group by symbol, interval order by symbol, interval;"
```

Jika berhasil, setiap pair dan interval akan memiliki baris candle.

## Catatan keamanan

- Ingestion memakai public market data Binance; API key Binance belum diperlukan.
- File database memberi akses penuh dan harus tetap berada di server.
- Ingestion bersifat idempotent berdasarkan `symbol`, `interval`, dan `open_time`.
- Candle yang belum selesai dibuang agar signal engine tidak membaca candle berjalan.
- Untuk worker yang berjalan terus, gunakan command `npm run ingest:watch --workspace @nusaquant/worker` setelah environment aman tersedia. Tahap berikutnya adalah menyimpan signal evaluation dan menghubungkan start/pause.
