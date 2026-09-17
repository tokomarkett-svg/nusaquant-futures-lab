# Paper logbook — ETHUSDT/WILLIAMS_VOLATILITY_BREAKOUT (mulai 2026-09-17)

Dokumen ini pasangan hidup `docs/19` + `docs/20`: tempat membandingkan **paper vs ekspektasi
backtest**, dan aturan keputusan yang harus dipatuhi supaya paper tidak berubah jadi ajang
improvisasi. Sesi: `00000000-0000-4000-8000-000000000002`, mode PAPER_APPROVAL, risk 0.25%
(= 25 USDT per 1R pada equity 10k).

## Ekspektasi dari backtest 6,5 tahun (angka patokan, bukan janji)

| Metrik | Backtest 2020-01 → 2026-08 |
| --- | --- |
| frekuensi | ± 6-7 trade/bulan |
| win rate | ± 41% |
| komposisi exit | TP ≈ 9% · SL ≈ 38% · TIME_EXIT ≈ 53% |
| expectancy | +0.084R/trade ≈ +2 USDT/trade pada risk 25 USDT |
| karakter | beberapa TP 3R membayar banyak SL 1R; ada bulan/tahun datar |

## Cek mingguan (Supabase → SQL Editor)

```sql
select
  count(*) filter (where status = 'CLOSED') as trades,
  count(*) filter (where close_reason = 'TAKE_PROFIT') as tp,
  count(*) filter (where close_reason = 'STOP_LOSS') as sl,
  count(*) filter (where close_reason = 'TIME_EXIT') as time_exit,
  round(sum(realized_pnl) filter (where status = 'CLOSED'), 2) as net_pnl_usdt,
  round(100.0 * count(*) filter (where close_reason = 'TAKE_PROFIT')
        / nullif(count(*) filter (where status = 'CLOSED'), 0), 1) as tp_pct
from public.paper_positions
where bot_session_id = '00000000-0000-4000-8000-000000000002';
```

Catat hasil tiap minggu di bawah (tanggal · trades · tp/sl/time · net).

## Aturan keputusan (pra-registrasi, tidak boleh diubah saat berjalan)

1. **< 30 trade**: tidak menilai apa-apa. Hanya cek kesehatan operasional (sinyal muncul,
   approve jalan, exit tercatat).
2. **30-60 trade**: bandingkan komposisi exit dengan patokan (TP 5-15%, TIME mayoritas).
   Deviasi kecil wajar; deviasi besar = tulis review, jangan ubah parameter.
3. **≥ 60 trade**: uji ekspektansi. Lanjut bila net P/L ≥ 0 dan TP share ≥ 5%.
   **Stop & review tertulis** bila net < −30 trade·R-equivalen (≈ −750 USDT) atau TP share < 3% —
   review mencari penyebab (biaya/slippage/struktur), bukan men-tune parameter.
4. Intervensi yang dilarang: mengubah k, SMA, target, risk, sisi, atau skip sinyal "yang
   terasa jelek". Melewati approval karena sibuk = boleh dan netral; memilih-milih sinyal =
   membatalkan statistik.

## Log mingguan

| Tanggal | trades | tp/sl/time | net USDT | catatan |
| --- | --- | --- | --- | --- |
| 2026-09-17 | 0 | – | – | paper dimulai; setup region SG + backfill 1H + wiring selesai |
