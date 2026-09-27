'use client';

/** Beranda HP: visualisasi tiket dan kandidat dari /api/nominasi saja. Rumus tidak berubah. */
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import HpHeader from './HpHeader';
import { fmt, tiketSiap, wib, type Board, type BoardRow } from './bahan';

export default function BerandaHp() {
  const [board, setBoard] = useState<Board | null>(null);
  const [error, setError] = useState<string | null>(null);
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
  const siap = rows.filter((row) => tiketSiap(row) && board && sekarang !== null &&
    row.dataAgeMin + (sekarang - Date.parse(board.at)) / 60_000 <= 45 && row.setup.candle2 !== null &&
    sekarang >= row.setup.candle2 + 900_000 && sekarang <= row.setup.candle2 + 4 * 900_000)
    .sort((a, b) => (a.ticket?.entryAgeBars ?? 99) - (b.ticket?.entryAgeBars ?? 99));
  const hero = siap[0] ?? null;
  const bel = rows.filter((r) => r.status !== 'PADAM' && r.setup.x !== null && !r.ticket).slice(0, 6);

  return (
    <div className="hp-page">
      <HpHeader market={terkini ? board?.market : undefined} />
      <p className="hp-eyebrow">BERANDA <b>·</b> SATU LAYAR, SATU KEPUTUSAN</p>
      <h1 className="hp-heading">Pasar bergerak.<br />Kita tetap disiplin.</h1>
      <p className="hp-lede">Tiket sah ditampilkan di depan. Yang belum sah cukup dipantau.</p>
      <div className="hp-status-strip" role="status">
        <span className="hp-status-icon" aria-hidden="true">◉</span>
        <div className="hp-status-copy">
          <b>{error ? 'Data belum dapat dipastikan' : terkini ? 'Mesin memantau pasar' : board ? 'Data perlu diperbarui' : 'Menghubungkan ke pasar…'}</b>
          <small>{error ? 'Jangan gunakan tiket lama. Periksa koneksi.' : terkini && board ? `${board.funnel.scanned} pasar terbaca · sumber ${board.market}` : 'Menunggu data futures yang sah'}</small>
        </div>
        <span className={`hp-live${error || (board && !terkini) ? ' hp-live--error' : ''}`}>{error ? 'GANGGUAN' : terkini ? 'AKTIF' : board ? 'TUNDA' : 'MEMUAT'}</span>
      </div>
      {error && <div className="hp-error" role="alert"><b>Pemindaian terhenti:</b> {error}</div>}
      <div className="hp-section-label">TIKET PRIORITAS <small>{hero ? 'Layak menurut data saat ini' : 'Tidak ada tiket siap'}</small></div>
      {hero?.ticket ? (
        <KartuSiap row={hero} />
      ) : (
        <div className="hp-card hp-empty">
          <span className="hp-empty-icon" aria-hidden="true">◎</span>
          <b>{error || (board && !terkini) ? 'Tiket ditahan sampai data pulih' : board ? 'Belum ada paket sah' : 'Memuat kondisi pasar'}</b>
          <p>{error || (board && !terkini) ? 'Status lama tidak dipakai sebagai sinyal baru.' : 'Mesin menunggu X → candle 1 → candle 2 yang benar. Diam berarti disiplin, bukan rusak.'}</p>
        </div>
      )}
      {siap.length > 1 && <p className="hp-lede">Ada {siap.length - 1} tiket sah lain di <Link href="/hp/papan">Papan</Link>.</p>}
      <div className="hp-section-label">BEL PINTU <small>Belum tentu layak masuk</small></div>
      {bel.length === 0 && <p className="hp-lede">{terkini ? 'Tidak ada X yang sedang menunggu candle 1.' : 'Daftar pantau muncul setelah data futures segar berhasil dimuat.'}</p>}
      {bel.map((row) => (
        <Link className="hp-card hp-watch" key={row.symbol} href={`/hp/koin/${row.symbol}`}>
          <span className="hp-watch-icon" aria-hidden="true">{row.symbol.charAt(0)}</span>
          <span><b className="hp-watch-title">{row.symbol} · {row.side}</b><small className="hp-watch-meta">{row.setup.candle1 ? 'C1 sah · menunggu C2' : `X ${row.setup.x ? wib(row.setup.x) : '—'} WIB · menunggu C1`}</small></span>
          <span className="hp-watch-price">{fmt(row.last)}<small>LIHAT KOIN ↗</small></span>
        </Link>
      ))}
      <div className="hp-link-grid">
        <Link className="hp-link" href="/hp/cek">◉ Cek sistem</Link>
        <Link className="hp-link" href="/hp/siap-chris">🎯 Siap Entri Chris · footprint Futures</Link>
        <Link className="hp-link" href="/hp/riset">◇ Riset rumus tanpa MA</Link>
        <Link className="hp-link" href="/hp/pasang">↗ Pasang aplikasi</Link>
      </div>
    </div>
  );
}

function KartuSiap({ row }: { row: BoardRow }) {
  const t = row.ticket!;
  const lahir = row.setup.candle2 ? wib(row.setup.candle2) : null;
  return (
    <section className="hp-ticket" aria-label={`Tiket siap ${row.symbol} ${row.side}`}>
      <div className="hp-ticket-top"><span className="hp-ready">SIAP ENTRI</span><span className="hp-ticket-age">SEGAR · {t.entryAgeBars ?? 0}/3 CANDLE</span></div>
      <div className="hp-ticket-symbol">
        <div><strong>{row.symbol.replace('USDT', '')}<small>USDT</small></strong><span>{row.side === 'LONG' ? '↗' : '↘'} {row.side} / {row.side === 'LONG' ? 'BUY' : 'SELL'}</span></div>
        <span className="hp-gate-tag">15M / 1H SEARAH ✓</span>
      </div>
      <div className="hp-entry"><small>ENTRY · CLOSE C2</small><strong>{fmt(t.entry)}</strong></div>
      <div className="hp-ticket-values">
        <div><small>STOP · EKOR C1</small><b className="stop">{fmt(t.stop)}</b></div>
        <div><small>TARGET · 2R</small><b className="target">{fmt(t.target)}</b></div>
      </div>
      <div className="hp-ticket-trail"><span><b>X</b> {row.setup.x ? wib(row.setup.x) : '—'}</span><i /><span><b>1</b> {row.setup.candle1 ? wib(row.setup.candle1) : '—'}</span><i /><span><b>2</b> {lahir ?? '—'}</span></div>
      <div className="hp-expiry"><span>Ukuran {t.sizeCoin.toLocaleString('id-ID', { maximumFractionDigits: 4 })} koin</span><span>Lahir {lahir ?? '—'} WIB</span></div>
      <div className="hp-expiry-meter" aria-label={`Umur tiket ${t.entryAgeBars ?? 0} dari 3 candle`}><i style={{ width: `${Math.max(7, 100 - ((t.entryAgeBars ?? 0) / 3) * 100)}%` }} /></div>
      {t.warnings.length > 0 && <div className="hp-ticket-warning">⚠ {t.warnings.join(' · ')}</div>}
      {row.demoReady ? <Link href={`/hp/entri?symbol=${row.symbol}&side=${row.side}`} className="hp-cta">🧪 Tinjau Demo · login & periksa ulang</Link>
        : <div className="hp-cta hp-cta-secondary">Sinyal Futures sah · simbol belum TRADING di Testnet (tidak ada order Demo)</div>}
      <Link href={`/hp/koin/${row.symbol}`} className="hp-cta hp-cta-secondary">Lihat chart & garis ↗</Link>
      <div className="hp-ticket-disclaimer">Alarm bukan order · jangan salin tiket langsung ke Binance · Demo perlu persetujuan per tiket.</div>
    </section>
  );
}
