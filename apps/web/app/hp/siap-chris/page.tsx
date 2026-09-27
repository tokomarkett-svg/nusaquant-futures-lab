'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import HpHeader from '../HpHeader';

type Fib = { shallow705: number; mid788: number; invalid886: number };
type Decision = { symbol: string; side: 'LONG' | 'SHORT'; stage: 'C1' | 'BATAL' | 'SIAP' | 'BASI';
  x: number; fib: Fib; c1: number; c2: number | null; trigger: number; priceNow: number; entry: number | null;
  stop: number; target: number | null; sizeCoin: number | null; reason: string };
type Watch = { side: 'LONG' | 'SHORT'; x: number; fib: Fib };
type Feed = { ok: boolean; at: string; error?: string; source?: string; universe?: string[];
  rows: Array<{ symbol: string; status: string; windows: number; at: number; watch?: Watch | null; decision: Decision | null }> };
const wib = (ms: number) => new Date(ms).toLocaleTimeString('id-ID', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit' });
const fmt = (n: number) => n.toLocaleString('id-ID', { maximumSignificantDigits: 9 });

export default function ChrisSiap() {
  const [feed, setFeed] = useState<Feed | null>(null);
  const [now, setNow] = useState(0);
  const [search, setSearch] = useState('');
  const load = useCallback(async () => {
    try {
      const response = await fetch('/api/chris', { cache: 'no-store' });
      const data = await response.json() as Feed;
      if (!response.ok || !data.ok) throw new Error(data.error ?? 'Worker tidak tersedia');
      setFeed(data);
    } catch (error) {
      setFeed({ ok: false, at: '', rows: [], error: error instanceof Error ? error.message : String(error) });
    }
  }, []);
  useEffect(() => {
    void load();
    const poll = setInterval(() => void load(), 60_000);
    const clock = setInterval(() => setNow(Date.now()), 10_000);
    setNow(Date.now());
    return () => { clearInterval(poll); clearInterval(clock); };
  }, [load]);
  const fresh = feed?.ok && now > 0 && now - Date.parse(feed.at) < 110_000;
  const rows = fresh ? feed.rows.map((row) => ({ ...row, decision: now - row.at < 110_000 ? row.decision : null,
    watch: now - row.at < 110_000 ? row.watch : null })) : [];
  const ready = rows.filter((r) => r.decision?.stage === 'SIAP' && r.decision.c2 !== null
    && now <= r.decision.c2 + 4 * 900_000);
  const monitored = new Set(feed?.rows.map((row) => row.symbol));
  const matches = (feed?.universe ?? []).filter((symbol) => symbol.includes(search.trim().toUpperCase())).slice(0, 20);
  return <div className="hp-page">
    <HpHeader tag={fresh ? 'FUTURES · TRANSAKSI' : 'DATA DITAHAN'} />
    <p className="hp-eyebrow">PAPAN UTAMA <b>·</b> OTAK PERTARUNGAN</p>
    <h1 className="hp-heading">Baca pertarungan.<br />Tunggu C2 tutup.</h1>
    <p className="hp-lede">Satu rumus aplikasi dan Telegram: struktur swing 1H/4H tanpa MA → lokasi di luar value area transaksi Futures → X sentuh 0,705 → absorption → serangan kedua gagal → dominasi berbalik → C1 pantau → C2 15m tutup melewati high/low C1 → tiket risiko. 0,788 adalah level tengah; 0,886 membatalkan. Ini adaptasi kripto, bukan klaim GEX Nasdaq identik.</p>
    <div className="hp-status-strip" role="status"><span className="hp-status-icon">◉</span><div className="hp-status-copy">
      <b>{fresh ? 'Mesin pertarungan Futures aktif' : 'Tidak ada data pertarungan segar'}</b>
      <small>{fresh ? `${rows.length} simbol dipindai mendalam · ${wib(Date.parse(feed!.at))} WIB · GEX tidak diketahui` : feed?.error ?? 'Menunggu data transaksi Futures lengkap'}</small>
    </div><span className={`hp-live${fresh ? '' : ' hp-live--error'}`}>{fresh ? 'AKTIF' : 'TUNDA'}</span></div>
    <div className="hp-section-label">🎯 SIAP ENTRI <small>{ready.length} tiket sah</small></div>
    {ready.map((row) => {
      const d = row.decision!;
      return <section className="hp-card" style={{ marginBottom: 10, borderLeft: '4px solid #127b53' }} key={`${row.symbol}:${d.c2}`}>
        <b>🎯 SIAP · {row.symbol} {d.side}</b>
        <p>X {wib(d.x)} · zona 0,705: {fmt(d.fib.shallow705)} · tengah 0,788: {fmt(d.fib.mid788)} · batal 0,886: {fmt(d.fib.invalid886)}.</p>
        <p>C1 {wib(d.c1)} · batas {fmt(d.trigger)} · C2 15m tutup {fmt(d.entry!)} melewati batas · harga sekarang {fmt(d.priceNow)}.</p>
        <p>Entry rencana <b>{fmt(d.entry!)}</b> · stop <b>{fmt(d.stop)}</b> · target <b>{fmt(d.target!)}</b> · ukuran risiko 0,31 USDT: {d.sizeCoin?.toPrecision(6)} coin.</p>
        <Link className="hp-cta" href={`/hp/entri?symbol=${encodeURIComponent(row.symbol)}&side=${d.side}`}>🧪 Tinjau DEMO · login &amp; setujui tiket</Link>
        <small>Alarm bukan order. Hanya Testnet bila simbol tersedia dan akun login; setiap klik memeriksa ulang harga serta tiket. Mainnet tetap terkunci.</small>
      </section>;
    })}
    {ready.length === 0 && <div className="hp-card hp-empty"><b>Belum ada tiket Siap.</b><p>Tidak ada alarm entri sampai footprint lengkap, C1 benar, dan candle C2 tertutup melewati batas. Hasil profit atau statistik panjang tidak dijadikan syarat untuk menjalankan rumus.</p></div>}
    <div className="hp-section-label">TAHAP X / C1 / C2 / BATAL <small>Terpisah dari tiket Siap</small></div>
    {rows.map((row) => {
      const d = row.decision;
      const x = d ? { x: d.x, fib: d.fib, side: d.side } : row.watch;
      if (!x || d?.stage === 'SIAP') return null;
      return <div className="hp-card" style={{ marginBottom: 8, borderLeft: d?.stage === 'C1' ? '4px solid #bd7835' : d ? '4px solid #aa4b4b' : '4px solid #6c9c88' }} key={row.symbol}>
        <b>{d?.stage === 'C1' ? '👀 C1 · PANTAU BERSYARAT' : d?.stage === 'BATAL' ? '✕ C2 GAGAL · BATAL' : d?.stage === 'BASI' ? '⌛ BASI' : '① X · MASUK ZONA'} · {row.symbol} {x.side}</b>
        <p>X {wib(x.x)} WIB · pintu 0,705: {fmt(x.fib.shallow705)} · level tengah 0,788: {fmt(x.fib.mid788)} · batal bila melewati 0,886: {fmt(x.fib.invalid886)}.</p>
        {d && <p>{d.reason} {d.stage === 'C1' ? `C2 berikutnya harus TUTUP ${d.side === 'LONG' ? 'DI ATAS' : 'DI BAWAH'} ${fmt(d.trigger)}. Ini bukan tiket.` : 'Tidak ada izin entri.'}</p>}
      </div>;
    })}
    {feed?.rows.map((r) => <p className="hp-lede" key={r.symbol}><b>{r.symbol}</b> · {r.decision?.stage ?? (r.watch ? 'X' : 'MENUNGGU')} · {r.status}</p>)}
    <div className="hp-section-label">DAFTAR FUTURES <small>{feed?.universe?.length ?? '—'} simbol tersedia di bursa; cakupan footprint aktif {feed?.rows.length ?? 0}</small></div>
    <p className="hp-lede">Simbol yang belum dipantau mendalam tidak diberi sinyal palsu. Ketersediaan Testnet hanya menentukan order Demo, bukan sahnya sinyal Futures.</p>
    <label className="hp-search"><span aria-hidden="true">⌕</span><input aria-label="Cari simbol Futures" placeholder="Cari simbol Futures" value={search} onChange={e => setSearch(e.target.value)} /></label>
    {search && matches.map((symbol) => <div key={symbol} className="hp-card" style={{ marginBottom: 5, padding: '8px 12px' }}><b>{symbol}</b> · {monitored.has(symbol) ? 'footprint dipantau' : 'footprint belum aktif — tidak ada tiket'}</div>)}
    <Link className="hp-cta hp-cta-secondary" href="/hp/cek">Cek kesehatan bot ↗</Link>
  </div>;
}
