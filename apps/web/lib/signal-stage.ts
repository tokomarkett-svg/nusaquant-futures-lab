import type { BoardRow } from './binance';

export type SignalStage = 'PINTU' | 'C1' | 'C2' | 'SIAP' | 'BASI' | 'BATAL' | 'PANTAU';

/** Tahapan tampilan dari SATU snapshot scanner worker; tidak menghitung ulang rumus.
 * SIAP hanya boleh berasal dari verifikasi aplikasi (manualTicket) yang juga
 * diwajibkan sebelum Telegram mengirim alarm TIKET. Peringkat selalu lebih aman:
 * BATAL/BASI menang di atas SIAP, lalu bukti X -> C1 -> C2. */
export function signalStage(row: BoardRow, snapshotAt: string, now = Date.now()): SignalStage {
  const setup = row.setup;
  if (row.status === 'PADAM' || setup.note?.includes('kena BATAL')) return 'BATAL';
  const c2 = setup.candle2;
  const recentSnapshot = Number.isFinite(Date.parse(snapshotAt)) && now - Date.parse(snapshotAt) <= 120_000;
  const freshData = row.dataAgeMin + Math.max(0, (now - Date.parse(snapshotAt)) / 60_000) <= 45;
  if (c2 !== null) {
    if (!setup.valid) return 'BATAL'; // C2 tertutup tetapi gagal merebut pintu / kualitasnya tidak sah
    if (now > c2 + 4 * 900_000 || row.ticket?.chaseRisk || (row.ticket?.entryAgeBars ?? 0) > 3) return 'BASI';
    if (row.technicalReady === true && row.gateAlign && row.ticket?.actionable && recentSnapshot && freshData) return 'SIAP';
    return 'C2'; // C2 sudah ada, tetapi gate/data/harga/verifikasi belum meloloskan SIAP
  }
  // X punya batas hidup 12 candle. Jangan terus menampilkan proses lama sebagai calon baru.
  if (setup.x !== null && now > setup.x + 13 * 900_000) return 'BASI';
  if (setup.candle1 !== null) return 'C1';
  if (setup.x !== null) return 'PINTU';
  return 'PANTAU';
}
