/** Diagnostik sekali-pakai: apa yang dilihat meja di tiap kandidat sekarang. */
import { BinancePublicMarketDataClient, DEFAULT_BINANCE_BASE_URL } from './market-data.ts';
import { scanAlertCandidates } from './alerts.ts';

async function main(): Promise<void> {
  const market = new BinancePublicMarketDataClient({ baseUrl: process.env.BINANCE_BASE_URL ?? DEFAULT_BINANCE_BASE_URL });
  const candidates = await scanAlertCandidates(market, 40);
  let withTicket = 0, actionable = 0, aligned = 0, ready = 0;
  const lines: string[] = [];
  for (const c of candidates) {
    const ticket = c.ticket ?? null;
    if (ticket) withTicket += 1;
    if (ticket?.actionable) actionable += 1;
    if (c.gateAlign) aligned += 1;
    if (ticket?.actionable && c.gateAlign) { ready += 1; lines.push(`  SIAP: ${c.symbol} ${c.side} @ ${c.priceNow}`); }
    else if (ticket) lines.push(`  ${c.symbol} ${c.side}: tiket ada, ${c.gateAlign ? 'tiket basi/nyangkut' : `gate ${c.gate} belum searah`}`);
  }
  console.log(`kandidat: ${candidates.length} · ada tiket: ${withTicket} · actionable: ${actionable} · gate searah: ${aligned} · SIAP (keduanya): ${ready}`);
  for (const line of lines) console.log(line);
}
main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exitCode = 1; });
