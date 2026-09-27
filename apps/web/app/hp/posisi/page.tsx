'use client';

/**
 * POSISI (mode HP) — Tahap D docs/52: posisi paper meja + P/L BERJALAN satuan R.
 * Harga live dari /api/harga (semua pair USDT, satu request) — segar tiap 5 detik.
 * R = (harga − entry) ÷ jarak risiko, arah menyesuaikan LONG/SHORT. Data posisi: /api/meja.
 */

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import HpHeader from '../HpHeader';
import { WARNA, digitsFor, fmt, salinTeks, umur } from '../bahan';

type Posisi = {
  symbol: string; side: 'LONG' | 'SHORT'; entry: number; stop: number; target: number;
  sizeCoin: number; openedAt: string; processScore: number | null; via: string;
};
type Ringkasan = {
  trades: number; open: number; closed: number; wins: number; losses: number;
  rTotal: number; pnlUsdt: number; lastClosed: { symbol: string; reason: string; r: number } | null;
};
type DataMeja = { ok: boolean; error?: string; open: Posisi[]; today: Ringkasan | null };

export default function PosisiHp() {
  const [data, setData] = useState<DataMeja | null>(null);
  const [harga, setHarga] = useState<Record<string, number>>({});
  const [error, setError] = useState<string | null>(null);
  const [tersalin, setTersalin] = useState<string | null>(null);

  const muatMeja = useCallback(async () => {
    try {
      const r = await fetch('/api/meja', { cache: 'no-store' });
      const p = await r.json();
      if (!p.ok) throw new Error(p.error ?? 'Gagal membaca meja.');
      setData(p as DataMeja);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  const muatHarga = useCallback(async () => {
    try {
      const r = await fetch('/api/harga', { cache: 'no-store' });
      const p = await r.json();
      setHarga(p.ok ? p.prices as Record<string, number> : {});
    } catch {
      setHarga({});
    }
  }, []);

  useEffect(() => {
    void muatMeja();
    void muatHarga();
    const a = setInterval(() => void muatMeja(), 15_000);
    const b = setInterval(() => void muatHarga(), 5_000);
    return () => { clearInterval(a); clearInterval(b); };
  }, [muatMeja, muatHarga]);

  const open = !error ? data?.open ?? [] : [];
  const today = !error ? data?.today : null;

  const salin = async (p: Posisi) => {
    const d = digitsFor(p.entry);
    const teks = `${p.side === 'LONG' ? 'BUY' : 'SELL'} ${p.symbol} ${p.entry.toFixed(d)} SL ${p.stop.toFixed(d)} TP ${p.target.toFixed(d)}`;
    if (await salinTeks(teks)) {
      setTersalin(p.symbol);
      setTimeout(() => setTersalin(null), 2500);
    }
  };

  return (
    <div className="hp-page">
      <HpHeader tag="PAPER · 0,31/trade" />
      <p className="hp-eyebrow">POSISI <b>·</b> RISIKO TETAP TERUKUR</p>
      <h1 className="hp-heading">Posisi berjalan.</h1>
      <p className="hp-lede">P/L dalam satuan R. Selalu lihat stop, target dan harga terkini.</p>
      <div className="hp-metrics">
        {[
          { n: open.length, l: 'BERJALAN', c: WARNA.ink },
          { n: today?.wins ?? 0, l: 'MENANG', c: '#0d7a4b' },
          { n: today?.losses ?? 0, l: 'KALAH', c: WARNA.red },
          { n: `${(today?.rTotal ?? 0) >= 0 ? '+' : ''}${(today?.rTotal ?? 0).toFixed(2)}R`, l: 'HARI INI', c: (today?.rTotal ?? 0) >= 0 ? '#0d7a4b' : WARNA.red },
        ].map((kotak) => (
          <div key={kotak.l} className="hp-metric">
            <b style={{ color: kotak.c }}>{kotak.n}</b>
            <small>{kotak.l}</small>
          </div>
        ))}
      </div>

      {error && <div style={{ background: WARNA.redSoft, color: WARNA.red, border: '1px solid #f3cdd6', borderRadius: 12, padding: '10px 12px', fontSize: 12.5, marginBottom: 10 }}>{error}</div>}
      {!error && open.length === 0 && (
        <div className="hp-card hp-empty">
          <span className="hp-empty-icon" aria-hidden="true">◫</span>
          <b>{data ? 'Tidak ada posisi berjalan' : 'Memuat posisi paper…'}</b>
          <p>{data ? 'Meja hanya membuka posisi saat tiket sah dan pagar risiko terpenuhi.' : 'Menunggu data meja dari Supabase.'}</p>
        </div>
      )}

      {open.length > 0 && <div className="hp-section-label">DIPANTAU MEJA <small>{open.length} posisi paper</small></div>}
      {open.map((p) => {
        const long = p.side === 'LONG';
        const d = digitsFor(p.entry);
        const kini = harga[p.symbol];
        const risiko = Math.abs(p.entry - p.stop);
        const r = kini && risiko > 0 ? (long ? (kini - p.entry) / risiko : (p.entry - kini) / risiko) : null;
        const pct = kini
          ? Math.max(0, Math.min(100, (long ? (kini - p.stop) / (p.target - p.stop) : (p.stop - kini) / (p.stop - p.target)) * 100))
          : Math.max(0, Math.min(100, (long ? (p.entry - p.stop) / (p.target - p.stop) : (p.stop - p.entry) / (p.stop - p.target)) * 100));
        return (
          <div key={p.symbol} className="hp-card hp-position" style={{ borderLeft: `3px solid ${long ? '#0d7a4b' : WARNA.red}` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
              <Link href={`/hp/koin/${p.symbol}`} style={{ textDecoration: 'none' }}>
                <b style={{ fontSize: 14, color: WARNA.ink, borderBottom: '1px dotted #9db3a6' }}>{p.symbol}</b>
              </Link>
              <span style={{ fontSize: 10, fontWeight: 800, padding: '2px 8px', borderRadius: 6, background: long ? WARNA.mintSoft : WARNA.redSoft, color: long ? WARNA.greenDark : WARNA.red, border: `1px solid ${long ? '#bfe8d1' : '#f3cdd6'}` }}>{p.side}</span>
              <span style={{ marginLeft: 'auto', fontSize: 11, color: WARNA.muted }}>umur {umur(p.openedAt)}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 6 }}>
              <span style={{ fontFamily: 'ui-monospace, monospace', fontSize: 26, fontWeight: 800, color: r === null ? WARNA.muted : r >= 0 ? '#0d7a4b' : WARNA.red }}>
                {r === null ? '—' : `${r >= 0 ? '+' : ''}${r.toFixed(2)}R`}
              </span>
              <span style={{ fontSize: 11, color: WARNA.muted }}>
                {r !== null && kini ? `${r >= 0 ? '+' : ''}${(r * 0.31).toFixed(2)} USDT paper · harga indikatif ${fmt(kini)}` : 'menunggu harga terkini…'}
              </span>
            </div>
            <div style={{ display: 'flex', gap: 10, margin: '7px 0 2px', fontFamily: 'ui-monospace, monospace', fontSize: 12 }}>
              <span>Entry <b>{p.entry.toFixed(d)}</b></span>
              <span style={{ color: WARNA.red }}>SL <b>{p.stop.toFixed(d)}</b></span>
              <span style={{ color: '#0d7a4b' }}>TP <b>{p.target.toFixed(d)}</b></span>
            </div>
            <div style={{ height: 4, borderRadius: 99, background: 'linear-gradient(90deg,#e8b4bd,#f3ddab,#bfe8d1)', position: 'relative', marginTop: 6 }}>
              <i style={{ position: 'absolute', top: -3.5, left: `calc(${pct}% - 5px)`, width: 11, height: 11, borderRadius: 99, background: WARNA.gelap, border: '2px solid #fff', transition: 'left .4s' }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 8.5, color: WARNA.muted, marginTop: 3 }}>
              <span>SL</span><span>ENTRY</span><span>TP</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
              <span style={{ fontSize: 9.5, color: WARNA.muted }}>📦 {p.sizeCoin.toLocaleString('id-ID', { maximumFractionDigits: 4 })} koin{p.processScore ? ` · skor ${p.processScore}/6` : ''}</span>
              <button onClick={() => void salin(p)} style={{ border: '1px solid #cfe0d5', background: '#f6fbf7', color: WARNA.greenDark, fontWeight: 800, fontSize: 11, borderRadius: 10, padding: '6px 12px', cursor: 'pointer' }}>
                {tersalin === p.symbol ? '✅ tersalin' : '📋 salin'}
              </button>
            </div>
          </div>
        );
      })}

      {today?.lastClosed && (
        <div style={{ fontSize: 11, color: WARNA.muted, textAlign: 'center', marginTop: 6 }}>
          Terakhir ditutup: <b style={{ color: today.lastClosed.r >= 0 ? '#0d7a4b' : WARNA.red }}>{today.lastClosed.symbol} {today.lastClosed.r >= 0 ? '+' : ''}{today.lastClosed.r}R</b> ({today.lastClosed.reason})
        </div>
      )}
    </div>
  );
}
