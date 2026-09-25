/**
 * Eksekusi DEMO ke Binance Futures TESTNET (uang pura-pura resmi dari Binance).
 *
 * Pagar desain:
 *  - Hanya testnet (base terpisah), tidak pernah menyentuh akun sungguhan.
 *  - Kunci API demo hanya hidup di Railway (EXEC via token bersama dari web).
 *  - Entry = MARKET; proteksi = STOP_MARKET + TAKE_PROFIT_MARKET (closePosition) di sisi bursa.
 *  - Meja paper tetap mencatat jurnal lokal; saat meja menutup, posisi demo di testnet ikut ditutup.
 */
import crypto from 'node:crypto';

export const TESTNET_BASE_DEFAULT = 'https://testnet.binancefuture.com';

export function demoConfig() {
  const apiKey = (process.env.BINANCE_TESTNET_API_KEY ?? '').trim();
  const apiSecret = (process.env.BINANCE_TESTNET_API_SECRET ?? '').trim();
  const base = (process.env.BINANCE_TESTNET_BASE ?? TESTNET_BASE_DEFAULT).replace(/\/+$/, '');
  return { apiKey, apiSecret, base, siap: apiKey.length > 0 && apiSecret.length > 0 };
}

/** Query string terurut + tanda tangan HMAC-SHA256 (format resmi Binance). */
export function tandaTangan(params: Record<string, string | number>, apiSecret: string): string {
  const query = Object.entries(params)
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
    .join('&');
  return crypto.createHmac('sha256', apiSecret).update(query).digest('hex');
}

/** Bulatkan jumlah ke kelipatan stepSize (LOT_SIZE bursa) — hindari penolakan presisi. */
export function formatQty(qty: number, stepSize: number): { qty: string; valid: boolean } {
  const step = stepSize > 0 ? stepSize : 0.001;
  const langkah = Math.floor(qty / step + 1e-9);
  const hasil = langkah * step;
  const desimal = (String(step).split('.')[1] ?? '').length;
  return { qty: hasil.toFixed(Math.min(desimal, 8)), valid: hasil >= step };
}

/** Bulatkan harga ke kelipatan tickSize. */
export function formatHarga(price: number, tickSize: number): string {
  const tick = tickSize > 0 ? tickSize : 0.0001;
  const langkah = Math.round(price / tick + 1e-9);
  const desimal = (String(tick).split('.')[1] ?? '').length;
  return langkah > 0 ? (langkah * tick).toFixed(Math.min(desimal, 8)) : price.toPrecision(6);
}

type FilterInfo = { stepSize: number; tickSize: number; minQty: number };

let filterCache: { at: number; data: Record<string, FilterInfo> } | null = null;

async function filterSimbol(base: string, symbol: string): Promise<FilterInfo> {
  if (!filterCache || Date.now() - filterCache.at > 3_600_000) {
    const response = await fetch(new URL('/fapi/v1/exchangeInfo', base), { signal: AbortSignal.timeout(10_000) });
    if (!response.ok) throw new Error(`exchangeInfo HTTP ${response.status}`);
    const payload = await response.json() as { symbols?: Array<Record<string, unknown>> };
    const data: Record<string, FilterInfo> = {};
    for (const s of payload.symbols ?? []) {
      const filters = (s.filters ?? []) as Array<Record<string, string>>;
      const lot = filters.find((f) => f.filterType === 'LOT_SIZE');
      const price = filters.find((f) => f.filterType === 'PRICE_FILTER');
      data[String(s.symbol)] = {
        stepSize: Number(lot?.stepSize ?? 0.001),
        tickSize: Number(price?.tickSize ?? 0.0001),
        minQty: Number(lot?.minQty ?? 0),
      };
    }
    filterCache = { at: Date.now(), data };
  }
  return filterCache.data[symbol] ?? { stepSize: 0.001, tickSize: 0.0001, minQty: 0 };
}

async function kirimPrivat(method: 'GET' | 'POST' | 'DELETE', path: string, params: Record<string, string | number>): Promise<Record<string, unknown>> {
  const { apiKey, apiSecret, base } = demoConfig();
  if (!apiKey || !apiSecret) throw new Error('Kunci API testnet belum diisi (BINANCE_TESTNET_API_KEY / BINANCE_TESTNET_API_SECRET di Railway).');
  const lengkap: Record<string, string | number> = { ...params, timestamp: Date.now(), recvWindow: 8000 };
  const query = Object.entries(lengkap)
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
    .join('&');
  const signature = crypto.createHmac('sha256', apiSecret).update(query).digest('hex');
  const url = `${base}${path}?${query}&signature=${signature}`;
  const response = await fetch(url, { method, headers: { 'X-MBX-APIKEY': apiKey }, signal: AbortSignal.timeout(12_000) });
  const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) {
    throw new Error(`testnet ${method} ${path}: ${String((payload as { msg?: string }).msg ?? `HTTP ${response.status}`)}`);
  }
  return payload;
}

export type DemoEntryInput = { symbol: string; side: 'LONG' | 'SHORT'; qty: number; stop: number; target: number };

/** Buka posisi demo: MARKET + SL/TP di sisi bursa. Kembalikan id-id order untuk jurnal. */
export async function bukaDemo(input: DemoEntryInput): Promise<{ ok: true; entryOrderId?: string; slOrderId?: string; tpOrderId?: string; qty: string }> {
  const { base, siap } = demoConfig();
  if (!siap) throw new Error('Kunci API testnet belum diisi di Railway.');
  const orderSide = input.side === 'LONG' ? 'BUY' : 'SELL';
  const info = await filterSimbol(base, input.symbol);
  const { qty, valid } = formatQty(input.qty, info.stepSize);
  if (!valid) throw new Error(`Ukuran ${input.qty} di bawah minimum lot ${info.minQty} untuk ${input.symbol}.`);

  const entry = await kirimPrivat('POST', '/fapi/v1/order', {
    symbol: input.symbol, side: orderSide, type: 'MARKET', quantity: qty, newOrderRespType: 'RESULT',
  });

  const stopPrice = formatHarga(input.stop, info.tickSize);
  const targetPrice = formatHarga(input.target, info.tickSize);
  const sl = await kirimPrivat('POST', '/fapi/v1/order', {
    symbol: input.symbol, side: orderSide === 'BUY' ? 'SELL' : 'BUY', type: 'STOP_MARKET',
    stopPrice, closePosition: 'true', priceProtect: 'true', newOrderRespType: 'RESULT',
  }).catch((e: unknown) => ({ gagal: e instanceof Error ? e.message : String(e) }));
  const tp = await kirimPrivat('POST', '/fapi/v1/order', {
    symbol: input.symbol, side: orderSide === 'BUY' ? 'SELL' : 'BUY', type: 'TAKE_PROFIT_MARKET',
    stopPrice: targetPrice, closePosition: 'true', priceProtect: 'true', newOrderRespType: 'RESULT',
  }).catch((e: unknown) => ({ gagal: e instanceof Error ? e.message : String(e) }));

  return {
    ok: true,
    entryOrderId: String(entry.orderId ?? ''),
    slOrderId: 'orderId' in sl ? String(sl.orderId) : undefined,
    tpOrderId: 'orderId' in tp ? String(tp.orderId) : undefined,
    qty,
  };
}

/** Tutup seluruh posisi demo pada satu simbol: batalkan order terbuka + MARKET reduceOnly. */
export async function tutupDemo(symbol: string): Promise<{ ok: true; ditutup: string; posisiTersisa: string }> {
  const { base } = demoConfig();
  await kirimPrivat('DELETE', '/fapi/v1/allOpenOrders', { symbol }).catch(() => undefined);
  const risiko = await kirimPrivat('GET', '/fapi/v2/positionRisk', { symbol });
  const baris = Array.isArray(risiko) ? (risiko as Array<Record<string, unknown>>).find((r) => r.symbol === symbol) : null;
  const posisi = Math.abs(Number(baris?.positionAmt ?? 0));
  if (posisi <= 0) return { ok: true, ditutup: '0', posisiTersisa: '0' };
  const info = await filterSimbol(base, symbol);
  const { qty, valid } = formatQty(posisi, info.stepSize);
  if (!valid) return { ok: true, ditutup: '0', posisiTersisa: String(posisi) };
  const sisiTutup = Number(baris?.positionAmt) > 0 ? 'SELL' : 'BUY';
  await kirimPrivat('POST', '/fapi/v1/order', {
    symbol, side: sisiTutup, type: 'MARKET', quantity: qty, reduceOnly: 'true', newOrderRespType: 'RESULT',
  });
  return { ok: true, ditutup: qty, posisiTersisa: '0' };
}

/** Pemeriksa token bersama web→worker (bandingkan panjang-aman). */
export function tokenSah(berikan: string | undefined, harapan: string | undefined): boolean {
  if (!harapan || !berikan) return false;
  const a = Buffer.from(berikan);
  const b = Buffer.from(harapan);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
