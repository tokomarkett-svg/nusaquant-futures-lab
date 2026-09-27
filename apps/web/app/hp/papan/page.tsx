'use client';

/** Papan HP: pemindai dan tiket tetap berasal dari /api/nominasi. */
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import HpHeader from '../HpHeader';
import { badgeJenis, badgeSisi, badgeStatus, fmt, Pita, type Board, type BoardRow } from '../bahan';

type Filter = 'SEMUA' | 'LONG' | 'SHORT' | 'SEARAH' | 'SIAP';
const FILTERS: ReadonlyArray<{ id: Filter; text: string }> = [
  { id: 'SEMUA', text: 'Semua' }, { id: 'LONG', text: 'Long' }, { id: 'SHORT', text: 'Short' },
  { id: 'SEARAH', text: 'Gate searah' }, { id: 'SIAP', text: '◎ Tiket siap' },
];

export default function PapanHp() {
  const [board, setBoard] = useState<Board | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('SEMUA');
  const [cari, setCari] = useState('');
  const [sekarang, setSekarang] = useState<number | null>(null);

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
  useEffect(() => {
    setSekarang(Date.now());
    const timer = setInterval(() => setSekarang(Date.now()), 10_000);
    return () => clearInterval(timer);
  }, []);

  const terkini = Boolean(board && !error && sekarang !== null && board.market === 'FUTURES' && sekarang - Date.parse(board.at) <= 120_000);
  const rows = terkini ? board?.rows ?? [] : [];
  const tampil = useMemo(() => {
    const kata = cari.trim().toUpperCase().replace(/USDT$/, '');
    const cocok = (r: BoardRow): boolean => {
      if (kata && !r.symbol.includes(kata)) return false;
      if (filter === 'LONG') return r.side === 'LONG';
      if (filter === 'SHORT') return r.side === 'SHORT';
      if (filter === 'SEARAH') return r.gateAlign;
      if (filter === 'SIAP') return Boolean(r.ticket?.actionable) && r.gateAlign && r.status !== 'PADAM' && board !== null && sekarang !== null &&
        r.dataAgeMin + (sekarang - Date.parse(board.at)) / 60_000 <= 45 && r.setup.candle2 !== null &&
        sekarang >= r.setup.candle2 + 900_000 && sekarang <= r.setup.candle2 + 4 * 900_000;
      return true;
    };
    return rows.filter(cocok);
  }, [rows, board, filter, cari, sekarang]);

  return (
    <div className="hp-page">
      <HpHeader market={terkini ? board?.market : undefined} />
      <p className="hp-eyebrow">PAPAN <b>·</b> PEMANTAUAN PASAR</p>
      <h1 className="hp-heading">Papan kandidat.</h1>
      <p className="hp-lede">Saring tanpa terburu-buru. “Menyala” belum berarti siap entri.</p>
      <div className="hp-status-strip" role="status">
        <span className="hp-status-icon" aria-hidden="true">▦</span>
        <div className="hp-status-copy"><b>{error ? 'Pemindaian terganggu' : terkini ? `${rows.length} koin di papan` : board ? 'Data perlu diperbarui' : 'Sedang memindai…'}</b><small>{error ? 'Daftar lama disembunyikan sampai data pulih.' : terkini && board ? `${board.funnel.scanned} pasar terbaca · data ${board.market}` : 'Meminta data futures terkini'}</small></div>
        <span className={`hp-live${error || (board && !terkini) ? ' hp-live--error' : ''}`}>{error || (board && !terkini) ? 'TUNDA' : terkini ? 'AKTIF' : 'MEMUAT'}</span>
      </div>
      <label className="hp-search"><span aria-hidden="true">⌕</span><input value={cari} onChange={(e) => setCari(e.target.value)} placeholder="Cari koin, misalnya RUNE" aria-label="Cari koin" /></label>
      <div className="hp-filters" role="group" aria-label="Filter koin">
        {FILTERS.map(({ id, text }) => <button className="hp-filter" type="button" key={id} onClick={() => setFilter(id)} aria-pressed={filter === id}>{text}</button>)}
      </div>
      {error && <div className="hp-error" role="alert"><b>Data tidak dapat dipastikan.</b> {error}</div>}
      <div className="hp-section-label">{filter === 'SIAP' ? 'TIKET SIAP' : 'HASIL PEMINDAIAN'} <small>{tampil.length} koin ditampilkan</small></div>
      {!error && tampil.length === 0 && <div className="hp-card hp-empty"><span className="hp-empty-icon" aria-hidden="true">⌕</span><b>{board && !terkini ? 'Menunggu data futures segar' : !board ? 'Memuat kandidat…' : 'Belum ada koin di filter ini'}</b><p>{!terkini ? 'Papan muncul setelah pasar berhasil dibaca.' : filter === 'SIAP' ? 'Belum ada tiket sah. Mesin tidak memaksa entri.' : 'Coba kata kunci atau filter yang lain.'}</p></div>}
      {tampil.map((row) => {
        const status = badgeStatus(row);
        return (
          <Link key={row.symbol} href={`/hp/koin/${row.symbol}`} className={`hp-card hp-market-row${row.status === 'PADAM' ? ' is-off' : ''}`}>
            <div className="hp-market-row-top">
              <span className="hp-market-row-name">{row.symbol.replace('USDT', '')}</span>
              <span style={badgeSisi(row).style}>{badgeSisi(row).text}</span>
              {badgeJenis(row)}
              <span className="hp-market-row-price">{fmt(row.last)}</span>
            </div>
            <div className="hp-market-row-status">{status.text} · Gate 1H {row.gate}{row.gateAlign ? ' · MA99 searah ✓' : ''}</div>
            <Pita row={row} />
            <div className="hp-market-row-meta">{row.setup.note ?? 'Menunggu bukti candle yang lengkap.'} · range {row.rangePct.toFixed(1)}% · vol {row.volJt}jt</div>
          </Link>
        );
      })}
    </div>
  );
}
