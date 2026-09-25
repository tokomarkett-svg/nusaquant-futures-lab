'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Pembaruan from './Pembaruan';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { Board, BoardRow, Status } from '../../lib/binance';
import SiapEntri from './SiapEntri';

type Filter = 'SEMUA' | 'LONG' | 'SHORT' | 'SEARAH' | 'TIKET';

const STATUS_STYLE: Record<Status, { bg: string; fg: string; border: string; label: string }> = {
  MENYALA: { bg: '#3a2a06', fg: '#ffc44d', border: '#6b4d0a', label: '🔥 MENYALA' },
  SIMAK: { bg: '#122036', fg: '#8fb6ff', border: '#23406b', label: 'SIMAK' },
  DISIMAK: { bg: '#141b29', fg: '#8ea3c0', border: '#28344a', label: 'DISIMAK' },
  PADAM: { bg: '#241214', fg: '#ff9db0', border: '#5c2330', label: '💀 PADAM — zona mati (kena batal)' },
};

const GATE_STYLE = {
  HIJAU: { bg: '#0e2a1d', fg: '#7ff0b0', border: '#1c4a33', label: '🟢 1H' },
  MERAH: { bg: '#2a1119', fg: '#ff9db0', border: '#5c2330', label: '🔴 1H' },
  KUNING: { bg: '#2b2413', fg: '#ffd479', border: '#584a1e', label: '🟡 1H' },
} as const;

const BUCKETS = ['<1 jam', '1-2 jam', '2-3 jam', '>3 jam'] as const;

function priceDigits(price: number) {
  if (price >= 100) return 2;
  if (price >= 1) return 4;
  if (price >= 0.01) return 5;
  return 7;
}

export default function PapanNominasi() {
  const [board, setBoard] = useState<Board | null>(null);
  const [prices, setPrices] = useState<Record<string, number>>({});
  const [cari, setCari] = useState('');
  const router = useRouter();
  const [previous, setPrevious] = useState<Record<string, number>>({});
  const [filter, setFilter] = useState<Filter>('SEMUA');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastAt, setLastAt] = useState<string | null>(null);
  const previousRef = useRef<Record<string, number>>({});

  const loadBoard = useCallback(async () => {
    try {
      const response = await fetch('/api/nominasi', { cache: 'no-store' });
      const payload = await response.json();
      if (!payload.ok) throw new Error(payload.error ?? 'Gagal memindai.');
      setBoard(payload as Board);
      setLastAt(new Date().toLocaleTimeString('id-ID'));
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setLoading(false);
    }
  }, []);

  const loadPrices = useCallback(async () => {
    try {
      const response = await fetch('/api/harga', { cache: 'no-store' });
      const payload = await response.json();
      if (!payload.ok) return;
      setPrevious(previousRef.current);
      previousRef.current = payload.prices as Record<string, number>;
      setPrices(payload.prices as Record<string, number>);
    } catch {
      /* tick harga gagal = biarkan angka terakhir */
    }
  }, []);

  useEffect(() => {
    void loadBoard();
    void loadPrices();
    const boardTimer = setInterval(() => void loadBoard(), 60_000);
    const priceTimer = setInterval(() => void loadPrices(), 5_000);
    return () => {
      clearInterval(boardTimer);
      clearInterval(priceTimer);
    };
  }, [loadBoard, loadPrices]);

  const rows = useMemo(() => {
    if (!board) return [];
    if (filter === 'LONG') return board.rows.filter((row) => row.side === 'LONG');
    if (filter === 'SHORT') return board.rows.filter((row) => row.side === 'SHORT');
    if (filter === 'SEARAH') return board.rows.filter((row) => row.gateAlign);
    if (filter === 'TIKET') return board.rows.filter((row) => row.ticket !== null);
    return board.rows;
  }, [board, filter]);

  const grouped = useMemo(() => {
    const groups: Array<{ label: string; rows: BoardRow[] }> = [];
    for (const bucket of BUCKETS) {
      const inside = rows.filter((row) => row.bucket === bucket);
      if (inside.length) groups.push({ label: `NOMINASI ${bucket.toUpperCase()}`, rows: inside });
    }
    const noTouch = rows.filter((row) => row.touchAgeMin === null);
    if (noTouch.length) groups.push({ label: 'BELUM TERSENTUH', rows: noTouch });
    return groups;
  }, [rows]);

  const funnel = board?.funnel;

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <section className="panel" style={{ padding: '16px 18px', borderRadius: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <h2 style={{ margin: 0, fontSize: 18, letterSpacing: '-0.02em' }}>Papan Nominasi</h2>
          <span style={{ fontSize: 11, fontWeight: 800, padding: '3px 9px', borderRadius: 999, background: '#eaf8ef', color: 'var(--green-dark)', border: '1px solid #c8e9d5' }}>● LIVE</span>
          <span style={{ fontSize: 11, fontWeight: 800, padding: '3px 9px', borderRadius: 999, background: '#f3efff', color: '#5b3fa8', border: '1px solid #ded2ff' }}>PAPER + DEMO</span>
          <span
            title={(board?.market ?? 'SPOT') === 'FUTURES' ? 'Papan, notif Telegram, dan meja paper membaca pasar futures yang sama.' : 'Jembatan futures belum aktif — papan sementara memakai cermin spot (tidak sinkron dengan notif).'}
            style={{ fontSize: 11, fontWeight: 800, padding: '3px 9px', borderRadius: 999, background: (board?.market ?? 'SPOT') === 'FUTURES' ? '#eaf8ef' : '#fff4e0', color: (board?.market ?? 'SPOT') === 'FUTURES' ? 'var(--green-dark)' : '#a3690b', border: `1px solid ${(board?.market ?? 'SPOT') === 'FUTURES' ? '#c8e9d5' : '#ecd9a0'}` }}
          >
            {(board?.market ?? 'SPOT') === 'FUTURES' ? 'FUTURES ✔ SAMA DENGAN NOTIF' : '⚠ SPOT (CADANGAN) — BEDA DENGAN NOTIF'}
          </span>
          {lastAt && <span style={{ marginLeft: 'auto', color: 'var(--muted)', fontSize: 11 }}>scan terakhir {lastAt} · harga tiap 5 dtk</span>}
        </div>
        <p style={{ margin: '8px 0 0', color: 'var(--muted)', fontSize: 12.5, lineHeight: 1.6 }}>
          Seluruh pair USDT dipindai memakai sistem kita: zona pintu–manis–batal dari High/Low 24 jam (cermin long & short),
          pagar range ≥3%, likuiditas ≥5jt USDT, dan data candle wajib segar ≤45 menit.
        </p>
        {funnel && (
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 12, fontFamily: "'DM Mono', monospace", fontSize: 12 }}>
            <span>dipindai <b>{funnel.scanned}</b></span>
            <span>likuid <b>{funnel.liquid}</b></span>
            <span>range ≥3% <b>{funnel.rangeOk}</b></span>
            <span>masuk papan <b>{funnel.board}</b></span>
            <span style={{ color: 'var(--amber)' }}>data mati dibuang <b>{funnel.staleDropped}</b></span>
          </div>
        )}
      </section>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          const bersih = cari.trim().toUpperCase().replace(/USDT$/, '');
          if (bersih) router.push(`/nominasi/${bersih}USDT`);
        }}
        style={{ display: 'flex', gap: 8 }}
      >
        <input
          value={cari}
          onChange={(event) => setCari(event.target.value)}
          placeholder="🔍 Cek koin dari notif… (ketik CYS)"
          style={{ flex: 1, minWidth: 0, border: '1px solid #d7e5dc', borderRadius: 10, padding: '9px 12px', fontSize: 13, background: 'white' }}
        />
        <button type="submit" className="control-btn" style={{ fontWeight: 800, background: 'var(--green-dark)', color: 'white', borderColor: 'var(--green-dark)' }}>CEK KOIN</button>
      </form>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {(['SEMUA', 'LONG', 'SHORT', 'SEARAH', 'TIKET'] as Filter[]).map((item) => (
          <button
            key={item}
            onClick={() => setFilter(item)}
            className="control-btn"
            style={filter === item ? { background: 'var(--green-dark)', color: 'white', borderColor: 'var(--green-dark)' } : undefined}
          >
            {item === 'SEARAH' ? 'GATE SEARAH ✔' : item === 'TIKET' ? '🎯 SIAP TIKET' : item}
          </button>
        ))}
      </div>

      <Pembaruan />
      <SiapEntri rows={board?.rows ?? []} prices={prices} />

      {error && <section className="panel" style={{ padding: 16, borderRadius: 18, color: 'var(--red)' }}>Gagal memindai: {error}</section>}
      {loading && !board && <section className="panel" style={{ padding: 20, borderRadius: 18, color: 'var(--muted)' }}>Memindai pasar… (sekitar 3–6 detik)</section>}

      {grouped.map((group) => (
        <section key={group.label} style={{ display: 'grid', gap: 8 }}>
          <div style={{ color: 'var(--muted)', fontSize: 11, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase' }}>{group.label} · {group.rows.length}</div>
          {group.rows.map((row) => {
            const live = prices[row.symbol] ?? row.last;
            const before = previous[row.symbol];
            const direction = before === undefined ? 0 : live > before ? 1 : live < before ? -1 : 0;
            const digits = priceDigits(live);
            const zone = row.side === 'LONG' ? row.zones.long : row.zones.short;
            const status = STATUS_STYLE[row.status];
            const gate = GATE_STYLE[row.gate];
            return (
              <Link key={row.symbol} href={`/nominasi/${row.symbol}`} style={{ textDecoration: 'none', color: 'inherit' }}>
                <div className="panel" style={{ padding: '12px 14px', borderRadius: 14, borderLeft: `3px solid ${row.status === 'MENYALA' ? '#d29125' : row.status === 'PADAM' ? '#5c2330' : '#dce5dd'}` }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <b style={{ fontSize: 15 }}>{row.symbol.replace('USDT', '')}</b>
                    <span style={{ fontSize: 10.5, fontWeight: 800, padding: '2px 8px', borderRadius: 6, background: row.side === 'LONG' ? '#eaf8ef' : '#fdeeee', color: row.side === 'LONG' ? 'var(--green-dark)' : 'var(--red)', border: `1px solid ${row.side === 'LONG' ? '#c8e9d5' : '#f3d4d4'}` }}>{row.side}</span>
                    {row.jenis !== 'kripto' && (
                      <span title="Perp saham/komoditas — cari di menu Futures Binance, bukan daftar koin kripto" style={{ fontSize: 10, fontWeight: 800, padding: '2px 7px', borderRadius: 6, background: '#f1ecfb', color: '#5b3fa8', border: '1px solid #d9cdf2' }}>
                        {row.jenis === 'saham' ? 'SAHAM' : 'KOMODITAS'}
                      </span>
                    )}
                    <span style={{ fontSize: 10.5, fontWeight: 800, padding: '2px 8px', borderRadius: 6, background: status.bg, color: status.fg, border: `1px solid ${status.border}` }}>{status.label}</span>
                    <span style={{ marginLeft: 'auto', fontFamily: "'DM Mono', monospace", fontSize: 15, fontWeight: 700, color: direction === 1 ? 'var(--green-dark)' : direction === -1 ? 'var(--red)' : 'var(--ink)', transition: 'color .3s' }}>
                      {live.toFixed(digits)}{direction === 1 ? ' ▲' : direction === -1 ? ' ▼' : ''}
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 7, fontFamily: "'DM Mono', monospace", fontSize: 11.5, color: 'var(--muted)' }}>
                    <span>pintu <b style={{ color: 'var(--ink)' }}>{zone.pintu.toFixed(digits)}</b></span>
                    <span>manis <b>{zone.manis.toFixed(digits)}</b></span>
                    <span>batal <b>{zone.batal.toFixed(digits)}</b></span>
                  </div>
                  {row.ticket && (
                    <div style={{ marginTop: 8, padding: '7px 10px', borderRadius: 9, background: row.ticket.actionable ? '#eaf8ef' : '#fff4e8', border: `1px solid ${row.ticket.actionable ? '#c8e9d5' : '#f3ddc2'}`, fontFamily: "'DM Mono', monospace", fontSize: 11.5 }}>
                      🎯 <b style={{ color: row.ticket.actionable ? 'var(--green-dark)' : 'var(--amber)' }}>{row.ticket.actionable ? 'TIKET SIAP' : 'TIKET BASI — JANGAN DIKEJAR'}</b>
                      {'  ·  '}entry {row.ticket.entry.toFixed(digits)} · SL {row.ticket.stop.toFixed(digits)} · TP {row.ticket.target.toFixed(digits)} · ukuran {row.ticket.sizeCoin.toLocaleString('id-ID', { maximumFractionDigits: 4 })} coin
                    </div>
                  )}
                  {!row.ticket && row.setup.note && (
                    <div style={{ marginTop: 8, color: 'var(--muted)', fontSize: 11 }}>catatan: {row.setup.note}</div>
                  )}
                  <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 8, alignItems: 'center', fontSize: 11.5 }}>
                    <span style={{ padding: '2px 8px', borderRadius: 6, background: gate.bg, color: gate.fg, border: `1px solid ${gate.border}`, fontWeight: 800 }}>{gate.label}</span>
                    {row.gateAlign && <span style={{ color: 'var(--green-dark)', fontWeight: 700 }}>searah ✔</span>}
                    <span style={{ color: 'var(--muted)' }}>jarak {row.insideBand ? <b style={{ color: 'var(--amber)' }}>di dalam pita</b> : `${row.distPct.toFixed(2)}%`}</span>
                    <span style={{ color: 'var(--muted)' }}>range <b style={{ color: 'var(--ink)' }}>{row.rangePct.toFixed(1)}%</b></span>
                    <span style={{ color: 'var(--muted)' }}>vol {row.volJt}jt</span>
                    <span style={{ marginLeft: 'auto', color: 'var(--muted)' }}>
                      sentuh {row.touchAgeMin === null ? '—' : row.touchAgeMin < 60 ? `${Math.round(row.touchAgeMin)} mnt` : `${Math.floor(row.touchAgeMin / 60)}j ${Math.round(row.touchAgeMin % 60)}m`}
                    </span>
                  </div>
                </div>
              </Link>
            );
          })}
        </section>
      ))}

      {!loading && board && rows.length === 0 && (
        <section className="panel" style={{ padding: 20, borderRadius: 18, color: 'var(--muted)' }}>Tidak ada kandidat di filter ini. Pasar sedang sepi — menunggu itu bagian dari sistem.</section>
      )}
    </div>
  );
}
