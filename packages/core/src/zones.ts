import type { Candle } from './index.ts';

/**
 * Logika sistem Pintu–Manis–Batal (doktrin NusaQuant) — satu sumber kebenaran
 * yang dipakai halaman web maupun worker (alert Telegram).
 *
 * Zona diukur dari anchor High/Low 24 jam:
 *   long  : dari High, turun ke bawah (pintu 70,5% · manis 78,6% · batal 88,6% dari range)
 *   short : dari Low, naik ke atas (cermin rumus yang sama)
 */

export const RATIO = { pintu: 0.705, manis: 0.786, batal: 0.886 } as const;
export const MIN_RANGE_PCT = 3;
export const MIN_QUOTE_VOLUME = 5_000_000;
export const STALE_CANDLE_MINUTES = 45;
export const TOUCH_EXPIRY_CANDLES = 12;
/** Modal latihan: 31 USDT, risiko 1% per trade. */
export const RISK_USDT = 0.31;
export const TARGET_R = 2;
/** Kalau harga sudah berjalan > 0,5R dari entry → jangan dikejar. */
export const CHASE_LIMIT_R = 0.5;
/** Bawaan = aturan asli: stop ekor candle 1. Nilai 'batal' hanya opsi riset (alat uji balik). */
export function stopMode(): 'buntut' | 'batal' {
  return (process.env.PMB_STOP_MODE ?? 'buntut') as 'buntut' | 'batal';
}

export type Side = 'LONG' | 'SHORT';
export type Gate = 'HIJAU' | 'MERAH' | 'KUNING';
/** PADAM = sisi itu kena BATAL (zona mati sampai High/Low 24 jam bergeser) — bukan mode nonton. */
export type Status = 'MENYALA' | 'SIMAK' | 'DISIMAK' | 'PADAM';
export type Bucket = '<1 jam' | '1-2 jam' | '2-3 jam' | '>3 jam';

export type Zone = { pintu: number; manis: number; batal: number };
export type Zones = { high: number; low: number; range: number; rangePct: number; long: Zone; short: Zone };
export type TickerLike = { high: number; low: number; last: number };

export function zoneOf(zones: Zones, side: Side): Zone {
  return side === 'LONG' ? zones.long : zones.short;
}

export function computeZones(ticker: TickerLike): Zones | null {
  const { high, low, last } = ticker;
  const range = high - low;
  if (!(range > 0) || !(last > 0)) return null;
  return {
    high,
    low,
    range,
    rangePct: (range / last) * 100,
    long: {
      pintu: high - range * RATIO.pintu,
      manis: high - range * RATIO.manis,
      batal: high - range * RATIO.batal,
    },
    short: {
      pintu: low + range * RATIO.pintu,
      manis: low + range * RATIO.manis,
      batal: low + range * RATIO.batal,
    },
  };
}

/** SMA yang mengembalikan satu seri sepanjang input (NaN selama periode belum penuh). */
export function smaSeries(values: number[], period: number): number[] {
  const output = values.map(() => Number.NaN);
  if (period <= 0 || values.length < period) return output;
  let sum = 0;
  for (let index = 0; index < values.length; index += 1) {
    sum += values[index];
    if (index >= period) sum -= values[index - period];
    if (index >= period - 1) output[index] = sum / period;
  }
  return output;
}

export function gateFromCandles(h1: Candle[]): { gate: Gate; close: number; ma25: number; ma99: number } {
  const closes = h1.map((candle) => candle.close);
  const ma25 = smaSeries(closes, 25).at(-1) ?? Number.NaN;
  const ma99 = smaSeries(closes, 99).at(-1) ?? Number.NaN;
  const close = closes.at(-1) ?? Number.NaN;
  if (!Number.isFinite(ma25) || !Number.isFinite(ma99) || !Number.isFinite(close)) {
    return { gate: 'KUNING', close, ma25, ma99 };
  }
  if (close > ma99 && ma25 > ma99) return { gate: 'HIJAU', close, ma25, ma99 };
  if (close < ma99 && ma25 < ma99) return { gate: 'MERAH', close, ma25, ma99 };
  return { gate: 'KUNING', close, ma25, ma99 };
}

export function bucketOf(minutes: number | null): Bucket | null {
  if (minutes === null) return null;
  if (minutes < 60) return '<1 jam';
  if (minutes < 120) return '1-2 jam';
  if (minutes < 180) return '2-3 jam';
  return '>3 jam';
}

/**
 * Zona yang tergambar SEKARANG "lahir" sejak bar terakhir yang mencetak anchor High/Low-nya.
 * Dipakai aturan BATAL: close menembus garis batal mematikan sisi itu SAMPAI High/Low 24 jam
 * bergeser (zona baru tergambar) — bukan sampai harga iseng balik di atas garis.
 * null bila anchor tidak terlihat di data yang tersedia (pemanggil lalu memakai aturan lama).
 */
function anchorEpochTime(candles: Candle[], zones: Zones): number | null {
  const eps = Math.max(Math.abs(zones.high), Math.abs(zones.low)) * 1e-9 + 1e-15;
  let latest: number | null = null;
  for (const candle of candles) {
    if (Math.abs(candle.high - zones.high) <= eps || Math.abs(candle.low - zones.low) <= eps) {
      latest = candle.time;
    }
  }
  return latest;
}

/** Jarak ke pintu: negatif = harga sudah di dalam pita (bel sudah berbunyi). */
export function distanceToPintu(zones: Zones, side: Side, last: number): number {
  const pintu = zoneOf(zones, side).pintu;
  return side === 'LONG' ? ((last - pintu) / last) * 100 : ((pintu - last) / last) * 100;
}

export function detectTouchAge(candles: Candle[], zones: Zones, side: Side, now = Date.now()): number | null {
  const pintu = zoneOf(zones, side).pintu;
  for (let index = candles.length - 1; index >= 0; index -= 1) {
    const candle = candles[index];
    const touched = side === 'LONG' ? candle.low <= pintu : candle.high >= pintu;
    if (touched) return (now - (candle.time + 900_000)) / 60_000;
  }
  return null;
}

export function statusFor(setupValid: boolean, insideBand: boolean, distPct: number, zonaPadam = false): Status {
  if (zonaPadam) return 'PADAM';
  if (setupValid) return 'MENYALA';
  if (insideBand) return 'MENYALA';
  return Math.abs(distPct) <= 1.5 ? 'SIMAK' : 'DISIMAK';
}

export type SetupMarkers = {
  side: Side;
  x: number | null;
  candle1: number | null;
  candle2: number | null;
  staleBars: number | null;
  valid: boolean;
  notes: string[];
  /** Angka tiket — terisi hanya kalau paket lengkap (X → candle 1 → candle 2). */
  entry: number | null;
  stop: number | null;
  riskDistance: number | null;
};

function bodyOf(candle: Candle): number {
  return Math.abs(candle.close - candle.open);
}

/** Deteksi X / candle 1 / candle 2 sesuai doktrin. Dua arah (cermin). */
export function detectSetup(candles: Candle[], zones: Zones, side: Side): SetupMarkers {
  const notes: string[] = [];
  const zone = zoneOf(zones, side);
  const bars = candles.slice(-TOUCH_EXPIRY_CANDLES * 4);
  const empty = { entry: null, stop: null, riskDistance: null };

  // Aturan batal (doktrin): candle TERTUTUP menembus garis batal → zona sisi ini MATI,
  // dan tetap mati SAMPAI zona baru tergambar (High/Low 24 jam bergeser) — harga balik
  // sesaat di atas garis TIDAK menghidupkan zona kembali (inilah yang dulu bikin entri
  // muncul padahal di chart murid zonanya sudah mati).
  // Pemeriksaan memakai SEMUA candle tertutup sejak zona ini lahir; kalau anchor High/Low
  // tidak terlihat di data (mis. candle parsial), jatuh ke aturan lama (candle terakhir saja).
  const terakhir = bars.at(-1);
  const epoch = anchorEpochTime(candles, zones);
  const jendelaMati = epoch !== null ? candles.filter((b) => b.time >= epoch) : terakhir ? [terakhir] : [];
  const tembusBatal = jendelaMati.filter((b) => (side === 'LONG' ? b.close < zone.batal : b.close > zone.batal));
  if (tembusBatal.length > 0) {
    return {
      side, x: null, candle1: null, candle2: null, staleBars: null, valid: false,
      notes: [`zona ${side} kena BATAL: ${tembusBatal.length} candle tertutup menembus garis batal (${side === 'LONG' ? 'di bawah' : 'di atas'} ${zone.batal.toPrecision(6)}) — sisi ini mati sampai zona baru tergambar (High/Low 24j bergeser)`],
      ...empty,
    };
  }

  let xIndex: number | null = null;
  for (let index = bars.length - 1; index >= 1; index -= 1) {
    const candle = bars[index];
    const touched = side === 'LONG' ? candle.low <= zone.pintu : candle.high >= zone.pintu;
    const previousOutside = side === 'LONG' ? bars[index - 1].low > zone.pintu : bars[index - 1].high < zone.pintu;
    if (touched && previousOutside) {
      xIndex = index;
      break;
    }
  }
  if (xIndex === null) {
    notes.push('Belum ada X: harga belum menusuk garis pintu dari luar.');
    return { side, x: null, candle1: null, candle2: null, staleBars: null, valid: false, notes, ...empty };
  }

  const x = bars[xIndex];
  let c1Index: number | null = null;
  let c1InvalidReason: string | null = null;
  // Kamus visual X·1·2: X = bel pintu (bentuk BEBAS) · candle 1 = bukti pertarungan (buntut ≥2×
  // badan di pita, close paruh luar) · candle 2 = kunci masuk. Karena itu candle 1 WAJIB candle
  // SETELAH X — candle X tidak boleh dirangkap jadi candle 1 (dulu bikin entri lahir satu candle
  // lebih awal dari pola manual).
  for (let index = xIndex + 1; index <= Math.min(bars.length - 1, xIndex + TOUCH_EXPIRY_CANDLES); index += 1) {
    const candle = bars[index];
    const inBand = side === 'LONG'
      ? candle.low <= zone.pintu && candle.low >= zone.batal
      : candle.high >= zone.pintu && candle.high <= zone.batal;
    const body = bodyOf(candle);
    const range = candle.high - candle.low;
    const wick = side === 'LONG'
      ? Math.min(candle.open, candle.close) - candle.low
      : candle.high - Math.max(candle.open, candle.close);
    const wickRatio = body > 0 ? wick / body : Number.POSITIVE_INFINITY;
    const closeHalfOk = side === 'LONG'
      ? candle.close >= candle.low + range * 0.5
      : candle.close <= candle.high - range * 0.5;
    const visibleBody = range > 0 && body / range >= 0.08;
    if (!inBand) {
      c1InvalidReason = 'tidak ada candle yang low-nya (high-nya) jatuh di dalam pita pintu–batal';
      continue;
    }
    if (wickRatio < 2) {
      c1InvalidReason = `buntut cuma ${Number.isFinite(wickRatio) ? wickRatio.toFixed(2) : '∞'}× badan (butuh ≥2×) — contoh ONT 17:00 = 1,89×`;
      continue;
    }
    if (!visibleBody) {
      c1InvalidReason = 'badan nyaris nol (doji) — close tak bisa dibaca di paruh atas/bawah';
      continue;
    }
    if (!closeHalfOk) {
      c1InvalidReason = 'close tidak di paruh atas (long) / bawah (short) — belum ada penolakan';
      continue;
    }
    c1Index = index;
    break;
  }
  if (c1Index === null) {
    notes.push(`X ada (${new Date(x.time).toISOString().slice(11, 16)} UTC) tapi candle 1 belum sah: ${c1InvalidReason ?? 'belum muncul'}.`);
    return { side, x: x.time, candle1: null, candle2: null, staleBars: bars.length - 1 - xIndex, valid: false, notes, ...empty };
  }

  const c1 = bars[c1Index];
  let c2Index: number | null = null;
  for (let index = c1Index + 1; index <= Math.min(bars.length - 1, c1Index + 3); index += 1) {
    const candle = bars[index];
    const broke = side === 'LONG' ? candle.close > c1.high : candle.close < c1.low;
    if (broke) {
      c2Index = index;
      break;
    }
  }
  const staleBars = bars.length - 1 - xIndex;
  if (c2Index === null) {
    const c1Body = Math.max(bodyOf(c1), 1e-12);
    const c1Wick = side === 'LONG'
      ? Math.min(c1.open, c1.close) - c1.low
      : c1.high - Math.max(c1.open, c1.close);
    notes.push(`Candle 1 SAH (buntut ${(Math.abs(c1Wick) / c1Body).toFixed(2)}× badan). Candle 2 belum lahir: tunggu close di ${side === 'LONG' ? 'atas puncak' : 'bawah dasar'} candle 1 (maks 3 candle).`);
    if (staleBars > TOUCH_EXPIRY_CANDLES) notes.push(`Sudah ${staleBars} candle sejak X → melewati batas ${TOUCH_EXPIRY_CANDLES} candle (kedaluwarsa).`);
    return { side, x: x.time, candle1: c1.time, candle2: null, staleBars, valid: false, notes, ...empty };
  }

  const candle2 = bars[c2Index];
  // KUALITAS C2 — candle 2 adalah "induk": dari dia kelihatan layak/tidaknya entri (docs/50).
  const merebutPintu = side === 'LONG' ? candle2.close > zone.pintu : candle2.close < zone.pintu;
  const c2Range = Math.max(1e-12, candle2.high - candle2.low);
  const c2ParuhLuar = side === 'LONG'
    ? (candle2.close - candle2.low) / c2Range >= 0.5
    : (candle2.high - candle2.close) / c2Range >= 0.5;
  if (!merebutPintu || !c2ParuhLuar) {
    notes.push(!merebutPintu
      ? `C2 tidak layak: close belum merebut kembali garis pintu (${zone.pintu.toPrecision(6)}) — tembusannya belum berkuasa.`
      : 'C2 tidak layak: close tidak di paruh luar candle-nya (buntut lawan masih panjang) — tenaga tembus lemah.');
    return { side, x: x.time, candle1: c1.time, candle2: candle2.time, staleBars, valid: false, notes, ...empty };
  }
  const entry = candle2.close;
  const stop = side === 'LONG' ? c1.low : c1.high;
  const riskDistance = Math.abs(entry - stop);
  notes.push(`Paket lengkap: X → candle 1 → candle 2 (close ${side === 'LONG' ? 'di atas puncak' : 'di bawah dasar'} candle 1). Entry ${entry}, stop ${stop}.`);
  return { side, x: x.time, candle1: c1.time, candle2: candle2.time, staleBars, valid: true, notes, entry, stop, riskDistance };
}

export type Ticket = {
  side: Side;
  entry: number;
  stop: number;
  target: number;
  riskDistance: number;
  riskPct: number;
  sizeCoin: number;
  riskUsdt: number;
  rewardUsdt: number;
  rr: number;
  stopGeometryOk: boolean;
  stopVsBatal: 'aman' | 'peringatan';
  entryAgeBars: number | null;
  priceNow: number;
  distanceNowPct: number;
  chaseRisk: boolean;
  actionable: boolean;
  warnings: string[];
};

/**
 * Tiket eksekusi otomatis:
 * entry = close candle 2 · stop = ujung buntut candle 1 · target = 2R
 * ukuran coin = 1R ÷ jarak entry→stop, 1R = 0,31 USDT
 */
export function computeTicket(candles: Candle[], zones: Zones, side: Side, priceNow: number): Ticket | null {
  const setup = detectSetup(candles, zones, side);
  if (!setup.valid || setup.entry === null || setup.stop === null || setup.riskDistance === null || setup.riskDistance <= 0) {
    return null;
  }
  const { entry, stop, riskDistance } = setup;
  const target = side === 'LONG' ? entry + TARGET_R * riskDistance : entry - TARGET_R * riskDistance;
  const zone = zoneOf(zones, side);
  const warnings: string[] = [];

  const stopGeometryOk = side === 'LONG' ? stop < entry : stop > entry;
  if (!stopGeometryOk) warnings.push('geometri stop tidak wajar — periksa ulang candle 1');

  const stopVsBatal: 'aman' | 'peringatan' = side === 'LONG'
    ? (stop >= zone.batal ? 'aman' : 'peringatan')
    : (stop <= zone.batal ? 'aman' : 'peringatan');
  if (stopVsBatal === 'peringatan') warnings.push('stop berada di luar garis batal — setup lemah, zona sudah mati sebelum stop kena');

  const currentCandleTime = candles.at(-1)?.time ?? null;
  const barMs = candles.length > 1 ? Math.max(1, candles[1].time - candles[0].time) : 900_000;
  const entryAgeBars = setup.candle2 !== null && currentCandleTime !== null
    ? Math.round((currentCandleTime - setup.candle2) / barMs)
    : null;
  const kedaluwarsa = entryAgeBars !== null && entryAgeBars > 3;
  if (kedaluwarsa) warnings.push(`candle 2 sudah ${entryAgeBars} candle lalu — tiket dianggap basi`);

  // Profil v3: stop struktural di garis batal (bukan buntut candle) — lega dari noise.
  let stopAkhir = stop;
  let riskAkhir = riskDistance;
  let targetAkhir = target;
  if (stopMode() === 'batal') {
    stopAkhir = zone.batal;
    riskAkhir = side === 'LONG' ? entry - stopAkhir : stopAkhir - entry;
    if (!(riskAkhir > 0)) return null;
    targetAkhir = side === 'LONG' ? entry + TARGET_R * riskAkhir : entry - TARGET_R * riskAkhir;
  }

  const distanceNowPct = ((priceNow - entry) / entry) * 100;
  const travelledR = Math.abs(priceNow - entry) / riskAkhir;
  const chaseRisk = travelledR > CHASE_LIMIT_R;
  if (chaseRisk) {
    warnings.push(`harga sudah berjalan ${travelledR.toFixed(1)}R dari entry — jangan dikejar, tunggu setup baru (aturan anti-nyangkut)`);
  }

  return {
    side,
    entry,
    stop: stopAkhir,
    target: targetAkhir,
    riskDistance: riskAkhir,
    riskPct: (riskAkhir / entry) * 100,
    sizeCoin: RISK_USDT / riskAkhir,
    riskUsdt: RISK_USDT,
    rewardUsdt: RISK_USDT * TARGET_R,
    rr: TARGET_R,
    stopGeometryOk,
    stopVsBatal,
    entryAgeBars,
    priceNow,
    distanceNowPct,
    chaseRisk,
    // Basi = mati. Umur tiket wajib mematikan actionable — bukan sekadar peringatan.
    actionable: stopGeometryOk && !chaseRisk && stopVsBatal === 'aman' && !kedaluwarsa,
    warnings,
  };
}
