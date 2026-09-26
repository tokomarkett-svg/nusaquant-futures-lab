/**
 * PANTAUAN (permintaan pemilik 26/9): laporan berkala ke Telegram berisi
 * "siapa yang paling dekat ke garis pintu" — supaya pemilik tidak buta
 * selama menunggu alarm SIAP ENTRI.
 *
 * BACA SAJA: tidak mengubah satu pun saringan docs/47. Angka di sini fakta
 * posisi harga vs garis zona 24 jam; keputusan SAH tetap eksklusif milik
 * alarm alerts (X → Candle 1 → Candle 2, arah hari, ungu ketat, gate).
 *
 * Env: PANTAUAN_NOTIF=0 untuk mematikan · PANTAUAN_JAM=4 (interval jam, min 1).
 */
import { MIN_QUOTE_VOLUME, MIN_RANGE_PCT, computeZones, distanceToPintu } from '@nusaquant/core';
import type { BinancePublicMarketDataClient } from './market-data.ts';
import { EXCLUDED, LEVERAGED, scanAlertCandidates, sendTelegram, type AlertScanRow } from './alerts.ts';

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Jarak ke pintu dalam % — minus berarti harga sudah berada di dalam zona. */
export function formatJarak(d: number): string {
  const tanda = d < 0 ? '−' : '';
  return `${tanda}${Math.abs(d).toFixed(2)}%`;
}

/** Harga pendek menyesuaikan magnitudo: 0.73190 vs 84162.00. */
function fmtHarga(v: number): string {
  return v >= 100 ? v.toFixed(2) : v.toPrecision(5);
}

/**
 * Susun teks pantauan. Dua bagian:
 * 1. Hasil saringan KETAT (rumus penuh via scanAlertCandidates — sama dengan alarm).
 * 2. Fakta posisi: koin lolos gerbang likuid+range yang paling dekat ke pintu, dua arah.
 */
export async function buildPantauanText(client: BinancePublicMarketDataClient, now = new Date()): Promise<string> {
  const jamWib = new Date(now.getTime() + 7 * 3_600_000).toISOString().slice(11, 16);

  let lolos: AlertScanRow[] = [];
  let catatan = '';
  try {
    lolos = await scanAlertCandidates(client);
  } catch (error) {
    catatan = error instanceof Error ? error.message : 'pindai ketat gagal';
  }

  const tickers = await client.get24hTickerDetails();
  const lolosGerbang = tickers
    .filter((t) => t.symbol.endsWith('USDT') && !t.symbol.includes('_') && !EXCLUDED.test(t.symbol) && !LEVERAGED.test(t.symbol) && t.quoteVolume >= MIN_QUOTE_VOLUME)
    .map((t) => ({ t, z: computeZones(t) }))
    .filter((r): r is { t: typeof tickers[number]; z: NonNullable<ReturnType<typeof computeZones>> } => r.z !== null && r.z.rangePct >= MIN_RANGE_PCT)
    .map((r) => ({
      ...r,
      dL: distanceToPintu(r.z, 'LONG', r.t.last),
      dS: distanceToPintu(r.z, 'SHORT', r.t.last),
    }))
    .sort((a, b) => Math.min(Math.abs(a.dL), Math.abs(a.dS)) - Math.min(Math.abs(b.dL), Math.abs(b.dS)));

  const baris: string[] = [];
  baris.push(`🔎 PANTAUAN PMB · ${jamWib} WIB · ${lolosGerbang.length} koin lolos gerbang likuid+range`);

  if (catatan) baris.push(`(pindai ketat: ${catatan} — coba lagi siklus berikutnya)`);
  if (lolos.length > 0) {
    baris.push(`Lolos saringan ketat: ${lolos.length}`);
    for (const r of lolos.slice(0, 5)) {
      baris.push(`✅ ${r.symbol} ${r.side}${r.ticket ? ' — SIAP ENTRI' : ' — terpantau, menunggu C1/C2'} · harga ${fmtHarga(r.priceNow)}`);
    }
  } else {
    baris.push('Lolos saringan ketat: 0 — belum ada SIAP ENTRI. Alarm khusus bunyi sendiri saat ada yang sah.');
  }

  baris.push('Paling dekat ke garis PINTU (fakta posisi, bukan sinyal; minus = harga sudah di dalam zona):');
  for (const r of lolosGerbang.slice(0, 6)) {
    baris.push(`• ${r.t.symbol} (rng ${r.z.rangePct.toFixed(1)}%) — L pintu ${fmtHarga(r.z.long.pintu)} (${formatJarak(r.dL)}) · S pintu ${fmtHarga(r.z.short.pintu)} (${formatJarak(r.dS)})`);
  }

  return baris.join('\n');
}

/**
 * Loop pantauan: kirim tiap PANTAUAN_JAM jam (first kirim setelah interval,
 * bukan saat boot — anti-spam tiap redeploy). Error tak pernah mematikan loop.
 */
export async function watchPantauan(client = new BinancePublicMarketDataClient()): Promise<void> {
  const jam = Math.max(Number(process.env.PANTAUAN_JAM ?? 4), 1);
  const chatId = (process.env.TELEGRAM_CHAT_ID ?? '').trim() || undefined;
  console.log(JSON.stringify({ pantauan: true, jam: `${jam}j`, chatIdPresent: Boolean(chatId), at: new Date().toISOString() }));
  for (;;) {
    await sleep(jam * 3_600_000);
    try {
      const teks = await buildPantauanText(client);
      await sendTelegram(teks, { chatId });
      console.log(JSON.stringify({ pantauan: 'terkirim', at: new Date().toISOString() }));
    } catch (error) {
      console.error('[pantauan] gagal kirim:', error instanceof Error ? error.message : error);
    }
  }
}
