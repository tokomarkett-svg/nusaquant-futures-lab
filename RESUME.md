# Resume sesi — 16 September 2026

File ini ada supaya sesi/agent berikutnya bisa langsung nyambung tanpa perlu dijelaskan ulang.
Status terakhir: commit `248c34d` di `main`, working tree bersih.

## Kondisi saat ini

Bot-nya **tidak rusak**. Sebelum mengubah apa pun, validasi project sudah dijalankan dan lulus:
typecheck, test, build, `npm audit`. Yang belum tuntas adalah sisi **riset**, bukan sisi eksekusi.

Paper approval, Demo/Testnet, dan live **tetap terkunci**. Tidak ada private Binance API.

## Yang sudah dikerjakan sesi ini (8 commit, `8cbe401..248c34d`)

- `packages/core` sekarang ikut di-typecheck. Sebelumnya `npm run typecheck` hanya menjalankan web dan
  worker, jadi core tidak pernah dikompilasi. Menambahkannya langsung memunculkan 4 error nyata.
- `runBacktest` diperbaiki dari O(n²) jadi linear pada lookup higher-timeframe. Terbukti tidak mengubah
  hasil: baseline BTC 2026-05→08 tetap `115 trade / -743.55 / -0.268R / PF 0.54`.
- Pipeline riset dipindah ke `services/worker/src/research-evaluation.ts` supaya worker Railway dan CLI
  lokal memakai satu jalur evaluasi yang sama.
- CLI baru: `npm run research:local --workspace @nusaquant/worker`. Data publik Binance saja, tanpa
  Supabase. Cache di `services/worker/.research-cache/` (gitignored).
- Funnel diagnostik baru di `packages/core/src/diagnostics.ts`: menghitung berapa candle lolos tiap
  kondisi, supaya "0 trade" bisa dibedakan antara aturan salah vs aturan tidak mungkin aktif.
- Parser CSV Binance (klines/funding/metrics) yang tadinya diduplikasi 4x sekarang satu modul:
  `services/worker/src/binance-archive.ts`.
- `market_metrics` yang kosong sekarang fallback ke arsip resmi, dan tiap candidate punya
  `dataStatus` READY / MISSING_DATA.
- Agregat walk-forward tipis tidak lagi tampil `PF ∞`; sekarang `null` di bawah 30 trade.
- Test: 29 → 48 pass (19 core, 29 worker).

## Hasil riset full-history (Sep 2025 → Agu 2026, arsip resmi Binance)

35.040 candle 15M + 8.760 candle 1H + 1.095 funding + 105.120 metrics per symbol.

| Symbol | Trades | Net P/L | R | PF | OOS | WF | Gate |
|---|---:|---:|---:|---:|---:|---:|---|
| BTCUSDT | 376 | -2110.78 | -0.251 | 0.57 | 110 trade, -0.256R, PF 0.56 | -0.284R | REJECT |
| ETHUSDT | 363 | -1814.80 | -0.219 | 0.64 | 110 trade, -0.229R, PF 0.62 | -0.193R | REJECT |

Kesembilan candidate negatif di kedua symbol. Detail lengkap + tabel per candidate:
`docs/17-derivatives-research-and-tooling-2026-09-16.md`. Output mentah: `reports/local-research-*.json`.

### Dua temuan yang harus diingat sebelum membuat hipotesis baru

1. **Threshold funding `|funding| >= 0.0001` itu cap exchange, bukan kejadian ekstrem.**
   Max funding setahun = `0.000100` di BTC dan ETH; nol observasi dari 1.095 yang melebihinya.
   Filter ini memilih ~1 dari 11 observasi. Jangan dinaikkan threshold absolutnya — di sisi positif
   tidak ada ruang di dalam cap. Pengganti harus pakai persentil distribusi berjalan.

2. **Sisi short `LIQUIDATION_RECLAIM` tidak mungkin aktif.** Butuh tiga ratio crowding `<= 0.667`,
   padahal median all-account count ratio setahun `1.467`. Nol dari 34.960 candle pernah memenuhi.
   Sisi long menyempit sampai 11 candle (BTC) / 4 candle (ETH) → 9 dan 4 trade = `NOT_READY_SAMPLE`,
   bukan bukti menolak premis.

## Larangan yang tetap berlaku

- Jangan tuning threshold untuk memperbaiki angka di atas.
- Jangan promosikan apa pun ke paper/Testnet/live berdasarkan hasil ini.
- Jangan memasukkan credential ke source, `.env` ter-commit, log, README, atau chat.
- Hipotesis baru wajib punya funnel yang menunjukkan sample bisa dicapai, sebelum dievaluasi.

## Cara reproduksi cepat

```bash
npm install
npm run typecheck   # core + web + worker
npm test            # 48 pass
npm run build

# baseline saja, ~35 detik dengan cache
npm run research:local --workspace @nusaquant/worker -- --symbols=BTCUSDT --start=2026-05 --end=2026-08 --variants=NONE

# full-history satu symbol, ~50 menit
npm run research:local --workspace @nusaquant/worker -- --symbols=BTCUSDT --start=2025-09 --end=2026-08
```

## Yang belum diverifikasi

- Status deploy Vercel dan Railway, serta isi Supabase production. Worker production belum tentu
  memakai kode `248c34d`; perlu deploy ulang.
- `runBacktest` masih O(n²) di `evaluateIntelligentSignal` karena indikator dihitung ulang dari prefix
  yang membesar tiap candle. Ini item performa terbesar yang tersisa, dan harus dikerjakan sebagai
  perubahan terpisah dengan pengecekan hasil identik.
