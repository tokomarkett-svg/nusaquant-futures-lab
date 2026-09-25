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

## F. Uji notif (uji-notif.ts, 25/9 ±20:00 WIB) — LONG & SHORT bentuknya persis teknik kita

**Paket SAH & MASIH HIDUP saat uji (ini yang bakal berbunyi di Telegram):**

```
🎯 SIAP ENTRI — ETCUSDT LONG

👉 ENTRY: 9.5980  (BUY)
🛑 SL     : 9.4100  (−0.31 USDT)
✅ TP     : 9.9740  (+0.62 USDT)
📦 Ukuran : 1,6489 coin

Gate 1H HIJAU ✔ · stop 1.96% dari entry · target 2R
📏 Garis pas bot: pintu 9.4993 · manis 9.3935 · batal 9.2629
Lahir 19:45 WIB — tiket umurnya pendek, lirik yang baru
Semua pagar lolos — harga masih di dekat pintu.

Salin persis ke Binance: BUY ETCUSDT 9.5980 SL 9.4100 TP 9.9740
1% risiko · maksimal 2 trade/hari · stop dipasang SEBELUM entry.
```

**Bentuk kartu SHORT yang sah (replay SNDK 13:45 WIB, gate MERAH ✔ — tapi sudah tua, tak dikirim):**
`🟠 TIKET BASI — jangan dikejar · SNDKUSDT · SHORT · gate 1H MERAH ✔ · Entry 1785.22 · SL 1792.09 · TP 1771.48 · garis pintu 1786.39 manis 1793.19 batal 1801.59`

**Bukti "jangan asal" — tiga cara bot MENOLAK bicara:**
1. NIL LONG paket sah tapi C2 umur 18 candle + harga lari 2,4R → `TIKET BASI — jangan dikejar` (tidak dikirim).
2. SNDK SHORT sah tapi C2 umur 24 candle → ditolak.
3. SOXL SHORT sah tapi gate saat lahir HIJAU (lawan arah short) → `TIKET TERBENTUK TAPI GATE BELUM SEARAH — JANGAN EKSEKUSI` (tidak dikirim).

Alat uji: `services/worker/src/uji-notif.ts` — memindai koin terlikuid, mencari paket LONG & SHORT,
lalu me-render notif Telegram PERSIS seperti aslinya (pakai buildTicketText yang sama dengan mesin).

## G. Kasus MINAUSDT (25/9 ±20:00 WIB) — pemilik ragu, audit membuktikan bot sah

Curiga pemilik: "candle 2 masih ragu, chart malah turun, padahal disuruh long 0.14302."
Fakta audit (data live, harga saat audit 0.14301):
- Garis LONG: pintu 0.14223 · manis 0.14095 · batal 0.13938 (High 0.15333/Low 0.13758, range 11%)
- X = 19:00 (menusuk pintu dari luar) → C1 = 19:15 (buntut 3.92× badan ✓, badan 20% ✓, close paruh luar ✓)
- C2 = 19:30 close 0.14302 di atas puncak C1 ✓ · umur 1 candle (SEGAR) · gate 1H HIJAU searah ✓
- TIKET: entry 0.14302 · SL 0.14087 (ekor C1) · TP 0.14732 (2R) · jarak 1.50% · PUTUSAN: BOLEH ENTRI
- "Chart turun" ke 0.14265 saat screenshot = −0.26% dari entry, belum 0.1R — wajar (retest pintu),
  idea long tetap hidup selama close tidak di bawah garis batal 0.13938. Saat audit harga sudah balik 0.14301.
Pelajaran: turun sedikit setelah entry BUKAN bukti bot salah; hakimnya garis SL/batal, bukan perasaan candle berikutnya.
