import type { Board } from './binance';
import { ticketTimeValid } from './binance';
import { demoReadyTicket } from './demo-readiness';
import type { ManualTicket } from './manual-ticket';

/** Papan tidak mengklaim SIAP sampai gerbang yang sama dengan alarm dan pratinjau lulus.
 * Kegagalan API/testnet mengembalikan false, tidak mengubah sinyal menjadi siap. */
export async function markDemoReadiness(
  board: Board, verify: (symbol: string, side: 'LONG' | 'SHORT') => Promise<ManualTicket> = demoReadyTicket,
): Promise<Board> {
  const now = Date.now();
  await Promise.all(board.rows.map(async (row) => {
    row.demoReady = false;
    if (board.market !== 'FUTURES' || !row.ticket?.actionable || !row.gateAlign || row.status === 'PADAM'
      || !ticketTimeValid(row.setup.candle2, now) || row.dataAgeMin > 45) return;
    try {
      const verified = await verify(row.symbol, row.side);
      const same = (a: number, b: number) => Math.abs(a - b) <= Math.max(1e-10, Math.abs(b) * 1e-9);
      row.demoReady = verified.setupKey === `${row.symbol}:${row.side}:${row.setup.candle2}`
        && same(verified.entry, row.ticket.entry) && same(verified.stop, row.ticket.stop)
        && same(verified.target, row.ticket.target);
    } catch { /* fail closed: technical candidate only */ }
  }));
  return board;
}
