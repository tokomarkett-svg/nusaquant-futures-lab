'use client';

import { useEffect, useState } from 'react';

/**
 * Pembaruan otomatis + tombol darurat.
 *  - SW baru menunggu → bar "VERSI BARU SIAP" + tombol PASANG (sekali klik).
 *  - Saat SW baru mengambil alih (controllerchange) → muat ulang otomatis.
 *  - "⟳ segar total": bersihkan cache + muat ulang (obat paling ampuh).
 */
export default function Pembaruan() {
  const [siap, setSiap] = useState<ServiceWorker | null>(null);
  const [memuat, setMemuat] = useState(false);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    let batal = false;

    navigator.serviceWorker.register('/sw.js').then((reg) => {
      if (batal) return;
      if (reg.waiting && navigator.serviceWorker.controller) setSiap(reg.waiting);
      reg.addEventListener('updatefound', () => {
        const baru = reg.installing;
        if (!baru) return;
        baru.addEventListener('statechange', () => {
          if (baru.state === 'installed' && navigator.serviceWorker.controller) setSiap(baru);
        });
      });
    }).catch(() => undefined);

    const ganti = () => { window.location.reload(); };
    navigator.serviceWorker.addEventListener('controllerchange', ganti);
    return () => {
      batal = true;
      navigator.serviceWorker.removeEventListener('controllerchange', ganti);
    };
  }, []);

  const pasang = () => {
    if (!siap) return;
    setMemuat(true);
    siap.postMessage('pasang');
  };

  const segarTotal = async () => {
    setMemuat(true);
    try {
      const reg = await navigator.serviceWorker?.getRegistration();
      reg?.active?.postMessage('bersihkan');
      if ('caches' in window) {
        for (const kunci of await caches.keys()) await caches.delete(kunci);
      }
    } catch {
      /* abaikan */
    }
    window.location.reload();
  };

  return (
    <>
      {siap && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', background: '#fff8e8', border: '1px solid #ecd9a0', borderRadius: 12, padding: '10px 12px', fontSize: 12.5 }}>
          <b style={{ color: '#a3690b' }}>⬆ VERSI BARU SIAP</b>
          <span style={{ color: 'var(--muted)' }}>perbaikan terbaru sudah diunduh di belakang layar</span>
          <button
            onClick={pasang}
            disabled={memuat}
            className="control-btn"
            style={{ marginLeft: 'auto', fontWeight: 800, background: 'var(--green-dark)', color: 'white', borderColor: 'var(--green-dark)' }}
          >
            {memuat ? 'MEMASANG…' : 'PASANG'}
          </button>
        </div>
      )}
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button
          onClick={() => void segarTotal()}
          className="control-btn"
          style={{ fontSize: 11, padding: '5px 10px', color: 'var(--muted)' }}
          title="Bersihkan penyimpanan sementara & ambil versi terbaru dari internet"
        >
          ⟳ segar total
        </button>
      </div>
    </>
  );
}
