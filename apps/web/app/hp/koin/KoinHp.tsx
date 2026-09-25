'use client';

/**
 * DETAIL KOIN (mode HP) — Tahap C docs/52.
 * Chart candle + garis pintu/manis/batal tergambar otomatis + penanda X·1·2
 * + kartu tiket dengan tombol salin. Data dari API yang sama dengan web
 * (/api/coin/[symbol]) — tanpa logika teknik baru, hanya tampilan.
 */

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { jenisPerp } from '@nusaquant/core';
import { WARNA, digitsFor, fmt, salinTeks, wib } from '../bahan';

type Candle = { time: number; open: number; high: number; low: number; close: number };
type Setup = {
  side: string; x: number | null; candle1: number | null; candle2: number | null;
  staleBars: number | null; valid: boolean; notes: string[];
  entry: number | null; stop: number | null; riskDistance: number | null;
};
type Ticket = {
  side: 'LONG' | 'SHORT'; entry: number; stop: number; target: number; riskDistance: number;
  riskPct: number; sizeCoin: number; entryAgeBars: number | null; chaseRisk: boolean;
  actionable: boolean; warnings: string[];
};
type Detail = {
  ok: boolean; error?: string; symbol: string; interval: string; candles: Candle[];
  zones: { rangePct: number; long: { pintu: number; manis: number; batal: number }; short: { pintu: number; manis: number; batal: number } };
  gate: { gate: 'HIJAU' | 'MERAH' | 'KUNING'; close: number };
  setupLong: Setup; setupShort: Setup; ticketLong: Ticket | null; ticketShort: Ticket | null;
  last: number; dataAgeMin: number;
};

const TF = ['5m', '15m', '1h', '4h'] as const;
const CHIP: React.CSSProperties = { fontSize: 10.5, fontWeight: 700, padding: '5px 11px', borderRadius: 999, background: '#fff', border: '1px solid var(--line)', color: WARNA.muted };
const CHIP_ON: React.CSSProperties = { ...CHIP, background: WARNA.gelap, color: '#fff', borderColor: WARNA.gelap };

/** Pilih sisi yang ditonjolkan: yang sah dulu, lalu yang paling jauh progresnya. */
function pilihSisi(d: Detail): { sisi: 'LONG' | 'SHORT'; setup: Setup; ticket: Ticket | null } {
  const kandidat: Array<['LONG' | 'SHORT', Setup, Ticket | null]> = [
    ['LONG', d.setupLong, d.ticketLong],
    ['SHORT', d.setupShort, d.ticketShort],
  ];
  const sah = kandidat.find(([, s]) => s.valid);
  if (sah) return { sisi: sah[0], setup: sah[1], ticket: sah[2] };
  const adaC1 = kandidat.find(([, s]) => s.candle1 !== null);
  if (adaC1) return { sisi: adaC1[0], setup: adaC1[1], ticket: adaC1[2] };
  const adaX = kandidat.find(([, s]) => s.x !== null);
  if (adaX) return { sisi: adaX[0], setup: adaX[1], ticket: adaX[2] };
  return { sisi: 'LONG', setup: d.setupLong, ticket: d.ticketLong };
}

export default function KoinHp({ symbol }: { symbol: string }) {
  const router = useRouter();
  const [tf, setTf] = useState<(typeof TF)[number]>('15m');
  const [data, setData] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [memuat, setMemuat] = useState(true);
  const [tersalin, setTersalin] = useState(false);

  const muat = useCallback(async () => {
    try {
      const r = await fetch(`/api/coin/${symbol}?interval=${tf}`, { cache: 'no-store' });
      const p = await r.json();
      if (!p.ok) throw new Error(p.error ?? 'Gagal memuat data koin.');
      setData(p as Detail);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setMemuat(false);
    }
  }, [symbol, tf]);

  useEffect(() => {
    setMemuat(true);
    void muat();
    const timer = setInterval(() => void muat(), 60_000);
    return () => clearInterval(timer);
  }, [muat]);

  const jenis = jenisPerp(symbol);
  const pilihan = data ? pilihSisi(data) : null;
  const zona = data ? (pilihan!.sisi === 'LONG' ? data.zones.long : data.zones.short) : null;
  const searah = data ? (pilihan!.sisi === 'LONG' ? data.gate.gate === 'HIJAU' : data.gate.gate === 'MERAH') : false;

  const salin = async () => {
    const t = pilihan?.ticket;
    if (!t) return;
    const digit = digitsFor(t.entry);
    const teks = `${t.side === 'LONG' ? 'BUY' : 'SELL'} ${symbol} ${t.entry.toFixed(digit)} SL ${t.stop.toFixed(digit)} TP ${t.target.toFixed(digit)}`;
    if (await salinTeks(teks)) {
      setTersalin(true);
      setTimeout(() => setTersalin(false), 2500);
    }
  };

  return (
    <div style={{ padding: '10px 12px 0' }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '2px 0 10px' }}>
        <button onClick={() => router.back()} aria-label="kembali" style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 10, width: 30, height: 30, fontSize: 15, cursor: 'pointer', color: WARNA.ink }}>‹</button>
        <b style={{ fontSize: 15 }}>{symbol.replace('USDT', '')}</b>
        {jenis !== 'kripto' && (
          <span style={{ fontSize: 9.5, fontWeight: 800, padding: '2px 7px', borderRadius: 6, background: WARNA.unguSoft, color: WARNA.ungu, border: '1px solid #d9cdf2' }}>{jenis === 'saham' ? 'SAHAM' : 'KOMODITAS'}</span>
        )}
        <span style={{ marginLeft: 'auto', fontSize: 10, fontWeight: 800, color: data && data.dataAgeMin <= 45 ? '#0d7a4b' : '#9a6b00', background: data && data.dataAgeMin <= 45 ? WARNA.mintSoft : WARNA.amberSoft, border: '1px solid ' + (data && data.dataAgeMin <= 45 ? '#bfe8d1' : '#ecd9a0'), padding: '3px 9px', borderRadius: 999 }}>
          FUTURES ✔ · data {data?.dataAgeMin ?? '—'} mnt
        </span>
      </header>

      <div style={{ display: 'flex', gap: 6, margin: '0 0 8px' }}>
        {TF.map((item) => (
          <button key={item} onClick={() => setTf(item)} style={tf === item ? CHIP_ON : CHIP}>{item}</button>
        ))}
      </div>

      {error && <div style={{ background: WARNA.redSoft, color: WARNA.red, border: '1px solid #f3cdd6', borderRadius: 12, padding: '10px 12px', fontSize: 12.5, marginBottom: 10 }}>{error}</div>}
      {memuat && !data && <div style={{ textAlign: 'center', color: WARNA.muted, fontSize: 12.5, padding: '30px 0' }}>Memuat chart…</div>}

      {data && pilihan && zona && (
        <>
          <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 16, padding: '10px 8px 4px' }}>
            <ChartKoin candles={data.candles} zona={zona} sisi={pilihan.sisi} setup={pilihan.setup} last={data.last} />
          </div>

          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '8px 0' }}>
            <span style={{ fontSize: 10, fontWeight: 800, padding: '3px 9px', borderRadius: 999, background: pilihan.sisi === 'LONG' ? WARNA.mintSoft : WARNA.redSoft, color: pilihan.sisi === 'LONG' ? WARNA.greenDark : WARNA.red, border: `1px solid ${pilihan.sisi === 'LONG' ? '#bfe8d1' : '#f3cdd6'}` }}>{pilihan.sisi}</span>
            <span style={{ fontSize: 10, fontWeight: 800, padding: '3px 9px', borderRadius: 999, background: searah ? WARNA.mintSoft : WARNA.amberSoft, color: searah ? '#0d7a4b' : '#9a6b00', border: `1px solid ${searah ? '#bfe8d1' : '#ecd9a0'}` }}>
              Gate 1H {data.gate.gate} {searah ? '· searah ✔' : '· belum searah'}
            </span>
            <span style={{ fontSize: 10, fontWeight: 800, padding: '3px 9px', borderRadius: 999, background: '#eef1f4', color: '#5d6b76', border: '1px solid #d4dde4' }}>range 24j {data.zones.rangePct.toFixed(1)}%</span>
          </div>

          {pilihan.ticket && pilihan.ticket.actionable ? (
            <div style={{ background: `linear-gradient(160deg,${WARNA.gelap} 0%,#123a28 70%,#155238 100%)`, color: '#eafff4', borderRadius: 18, padding: '14px', marginBottom: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                <span style={{ fontSize: 12, fontWeight: 800, color: WARNA.amber }}>🎯 TIKET SAH — {pilihan.sisi}</span>
                {pilihan.ticket.entryAgeBars !== null && <span style={{ marginLeft: 'auto', fontSize: 10, color: '#9fd8bb' }}>umur {pilihan.ticket.entryAgeBars}/3 candle</span>}
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, margin: '8px 0 2px' }}>
                <span style={{ fontSize: 10, color: '#9fd8bb', fontWeight: 700 }}>ENTRI</span>
                <span style={{ fontSize: 26, fontWeight: 800, color: WARNA.mint, fontFamily: 'ui-monospace, monospace' }}>{fmt(pilihan.ticket.entry)}</span>
                <span style={{ fontSize: 10, color: '#9fd8bb', fontWeight: 700 }}>({pilihan.sisi === 'LONG' ? 'BUY' : 'SELL'})</span>
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                {[
                  { s: 'SL (EKOR C1)', v: fmt(pilihan.ticket.stop), c: '#ff9db0' },
                  { s: 'TP 2R', v: fmt(pilihan.ticket.target), c: WARNA.mint },
                  { s: 'UKURAN', v: pilihan.ticket.sizeCoin.toLocaleString('id-ID', { maximumFractionDigits: 4 }), c: '#eafff4' },
                ].map((sel) => (
                  <div key={sel.s} style={{ flex: 1, background: 'rgba(255,255,255,.07)', border: '1px solid rgba(255,255,255,.12)', borderRadius: 12, padding: '7px 9px' }}>
                    <div style={{ fontSize: 9, color: '#9fd8bb', fontWeight: 700 }}>{sel.s}</div>
                    <div style={{ fontSize: 13.5, fontWeight: 800, marginTop: 1, color: sel.c, fontFamily: 'ui-monospace, monospace' }}>{sel.v}</div>
                  </div>
                ))}
              </div>
              {pilihan.ticket.warnings.length > 0 && <div style={{ fontSize: 10.5, color: '#ffd479', marginTop: 8 }}>⚠ {pilihan.ticket.warnings.join(' · ')}</div>}
              <button onClick={() => void salin()} style={{ display: 'block', width: '100%', border: 'none', cursor: 'pointer', borderRadius: 13, padding: '11px 0', fontWeight: 800, fontSize: 13, marginTop: 10, background: WARNA.mint, color: '#06281a' }}>
                {tersalin ? '✅ TERSALIN — tempel di Binance' : '📋 SALIN ORDER'}
              </button>
              <div style={{ textAlign: 'center', fontSize: 9.5, color: '#9fd8bb', marginTop: 7 }}>1% risiko · maks 2 trade/hari · stop dipasang SEBELUM entry</div>
            </div>
          ) : (
            <div style={{ background: '#fff', border: '1px dashed var(--line)', borderRadius: 16, padding: '13px 14px', marginBottom: 10 }}>
              <b style={{ fontSize: 12.5 }}>Belum ada tiket yang boleh dieksekusi</b>
              <div style={{ fontSize: 11.5, color: WARNA.muted, marginTop: 5, lineHeight: 1.55 }}>
                {pilihan.setup.notes.at(-1) ?? 'Paket X → candle 1 → candle 2 belum lengkap.'}
              </div>
              {pilihan.ticket && !pilihan.ticket.actionable && (
                <div style={{ fontSize: 11, color: '#9a6b00', marginTop: 6 }}>⚠ Tiket lama ada tapi tidak layak: {pilihan.ticket.warnings.join(' · ') || 'pagar belum lolos'}</div>
              )}
            </div>
          )}

          <div style={{ fontSize: 10.5, color: WARNA.muted, textAlign: 'center', margin: '2px 0 10px' }}>
            <Link href={`/nominasi/${symbol}`} style={{ color: WARNA.greenDark, fontWeight: 700 }}>Buka versi web lengkap (MA25/MA99, semua TF) →</Link>
          </div>
        </>
      )}
    </div>
  );
}

/** Chart SVG ringkas: candle + 3 garis zona + penanda X·1·2 + garis harga terakhir. */
function ChartKoin({ candles, zona, sisi, setup, last }: {
  candles: Candle[];
  zona: { pintu: number; manis: number; batal: number };
  sisi: 'LONG' | 'SHORT';
  setup: Setup;
  last: number;
}) {
  const W = 340, H = 320, kiri = 6, kanan = 6, atas = 14, dasar = 26;
  const tampil = candles.slice(-48);
  if (tampil.length === 0) return <div style={{ height: 200 }} />;
  const semua = tampil.flatMap((c) => [c.high, c.low]).concat([zona.pintu, zona.manis, zona.batal]);
  const maks = Math.max(...semua), mins = Math.min(...semua);
  const pad = (maks - mins) * 0.06 || 1;
  const y = (v: number) => atas + ((maks + pad - v) / (maks - mins + 2 * pad)) * (H - atas - dasar);
  const langkah = (W - kiri - kanan) / tampil.length;
  const x = (i: number) => kiri + (i + 0.5) * langkah;
  const indeks = (waktu: number | null) => (waktu === null ? -1 : tampil.findIndex((c) => c.time === waktu));
  const iX = indeks(setup.x), iC1 = indeks(setup.candle1), iC2 = indeks(setup.candle2);
  const garis = [
    { v: zona.pintu, warna: '#d29a1d', label: `PINTU ${fmt(zona.pintu)}` },
    { v: zona.manis, warna: '#2fae70', label: `MANIS ${fmt(zona.manis)}` },
    { v: zona.batal, warna: '#c45555', label: `BATAL ${fmt(zona.batal)}` },
  ];
  const marker = (i: number, teks: string) => {
    if (i < 0) return null;
    const c = tampil[i];
    const diBawah = sisi === 'LONG';
    const yy = diBawah ? y(c.low) + 13 : y(c.high) - 7;
    return <text key={teks} x={x(i)} y={yy} textAnchor="middle" fontSize="11" fontWeight="800" fill={diBawah ? '#0b5135' : '#c45555'}>{teks}</text>;
  };
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', display: 'block' }}>
      {garis.map((g) => (
        <g key={g.label}>
          <line x1={kiri} x2={W - kanan} y1={y(g.v)} y2={y(g.v)} stroke={g.warna} strokeWidth="1.4" strokeDasharray="5 4" opacity="0.9" />
          <text x={kiri + 3} y={y(g.v) - 3} fontSize="8.5" fontWeight="800" fill={g.warna}>{g.label}</text>
        </g>
      ))}
      <line x1={kiri} x2={W - kanan} y1={y(last)} y2={y(last)} stroke="#728079" strokeWidth="1" strokeDasharray="2 3" opacity="0.7" />
      <text x={W - kanan - 3} y={y(last) - 3} textAnchor="end" fontSize="8.5" fontWeight="800" fill="#728079">HARGA {fmt(last)}</text>
      {tampil.map((c, i) => {
        const naik = c.close >= c.open;
        const warna = naik ? '#1f9d63' : '#c4555f';
        const badanAtas = y(Math.max(c.open, c.close));
        const tinggiBadan = Math.max(1, y(Math.min(c.open, c.close)) - badanAtas);
        return (
          <g key={c.time}>
            <line x1={x(i)} x2={x(i)} y1={y(c.high)} y2={y(c.low)} stroke={warna} strokeWidth="1.1" />
            <rect x={x(i) - langkah * 0.3} y={badanAtas} width={langkah * 0.6} height={tinggiBadan} fill={naik ? '#bfe8d1' : '#f3cdd6'} stroke={warna} strokeWidth="0.8" rx="0.5" />
          </g>
        );
      })}
      {marker(iX, 'X')}
      {marker(iC1, '1')}
      {marker(iC2, '2')}
      <text x={kiri} y={H - 8} fontSize="8.5" fill="#728079">{wib(tampil[0].time)}</text>
      <text x={W - kanan} y={H - 8} textAnchor="end" fontSize="8.5" fill="#728079">{wib(tampil[tampil.length - 1].time)} WIB · 48 candle {sisi === 'LONG' ? '(zona LONG)' : '(zona SHORT)'}</text>
    </svg>
  );
}
