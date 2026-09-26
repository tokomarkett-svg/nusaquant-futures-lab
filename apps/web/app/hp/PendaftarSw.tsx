'use client';

import { useEffect } from 'react';

/**
 * Daftarkan service worker di SEMUA halaman (dulu hanya /nominasi yang mendaftar).
 * Tanpa SW terdaftar, Chrome menolak menganggap situs ini aplikasi → "Tambahkan ke
 * layar utama" jadi shortcut pembuka Chrome, bukan aplikasi. Inilah biang ikon lama
 * pemilik membuka Chrome. Browser menduplikasi registrasi dengan sendirinya (aman).
 */
export default function PendaftarSw() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    const daftar = () => {
      navigator.serviceWorker.register('/sw.js').catch(() => undefined);
    };
    if (document.readyState === 'complete') daftar();
    else window.addEventListener('load', daftar, { once: true });
  }, []);
  return null;
}
