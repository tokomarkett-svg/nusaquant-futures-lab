'use client';

/**
 * PINTU OTOMATIS KE MODE HP.
 * Kasus: ikon aplikasi lama di HP pemilik masih membuka halaman web (manifest versi lama,
 * start_url /nominasi). Yang pemilik mau: klik ikon → langsung aplikasi HP.
 *
 * Aturannya:
 *  1. Dibuka dari IKON APLIKASI (standalone) di layar HP → LANGSUNG pindah ke /hp,
 *     tanpa pikir-pikir — ikon lamapun jadi membuka aplikasi HP.
 *  2. Dibuka di CHROME HP (bukan standalone) → tampil tombol kecil 📱 Mode HP (bisa diabaikan).
 *  3. Di LAPTOP/KOMPUTER → tidak muncul apa pun; dasbor penuh tetap seperti biasa.
 */

import Link from 'next/link';
import { useEffect, useState } from 'react';

export default function ArahkanModeHp() {
  const [tampilTombol, setTampilTombol] = useState(false);

  useEffect(() => {
    const standalone = window.matchMedia('(display-mode: standalone)').matches
      || (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
    const layarKecil = Math.min(window.screen?.width ?? 9999, window.screen?.height ?? 9999) <= 520;
    if (standalone && layarKecil) {
      // Dari ikon aplikasi di HP → langsung Mode HP (replace: tidak meninggalkan jejak riwayat).
      window.location.replace('/hp');
      return;
    }
    if (layarKecil) setTampilTombol(true);
  }, []);

  if (!tampilTombol) return null;
  return (
    <Link
      href="/hp"
      style={{
        position: 'fixed', right: 14, bottom: 20, zIndex: 60,
        background: '#0e2a1d', color: '#7ff0b0', fontWeight: 800, fontSize: 13,
        padding: '10px 15px', borderRadius: 999, textDecoration: 'none',
        boxShadow: '0 6px 18px rgba(14,42,29,.35)',
      }}
    >
      📱 Mode HP
    </Link>
  );
}
