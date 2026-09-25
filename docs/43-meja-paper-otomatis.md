# 43 — Meja Paper otomatis (tahap 2): bot yang eksekusi, kita yang menilai

## Apa yang dilakukan meja ini
1. Memindai pasar (aturan sama dengan papan: likuiditas ≥5jt, range ≥3%, data ≤45 menit).
2. Menemukan **🎯 tiket siap** — paket X → candle 1 → candle 2 lengkap, **gate 1H searah**, dan harga belum jalan >0,5R.
3. **Membuka posisi PAPER** (uang demo) di close candle 2: entry, SL di ujung buntut candle 1, TP 2R, ukuran dari 1R = 0,31 USDT.
4. Mengawasi tiap siklus: kalau candle menyentuh SL → tutup; menyentuh TP → tutup; 48 jam tanpa sentuhan → tutup di harga terakhir.
5. Menulis **jurnal otomatis** ke `trade_journal` (nilai proses 6/6) dan `paper_positions`.
6. Mengabari HP-mu lewat Telegram: 📄 saat buka, ✅/❌/⏱ saat tutup.

## Pagar yang dijaga mesin (bukan disiplin manual)
| Pagar | Aturan |
|---|---|
| Posisi bersamaan | 1 per coin |
| Trade per hari | maksimal **2** (hari dihitung WIB) |
| Loss beruntun | **2** → meja tutup sampai besok (pesan 🛑 satu kali) |
| Risiko | 0,31 USDT (1%) per trade, dihitung dari jarak entry→stop |
| Anti-nyangkut | tiket yang harga sudah jalan >0,5R **tidak** diambil |
| Anti-dobel | satu setup (symbol+arah+waktu candle 2) hanya sekali |
| Fill | candle parsial dilewati; satu candle sentuh SL & TP → **dianggap SL** (konservatif) |

## Cara menyalakan (Railway → Variables, 3 menit)
| Variabel | Nilai | Arti |
|---|---|---|
| `RUN_DESK` | `true` | menyalakan meja |
| `DESK_POLL_MS` | `120000` | siklus tiap 2 menit (minimum 60 detik) |

Setelah Save: di **Logs** akan muncul baris `{"desk":true,"watch":true,...}`.
Nama sesinya di database: **Meja Papan (Pintu–Manis–Batal)** — dibedakan dari armada paper lama (ETH/ADA/ZEC/UNI/RUNE).

## Yang kamu lihat
- **Telegram**: 📄 POSISI PAPER DIBUKA · ✅ TARGET KENA (+2R) · ❌ STOP KENA (−1R) · ⏱ ditutup batas waktu · 🛑 meja istirahat.
- **Papan Nominasi** (halaman web): panel **Meja Paper (otomatis)** — posisi terbuka + R berjalan, hasil hari ini (W/L, total R, USDT paper), nilai proses rata-rata.
- **Supabase**: tabel `paper_positions` (sesi `…0010`) dan `trade_journal` (aksi `DESK_OPEN`, `DESK_CLOSE`).

## Jujur soal uang
Meja ini **uang demo saja** — tidak ada order dikirim ke Binance, tidak ada API key dipakai. Tujuannya:
mengumpulkan 20 trade berdisiplin dengan bukti tercatat, **bersamaan** dengan latihanmu di uang sungguhan
(dengan 6 syarat di docs/41). Kalau meja paper belum menghasilkan ekspektasi positif setelah 20 trade,
itu jawaban yang jujur: sistemnya belum layak diperbesar.

## Batas jujur lain
- Sumber harga = mirror publik (spot ≈ perp); fee & funding tidak dihitung di hasil paper.
- Meja tidak tahu berita/bursa; dia hanya tahu aturan kita.
- Waktu siklus 2 menit → eksekusi paper terjadi setelah candle 2 tertutup, bukan pada detik yang sama.
