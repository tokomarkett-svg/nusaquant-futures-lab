import { fetchTickers } from './binance';
import type { ChrisDecision } from '@nusaquant/core';

export type ManualTicket = {
  symbol: string; side: 'LONG' | 'SHORT'; setupKey: string; expiresAt: string;
  entry: number; stop: number; target: number; qty: number; riskUsdt: number;
};

/** No MA or PMB fallback. The worker's trade-by-price decision is the ONLY source.
 * Recheck the Futures last price before returning an approvable Testnet ticket. */
export async function manualTicket(symbol: string, side: 'LONG' | 'SHORT'): Promise<ManualTicket> {
  if (!/^[A-Z0-9]{2,24}USDT$/.test(symbol) || (side !== 'LONG' && side !== 'SHORT')) throw new Error('Simbol/arah Futures tidak sah.');
  const base = (process.env.WORKER_DATA_URL ?? '').trim();
  if (!base.startsWith('https://')) throw new Error('Sumber keputusan Futures tidak dikonfigurasi.');
  const now = Date.now();
  const response = await fetch(new URL('/data/champion-json', base), { cache: 'no-store', signal: AbortSignal.timeout(12_000) });
  if (!response.ok) throw new Error('Mesin pertarungan Futures tidak terjangkau.');
  const payload = await response.json() as { ok?: boolean; at?: string; rows?: Array<{ symbol: string; at: number; decision: ChrisDecision | null }> };
  if (!payload.ok || !Number.isFinite(Date.parse(payload.at ?? '')) || now - Date.parse(payload.at!) > 100_000
    || Date.parse(payload.at!) > now + 5000) throw new Error('Snapshot rumus Chris tidak segar.');
  const r = payload.rows?.find((row) => row.symbol === symbol);
  const d = r?.decision;
  if (!r || now - r.at > 100_000 || !d || d.stage !== 'SIAP' || d.side !== side || d.symbol !== symbol
    || !Number.isFinite(d.c2) || d.c2 === null || now < d.c2 + 900_000 || now > d.c2 + 4 * 900_000
    || !Number.isFinite(d.x) || !(d.x <= d.c1) || d.c1 + 900_000 !== d.c2
    || !Number.isFinite(d.trigger) || !Number.isFinite(d.entry) || !Number.isFinite(d.stop)
    || !Number.isFinite(d.target) || !Number.isFinite(d.sizeCoin)
    || d.entry === null || d.target === null || d.sizeCoin === null || !(d.sizeCoin > 0)
    || (side === 'LONG' ? !(d.entry > d.trigger && d.stop < d.entry && d.target > d.entry)
      : !(d.entry < d.trigger && d.stop > d.entry && d.target < d.entry))) throw new Error('Belum ada tiket Chris yang sah dan segar pada sisi ini.');
  const risk = Math.abs(d.entry - d.stop);
  if (!(risk > 0) || Math.abs(d.sizeCoin * risk - 0.31) > 0.00001) throw new Error('Risiko tiket tidak konsisten.');
  const ticker = (await fetchTickers()).find((v) => v.symbol === symbol);
  if (!ticker || !(side === 'LONG' ? ticker.last > d.trigger : ticker.last < d.trigger)
    || Math.abs(ticker.last - d.entry) > risk * .5) throw new Error('Harga Futures terkini gagal batas C1 / sudah lari lebih dari 0,5R.');
  return { symbol, side, setupKey: `${symbol}:${side}:${d.c2}`,
    expiresAt: new Date(d.c2 + 4 * 900_000).toISOString(), entry: d.entry, stop: d.stop,
    target: d.target, qty: d.sizeCoin, riskUsdt: 0.31 };
}
