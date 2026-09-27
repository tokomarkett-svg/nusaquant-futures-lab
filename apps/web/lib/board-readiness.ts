import type { Board } from './binance';
import { gateMatchesSide } from '@nusaquant/core';
import { ticketTimeValid } from './binance';
import { manualTicket, type ManualTicket } from './manual-ticket';
import { simbolTestnet } from './testnet';

/** Worker dan web membaca snapshot Futures yang sama. Server aplikasi mengesahkan
 * lagi rumus tiket; Testnet hanya status EKSEKUSI DEMO, bukan filter universe sinyal. */
export async function markDemoReadiness(
  board: Board,
  verify: (symbol: string, side: 'LONG' | 'SHORT') => Promise<ManualTicket> = manualTicket,
  getTestnet: () => Promise<Set<string>> = simbolTestnet,
): Promise<Board> {
  const now = Date.now();
  const testnet = await getTestnet().catch(() => new Set<string>());
  await Promise.all(board.rows.map(async (row) => {
    const candidate = row.technicalReady === true;
    row.technicalReady = false;
    row.demoReady = false;
    if (!candidate || board.market !== 'FUTURES' || !row.ticket?.actionable || !row.gateAlign || !gateMatchesSide(row.gate, row.side) || row.status === 'PADAM'
      || !ticketTimeValid(row.setup.candle2, now) || row.dataAgeMin > 45) return;
    try {
      const verified = await verify(row.symbol, row.side);
      const same = (a: number, b: number) => Math.abs(a - b) <= Math.max(1e-10, Math.abs(b) * 1e-9);
      row.technicalReady = verified.setupKey === `${row.symbol}:${row.side}:${row.setup.candle2}`
        && same(verified.entry, row.ticket.entry) && same(verified.stop, row.ticket.stop)
        && same(verified.target, row.ticket.target);
      row.demoReady = row.technicalReady && testnet.has(row.symbol);
    } catch { /* fail closed: not READY if technical verification failed */ }
  }));
  return board;
}
