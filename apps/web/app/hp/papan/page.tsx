'use client';

/** Papan HP: pemindai dan tiket tetap berasal dari /api/nominasi. */
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import HpHeader from '../HpHeader';
import { badgeJenis, badgeSisi, fmt, Pita, type Board, type BoardRow } from '../bahan';
import { signalStage, type SignalStage } from '../../../lib/signal-stage';

type Filter = 'SEMUA' | Exclude<SignalStage, 'PANTAU'>;
const FILTERS: ReadonlyArray<{ id: Filter; text: string }> = [
  { id: 'SEMUA', text: 'Semua' }, { id: 'PINTU', text: '① Tembus pintu' },
  { id: 'C1', text: '② Candle 1' }, { id: 'C2', text: '③ Candle 2' },
  { id: 'SIAP', text: '🎯 Siap entri' }, { id: 'BASI', text: '⌛ Basi' },
  { id: 'BATAL', text: '✕ Batal' },
];

export default function PapanHp() {
  const [board, setBoard] = useState<Board | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('SEMUA');
  const [sisi, setSisi] = useState<'SEMUA' | 'LONG' | 'SHORT'>('SEMUA');
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
  const tahap = (row: BoardRow) => signalStage(row, board?.at ?? '', sekarang ?? Date.now());
  const jumlah = useMemo(() => {
    const hasil: Record<Filter, number> = { SEMUA: rows.length, PINTU: 0, C1: 0, C2: 0, SIAP: 0, BASI: 0, BATAL: 0 };
    for (const row of rows) {
      const stage = signalStage(row, board?.at ?? '', sekarang ?? Date.now());
      if (stage !== 'PANTAU') hasil[stage]++;
    }
    return hasil;
  }, [rows, board, sekarang]);
  const tampil = useMemo(() => {
    const kata = cari.trim().toUpperCase().replace(/USDT$/, '');
    return rows.filter((row) => (!kata || row.symbol.includes(kata))
      && (sisi === 'SEMUA' || (signalStage(row, board?.at ?? '', sekarang ?? Date.now()) !== 'PANTAU' && row.side === sisi))
      && (filter === 'SEMUA' || signalStage(row, board?.at ?? '', sekarang ?? Date.now()) === filter));
  }, [rows, board, filter, sisi, cari, sekarang]);

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
      <p className="hp-lede">Urutan rumus: pintu → candle 1 → candle 2 → siap entri. Basi dan batal dipisahkan; <b>hanya SIAP</b> yang menjadi alarm tiket baru di Telegram.</p>
      <div className="hp-filters" role="group" aria-label="Tahap sinyal" style={{ overflowX: 'auto', flexWrap: 'nowrap', paddingBottom: 6 }}>
        {FILTERS.map(({ id, text }) => <button className="hp-filter" type="button" key={id} onClick={() => setFilter(id)} aria-pressed={filter === id} style={{ whiteSpace: 'nowrap', flexShrink: 0 }}>{text} · {jumlah[id]}</button>)}
      </div>
      <div className="hp-filters" role="group" aria-label="Arah sinyal">
        {(['SEMUA', 'LONG', 'SHORT'] as const).map((arah) => <button className="hp-filter" type="button" key={arah} onClick={() => setSisi(arah)} aria-pressed={sisi === arah}>{arah === 'SEMUA' ? 'Dua arah' : arah}</button>)}
      </div>
      {error && <div className="hp-error" role="alert"><b>Data tidak dapat dipastikan.</b> {error}</div>}
      <div className="hp-section-label">{filter === 'SEMUA' ? 'SEMUA KOIN FUTURES' : `TAHAP ${filter}`} <small>{tampil.length} koin cocok · {rows.length} terdaftar</small></div>
      {!error && tampil.length === 0 && <div className="hp-card hp-empty"><span className="hp-empty-icon" aria-hidden="true">⌕</span><b>{board && !terkini ? 'Menunggu data futures segar' : !board ? 'Memuat kandidat…' : 'Belum ada koin di filter ini'}</b><p>{!terkini ? 'Papan muncul setelah pasar berhasil dibaca.' : filter === 'SIAP' ? 'Belum ada tiket sah. Mesin tidak memaksa entri.' : 'Coba kata kunci atau filter yang lain.'}</p></div>}
      {tampil.length > 60 && <p className="hp-lede">Menampilkan 60 pertama agar HP tetap ringan. Cari simbol untuk melihat seluruh {tampil.length} hasil.</p>}
      {tampil.slice(0, 60).map((row) => {
        const stage = tahap(row);
        const label = stage === 'PANTAU' ? 'Belum lolos filter / masih dipantau' : stage === 'SIAP' ? '🎯 SIAP ENTRI · alarm Telegram' : `Tahap ${stage}`;
        return (
          <Link key={row.symbol} href={`/hp/koin/${row.symbol}`} className={`hp-card hp-market-row${stage === 'BATAL' || stage === 'BASI' ? ' is-off' : ''}`}>
            <div className="hp-market-row-top">
              <span className="hp-market-row-name">{row.symbol.replace('USDT', '')}</span>
              {stage === 'PANTAU'
                ? <span style={{ fontSize: 11, color: '#697c76', fontWeight: 700 }}>ARAH BELUM TERVERIFIKASI</span>
                : <span style={badgeSisi(row).style}>{badgeSisi(row).text}</span>}
              {badgeJenis(row)}
              <span className="hp-market-row-price">{fmt(row.last)}</span>
            </div>
            <div className="hp-market-row-status">{label} · Gate 1H {row.gate}{row.gateAlign ? ' · gate MA25/MA99 searah ✓' : ''}{stage === 'SIAP' && !row.demoReady ? ' · belum tersedia di Testnet' : ''}</div>
            <Pita row={row} />
            <div className="hp-market-row-meta">{row.setup.note ?? 'Menunggu bukti candle yang lengkap.'} · range {row.rangePct.toFixed(1)}% · vol {row.volJt}jt</div>
          </Link>
        );
      })}
    </div>
  );
}
