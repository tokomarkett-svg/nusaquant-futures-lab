'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import HpHeader from '../HpHeader';

type Decision = { symbol: string; side: 'LONG' | 'SHORT'; stage: 'C1' | 'BATAL' | 'SIAP' | 'BASI';
  c1: number; c2: number | null; trigger: number; priceNow: number; entry: number | null;
  stop: number; target: number | null; sizeCoin: number | null; reason: string };
type Feed = { ok: boolean; at: string; error?: string; source?: string;
  rows: Array<{ symbol: string; status: string; windows: number; at: number; decision: Decision | null }> };
const wib = (ms: number) => new Date(ms).toLocaleTimeString('id-ID', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit' });

export default function ChrisSiap() {
  const [feed, setFeed] = useState<Feed | null>(null);
  const [now, setNow] = useState(0);
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
  const active = fresh ? feed.rows.filter((row) => row.decision && now - row.at < 110_000
    && (row.decision.stage !== 'SIAP' || (row.decision.c2 !== null && now <= row.decision.c2 + 4 * 900_000))) : [];
  return <div className="hp-page">
    <HpHeader back tag={fresh ? 'FUTURES · TRANSAKSI' : 'DATA DITAHAN'} />
    <p className="hp-eyebrow">CHRIS CRYPTO <b>·</b> TANPA MA</p>
    <h1 className="hp-heading">Siap entri, hanya setelah C2.</h1>
    <p className="hp-lede">Adaptasi orderflow Chris untuk Binance Futures, bukan salinan GEX Nasdaq. Data berasal dari aggTrades Futures nyata: konteks swing 1H/4H → value area transaksi 1 jam → absorption → percobaan kedua gagal → flip → C1 → close C2. GEX dealer tidak diketahui. Alarm bukan order, tanpa klaim profit.</p>
    <div className="hp-status-strip"><span className="hp-status-icon">◉</span><div className="hp-status-copy">
      <b>{fresh ? 'Pemantau Futures aktif' : 'Tidak ada sinyal segar'}</b>
      <small>{fresh ? `${feed.rows.length} simbol dipantau · sumber transaksi nyata · ${wib(Date.parse(feed.at))} WIB` : feed?.error ?? 'Menunggu worker dan jejak transaksi lengkap'}</small>
    </div><span className={`hp-live${fresh ? '' : ' hp-live--error'}`}>{fresh ? 'AKTIF' : 'TUNDA'}</span></div>
    <div className="hp-section-label">SIAP ENTRI CHRIS <small>{active.filter((r) => r.decision?.stage === 'SIAP').length} kandidat</small></div>
    {active.filter((r) => r.decision?.stage === 'SIAP').map((row) => {
      const d = row.decision!;
      return <div className="hp-card" style={{ marginBottom: 10, borderLeft: '4px solid #127b53' }} key={row.symbol}>
        <b>🎯 SIAP · {row.symbol} {d.side}</b>
        <p>C1 {d.trigger} · C2 15m tutup {d.entry} melewati batas pada {wib(d.c2!)} WIB · harga pantau {d.priceNow}.</p>
        <p>Entry (close C2) <b>{d.entry}</b> · stop <b>{d.stop}</b> · target <b>{d.target}</b> · ukuran risiko 0,31 USDT: {d.sizeCoin?.toPrecision(6)} coin.</p>
        <small>Tidak ada order otomatis. Order Chris belum terhubung ke alur login/persetujuan per tiket; jangan gunakan tombol order metode lama untuk sinyal ini. Harga dapat berubah sebelum penyegaran berikutnya.</small>
      </div>;
    })}
    {!active.some((r) => r.decision?.stage === 'SIAP') && <div className="hp-card hp-empty"><b>Belum ada tiket sah.</b><p>C2 harus tutup melewati batas C1 dan harga kini masih benar. Jika transaksi Futures tidak lengkap atau pasar tidak tersedia, sistem menahan sinyal.</p></div>}
    <div className="hp-section-label">PANTAU C1 & STATUS <small>Bukan tiket</small></div>
    {active.filter((r) => r.decision?.stage === 'C1').map((row) => <div className="hp-card" style={{ marginBottom: 8, borderLeft: '4px solid #bd7835' }} key={row.symbol}>
      <b>👀 PANTAU C1 · {row.symbol} {row.decision!.side}</b><p>{row.decision!.reason}</p>
      <small>Batas {row.decision!.trigger} · C1 {wib(row.decision!.c1)} WIB. Wick/sentuh saja bukan Siap.</small>
    </div>)}
    {feed?.rows.map((r) => <p className="hp-lede" key={r.symbol}><b>{r.symbol}</b> · {r.decision?.stage ?? 'MEMANTAU'} · {r.status}</p>)}
    <Link className="hp-cta hp-cta-secondary" href="/hp/papan">Papan alarm lama ↗</Link>
  </div>;
}
