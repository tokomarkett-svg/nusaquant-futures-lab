# Cross-asset review — ETHUSDT/WILLIAMS_VOLATILITY_BREAKOUT_HYPOTHESIS (2026-09-17)

Syarat konstitusi sebelum persetujuan paper: playbook yang lolos gerbang promosi wajib di-review
lintas aset secara tertulis. Data: long-history 2020-01 → 2026-08 (80 bulan), entry 1H, konteks 4H,
aturan persis `docs/19` (tanpa satu perubahan pun), dari run yang sama dengan
`reports/local-research-williams-longhistory.json` (direproduksi ulang, angka identik).

## Bukti per aset dan per sisi

| | BTCUSDT | ETHUSDT |
| --- | --- | --- |
| Net full | +128 USDT (571 trade) | +1.183 USDT (541 trade) |
| sisi LONG | 303 trade · +25.4R · +644 USDT | 283 trade · **+48.1R · +1.244 USDT** |
| sisi SHORT | 268 trade · **−19.4R · −516 USDT** | 258 trade · −2.5R · −61 USDT |
| median range harian | 3.76% | 5.00% |
| tahun positif (dari 7) | 5 (2025: −11.6R, 2026: −9.0R) | 6 (hanya 2023: −4.1R; 2025: +7.5R, 2026: +12.0R) |
| exits (SL / TIME / TP) | 228 / 294 / 49 | 203 / 290 / 48 |

## Kenapa ETH lulus dan BTC tidak

1. **Sisi short adalah sumber kegagalannya, di kedua aset.** Long positif di BTC maupun ETH;
   short rugi di keduanya, dan di BTC kerugiannya (−19.4R) memakan habis edge long. Struktur
   pasar 2020-2026 (bullish dominan + short-squeeze) membuat gate short sering tertembus tanpa
   follow-through — persis kegagalan yang diperingatkan sumber Larry Williams: breakout tanpa
   follow-through.
2. **Volatilitas relatif ETH ~33% lebih besar** (median range harian 5.0% vs 3.8%). Premis strategi
   ini adalah ekspansi range; semakin besar range relatif, semakin bermakna gate 0.5×range dan
   semakin sering ada ruang untuk target 3R. BTC bukan "rusak" — edge long-nya ada (+25.4R) tapi
   terlalu tipis untuk menutup short-nya.
3. **Stabilitas tahunan**: ETH positif di 6 dari 7 tahun kalender; BTC memburuk justru di dua
   tahun terakhir (−11.6R, −9.0R) — konsisten dengan hasil full-year 12 bulan yang REJECT di BTC.

## Keputusan

- **ETHUSDT/WILLIAMS_VOLATILITY_BREAKOUT_HYPOTHESIS disetujui masuk antrean paper trading**,
  dengan aturan persis seperti yang lulus (dua sisi, k=0.5, SMA5/45, 3R, 72 bar, risk 0.25%).
  Aturan TIDAK diubah berdasarkan review ini — yang lulus adalah aturan dua sisi, itu yang
  dipaperkan.
- **BTCUSDT tetap research-locked.** Tidak boleh "diperbaiki" dengan mematikan sisi short:
  itu adalah perubahan aturan setelah melihat hasil, dan hanya boleh masuk sebagai hipotesis
  BARU yang pra-registrasi (`long-only` sebagai spec terpisah, dengan pengakuan tertulis bahwa
  idenya muncul dari melihat data ini — risiko bias seleksi wajib dicantumkan).
- Karakter yang harus diharapkan saat paper: profit terkonsentrasi di ekor kanan (TP hanya ~9%
  trade; mayoritas keluar lewat TIME_EXIT), win rate ~41%, dan ada tahun datar/negatif (2023 di
  ETH). Paper harus melewati minimal satu fase flat tanpa intervensi parameter.

## Batas kejujuran review ini

- Satu aset lulus, satu gagal → ini bukti bahwa edge spesifik-konteks, bukan hukum pasar.
  Portofolio multi-playbook (otak #3, Andrea Unger) tetap agenda berikutnya.
- Semua angka memakai asumsi biaya repo (fee 0.0004, slippage 0.0002, funding/bar 0.00001).
  Edge +0.084R/trade cukup tipis sehingga paper trading adalah uji asumsi biaya yang sesungguhnya.

## Cara menyalakan paper trading Williams (ETH-only) — 2026-09-17

Wiring sudah diimplementasikan (engine `strategy`, TIME_EXIT 72 bar, pending expiry mengikuti
candle entry, ingest/backfill via env). Langkah di sisi deploy (Railway + Supabase):

1. **Backfill satu kali** (butuh ≥ 46 hari close harian untuk SMA45; 60 hari = 1.440 candle 1H):
   jalankan worker dengan `RUN_MARKET_BACKFILL=true BACKFILL_INTERVALS=1h BACKFILL_DAYS=60
   SYMBOLS=ETHUSDT BINANCE_BASE_URL=https://fapi.binance.com`.
   (`BINANCE_BASE_URL` wajib diset eksplisit: default backfill mengarah ke testnet.)
2. **Sesi bot**: set session ETH (`00000000-0000-4000-8000-000000000002`) ke `symbol=ETHUSDT`,
   `risk_fraction=0.0025`, `mode=PAPER_APPROVAL` (disarankan; PAPER_AUTO hanya setelah terbiasa).
3. **Env worker**: `BOT_STRATEGY=WILLIAMS_VOLATILITY_BREAKOUT`, `RUN_MARKET_INGEST=true`,
   `RUN_MARKET_WATCH=true`. Tanpa env ini engine tetap baseline — perubahan ini backward
   compatible, tidak ada migrasi SQL baru.
4. **Operasional**: sinyal dievaluasi tiap close candle 1H; pada PAPER_APPROVAL entry harus
   disetujui dalam 1 jam (kadaluarsa = batal, bot kembali observasi). Posisi keluar lewat SL,
   TP 3R, atau TIME_EXIT setelah 72 candle 1H (≈ 3 hari). Daily loss limit 1% tetap aktif.
5. **Yang TIDAK boleh disentuh selama paper**: k=0.5, SMA5/45, target 3R, risk 0.25%, dua sisi.
   Intervensi parameter membatalkan validitas statistik 541 trade yang meloloskan playbook ini.
