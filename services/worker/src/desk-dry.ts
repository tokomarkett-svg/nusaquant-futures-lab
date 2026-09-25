/**
 * Latihan kering meja paper: menjalankan SATU siklus penuh ke pasar live,
 * tetapi menulis ke memori — bukan ke Supabase. Tidak mengirim Telegram.
 *
 * Pakai: npm run desk:dry --workspace @nusaquant/worker
 */
import { BinancePublicMarketDataClient, DEFAULT_BINANCE_BASE_URL } from './market-data.ts';
import { createMemoryDeskStore, runDeskCycle } from './desk.ts';

const digitsFor = (price: number) => (price >= 100 ? 2 : price >= 1 ? 4 : price >= 0.01 ? 5 : 7);

async function main(): Promise<void> {
  const store = createMemoryDeskStore();
  const market = new BinancePublicMarketDataClient({ baseUrl: process.env.BINANCE_BASE_URL ?? DEFAULT_BINANCE_BASE_URL });
  const messages: string[] = [];

  const result = await runDeskCycle({
    store,
    market,
    notify: async (text) => { messages.push(text); },
  });

  console.log(`\n=== LATIHAN KERING MEJA PAPAN — ${new Date().toISOString()} ===`);
  console.log(`kandidat dipindai : ${result.scannedCandidates}`);
  console.log(`tiket siap        : ${result.readyTickets}`);
  console.log(`posisi dibuka     : ${result.opened}`);
  console.log(`posisi ditutup    : ${result.closed}`);

  if (store.positions.length > 0) {
    console.log('\n--- posisi (memori) ---');
    for (const position of store.positions) {
      const digits = digitsFor(position.entry);
      console.log(`${position.symbol} ${position.side} entry ${position.entry.toFixed(digits)} stop ${position.stop.toFixed(digits)} target ${position.target.toFixed(digits)} ukuran ${position.quantity.toLocaleString('id-ID', { maximumFractionDigits: 2 })} coin · proses ${String(position.metadata.processScore ?? '?')}/6 · status ${position.status}`);
    }
  }
  if (result.skipped.length > 0) {
    console.log('\n--- kandidat yang ditahan pagar ---');
    for (const skip of result.skipped) console.log(`${skip.symbol}: ${skip.reason}`);
  }
  if (messages.length > 0) {
    console.log('\n--- pesan yang AKAN dikirim (tidak dikirim di latihan kering) ---');
    for (const message of messages) console.log(message.replace(/<\/?b>/g, ''));
  } else {
    console.log('\n(tidak ada pesan — belum ada tiket siap pada siklus ini)');
  }
  console.log('\nCatatan: tidak ada baris yang ditulis ke database. Ini hanya simulasi.');
}

main().catch((error: unknown) => {
  console.error('Latihan kering gagal:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
