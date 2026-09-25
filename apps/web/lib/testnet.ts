/**
 * Daftar simbol yang TERSEDIA di Binance Futures TESTNET.
 * Testnet ketinggalan daftar koin baru dibanding pasar asli — koin seperti SNXX/SNDK
 * belum terdaftar di sana. Supaya tombol 🧪 ENTRI DEMO tidak mengirim order yang pasti
 * ditolak, kita cek dulu ke daftar resmi testnet (cache 1 jam).
 */

const TESTNET_BASE = 'https://testnet.binancefuture.com';
const CACHE_MS = 3_600_000;

let cache: { at: number; symbols: Set<string> } | null = null;
let sedangAmbil: Promise<Set<string>> | null = null;

async function ambilDaftar(): Promise<Set<string>> {
  const response = await fetch(new URL('/fapi/v1/exchangeInfo', TESTNET_BASE), {
    cache: 'no-store',
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) throw new Error(`exchangeInfo testnet HTTP ${response.status}`);
  const payload = await response.json() as { symbols?: Array<{ symbol?: string; status?: string }> };
  const set = new Set<string>();
  for (const s of payload.symbols ?? []) {
    if (s.symbol && (s.status ?? 'TRADING') === 'TRADING') set.add(s.symbol);
  }
  return set;
}

/** Set simbol testnet; gagal jaringan → Set kosong (pemanggil memutuskan gagal-aman). */
export async function simbolTestnet(): Promise<Set<string>> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.symbols;
  if (!sedangAmbil) {
    sedangAmbil = ambilDaftar()
      .then((set) => {
        cache = { at: Date.now(), symbols: set };
        return set;
      })
      .finally(() => {
        sedangAmbil = null;
      });
  }
  return sedangAmbil;
}

/** Ada di testnet? Kalau daftar gagal diambil, anggap ADA (biar tombol tetap tampil & server testnet yang menolak). */
export async function adaDiTestnet(symbol: string): Promise<boolean> {
  try {
    const set = await simbolTestnet();
    return set.size === 0 ? true : set.has(symbol);
  } catch {
    return true;
  }
}
