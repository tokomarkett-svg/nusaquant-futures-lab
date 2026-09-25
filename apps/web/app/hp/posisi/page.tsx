'use client';

/**
 * POSISI (mode HP) — posisi paper meja yang sedang berjalan + ringkasan hari.
 * Data: /api/meja (sumber yang sama dengan halaman POSISIKU & pesan Telegram meja).
 */

import { useCallback, useEffect, useState } from 'react';
import { WARNA, fmt, salinTeks, umur } from '../bahan';

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
  const [error, setError] = useState<string | null>(null);
  const [tersalin, setTersalin] = useState<string | null>(null);

  const muat = useCallback(async () => {
    try {
      const r = await fetch('/api/meja', { cache: 'no-store' });
      const p = await r.json();
      if (!p.ok && !p.open) throw new Error(p.error ?? 'Gagal membaca meja.');
      setData(p as DataMeja);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    void muat();
    const timer = setInterval(() => void muat(), 15_000);
    return () => clearInterval(timer);
  }, [muat]);

  const open = data?.open ?? [];
  const today = data?.today;

  const salin = async (p: Posisi) => {
    const d = p.entry >= 100 ? 2 : p.entry >= 1 ? 4 : 5;
    const teks = `${p.side === 'LONG' ? 'BUY' : 'SELL'} ${p.symbol} ${p.entry.toFixed(d)} SL ${p.stop.toFixed(d)} TP ${p.target.toFixed(d)}`;
    if (await salinTeks(teks)) {
      setTersalin(p.symbol);
      setTimeout(() => setTersalin(null), 2500);
    }
  };

  return (
    <div style={{ padding: '10px 12px 0' }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '2px 2px 10px' }}>
        <div style={{ width: 30, height: 30, borderRadius: 9, background: WARNA.gelap, color: WARNA.mint, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 13 }}>N</div>
        <b style={{ fontSize: 15 }}>Posisi</b>
        <span style={{ marginLeft: 'auto', fontSize: 10, fontWeight: 800, color: '#0d7a4b', background: WARNA.mintSoft, border: '1px solid #bfe8d1', padding: '3px 9px', borderRadius: 999 }}>PAPER · 0,31/trade</span>
      </header>

      <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
        {[
          { n: open.length, l: 'BERJALAN', c: WARNA.ink },
          { n: today?.wins ?? 0, l: 'MENANG', c: '#0d7a4b' },
          { n: today?.losses ?? 0, l: 'KALAH', c: WARNA.red },
          { n: `${(today?.rTotal ?? 0) >= 0 ? '+' : ''}${(today?.rTotal ?? 0).toFixed(2)}R`, l: 'HARI INI', c: (today?.rTotal ?? 0) >= 0 ? '#0d7a4b' : WARNA.red },
        ].map((kotak) => (
          <div key={kotak.l} style={{ flex: 1, background: '#fff', border: '1px solid var(--line)', borderRadius: 14, padding: '9px 6px', textAlign: 'center' }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: kotak.c }}>{kotak.n}</div>
            <div style={{ fontSize: 8.5, color: WARNA.muted, fontWeight: 700, letterSpacing: 0.4 }}>{kotak.l}</div>
          </div>
        ))}
      </div>

      {error && <div style={{ background: WARNA.redSoft, color: WARNA.red, border: '1px solid #f3cdd6', borderRadius: 12, padding: '10px 12px', fontSize: 12.5, marginBottom: 10 }}>{error}</div>}
      {!error && open.length === 0 && (
        <div style={{ background: '#fff', border: '1px dashed var(--line)', borderRadius: 16, padding: '18px 14px', textAlign: 'center' }}>
          <div style={{ fontSize: 24 }}>💼</div>
          <b style={{ fontSize: 13.5 }}>Tidak ada posisi berjalan</b>
          <div style={{ fontSize: 12, color: WARNA.muted, marginTop: 4 }}>Meja membuka posisi otomatis saat tiket sah muncul.</div>
        </div>
      )}

      {open.map((p) => {
        const long = p.side === 'LONG';
        const d = p.entry >= 100 ? 2 : p.entry >= 1 ? 4 : 5;
        // posisi harga tak live di API meja — pakai posisi entry di pita SL..TP sebagai gambaran
        const pct = Math.max(0, Math.min(100, ((p.entry - p.stop) / Math.max(1e-12, p.target - p.stop)) * 100));
        return (
          <div key={p.symbol} style={{ background: '#fff', border: '1px solid var(--line)', borderLeft: `3px solid ${long ? '#0d7a4b' : WARNA.red}`, borderRadius: 14, padding: '11px 12px', marginBottom: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
              <b style={{ fontSize: 14 }}>{p.symbol}</b>
              <span style={{ fontSize: 10, fontWeight: 800, padding: '2px 8px', borderRadius: 6, background: long ? WARNA.mintSoft : WARNA.redSoft, color: long ? WARNA.greenDark : WARNA.red, border: `1px solid ${long ? '#bfe8d1' : '#f3cdd6'}` }}>{p.side}</span>
              <span style={{ marginLeft: 'auto', fontSize: 11, color: WARNA.muted }}>umur {umur(p.openedAt)}</span>
            </div>
            <div style={{ display: 'flex', gap: 10, margin: '8px 0 2px', fontFamily: 'ui-monospace, monospace', fontSize: 12 }}>
              <span>Entry <b>{p.entry.toFixed(d)}</b></span>
              <span style={{ color: WARNA.red }}>SL <b>{p.stop.toFixed(d)}</b></span>
              <span style={{ color: '#0d7a4b' }}>TP <b>{p.target.toFixed(d)}</b></span>
            </div>
            <div style={{ height: 4, borderRadius: 99, background: 'linear-gradient(90deg,#e8b4bd,#f3ddab,#bfe8d1)', position: 'relative', marginTop: 6 }}>
              <i style={{ position: 'absolute', top: -3.5, left: `calc(${pct}% - 5px)`, width: 11, height: 11, borderRadius: 99, background: WARNA.gelap, border: '2px solid #fff' }} />
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
