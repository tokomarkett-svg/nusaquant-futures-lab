'use client';

/**
 * BERANDA (mode HP) — "Satu layar, satu keputusan."
 * Kalau ada tiket sah (actionable + gate searah + zona hidup): kartu gelap besar di atas.
 * Di bawahnya: bel pintu yang masih nonton (X sudah menusuk, C1/C2 belum sah).
 * Sumber data = API papan yang sama dengan web; tidak ada logika teknik baru di sini.
 */

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import {
  WARNA, badgeJenis, badgeSisi, fmt, salinTeks, teksOrder, tiketSiap, labelSumber, wib,
  type Board, type BoardRow,
} from './bahan';

export default function BerandaHp() {
  const [board, setBoard] = useState<Board | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tersalin, setTersalin] = useState(false);

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
  const siap = rows.filter(tiketSiap)
    .sort((a, b) => (a.ticket?.entryAgeBars ?? 99) - (b.ticket?.entryAgeBars ?? 99));
  const hero = siap[0] ?? null;
  const bel = rows
    .filter((r) => r.status !== 'PADAM' && r.setup.x !== null && !r.ticket)
    .slice(0, 6);

  const salin = async (row: BoardRow) => {
    const teks = teksOrder(row);
    if (!teks) return;
    if (await salinTeks(teks)) {
      setTersalin(true);
      setTimeout(() => setTersalin(false), 2500);
    }
  };

  return (
    <div style={{ padding: '10px 12px 0' }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '2px 2px 10px' }}>
        <div style={{ width: 30, height: 30, borderRadius: 9, background: WARNA.gelap, color: WARNA.mint, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 13 }}>N</div>
        <b style={{ fontSize: 15 }}>Beranda</b>
        <span style={{ marginLeft: 'auto', ...labelSumber(board?.market).style }}>{labelSumber(board?.market).text}</span>
      </header>

      {error && <div style={{ background: WARNA.redSoft, color: WARNA.red, border: '1px solid #f3cdd6', borderRadius: 12, padding: '10px 12px', fontSize: 12.5, marginBottom: 10 }}>{error}</div>}

      {hero && hero.ticket ? (
        <KartuSiap row={hero} tersalin={tersalin} padaSalin={() => void salin(hero)} />
      ) : (
        <div style={{ background: '#fff', border: '1px dashed var(--line)', borderRadius: 16, padding: '18px 14px', textAlign: 'center', marginBottom: 10 }}>
          <div style={{ fontSize: 26 }}>🌙</div>
          <b style={{ fontSize: 14 }}>Belum ada paket sah</b>
          <div style={{ fontSize: 12, color: WARNA.muted, marginTop: 4, lineHeight: 1.5 }}>
            Mesin menunggu X → candle 1 → candle 2 yang benar.<br />Diam = disiplin, bukan rusak.
          </div>
        </div>
      )}

      {siap.length > 1 && (
        <div style={{ fontSize: 11, color: WARNA.muted, margin: '0 2px 8px' }}>
          ➕ {siap.length - 1} tiket sah lain — lihat di tab <Link href="/hp/papan" style={{ color: WARNA.greenDark, fontWeight: 700 }}>Papan</Link>
        </div>
      )}

      <div style={{ fontSize: 12, fontWeight: 800, color: '#33463c', margin: '10px 2px 6px' }}>🔔 BEL PINTU — nonton (belum sah)</div>
      {bel.length === 0 && <div style={{ fontSize: 12, color: WARNA.muted, margin: '0 2px' }}>Tidak ada X yang sedang menunggu.</div>}
      {bel.map((row) => (
        <Link key={row.symbol} href={`/hp/koin/${row.symbol}`} style={{ textDecoration: 'none', color: 'inherit' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#fff', border: '1px solid var(--line)', borderRadius: 14, padding: '10px 11px', marginBottom: 8 }}>
            <span style={{ fontWeight: 800, fontSize: 13.5 }}>{row.symbol.replace('USDT', '')}</span>
            <span style={badgeSisi(row).style}>{badgeSisi(row).text}</span>
            {badgeJenis(row)}
            <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
              <div style={{ fontSize: 13.5, fontWeight: 800 }}>{fmt(row.last)}</div>
              <div style={{ fontSize: 9.5, color: WARNA.muted }}>
                {row.setup.candle1 ? 'C1 sah · nunggu C2' : `X ${row.setup.x ? wib(row.setup.x) : '—'} · nunggu C1`}
              </div>
            </div>
          </div>
        </Link>
      ))}
    </div>
  );
}

function KartuSiap({ row, tersalin, padaSalin }: { row: BoardRow; tersalin: boolean; padaSalin: () => void }) {
  const t = row.ticket!;
  const long = row.side === 'LONG';
  const orderSide = long ? 'BUY' : 'SELL';
  const umurText = t.entryAgeBars !== null ? `${t.entryAgeBars}/3 candle` : 'baru lahir';
  const lahir = row.setup.candle2 ? wib(row.setup.candle2) : null;
  return (
    <div style={{ background: `linear-gradient(160deg,${WARNA.gelap} 0%,#123a28 70%,#155238 100%)`, color: '#eafff4', borderRadius: 18, padding: '14px 14px 12px', marginBottom: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
        <span style={{ fontWeight: 800, fontSize: 16 }}>{row.symbol}</span>
        <span style={{ fontSize: 10, fontWeight: 800, padding: '2px 8px', borderRadius: 6, background: long ? 'rgba(127,240,176,.15)' : 'rgba(255,157,176,.15)', color: long ? WARNA.mint : '#ff9db0', border: `1px solid ${long ? '#2c5a45' : '#5c3a44'}` }}>{row.side}</span>
        {row.jenis !== 'kripto' && <span style={{ fontSize: 9.5, fontWeight: 800, padding: '2px 7px', borderRadius: 6, background: 'rgba(255,255,255,.1)', color: '#d9cdf2', border: '1px solid #4a3f6b' }}>{row.jenis === 'saham' ? 'SAHAM' : 'KOMODITAS'}</span>}
        <span style={{ marginLeft: 'auto', fontSize: 10, color: '#9fd8bb' }}>
          {lahir ? `lahir ${lahir} WIB` : ''}
        </span>
      </div>

      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, margin: '9px 0 2px' }}>
        <span style={{ fontSize: 10, color: '#9fd8bb', fontWeight: 700 }}>ENTRI</span>
        <span style={{ fontSize: 30, fontWeight: 800, color: WARNA.mint, letterSpacing: 0.5 }}>{fmt(t.entry)}</span>
        <span style={{ fontSize: 10, color: '#9fd8bb', fontWeight: 700 }}>({orderSide})</span>
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        {[
          { s: 'SL (EKOR C1)', v: fmt(t.stop), c: '#ff9db0' },
          { s: 'TP 2R', v: fmt(t.target), c: WARNA.mint },
          { s: 'UKURAN', v: t.sizeCoin.toLocaleString('id-ID', { maximumFractionDigits: 4 }), c: '#eafff4' },
        ].map((sel) => (
          <div key={sel.s} style={{ flex: 1, background: 'rgba(255,255,255,.07)', border: '1px solid rgba(255,255,255,.12)', borderRadius: 12, padding: '7px 9px' }}>
            <div style={{ fontSize: 9, color: '#9fd8bb', fontWeight: 700 }}>{sel.s}</div>
            <div style={{ fontSize: 14.5, fontWeight: 800, marginTop: 1, color: sel.c, fontFamily: 'ui-monospace, monospace' }}>{sel.v}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#9fd8bb', marginTop: 9 }}>
        <span>gate 1H {row.gate} · MA99 searah ✔</span>
        <span>umur {umurText}</span>
      </div>
      <div style={{ height: 5, background: 'rgba(255,255,255,.14)', borderRadius: 99, marginTop: 4, overflow: 'hidden' }}>
        <i style={{ display: 'block', height: '100%', width: `${Math.max(8, 100 - ((t.entryAgeBars ?? 0) / 3) * 100)}%`, background: WARNA.amber, borderRadius: 99 }} />
      </div>

      {t.warnings.length > 0 && (
        <div style={{ fontSize: 10.5, color: '#ffd479', marginTop: 8 }}>⚠ {t.warnings.join(' · ')}</div>
      )}

      <button onClick={padaSalin} style={{
        display: 'block', width: '100%', textAlign: 'center', border: 'none', cursor: 'pointer',
        borderRadius: 13, padding: '11px 0', fontWeight: 800, fontSize: 13, marginTop: 10,
        background: WARNA.mint, color: '#06281a',
      }}>
        {tersalin ? '✅ TERSALIN — tempel di Binance' : '📋 SALIN ORDER'}
      </button>
      <Link href={`/hp/koin/${row.symbol}`} style={{
        display: 'block', textAlign: 'center', textDecoration: 'none', cursor: 'pointer',
        borderRadius: 13, padding: '10px 0', fontWeight: 800, fontSize: 12.5, marginTop: 7,
        border: '1px solid rgba(255,255,255,.25)', color: '#dff7ea',
      }}>
        📈 Lihat chart & garis pintu
      </Link>
      <div style={{ textAlign: 'center', fontSize: 9.5, color: '#9fd8bb', marginTop: 7 }}>
        1% risiko · maks 2 trade/hari · stop dipasang SEBELUM entry
      </div>
    </div>
  );
}
