# NusaQuant Futures Lab

NusaQuant Futures Lab adalah platform riset dan paper-trading untuk Binance USDⓈ-M Futures. Proyek ini **belum merupakan bot live** dan tidak boleh diperlakukan sebagai jaminan profit.

> **Mode keselamatan saat ini: paper trading / research only.** Tidak ada Binance private order, Testnet order, atau live order yang diaktifkan.

## Handoff singkat untuk sesi/agent berikutnya

**Tanggal status:** 10 September 2026, Asia/Jakarta
**Branch:** `main`
**Commit fitur terakhir:** `26df0f9 fix: reject stale worker market data`
**Repository:** `tokomarkett-svg/nusaquant-futures-lab`

### Mulai dari sini

1. Baca bagian **Status Saat Ini**, **Temuan Backtest**, dan **Pekerjaan Berikutnya**.
2. Jalankan `git status --short --branch` dan pastikan tidak ada perubahan yang hilang.
3. Jangan mengubah threshold, stop-loss, atau rule entry untuk mempercantik metrik.
4. Baca entry timing diagnostics sebelum mengubah rule entry atau stop-loss.
5. Jalankan seluruh validasi sebelum commit dan push.
6. Jangan meminta atau memasukkan credential ke source code, `.env` ter-commit, log, README, atau chat.

## Status Saat Ini

### Yang sudah selesai dan tervalidasi

- Monorepo web, core, dan worker.
- Dashboard Next.js di Vercel.
- Worker paper/ingestion di Railway.
- Supabase schema dan health check.
- Public Binance market-data adapter tanpa private API key.
- Historical backfill satu kali untuk 90 hari.
- Backtest dengan pagination Supabase.
- Cost-aware position sizing.
- Research gate dan trade diagnostics.
- Edge diagnostics berdasarkan side, quality score, exit reason, regime, dan periode.
- Entry timing diagnostics berdasarkan trigger candle range/ATR, entry distance/EMA20, dan stop distance/ATR.
- State machine paper trading dengan approval, pause, emergency stop, stop-loss, take-profit, cooldown, dan restore state.

Validasi terakhir yang lulus sebelum commit edge diagnostics:

- Web typecheck: pass
- Worker typecheck: pass
- Core tests: 12 pass
- Worker tests: 9 pass
- Production build: pass
- `npm audit --omit=dev`: 0 vulnerability
- `git diff --check`: pass

### Batas produk saat ini

| Area | Status | Keterangan |
|---|---|---|
| Signal engine | Berfungsi secara lokal | Menghasilkan `LONG`, `SHORT`, atau `NO_TRADE` dari candle closed |
| Risk sizing | Berfungsi secara lokal | Stop distance, fee, slippage, funding, dan max holding bars masuk estimasi quantity |
| Backtest | Berfungsi | Sudah membaca sample besar dan menghitung biaya |
| Edge diagnostics | Berfungsi | Tabel sudah tampil di dashboard |
| Entry timing diagnostics | Implemented | Trigger range/ATR, entry distance/EMA20, stop distance/ATR |
| Triad timing hypothesis | Research-only | Trigger <1.2 ATR dan entry distance >=0.25 ATR; ditolak setelah OOS |
| Triad retest hypothesis | Research-only | Trigger → retest level candle sebelumnya ≤3 candle; belum production |
| Historical backfill | Berhasil | 90 hari BTCUSDT/ETHUSDT, interval 15M/1H |
| Public market polling | Tersedia | REST/polling, belum WebSocket production |
| Paper state machine | Fondasi dan test berfungsi | End-to-end production masih perlu smoke test |
| Bot control API | Tersedia | Start, pause, approve, emergency; membutuhkan env Supabase server |
| Paper P/L accounting | Implemented locally | Fee, slippage, funding, net realized P/L, dan cost metadata sudah dihitung; production smoke test masih perlu |
| Daily-loss hard block | Implemented locally | Risk Governor memblokir entry dan mem-pause engine setelah limit tercapai; persistence production masih perlu smoke test |
| Testnet | Belum dimulai | Jangan diaktifkan sebelum paper dan OOS lulus |
| Live trading | Tidak dimulai | Jangan menghubungkan private API |
| Temporal out-of-sample | Implemented | 70/30 split tersedia di API/dashboard; BTCUSDT sudah dijalankan |
| Walk-forward validation | Implemented | 3 forward folds tersedia di API/dashboard; hasil BTC terbaru perlu dijalankan ulang |

## Arsitektur

```text
apps/web
  Dashboard Next.js, API backtest, API bot session, UI controls

packages/core
  Candle model, indicators, signal engine, intelligence layer,
  opportunity planner, risk-aware sizing, backtest runner

services/worker
  Public market ingestion, one-time backfill, paper bot engine,
  Supabase session controller, position persistence

supabase/migrations
  bot sessions, market candles, signals, paper orders/positions,
  trade journal, equity snapshots, RLS
```

## Konfigurasi Strategi Saat Ini

- Symbol: `BTCUSDT`, `ETHUSDT`
- Higher timeframe: `1h`
- Entry timeframe: `15m`
- Gaya: trend-following pullback
- Default risk fraction: `0.0025` atau 0,25% per transaksi
- Default initial equity backtest: `10,000 USDT`
- Fee rate backtest: `0.0004`
- Slippage rate backtest: `0.0002`
- Funding rate per bar: `0.00001`
- Maximum holding time: `96` entry bars
- Timezone: `Asia/Jakarta`

## Hasil Backtest Terakhir

### BTCUSDT, sample 90 hari setelah fill-model fix

Dashboard terbaru menampilkan `2.169 candle 1H` dan `8.679 candle 15M`.

- Trades: `84`
- Win/loss: `23W / 61L`
- Win rate: `27.4%`
- Net P/L: `-634.39 USDT`
- Expectancy: `-0.311R`
- Profit factor: `0.47`
- Max drawdown: `-729.87 USDT / 7.30%`
- Research gate: `FAIL`

Hasil ini menggantikan angka sebelum fill-model fix (`-599.06 USDT`). Penurunan performa setelah fill yang lebih konsisten membuat baseline sekarang lebih konservatif.

### BTCUSDT edge breakdown terbaru

#### By side

- LONG: 53 trade, win rate 30,2%, expectancy -0,38R, net -380,73 USDT
- SHORT: 31 trade, win rate 22,6%, expectancy -0,34R, net -253,67 USDT

Kedua arah tetap negatif. Ini bukan masalah long-only atau short-only secara sederhana.

#### By quality score

- 72–79: 17 trade, expectancy -0,50R, net -206,37 USDT
- 80–89: 58 trade, expectancy -0,24R, net -336,95 USDT
- 90–100: 9 trade, expectancy -0,42R, net -91,07 USDT

Score belum terkalibrasi sebagai probabilitas kemenangan. Bucket score tinggi belum menghasilkan expectancy positif.

#### By exit reason

- Stop-loss: 58 trade, win rate 0%, net -1.168,09 USDT, expectancy -0,83R
- Take-profit: 21 trade, net +520,23 USDT, expectancy +1,01R
- Time exit: 5 trade, net +13,46 USDT, expectancy +0,10R

Stop-loss masih menjadi sumber kerugian dominan. Exit reason adalah klasifikasi hasil, bukan bukti bahwa target memiliki probabilitas 95% secara keseluruhan.

#### By periode entry

- 2026-06: 11 trade, net +26,46 USDT; sample kecil
- 2026-07: 36 trade, net -300,95 USDT
- 2026-08: 30 trade, net -295,79 USDT
- 2026-09: 7 trade, net -64,11 USDT; sample parsial

Juli dan Agustus menyumbang mayoritas kerugian pada sample yang lebih besar.

### Temporal validation BTCUSDT terbaru

Split `70/30` menghasilkan:

- In-sample: 58 trade, win rate 27,6%, net -460,71 USDT, expectancy -0,324R, profit factor 0,45
- Out-of-sample: 26 trade, win rate 26,9%, net -182,08 USDT, expectancy -0,282R, profit factor 0,51

OOS masih berstatus `NOT READY` karena kurang dari 30 trade. Walaupun sampelnya belum cukup untuk gate formal, OOS tetap negatif dan arahnya konsisten dengan in-sample. Jangan menjumlahkan net P/L dua slice sebagai equity curve karena masing-masing slice dimulai dari initial equity terpisah.

### ETHUSDT, hasil sebelumnya sebelum fill-model fix

- Trades: `81`
- Win/loss: `28W / 53L`
- Win rate: `34.6%`
- Net P/L: `-413.20 USDT`
- Expectancy: `-0.207R`
- Profit factor: `0.65`
- Max drawdown: `-553.72 USDT / 5.54%`
- Research gate: `FAIL`

ETHUSDT wajib di-rerun setelah deployment fill-model fix sebelum dibandingkan dengan BTCUSDT.
## Perbaikan Teknis Terbaru

Commit `edf7b4e` sudah memperbaiki ketidakkonsistenan harga fill backtest. Sebelumnya simulator mendeteksi stop/target menggunakan `high`/`low` candle, tetapi memakai `candle.close` sebagai harga exit.

Sekarang model fill menjadi:

- `STOP_LOSS` → exit pada `signal.stopLoss`
- `TAKE_PROFIT` → exit pada `signal.takeProfit`
- `TIME_EXIT` → exit pada close candle
- Fee, slippage, dan funding dihitung setelah harga fill tersebut

Test regresi khusus untuk ketiga jalur exit sudah ditambahkan dan seluruh validasi lokal lulus. Metrik dashboard sebelum commit ini tetap dianggap diagnosis awal; hasil final harus diambil dari rerun setelah deployment terbaru. Backtest sekarang juga menampilkan execution audit gross P/L sebelum biaya, total biaya, net P/L setelah biaya, dan proporsi stop/target/time exit agar masalah signal tidak tertukar dengan masalah fill.

Research-only `TRIAD_TIMING_HYPOTHESIS` menolak trigger dengan range `>=1.2 ATR` atau entry dengan jarak `<0.25 ATR` dari EMA20. Variant ini menghasilkan full-sample lebih kecil tetapi OOS lebih buruk, sehingga ditolak dan tidak mengubah signal paper/live. `TRIAD_RETEST_HYPOTHESIS` menguji entry setelah retest level candle sebelumnya dalam maksimal tiga candle, juga hanya sebagai research comparison.

## Pekerjaan Berikutnya

Urutan kerja yang disepakati:

1. Deployment commit `f34a7ad` sedang diverifikasi di Vercel/Railway.
2. Jalankan ulang BTCUSDT dan ETHUSDT agar entry timing diagnostics serta dua research variant terisi.
3. Bandingkan baseline, `TRIAD_TIMING_HYPOTHESIS`, dan `TRIAD_RETEST_HYPOTHESIS` pada full-sample dan OOS.
4. Candidate hanya boleh dipromosikan jika OOS membaik tanpa mengorbankan sample dan konsisten di fold.
5. Jika retest candidate layak, jalankan walk-forward khusus candidate; jika tidak, audit exit architecture.
6. Jalankan production smoke test paper: start → signal → approval → open → costed close → daily-loss block → recovery.
7. Hanya jika edge stabil dan positif, lanjutkan evaluasi paper execution yang lebih lama.
8. Testnet/live tetap terkunci sampai seluruh research dan security gate lulus.

## Deployment dan Environment

### Web

- Target: Vercel project `web`
- Frontend boleh memakai `NEXT_PUBLIC_SUPABASE_URL` dan `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- Jangan pernah menaruh `SUPABASE_SERVICE_ROLE_KEY` di frontend atau repository.

### Worker

- Target: Railway.
- Worker hanya menggunakan public Binance market data untuk saat ini.
- Start command production yang benar:

```text
npm run ingest:watch --workspace @nusaquant/worker
```

- Backfill hanya one-time command:

```text
npm run ingest:backfill --workspace @nusaquant/worker
```

- Jangan menjadikan backfill sebagai start command permanen.
- Worker memerlukan `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, dan konfigurasi session yang sesuai.

### Environment penting

```text
BACKFILL_DAYS=90
BACKFILL_INTERVALS=15m,1h
BOT_SESSION_IDS=00000000-0000-4000-8000-000000000001,00000000-0000-4000-8000-000000000002
CONTROL_POLL_INTERVAL_MS=10000
```

Credential asli tidak boleh ditulis ke README ini. Jika credential pernah terekspos, revoke dan rotate segera.

## Cara Validasi Lokal

Dari root repository:

```bash
npm install
npm run typecheck
npm test
npm run build
npm audit --omit=dev
git diff --check
```

Untuk memeriksa status:

```bash
git status --short --branch
git log --oneline -5
```

## Guardrail dan Keputusan Keselamatan

- `NO_TRADE` adalah keputusan valid.
- Candle belum close tidak boleh menjadi dasar entry.
- Conviction/quality score bukan jaminan profit atau probabilitas menang.
- Risk Governor harus dapat membatalkan signal.
- Tidak ada private Binance API pada fase ini.
- Tidak ada Testnet/live order berdasarkan hasil backtest negatif.
- Backtest negatif atau sample kecil menghentikan eskalasi.
- Tidak boleh tuning acak hanya untuk mempercantik metrik.
- Semua perubahan strategi harus diuji out-of-sample/walk-forward.

## File Penting

- `apps/web/app/api/backtest/route.ts` — backtest API dengan pagination 1.000 row/page dan maksimum 20.000 candle.
- `apps/web/app/components/BacktestPanel.tsx` — research gate, edge diagnostics, entry timing diagnostics, dan trade diagnostics.
- `apps/web/app/components/BotControls.tsx` — kontrol paper session.
- `apps/web/app/api/bot/session/route.ts` — API start/pause/approve/emergency.
- `packages/core/src/intelligence.ts` — intelligence layer dan cost-aware quantity sizing.
- `packages/core/src/backtest.ts` — simulator, cost model, exit handling, temporal OOS, walk-forward, dan entry timing diagnostics.
- `packages/core/src/backtest.test.ts` — test backtest.
- `services/worker/src/index.ts` — paper bot state machine.
- `services/worker/src/session-control.ts` — restore/persist paper state ke Supabase.
- `services/worker/src/market-data.ts` — public Binance adapter dan polling.
- `services/worker/src/ingest.ts` — ingestion watch.
- `services/worker/src/backfill.ts` — one-time historical backfill.
- `supabase/migrations/20260909000000_initial_schema.sql` — schema/RLS.
- `docs/05-bot-controls.md` — dokumentasi kontrol bot dan backfill.

## Ringkasan Historis Commit

- `26df0f9` — worker menolak evaluasi dari candle market stale dan dev script benar-benar menjalankan ingestion/control watch.
- `da77d4e` — execution audit gross/net/cost dan exit-reason rates di backtest.
- `f34a7ad` — surface stale market data, explicit backtest errors, request timeout, dan latest candle/run timestamp.
- `9b7bf22` — research-only retest entry hypothesis.
- `8ee1dd0` — automatic rejection verdict untuk candidate OOS yang tidak membaik.
- `c9c2cc7` — research-only triad timing hypothesis dan comparison cards.
- `4df73b9` — persist cost metadata dan risk pause setelah restore.
- `3e7660a` — paper cost accounting dan daily-loss guard.
- `b1f79b5` — entry timing diagnostics untuk membaca kualitas trigger dan jarak entry.
- `233e7b2` — walk-forward validation report 3 forward folds di API/dashboard.
- `8106760` — temporal out-of-sample validation 70/30 di API/dashboard.
- `edf7b4e` — gunakan stop/target fill price yang benar di backtest.
- `eb0cdb3` — README handoff, status riset, dan batas scope.
- `7a644c8` — edge diagnostics di dashboard dan report backtest.
- `1cae534` — historical candle dengan volume nol diterima.
- `7bdae50` — pagination backtest sampai 20.000 candle.
- `1181ac8` — cost-aware position sizing.
- `2ca8dee` — research gate dan trade diagnostics.
- `ed9ec77` — historical market candle backfill.

## Definisi Selesai MVP Aman

MVP aman belum dianggap selesai hanya karena dashboard menampilkan sinyal. Minimal harus:

- memakai candle closed;
- memiliki `NO_TRADE`;
- memiliki state machine yang dapat dipulihkan;
- memiliki risk cap dan daily loss enforcement;
- memiliki paper broker dengan biaya realistis;
- menyimpan alasan keputusan dan trade journal;
- memiliki backtest cost-aware;
- lulus out-of-sample dan walk-forward;
- tidak mengirim order real;
- lulus typecheck, test, build, audit, dan security review.
