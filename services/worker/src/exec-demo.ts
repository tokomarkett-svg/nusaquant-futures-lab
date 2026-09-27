/** Binance USDⓈ-M Futures Demo ONLY. Mainnet is deliberately not reachable from this module.
 * Every placement needs a human-approved, fresh ticket from the web server; the worker
 * independently enforces one-way mode, exchange filters, risk, and exchange-side stops. */
import crypto from 'node:crypto';
import { RISK_USDT } from '@nusaquant/core';

export const TESTNET_BASE_DEFAULT = 'https://testnet.binancefuture.com';
const SYMBOL = /^[A-Z0-9]{2,24}USDT$/;

export function demoConfig() {
  const apiKey = (process.env.BINANCE_TESTNET_API_KEY ?? '').trim();
  const apiSecret = (process.env.BINANCE_TESTNET_API_SECRET ?? '').trim();
  // No configurable URL: credentials can NEVER be sent to mainnet or another host.
  return { apiKey, apiSecret, base: TESTNET_BASE_DEFAULT, siap: Boolean(apiKey && apiSecret) };
}

export function tandaTangan(params: Record<string, string | number>, apiSecret: string): string {
  return crypto.createHmac('sha256', apiSecret).update(queryOf(params)).digest('hex');
}

function queryOf(params: Record<string, string | number>): string {
  return Object.entries(params).sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join('&');
}

export function formatQty(qty: number, stepSize: number): { qty: string; valid: boolean } {
  if (!(Number.isFinite(qty) && qty > 0 && Number.isFinite(stepSize) && stepSize > 0)) return { qty: '0', valid: false };
  const decimals = (stepSize.toString().split('.')[1] ?? '').length;
  const amount = Math.floor(qty / stepSize + 1e-9) * stepSize;
  return { qty: amount.toFixed(Math.min(decimals, 8)), valid: amount >= stepSize };
}

export function formatHarga(price: number, tickSize: number): string {
  if (!(Number.isFinite(price) && price > 0 && Number.isFinite(tickSize) && tickSize > 0)) throw new Error('Harga/tick tidak sah.');
  const decimals = (tickSize.toString().split('.')[1] ?? '').length;
  return (Math.round(price / tickSize) * tickSize).toFixed(Math.min(decimals, 8));
}

type Json = Record<string, unknown>;
async function signed<T = Json>(method: 'GET' | 'POST' | 'DELETE', path: string, params: Record<string, string | number> = {}): Promise<T> {
  const { apiKey, apiSecret, base } = demoConfig();
  if (!apiKey || !apiSecret) throw new Error('Kunci Demo/Testnet tidak tersedia pada worker.');
  const query = queryOf({ ...params, timestamp: Date.now(), recvWindow: 8000 });
  const signature = crypto.createHmac('sha256', apiSecret).update(query).digest('hex');
  const response = await fetch(`${base}${path}?${query}&signature=${signature}`, {
    method, headers: { 'X-MBX-APIKEY': apiKey }, cache: 'no-store', signal: AbortSignal.timeout(12_000),
  });
  const payload = await response.json().catch(() => ({})) as Json;
  if (!response.ok) throw new Error(`Testnet ${method} ${path}: ${payload.code ?? response.status} ${String(payload.msg ?? `HTTP ${response.status}`)}`);
  return payload as T;
}

async function publicGet<T>(path: string, params: Record<string, string> = {}): Promise<T> {
  const u = new URL(path, TESTNET_BASE_DEFAULT);
  for (const [key, val] of Object.entries(params)) u.searchParams.set(key, val);
  const response = await fetch(u, { cache: 'no-store', signal: AbortSignal.timeout(10_000) });
  if (!response.ok) throw new Error(`Testnet data HTTP ${response.status}`);
  return await response.json() as T;
}

type FilterInfo = { stepSize: number; minQty: number; tickSize: number; minNotional: number };
let filters: { at: number; data: Map<string, FilterInfo> } | null = null;
async function symbolFilters(symbol: string): Promise<FilterInfo> {
  if (!filters || Date.now() - filters.at > 3_600_000) {
    const payload = await publicGet<{ symbols?: Array<{ symbol: string; status?: string; filters: Array<{ filterType: string; stepSize?: string; minQty?: string; tickSize?: string; notional?: string }> }> }>('/fapi/v1/exchangeInfo');
    const map = new Map<string, FilterInfo>();
    for (const row of payload.symbols ?? []) {
      if (row.status !== 'TRADING') continue;
      const lot = row.filters.find((f) => f.filterType === 'MARKET_LOT_SIZE') ?? row.filters.find((f) => f.filterType === 'LOT_SIZE');
      const price = row.filters.find((f) => f.filterType === 'PRICE_FILTER');
      const notional = row.filters.find((f) => f.filterType === 'MIN_NOTIONAL');
      if (!lot || !price) continue;
      map.set(row.symbol, {
        stepSize: Number(lot.stepSize), minQty: Number(lot.minQty), tickSize: Number(price.tickSize),
        minNotional: Number(notional?.notional ?? 0),
      });
    }
    filters = { at: Date.now(), data: map };
  }
  const result = filters.data.get(symbol);
  if (!result || !(result.stepSize > 0 && result.tickSize > 0)) throw new Error(`${symbol} tidak ada di Futures Testnet (TRADING) / filter tidak lengkap.`);
  return result;
}

/** This endpoint is GET-only, cached to avoid public callers exhausting signed API weight. */
let readinessCache: { at: number; data: DemoReadiness } | null = null;
type DemoReadiness = { ok: boolean; configured: boolean; authenticated: boolean; oneWay: boolean | null; enabled: boolean; reason?: string };
export async function demoReadiness(): Promise<DemoReadiness> {
  if (readinessCache && Date.now() - readinessCache.at < 60_000) return readinessCache.data;
  const configured = demoConfig().siap;
  const enabled = process.env.DEMO_EXECUTION_ENABLED === '1';
  if (!configured) return { ok: false, configured, authenticated: false, oneWay: null, enabled, reason: 'Kunci Demo/Testnet belum terpasang di worker.' };
  let data: DemoReadiness;
  try {
    const [account, mode] = await Promise.all([
      signed<Json>('GET', '/fapi/v3/account'),
      signed<{ dualSidePosition: boolean }>('GET', '/fapi/v1/positionSide/dual'),
    ]);
    data = { ok: mode.dualSidePosition === false, configured, authenticated: Boolean(account), oneWay: mode.dualSidePosition === false, enabled,
      reason: mode.dualSidePosition === false ? undefined : 'Akun Hedge Mode; adaptor hanya mendukung One-way Mode.' };
  } catch (e) {
    data = { ok: false, configured, authenticated: false, oneWay: null, enabled,
      reason: e instanceof Error ? e.message.slice(0, 180) : 'Koneksi privat Demo gagal.' };
  }
  readinessCache = { at: Date.now(), data };
  return data;
}

export type DemoEntryInput = { symbol: string; side: 'LONG' | 'SHORT'; qty: number; stop: number; target: number; expectedEntry: number; setupKey: string };
export type DemoEntryResult = { ok: true; entryOrderId: string; slOrderId: string; tpOrderId: string; qty: string; fillPrice: number };

/** Refuse an entry if signed account or risk protection cannot be proven. Never return ok for naked positions. */
export async function bukaDemo(input: DemoEntryInput): Promise<DemoEntryResult> {
  if (process.env.DEMO_EXECUTION_ENABLED !== '1') throw new Error('Eksekusi Demo terkunci; tidak ada order dikirim.');
  if (!demoConfig().siap) throw new Error('Kunci Demo/Testnet belum siap.');
  if (!SYMBOL.test(input.symbol) || !['LONG', 'SHORT'].includes(input.side) ||
      !Number.isFinite(input.expectedEntry) || !Number.isFinite(input.stop) || !Number.isFinite(input.target) || !Number.isFinite(input.qty) ||
      !(input.qty > 0 && input.expectedEntry > 0) || !/^[A-Z0-9]+USDT:(LONG|SHORT):\d{12,13}$/.test(input.setupKey) ||
      !input.setupKey.startsWith(`${input.symbol}:${input.side}:`)) throw new Error('Input tiket demo tidak sah.');
  if (input.side === 'LONG' ? !(input.stop < input.expectedEntry && input.expectedEntry < input.target) : !(input.target < input.expectedEntry && input.expectedEntry < input.stop)) {
    throw new Error('SL/TP tidak berada di sisi yang benar.');
  }
  const c2 = Number(input.setupKey.split(':').at(-1));
  if (!Number.isFinite(c2) || Date.now() < c2 + 900_000 || Date.now() > c2 + 4 * 900_000) throw new Error('Tiket sudah kedaluwarsa atau candle C2 belum tutup.');
  if (Math.abs(input.expectedEntry - input.stop) * input.qty > RISK_USDT + 0.0001) throw new Error('Ukuran melampaui risiko demo yang ditetapkan.');

  const [info, ready, priceData, positions, orders, algos] = await Promise.all([
    symbolFilters(input.symbol), demoReadiness(),
    publicGet<{ price: string }>('/fapi/v1/ticker/price', { symbol: input.symbol }),
    signed<Array<{ positionAmt: string }>>('GET', '/fapi/v2/positionRisk', { symbol: input.symbol }),
    signed<Json[]>('GET', '/fapi/v1/openOrders', { symbol: input.symbol }),
    signed<Json[]>('GET', '/fapi/v1/openAlgoOrders', { symbol: input.symbol }),
  ]);
  if (!ready.ok || !ready.oneWay) throw new Error(`Akun Demo belum siap: ${ready.reason ?? 'mode posisi tidak sesuai'}`);
  if (!Array.isArray(positions) || positions.some((p) => Math.abs(Number(p.positionAmt)) > 0) || !Array.isArray(orders) || orders.length || !Array.isArray(algos) || algos.length) {
    throw new Error('Sudah ada posisi/order pada simbol ini di akun Demo; periksa manual sebelum entry baru.');
  }
  const price = Number(priceData.price);
  const distance = Math.abs(input.expectedEntry - input.stop);
  if (!Number.isFinite(price) || price <= 0 || Math.abs(price - input.expectedEntry) > 0.5 * distance) {
    throw new Error('Harga Testnet berbeda >0,5R dari tiket Futures; jangan mengejar.');
  }
  const { qty, valid } = formatQty(input.qty, info.stepSize);
  if (!valid || Number(qty) < info.minQty || Number(qty) * price < info.minNotional) {
    throw new Error('Ukuran sesuai risiko tidak memenuhi minimum order Binance; jangan menaikkan risiko.');
  }
  const orderSide = input.side === 'LONG' ? 'BUY' : 'SELL';
  const clientId = `NQ${crypto.createHash('sha256').update(input.setupKey).digest('hex').slice(0, 30)}`;
  // If a previous request timed out after entry, NEVER create a second entry.
  try {
    const existing = await signed<Json>('GET', '/fapi/v1/order', { symbol: input.symbol, origClientOrderId: clientId });
    if (existing.orderId) throw new Error('Setup sudah pernah dikirim ke bursa. Periksa akun Demo; jangan ulangi.');
  } catch (e) {
    if (!(e instanceof Error) || !e.message.includes('-2013')) throw e;
  }

  let entry: Json;
  try {
    entry = await signed<Json>('POST', '/fapi/v1/order', {
      symbol: input.symbol, side: orderSide, type: 'MARKET', quantity: qty, newClientOrderId: clientId, newOrderRespType: 'RESULT',
    });
  } catch (error) {
    // A timeout can happen AFTER Binance accepted the market order. Reconcile/flatten,
    // never assume failure means that no position was opened.
    try { await tutupDemo(input.symbol); }
    catch (closeError) {
      throw new Error(`DARURAT: respons entry tidak pasti (${error instanceof Error ? error.message : 'unknown'}); posisi belum terverifikasi flat (${closeError instanceof Error ? closeError.message : 'unknown'}). PERIKSA TESTNET SEGERA.`);
    }
    throw new Error('Entry demo tidak dapat diverifikasi dan posisi telah dicek/ditutup. Jangan ulangi setup ini.');
  }
  let slId = '', tpId = '';
  try {
    if (entry.status !== 'FILLED' || !entry.orderId || !(Number(entry.avgPrice) > 0) || Number(entry.executedQty) !== Number(qty)) {
      throw new Error('Fill entry tidak bisa diverifikasi; order tidak boleh dianggap terlindungi.');
    }
    const fillPrice = Number(entry.avgPrice);
    if (Math.abs(fillPrice - input.stop) * Number(qty) > RISK_USDT + 0.0001 ||
        (input.side === 'LONG' ? fillPrice <= input.stop : fillPrice >= input.stop)) {
      throw new Error('Risiko fill melampaui batas; tutup posisi demo.');
    }
    const side = orderSide === 'BUY' ? 'SELL' : 'BUY';
    const sl = await signed<Json>('POST', '/fapi/v1/algoOrder', {
      algoType: 'CONDITIONAL', symbol: input.symbol, side, type: 'STOP_MARKET',
      triggerPrice: formatHarga(input.stop, info.tickSize), closePosition: 'true',
    });
    slId = String(sl.algoId ?? '');
    if (!slId) throw new Error('Bursa tidak mengembalikan id stop-loss Algo.');
    const tp = await signed<Json>('POST', '/fapi/v1/algoOrder', {
      algoType: 'CONDITIONAL', symbol: input.symbol, side, type: 'TAKE_PROFIT_MARKET',
      triggerPrice: formatHarga(input.target, info.tickSize), closePosition: 'true',
    });
    tpId = String(tp.algoId ?? '');
    if (!tpId) throw new Error('Bursa tidak mengembalikan id take-profit Algo.');
    const active = await signed<Array<{ algoId: number | string }>>('GET', '/fapi/v1/openAlgoOrders', { symbol: input.symbol });
    if (!Array.isArray(active) || !active.some((a) => String(a.algoId) === slId) || !active.some((a) => String(a.algoId) === tpId)) {
      throw new Error('SL dan TP belum sama-sama aktif di bursa.');
    }
    return { ok: true, entryOrderId: String(entry.orderId), slOrderId: slId, tpOrderId: tpId, qty, fillPrice };
  } catch (error) {
    // Never silently swallow protection failures. Flatten the actual exchange position.
    try { await tutupDemo(input.symbol); }
    catch (closeError) {
      throw new Error(`DARURAT: proteksi gagal (${error instanceof Error ? error.message : 'unknown'}) dan penutupan bursa belum pasti (${closeError instanceof Error ? closeError.message : 'unknown'}). PERIKSA AKUN TESTNET SEGERA.`);
    }
    throw new Error(`Entry demo dibatalkan dan posisi ditutup: ${error instanceof Error ? error.message : 'proteksi gagal'}. Periksa akun Testnet.`);
  }
}

/** Close/reconcile on exchange FIRST. Callers may close the paper ledger only after this succeeds. */
export async function tutupDemo(symbol: string): Promise<{ ok: true; ditutup: string; posisiTersisa: string }> {
  if (!SYMBOL.test(symbol)) throw new Error('Simbol demo tidak sah.');
  const ready = await demoReadiness();
  if (!ready.ok || !ready.oneWay) throw new Error('Akun Demo belum dapat diverifikasi; jurnal jangan ditutup.');
  const rows = await signed<Array<{ symbol: string; positionAmt: string }>>('GET', '/fapi/v2/positionRisk', { symbol });
  if (!Array.isArray(rows)) throw new Error('Posisi bursa tidak terbaca.');
  const pos = rows.find((p) => p.symbol === symbol);
  const amount = Number(pos?.positionAmt ?? 0);
  if (!Number.isFinite(amount)) throw new Error('Ukuran posisi tidak valid.');
  let ditutup = '0';
  if (amount !== 0) {
    const info = await symbolFilters(symbol);
    const { qty, valid } = formatQty(Math.abs(amount), info.stepSize);
    if (!valid || Number(qty) < info.minQty) throw new Error('Posisi tidak bisa ditutup dengan lot bursa; perlu pemeriksaan manual.');
    await signed('POST', '/fapi/v1/order', { symbol, side: amount > 0 ? 'SELL' : 'BUY', type: 'MARKET', quantity: qty, reduceOnly: 'true', newOrderRespType: 'RESULT' });
    ditutup = qty;
  }
  const after = await signed<Array<{ symbol: string; positionAmt: string }>>('GET', '/fapi/v2/positionRisk', { symbol });
  if (!Array.isArray(after) || after.some((p) => p.symbol === symbol && Math.abs(Number(p.positionAmt)) > 0)) {
    throw new Error('Posisi Demo belum nol sesudah permintaan tutup.');
  }
  // Cancel only AFTER position is confirmed flat; failure is visible to the caller.
  await signed('DELETE', '/fapi/v1/allOpenOrders', { symbol });
  await signed('DELETE', '/fapi/v1/algoOpenOrders', { symbol });
  const remaining = await signed<Json[]>('GET', '/fapi/v1/openAlgoOrders', { symbol });
  if (!Array.isArray(remaining) || remaining.length) throw new Error('Posisi flat tetapi order SL/TP Algo belum bersih.');
  return { ok: true, ditutup, posisiTersisa: '0' };
}

export function tokenSah(berikan: string | undefined, harapan: string | undefined): boolean {
  if (!harapan || !berikan) return false;
  const a = Buffer.from(berikan); const b = Buffer.from(harapan);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
