'use client';

/**
 * MEJA (mode HP) — hakim 20 trade disiplin. TUNTAS:
 * progres lintas hari (/api/meja/skor, VOID tidak dihitung) + kotak hari ini
 * + RIWAYAT 20 trade terakhir per trade (/api/meja/riwayat, VOID dilabeli).
 */

import { useCallback, useEffect, useState } from 'react';
import { WARNA, umur, wib } from '../bahan';

type Skor = {
  ok: boolean; error?: string; total: number; target: number; rTotal: number; rUsdt: number;
  wins: number; losses: number; winRate: number | null; terakhir: string[];
};
type Riwayat = {
  symbol: string; side: 'LONG' | 'SHORT'; r: number; usdt: number;
  reason: string | null; closedAt: string | null; void: boolean;
};
type DataMeja = { ok: boolean; open?: unknown[]; today?: { trades: number; open: number; closed: number; wins: number; losses: number; rTotal: number; pnlUsdt: number } | null };

export default function MejaHp() {
  const [skor, setSkor] = useState<Skor | null>(null);
  const [hariIni, setHariIni] = useState<DataMeja['today'] | null>(null);
  const [riwayat, setRiwayat] = useState<Riwayat[]>([]);
  const [error, setError] = useState<string | null>(null);

  const muat = useCallback(async () => {
    try {
      const [rSkor, rMeja, rRiwayat] = await Promise.all([
        fetch('/api/meja/skor', { cache: 'no-store' }),
        fetch('/api/meja', { cache: 'no-store' }),
        fetch('/api/meja/riwayat', { cache: 'no-store' }),
      ]);
      const pSkor = await rSkor.json();
      const pMeja = await rMeja.json();
      const pRiwayat = await rRiwayat.json();
      if (pSkor.ok) setSkor(pSkor as Skor);
      setHariIni(pMeja.today ?? null);
      if (pRiwayat.ok) setRiwayat(pRiwayat.trades as Riwayat[]);
      setError(pSkor.ok ? null : pSkor.error ?? 'Gagal membaca skor.');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    void muat();
    const timer = setInterval(() => void muat(), 60_000);
    return () => clearInterval(timer);
  }, [muat]);

  const total = skor?.total ?? 0;
  const target = skor?.target ?? 20;
  const pct = Math.min(100, (total / target) * 100);
  const rTotal = skor?.rTotal ?? 0;

  return (
    <div style={{ padding: '10px 12px 0' }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '2px 2px 10px' }}>
        <div style={{ width: 30, height: 30, borderRadius: 9, background: WARNA.gelap, color: WARNA.mint, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 13 }}>N</div>
        <b style={{ fontSize: 15 }}>Meja (Jurnal)</b>
        <span style={{ marginLeft: 'auto', fontSize: 10, fontWeight: 800, color: WARNA.greenDark, background: WARNA.mintSoft, border: '1px solid #bfe8d1', padding: '3px 9px', borderRadius: 999 }}>ATURAN ASLI</span>
      </header>

      <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 16, padding: '16px 14px', textAlign: 'center', marginBottom: 10 }}>
        <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: 0.6, color: WARNA.muted }}>PROGRES {target} TRADE DISIPLIN</div>
        <div style={{ fontFamily: 'ui-monospace, monospace', fontSize: 38, fontWeight: 800, margin: '4px 0' }}>
          {total}<span style={{ fontSize: 20, color: WARNA.muted }}>/{target}</span>
        </div>
        <div style={{ height: 6, borderRadius: 99, background: '#e4ede6', position: 'relative', overflow: 'hidden' }}>
          <i style={{ display: 'block', height: '100%', width: `${pct}%`, background: WARNA.greenDark, borderRadius: 99 }} />
        </div>
        {skor?.terakhir?.length ? (
          <div style={{ display: 'flex', gap: 4, justifyContent: 'center', marginTop: 9 }}>
            {skor.terakhir.map((hasil, index) => (
              <span key={index} style={{
                width: 22, height: 22, borderRadius: 8, fontSize: 11, fontWeight: 800, lineHeight: '22px',
                background: hasil === 'W' ? WARNA.mintSoft : hasil === 'L' ? WARNA.redSoft : '#eef1f4',
                color: hasil === 'W' ? '#0d7a4b' : hasil === 'L' ? WARNA.red : '#5d6b76',
              }}>{hasil}</span>
            ))}
          </div>
        ) : null}
        <div style={{ fontSize: 12, color: WARNA.muted, marginTop: 9, lineHeight: 1.55 }}>
          Total <b style={{ color: rTotal >= 0 ? '#0d7a4b' : WARNA.red }}>{rTotal >= 0 ? '+' : ''}{rTotal.toFixed(2)}R ({(skor?.rUsdt ?? 0) >= 0 ? '+' : ''}{skor?.rUsdt ?? 0} USDT paper)</b>
          {skor?.winRate !== null && skor?.winRate !== undefined ? <> · menang {skor.winRate}%</> : null}
          <br />Keputusan setelah {target} trade: di tangan pemilik.
        </div>
      </div>

      {error && <div style={{ background: WARNA.redSoft, color: WARNA.red, border: '1px solid #f3cdd6', borderRadius: 12, padding: '10px 12px', fontSize: 12.5, marginBottom: 10 }}>{error}</div>}

      {hariIni && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
          {[
            { n: hariIni.trades, l: 'TRADE HARI INI' },
            { n: hariIni.wins, l: 'MENANG' },
            { n: hariIni.losses, l: 'KALAH' },
            { n: hariIni.open, l: 'BERJALAN' },
          ].map((kotak) => (
            <div key={kotak.l} style={{ flex: 1, background: '#fff', border: '1px solid var(--line)', borderRadius: 14, padding: '9px 6px', textAlign: 'center' }}>
              <div style={{ fontSize: 18, fontWeight: 800 }}>{kotak.n}</div>
              <div style={{ fontSize: 8, color: WARNA.muted, fontWeight: 700, letterSpacing: 0.3 }}>{kotak.l}</div>
            </div>
          ))}
        </div>
      )}

      <div style={{ fontSize: 12, fontWeight: 800, color: '#33463c', margin: '4px 2px 6px' }}>📓 RIWAYAT — {riwayat.length ? `${riwayat.length} trade terakhir` : 'belum ada trade tertutup'}</div>
      {riwayat.map((trade, index) => {
        const menang = trade.r > 0;
        const emoji = trade.void ? '🗑' : trade.reason === 'TP' ? '✅' : trade.reason === 'SL' ? '❌' : '⏱';
        const label = trade.void ? 'VOID-REGRESI' : trade.reason === 'TP' ? 'TARGET KENA' : trade.reason === 'SL' ? 'STOP KENA' : trade.reason === 'TIMEOUT' ? 'BATAS WAKTU' : trade.reason ?? 'DITUTUP';
        return (
          <div key={`${trade.symbol}-${trade.closedAt ?? index}`} style={{
            background: '#fff', border: '1px solid var(--line)', borderLeft: `3px solid ${trade.void ? '#c9d6cd' : menang ? '#0d7a4b' : WARNA.red}`,
            borderRadius: 14, padding: '10px 11px', marginBottom: 8, opacity: trade.void ? 0.72 : 1,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
              <span>{emoji}</span>
              <b style={{ fontSize: 12.5 }}>{label} — {trade.symbol.replace('USDT', '')}</b>
              <span style={{ fontSize: 10, fontWeight: 800, padding: '2px 7px', borderRadius: 6, background: trade.side === 'LONG' ? WARNA.mintSoft : WARNA.redSoft, color: trade.side === 'LONG' ? WARNA.greenDark : WARNA.red, border: `1px solid ${trade.side === 'LONG' ? '#bfe8d1' : '#f3cdd6'}` }}>{trade.side}</span>
              <b style={{ marginLeft: 'auto', fontFamily: 'ui-monospace, monospace', fontSize: 13.5, color: trade.void ? WARNA.muted : menang ? '#0d7a4b' : WARNA.red }}>
                {trade.void ? '0R' : `${trade.r >= 0 ? '+' : ''}${trade.r.toFixed(2)}R`}
              </b>
            </div>
            <div style={{ fontSize: 9.5, color: WARNA.muted, marginTop: 4 }}>
              {trade.void ? 'ditutup netral (PnL 0) — aturan mesin berganti, tak masuk skor' : `${trade.usdt >= 0 ? '+' : ''}${trade.usdt.toFixed(2)} USDT paper`}
              {trade.closedAt ? ` · ${wib(new Date(trade.closedAt).getTime())} WIB (${umur(trade.closedAt)} lalu)` : ''}
            </div>
          </div>
        );
      })}

      <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 14, padding: '12px 13px', fontSize: 11.5, color: WARNA.muted, lineHeight: 1.6, marginTop: 2 }}>
        <b style={{ color: WARNA.ink }}>Cara membaca:</b> meja hanya mencatat trade yang lahir dari paket sah
        (X → C1 → C2 + gate searah). VOID-REGRESI (aturan mesin berganti) tampil di riwayat tapi <b style={{ color: WARNA.ink }}>tidak masuk skor</b> —
        supaya hitungan {target} trade mulai dari nol yang jujur.
      </div>
    </div>
  );
}
