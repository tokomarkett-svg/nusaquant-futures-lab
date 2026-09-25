'use client';

/**
 * MEJA (mode HP) — hakim 20 trade disiplin.
 * Progres lintas hari dari /api/meja/skor (VOID-REGRESI tidak dihitung),
 * hasil hari ini dari /api/meja. Semua dilaporkan mentah: menang, kalah, void.
 */

import { useCallback, useEffect, useState } from 'react';
import { WARNA, wib } from '../bahan';

type Skor = {
  ok: boolean; error?: string; total: number; target: number; rTotal: number; rUsdt: number;
  wins: number; losses: number; winRate: number | null; terakhir: string[];
};
type TradeHariIni = {
  symbol: string; side: string; status: string; r: number; reason: string | null; closedAt: string | null;
};
type DataMeja = { ok: boolean; open?: unknown[]; today?: { trades: number; open: number; closed: number; wins: number; losses: number; rTotal: number; pnlUsdt: number } | null };

export default function MejaHp() {
  const [skor, setSkor] = useState<Skor | null>(null);
  const [hariIni, setHariIni] = useState<DataMeja['today'] | null>(null);
  const [trades, setTrades] = useState<TradeHariIni[]>([]);
  const [error, setError] = useState<string | null>(null);

  const muat = useCallback(async () => {
    try {
      const [rSkor, rMeja] = await Promise.all([
        fetch('/api/meja/skor', { cache: 'no-store' }),
        fetch('/api/meja', { cache: 'no-store' }),
      ]);
      const pSkor = await rSkor.json();
      if (pSkor.ok) setSkor(pSkor as Skor);
      const pMeja = await rMeja.json();
      setHariIni(pMeja.today ?? null);
      // posisi hari ini versi ringkas tidak termasuk daftar — dari open+today ringkasan saja cukup utk tab ini
      setTrades([]);
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

      <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 14, padding: '12px 13px', fontSize: 11.5, color: WARNA.muted, lineHeight: 1.6 }}>
        <b style={{ color: WARNA.ink }}>Cara membaca:</b> meja hanya mencatat trade yang lahir dari paket sah
        (X → C1 → C2 + gate searah). Poses VOID-REGRESI (aturan mesin berganti) tidak masuk skor —
        supaya hitungan 20 trade mulai dari nol yang jujur. Riwayat lengkap & rinci tiap trade ada di
        jurnal Supabase (tab <b style={{ color: WARNA.ink }}>trade_journal</b>).
      </div>
    </div>
  );
}
