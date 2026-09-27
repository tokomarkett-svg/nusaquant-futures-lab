import Link from 'next/link';

/** Visual shell only: status pasar yang belum dimuat tidak boleh terlihat seolah FUTURES sudah terverifikasi. */
export default function HpHeader({ market, tag, back }: { market?: 'FUTURES' | 'SPOT'; tag?: string; back?: boolean }) {
  return (
    <header className="hp-app-head">
      {back ? <Link href="/hp" className="hp-logo" aria-label="Kembali ke beranda" style={{ textDecoration: 'none' }}>‹</Link> : <div className="hp-logo" aria-hidden="true">N.</div>}
      <div className="hp-brand"><strong>NusaQuant</strong><small>FUTURES LAB</small></div>
      {market === 'SPOT' ? <span className="hp-head-tag hp-head-tag--spot">⚠ DATA SPOT</span>
        : market === 'FUTURES' ? <span className="hp-head-tag">● DATA FUTURES</span>
        : tag ? <span className="hp-head-tag">{tag}</span>
        : <span className="hp-head-tag hp-head-tag--pending">Menunggu data…</span>}
    </header>
  );
}
