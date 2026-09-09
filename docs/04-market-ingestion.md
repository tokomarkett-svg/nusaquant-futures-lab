# Market Ingestion — Tahap Berikutnya

Worker sekarang memiliki command untuk mengambil candle publik Binance Futures dan menyimpan candle tertutup ke Supabase.

## Environment worker

```env
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
BINANCE_BASE_URL=https://fapi.binance.com
SYMBOLS=BTCUSDT,ETHUSDT
RUN_MARKET_INGEST=true
```

`SUPABASE_SERVICE_ROLE_KEY` hanya boleh berada di worker/server. Jangan memasukkannya ke frontend, GitHub, Vercel public variables, atau chat.

## Menjalankan ingestion secara lokal

Dari root repository:

```bash
npm install
SUPABASE_URL="..." \
SUPABASE_SERVICE_ROLE_KEY="..." \
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

## Verifikasi di Supabase

Di SQL Editor:

```sql
select symbol, interval, count(*)
from public.market_candles
group by symbol, interval
order by symbol, interval;
```

Jika berhasil, setiap pair dan interval akan memiliki baris candle.

## Catatan keamanan

- Ingestion memakai public market data Binance; API key Binance belum diperlukan.
- Service-role key memberi akses tinggi dan harus tetap berada di server.
- Ingestion bersifat idempotent berdasarkan `symbol`, `interval`, dan `open_time`.
- Candle yang belum selesai dibuang agar signal engine tidak membaca candle berjalan.
- Tahap berikutnya adalah menjadwalkan ingestion dan menyimpan signal evaluation.
