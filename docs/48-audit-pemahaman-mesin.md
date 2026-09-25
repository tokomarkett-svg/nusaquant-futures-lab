# 48 — Audit pemahaman mesin: apakah bot baca pola persis teknik kita?

Diperiksa ulang baris-per-baris kodenya + diuji ke data hidup Binance Futures (25/9 malam).
Metode: `audit-teknik.ts` — recompute penuh dari data live, tiap aturan ditampilkan + putusan.

## A. Garis (rumus asli) — SESUAI
| Aturan | Isi mesin | Status |
|---|---|---|
| High − Low = range | `zones.ts` baris 48–57 | ✓ |
| LONG: pintu = High − range×0.705, manis ×0.786, batal ×0.886 | idem | ✓ |
| SHORT = cermin: pintu = Low + range×0.705, dst | idem | ✓ |
| Zona mati: candle TERTUTUP menembus garis batal | `detectSetup` | ✓ |

## B. Pola X → candle 1 → candle 2 — SESUAI (dua arah, cermin)
| Langkah | Isi mesin | Status |
|---|---|---|
| X = menusuk garis pintu dari luar (candle sebelumnya di luar) | LONG: low ≤ pintu · SHORT: high ≥ pintu | ✓ |
| Candle 1: buntut jatuh DI DALAM pita pintu–batal | long: low di pita · short: high di pita | ✓ |
| Buntut ≥ 2× badan (ONT 17:00 = 1,89× ditolak; FLOKI kemarin 8× lolos) | `wickRatio < 2 → tolak` | ✓ |
| Badan terlihat (≥8% range, bukan doji) | `visibleBody` | ✓ |
| Close paruh luar = tanda penolakan | long: paruh atas · short: paruh bawah | ✓ |
| Candle 2: close menembus puncak (long) / dasar (short) candle 1, maks 3 candle | `c1Index+3` | ✓ |
| X lebih tua dari 12 candle → kedaluwarsa | `TOUCH_EXPIRY_CANDLES` | ✓ |
| Entry = close candle 2 · stop = ekor candle 1 · target 2R · ukuran dari 0,31 USDT | `computeTicket` | ✓ |
| Anti-nyangkut: harga sudah lari >0,5R dari entry → tiket tak boleh dieksekusi | `chaseRisk` | ✓ |

## C. Notif — HANYA bicara kalau pantas (mode TIKETSIAP)
1. Bel pintu 🔔: cuma kalau gate 1H SEARAH + X baru terjadi (≤1 candle) + belum pernah dikirim.
2. Tiket 🎯: cuma kalau paket SAH + tiket masih hidup (bukan basi) + gate SEARAH. Gate kuning/belum searah = TIDAK dikirim.
3. Anti spam: satu notif per X / per candle 2 (kunci unik), tidak diulang-ulang.
4. Isi notif = persis format kita: SIAP ENTRI — koin + arah (LONG/SHORT, BUY/SELL), ENTRY (angka besar), SL, TP, ukuran coin, gate ✔, garis pintu·manis·batal, jam lahir tiket, perintah salin `BUY/SELL KOIN entry SL tp TP`, plus pengingat 1% risiko · maks 2 trade/hari · stop SEBELUM entry.

## D. Bukti hidup 25/9 malam (bukan karangan)
- **BCHUSDT SHORT**: X 08:00 → C1 sah (buntut 8,83× ✓ badan 9,7% ✓ close paruh ✓) → C2 sah → tapi umur C2 sudah 44 candle (maks 3) → **PUTUSAN: TIDAK LAYAK — TIDAK ADA NOTIF** ✓ bot menolak paket basi.
- **FFUSDT SHORT**: paket sah tapi C2 umur 11 candle → **TIDAK LAYAK** ✓.
- **BCHUSDT LONG**: X baru 18:45, candle 1 belum sah → bot DIAM dan MENUNGGU ✓.
- **EIGENUSDT**: X ada tapi candle 1 tak sah + gate KUNING → **DIAM** ✓.

## E. Kesimpulan
Bot tidak ngawur: dia hanya bersuara setelah lolos 8 pintu — likuid ≥5jt, range ≥3%, data ≤45 menit,
zona hidup (belum kena batal), X sah, candle 1 sah, candle 2 sah & muda, gate searah.
Diam berarti belum ada paket yang pantas — bukan bot rusak.
