import {
  computeZones, detectSetup, computeTicket, gateTeknik, ticketTimeValid, fetchKlines, fetchTickers, STALE_CANDLE_MINUTES,
} from './binance';

export type ManualTicket = {
  symbol: string; side: 'LONG' | 'SHORT'; setupKey: string; expiresAt: string;
  entry: number; stop: number; target: number; qty: number; riskUsdt: number;
};

/** Re-evaluate ALL trade guards on the server at confirmation time, never trust the old UI/alert. */
export async function manualTicket(symbol: string, side: 'LONG' | 'SHORT'): Promise<ManualTicket> {
  if (!/^[A-Z0-9]{2,24}USDT$/.test(symbol)) throw new Error('Simbol futures tidak sah.');
  const [tickers, m15, h1] = await Promise.all([
    fetchTickers(), fetchKlines(symbol, '15m', 140), fetchKlines(symbol, '1h', 120),
  ]);
  const ticker = tickers.find((t) => t.symbol === symbol);
  if (!ticker) throw new Error('Simbol tidak ditemukan pada Futures.');
  const zones = computeZones(ticker);
  if (!zones) throw new Error('High/Low 24 jam belum tersedia.');
  const now = Date.now();
  const newest = m15.at(-1)?.time;
  if (!newest || now - newest - 900_000 > STALE_CANDLE_MINUTES * 60_000) throw new Error('Candle Futures basi. Jangan entry.');
  const gate = gateTeknik(m15, h1, ticker.last, side, now);
  if (!gate.ok) throw new Error(`Arah/gate ditolak: ${gate.reason}`);
  const setup = detectSetup(m15, zones, side);
  const ticket = computeTicket(m15, zones, side, ticker.last);
  if (!setup.valid || !ticket || !ticket.actionable || !ticketTimeValid(setup.candle2, now)) {
    throw new Error('Tidak ada tiket segar yang sah (X → C1 → C2) untuk sisi ini. Jangan kejar.');
  }
  const c2 = setup.candle2!;
  return {
    symbol, side, setupKey: `${symbol}:${side}:${c2}`, expiresAt: new Date(c2 + 4 * 900_000).toISOString(),
    entry: ticket.entry, stop: ticket.stop, target: ticket.target, qty: ticket.sizeCoin, riskUsdt: ticket.riskUsdt,
  };
}
