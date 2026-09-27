import { manualTicket, type ManualTicket } from './manual-ticket';
import { simbolTestnet } from './testnet';

/** Satu keputusan server untuk pratinjau HP dan alarm Telegram.
 * Tidak pernah mengirim order; kegagalan data Testnet harus menolak alarm. */
export async function demoReadyTicket(symbol: string, side: 'LONG' | 'SHORT'): Promise<ManualTicket> {
  const ticket = await manualTicket(symbol, side);
  const symbols = await simbolTestnet();
  if (!symbols.has(symbol)) throw new Error('Simbol ini tidak tersedia di Demo/Testnet (TRADING); jangan kirim order.');
  return ticket;
}
