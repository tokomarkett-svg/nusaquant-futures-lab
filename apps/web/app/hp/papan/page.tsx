'use client';

/**
 * PAPAN (mode HP) — daftar nonton yang jujur, data dari API papan yang sama dengan web.
 * Filter chip + garis pita posisi harga (kiri = batal, kanan = pintu) + badge konsisten
 * dengan notif: 🎯 SIAP / 🔥 MENYALA / 💀 PADAM / abu = nonton.
 */

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  WARNA, badgeJenis, badgeSisi, badgeStatus, fmt, labelSumber, Pita,
  type Board, type BoardRow,
} from '../bahan';

type Filter = 'SEMUA' | 'LONG' | 'SHORT' | 'SEARAH' | 'SIAP';

const CHIP: React.CSSProperties = { fontSize: 10.5, fontWeight: 700, padding: '5px 11px', borderRadius: 999, background: '#fff', border: '1px solid var(--line)', color: WARNA.muted };
const CHIP_ON: React.CSSProperties = { ...CHIP, background: WARNA.gelap, color: '#fff', borderColor: WARNA.gelap };

export default function PapanHp() {
  const [board, setBoard] = useState<Board | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('SEMUA');

  const muat = useCallback(async () => {
    try {
      const r = await fetch('/api/nominasi', { cache: 'no-store' });
      const p = await r.json();
      if (!p.ok) throw new Error(p.error ?? 'Gagal memindai.');
      setBoard(p as Board);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    void muat();
    const timer = setInterval(() => void muat(), 60_000);
    return () => clearInterval(timer);
  }, [muat]);

  const rows = board?.rows ?? [];
  const tampil = useMemo(() => {
    const cocok = (r: BoardRow): boolean => {
      if (filter === 'LONG') return r.side === 'LONG';
      if (filter === 'SHORT') return r.side === 'SHORT';
      if (filter === 'SEARAH') return r.gateAlign;
      if (filter === 'SIAP') return Boolean(r.ticket?.actionable) && r.gateAlign && r.status !== 'PADAM';
      return true;
    };
    return rows.filter(cocok);
  }, [rows, filter]);

  return (
    <div style={{ padding: '10px 12px 0' }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '2px 2px 10px' }}>
        <div style={{ width: 30, height: 30, borderRadius: 9, background: WARNA.gelap, color: WARNA.mint, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 13 }}>N</div>
        <b style={{ fontSize: 15 }}>Papan</b>
        <span style={{ marginLeft: 'auto', ...labelSumber(board?.market).style }}>{labelSumber(board?.market).text}</span>
      </header>

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '0 0 10px' }}>
        {([['SEMUA', 'Semua'], ['LONG', 'LONG'], ['SHORT', 'SHORT'], ['SEARAH', 'Gate searah'], ['SIAP', '🎯 Siap']] as const).map(([nilai, label]) => (
          <button key={nilai} onClick={() => setFilter(nilai)} style={filter === nilai ? CHIP_ON : CHIP}>{label}</button>
        ))}
      </div>

      {error && <div style={{ background: WARNA.redSoft, color: WARNA.red, border: '1px solid #f3cdd6', borderRadius: 12, padding: '10px 12px', fontSize: 12.5, marginBottom: 10 }}>{error}</div>}
      {!error && tampil.length === 0 && (
        <div style={{ fontSize: 12.5, color: WARNA.muted, textAlign: 'center', padding: '24px 0' }}>Tidak ada koin di filter ini.</div>
      )}

      {tampil.map((row) => {
        const status = badgeStatus(row);
        return (
          <Link key={row.symbol} href={`/hp/koin/${row.symbol}`} style={{ textDecoration: 'none', color: 'inherit' }}>
            <div style={{
              background: '#fff', border: '1px solid var(--line)', borderRadius: 14, padding: '10px 11px', marginBottom: 8,
              borderLeft: `3px solid ${row.status === 'MENYALA' ? '#d29125' : row.status === 'PADAM' ? '#5c2330' : '#dce6df'}`,
              opacity: row.status === 'PADAM' ? 0.8 : 1,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
                <span style={{ fontWeight: 800, fontSize: 13.5 }}>{row.symbol.replace('USDT', '')}</span>
                <span style={badgeSisi(row).style}>{badgeSisi(row).text}</span>
                {badgeJenis(row)}
                <span style={{ fontSize: 9.5, fontWeight: 800, padding: '2px 8px', borderRadius: 6, ...status.style }}>{status.text}</span>
                <span style={{ marginLeft: 'auto', textAlign: 'right', fontFamily: 'ui-monospace, monospace', fontWeight: 800, fontSize: 13.5 }}>{fmt(row.last)}</span>
              </div>
              <Pita row={row} />
              <div style={{ fontSize: 9.5, color: WARNA.muted, marginTop: 5 }}>
                {row.setup.note ?? (row.gateAlign ? 'gate searah ✔' : `gate ${row.gate}`)} · range {row.rangePct.toFixed(1)}% · vol {row.volJt}jt
              </div>
            </div>
          </Link>
        );
      })}
    </div>
  );
}
