'use client';

/**
 * Bahan bersama aplikasi HP (rute /hp) — lapisan tampilan saja.
 * Tidak ada logika teknik di sini: garis, pola, dan tiket tetap datang
 * dari API yang sama dengan papan web (/api/nominasi) & meja (/api/meja).
 */

import type { Board, BoardRow } from '../../lib/binance';

export type { Board, BoardRow };

export const WARNA = {
  ink: '#10221d', muted: '#728079', line: '#dce6df', paper: '#f4f9f5',
  greenDark: '#0b5135', gelap: '#0e2a1d', mint: '#7ff0b0', mintSoft: '#eaf8ef',
  amber: '#ffc44d', amberSoft: '#fff6e2', red: '#c45555', redSoft: '#fdeef1',
  ungu: '#5b3fa8', unguSoft: '#f1ecfb',
};

export function digitsFor(price: number): number {
  if (price >= 100) return 2;
  if (price >= 1) return 4;
  if (price >= 0.01) return 5;
  return 7;
}

export function fmt(price: number): string {
  return price.toFixed(digitsFor(price));
}

/** Jam WIB dari timestamp ms. */
export function wib(ms: number): string {
  return new Date(ms + 7 * 3_600_000).toISOString().slice(11, 16);
}

export function umur(iso: string): string {
  const menit = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
  if (menit < 60) return `${menit} mnt`;
  return `${Math.floor(menit / 60)} j ${menit % 60} mnt`;
}

export function teksOrder(row: BoardRow): string | null {
  const t = row.ticket;
  if (!t) return null;
  const sisi = row.side === 'LONG' ? 'BUY' : 'SELL';
  return `${sisi} ${row.symbol} ${fmt(t.entry)} SL ${fmt(t.stop)} TP ${fmt(t.target)}`;
}

/** Salin ke papan klip — clipboard API dulu, fallback lama bila diblokir. */
export async function salinTeks(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    /* coba cara lama di bawah */
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

/** Tiket sah & boleh dieksekusi: actionable + gate searah + zonanya bukan PADAM. */
export function tiketSiap(row: BoardRow): boolean {
  return Boolean(row.ticket?.actionable) && row.gateAlign && row.status !== 'PADAM';
}

/** Posisi harga di pita pintu–batal (0% = batal, 100% = pintu) — untuk garis pita kecil. */
export function posisiPita(row: BoardRow): number {
  const z = row.side === 'LONG' ? row.zones.long : row.zones.short;
  const mulai = row.side === 'LONG' ? z.batal : z.pintu;
  const selesai = row.side === 'LONG' ? z.pintu : z.batal;
  const lebar = selesai - mulai;
  if (Math.abs(lebar) < 1e-12) return 50;
  const pct = ((row.last - mulai) / lebar) * 100;
  return Math.max(0, Math.min(100, pct));
}

export function badgeSisi(row: BoardRow) {
  const long = row.side === 'LONG';
  return {
    text: long ? 'LONG' : 'SHORT',
    style: {
      fontSize: 10, fontWeight: 800, padding: '2px 8px', borderRadius: 6,
      background: long ? WARNA.mintSoft : WARNA.redSoft,
      color: long ? WARNA.greenDark : WARNA.red,
      border: `1px solid ${long ? '#bfe8d1' : '#f3cdd6'}`,
    } as React.CSSProperties,
  };
}

export function badgeStatus(row: BoardRow) {
  if (row.status === 'PADAM') {
    return { text: '💀 PADAM', style: { background: '#241214', color: '#ff9db0', border: '1px solid #5c2330' } };
  }
  if (tiketSiap(row)) {
    return { text: '🎯 SIAP ENTRI', style: { background: '#3a2a06', color: WARNA.amber, border: '1px solid #6b4d0a' } };
  }
  if (row.status === 'MENYALA') {
    return { text: '🔥 MENYALA', style: { background: '#3a2a06', color: WARNA.amber, border: '1px solid #6b4d0a' } };
  }
  return { text: row.status, style: { background: '#eef1f4', color: '#5d6b76', border: '1px solid #d4dde4' } };
}

export function badgeJenis(row: BoardRow): React.ReactNode | null {
  if (row.jenis === 'kripto') return null;
  const text = row.jenis === 'saham' ? 'SAHAM' : 'KOMODITAS';
  return (
    <span title="Perp saham/komoditas — cari di menu Futures Binance, bukan daftar koin kripto"
      style={{ fontSize: 9.5, fontWeight: 800, padding: '2px 7px', borderRadius: 6, background: WARNA.unguSoft, color: WARNA.ungu, border: '1px solid #d9cdf2' }}>
      {text}
    </span>
  );
}

/** Label sumber data — FUTURES hijau, SPOT peringatan. */
export function labelSumber(market: Board['market'] | undefined): { text: string; style: React.CSSProperties } {
  if (market === 'SPOT') {
    return {
      text: '⚠ SPOT — bisa beda dgn chart',
      style: { fontSize: 10, fontWeight: 800, color: '#9a6b00', background: WARNA.amberSoft, border: '1px solid #ecd9a0', padding: '3px 9px', borderRadius: 999 },
    };
  }
  return {
    text: 'FUTURES ✔',
    style: { fontSize: 10, fontWeight: 800, color: '#0d7a4b', background: WARNA.mintSoft, border: '1px solid #bfe8d1', padding: '3px 9px', borderRadius: 999 },
  };
}

/** Baris pita kecil: titik = posisi harga antara BATAL dan PINTU. */
export function Pita({ row }: { row: BoardRow }) {
  const pct = posisiPita(row);
  return (
    <div>
      <div style={{ height: 4, borderRadius: 99, background: 'linear-gradient(90deg,#e8b4bd 0%,#f3ddab 55%,#bfe8d1 100%)', position: 'relative', marginTop: 6 }}>
        <i style={{ position: 'absolute', top: -3.5, left: `calc(${pct}% - 5px)`, width: 11, height: 11, borderRadius: 99, background: WARNA.gelap, border: '2px solid #fff' }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 8.5, color: WARNA.muted, marginTop: 3 }}>
        <span>{row.side === 'LONG' ? 'BATAL' : 'PINTU'}</span>
        <span>{row.side === 'LONG' ? 'PINTU' : 'BATAL'}</span>
      </div>
    </div>
  );
}
