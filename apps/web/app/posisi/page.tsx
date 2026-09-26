'use client';

/**
 * POSISIKU — menu khusus pasca-entry (permintaan pemilik 25/9).
 * Setelah notif 🎯 dan meja membuka posisi, semua posisi PAPER terbuka tampil di sini:
 * arah, entry, SL, TP, ukuran, umur, plus baris siap-salin. Hidup: segar tiap 15 detik.
 */
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import ArahkanModeHp from '../components/ArahkanModeHp';

type Posisi = {
  symbol: string;
  side: 'LONG' | 'SHORT';
  entry: number;
  stop: number;
  target: number;
  sizeCoin: number;
  openedAt: string;
  processScore: number | null;
  via: string;
};

type Ringkasan = {
  trades: number;
  open: number;
  closed: number;
  wins: number;
  losses: number;
  rTotal: number;
  pnlUsdt: number;
  lastClosed: { symbol: string; reason: string; r: number } | null;
};

type Data = { ok: boolean; error?: string; open: Posisi[]; today: Ringkasan | null };

function digits(v: number): number {
  if (v >= 100) return 2;
  if (v >= 1) return 4;
  if (v >= 0.01) return 5;
  return 7;
}

function umur(iso: string): string {
  const menit = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
  if (menit < 60) return `${menit} mnt`;
  const jam = Math.floor(menit / 60);
  return `${jam} j ${menit % 60} mnt`;
}

const kartu: React.CSSProperties = {
  background: '#101a26', border: '1px solid #223146', borderRadius: 14,
  padding: '14px 16px', marginBottom: 12,
};
const label: React.CSSProperties = { fontSize: 11, color: '#7d8ca0', textTransform: 'uppercase', letterSpacing: 0.6 };
const nilai: React.CSSProperties = { fontSize: 15, fontWeight: 700, color: '#e8eef6', fontFamily: 'ui-monospace, monospace' };

function KartuPosisi(p: Posisi) {
  const d = digits(p.entry);
  const f = (v: number) => v.toFixed(d);
  const long = p.side === 'LONG';
  const orderSide = long ? 'BUY' : 'SELL';
  const salin = `${orderSide} ${p.symbol} ${f(p.entry)} SL ${f(p.stop)} TP ${f(p.target)}`;
  return (
    <div style={kartu}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <span style={{ background: long ? '#0f3d33' : '#3d1518', color: long ? '#5be3ae' : '#ff8f8f', fontWeight: 800, fontSize: 13, padding: '3px 10px', borderRadius: 8 }}>
          {p.side === 'LONG' ? 'LONG ▲' : 'SHORT ▼'}
        </span>
        <span style={{ fontWeight: 800, fontSize: 17, color: '#ffffff' }}>{p.symbol}</span>
        <span style={{ marginLeft: 'auto', fontSize: 12, color: '#7d8ca0' }}>umur {umur(p.openedAt)}</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 10 }}>
        <div><div style={label}>Entry</div><div style={{ ...nilai, fontSize: 17 }}>{f(p.entry)}</div></div>
        <div><div style={label}>SL</div><div style={{ ...nilai, color: '#ff8f8f' }}>{f(p.stop)}</div></div>
        <div><div style={label}>TP</div><div style={{ ...nilai, color: '#5be3ae' }}>{f(p.target)}</div></div>
      </div>
      <div style={{ display: 'flex', gap: 14, marginBottom: 10, fontSize: 12.5, color: '#9fb0c3' }}>
        <span>📦 {p.sizeCoin.toLocaleString('id-ID', { maximumFractionDigits: 4 })} koin</span>
        <span>🎯 risiko 0,31 → imbalan 0,62</span>
        {p.processScore ? <span>skor {p.processScore}/9</span> : null}
      </div>
      <div style={{ background: '#0b141d', border: '1px dashed #2c4258', borderRadius: 10, padding: '8px 10px', fontSize: 12.5, color: '#cfe0f0', fontFamily: 'ui-monospace, monospace', overflowWrap: 'anywhere' }}>
        {salin}
      </div>
    </div>
  );
}

export default function HalamanPosisi() {
  const [data, setData] = useState<Data | null>(null);
  const [gagal, setGagal] = useState<string | null>(null);

  const muat = useCallback(async () => {
    try {
      const r = await fetch('/api/meja', { cache: 'no-store' });
      const j = (await r.json()) as Data;
      setData(j);
      setGagal(j.ok ? null : (j.error ?? 'gagal memuat'));
    } catch {
      setGagal('jaringan bermasalah — coba tarik untuk segarkan');
    }
  }, []);

  useEffect(() => {
    void muat();
    const timer = setInterval(() => void muat(), 15_000);
    return () => clearInterval(timer);
  }, [muat]);

  const terbuka = data?.open ?? [];
  const hari = data?.today ?? null;

  return (
    <main style={{ maxWidth: 560, margin: '0 auto', padding: '18px 14px 60px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
        <Link href="/" style={{ color: '#7fb2ff', textDecoration: 'none', fontSize: 14 }}>← Beranda</Link>
        <span style={{ marginLeft: 'auto', fontSize: 12, color: '#5fe0a8' }}>● hidup — segar tiap 15 detik</span>
      </div>
      <h1 style={{ fontSize: 22, margin: '2px 0 2px', color: '#ffffff' }}>POSISIKU (PAPER)</h1>
      <p style={{ margin: '0 0 14px', color: '#9fb0c3', fontSize: 13.5 }}>
        Menu khusus setelah entri: semua posisi yang dibuka meja, angkanya persis dari notif.
      </p>

      {gagal ? (
        <div style={{ ...kartu, borderColor: '#5a2b2b', color: '#ffb3b3', fontSize: 13.5 }}>{gagal}</div>
      ) : null}

      {hari ? (
        <div style={{ ...kartu, display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6, textAlign: 'center' }}>
          <div><div style={label}>Trade</div><div style={nilai}>{hari.trades}/2</div></div>
          <div><div style={label}>Menang</div><div style={{ ...nilai, color: '#5be3ae' }}>{hari.wins}</div></div>
          <div><div style={label}>Kalah</div><div style={{ ...nilai, color: '#ff8f8f' }}>{hari.losses}</div></div>
          <div><div style={label}>Total R</div><div style={{ ...nilai, color: hari.rTotal >= 0 ? '#5be3ae' : '#ff8f8f' }}>{hari.rTotal >= 0 ? '+' : ''}{hari.rTotal.toFixed(2)}</div></div>
        </div>
      ) : null}

      {terbuka.length === 0 && !gagal ? (
        <div style={{ ...kartu, textAlign: 'center', color: '#9fb0c3', fontSize: 14 }}>
          <div style={{ fontSize: 34, marginBottom: 6 }}>🎯</div>
          Tidak ada posisi terbuka sekarang.<br />
          Mesin baru hanya bicara kalau lolos semua: arah hari, MA 1H + 15m, garis, X → C1 → C2.<br />
          <span style={{ fontSize: 12.5, color: '#7d8ca0' }}>Sunyi = bot sabar. Begitu notif bunyi & meja membuka, posisinya tampil di sini otomatis.</span>
        </div>
      ) : null}

      {terbuka.map((p) => <KartuPosisi key={`${p.symbol}-${p.openedAt}`} {...p} />)}

      <p style={{ fontSize: 11.5, color: '#66778c', marginTop: 16, lineHeight: 1.5 }}>
        PAPER = latihan tanpa uang. Angka mengikuti aturan: entry close candle 2 · SL ekor candle 1 · TP 2R · 1R = 0,31 USDT · maks 2 trade/hari.
      </p>
      <ArahkanModeHp />
    </main>
  );
}
