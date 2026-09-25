'use client';

/**
 * Deteksi "HP tapi dirender seperti desktop" (Chrome: Situs desktop NYALA / viewport dipaksa lebar).
 * Cirinya: layar fisik kecil (<=500px) tapi viewport lebar (>=720px). Saat itu terjadi kita
 * tampilkan panduan perbaikan 10 detik — bukan memaksa apa pun (browser melarang JS mengubahnya).
 * Hilang sendiri begitu mode desktop dimatikan (resize terdeteksi).
 */

import { useEffect, useState } from 'react';

const GAYA: React.CSSProperties = {
  position: 'sticky', top: 0, zIndex: 50, background: '#fff6e2', color: '#6b4d0a',
  borderBottom: '1px solid #ecd9a0', padding: '10px 12px', fontSize: 12, lineHeight: 1.55,
};

export default function PeringatanMode() {
  const [kena, setKena] = useState(false);
  const [ditutup, setDitutup] = useState(false);

  useEffect(() => {
    const periksa = () => {
      const layarKecil = Math.min(window.screen?.width ?? 9999, window.screen?.height ?? 9999) <= 500;
      setKena(layarKecil && window.innerWidth >= 720);
    };
    periksa();
    window.addEventListener('resize', periksa);
    return () => window.removeEventListener('resize', periksa);
  }, []);

  if (!kena || ditutup) return null;
  return (
    <div style={GAYA}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
        <span style={{ fontSize: 15 }}>📱</span>
        <div style={{ flex: 1 }}>
          <b>Chrome-mu lagi mode SITUS DESKTOP — makanya tampil sempit.</b>
          <br />
          Perbaikan 10 detik: menu <b>⋮</b> (kanan atas) → <b>hilangkan centang “Situs desktop”</b>.
          <br />
          Lalu menu <b>⋮</b> → <b>“Tambahkan ke layar utama”</b> → hapus ikon lama → buka ikon yang baru:
          langsung jadi aplikasi HP penuh.
        </div>
        <button onClick={() => setDitutup(true)} aria-label="tutup" style={{ border: 'none', background: 'transparent', color: '#6b4d0a', fontSize: 16, fontWeight: 800, cursor: 'pointer', padding: '0 2px' }}>✕</button>
      </div>
    </div>
  );
}
