'use client';

/**
 * PASANG APLIKASI (mode HP) — solusi tuntas keluhan pemilik:
 * "klik ikon harusnya masuk aplikasi, kok nyasar ke Chrome".
 *
 * Fakta Android: IKON/SHORTCUT YANG SUDAH TERPASANG TIDAK BISA DIUBAH oleh web mana pun
 * (Android menguncinya). Shortcut lama = pembuka Chrome, selamanya pembuka Chrome.
 * Satu-satunya jalan: memasang APLIKASI resmi lewat popup install Chrome — dan itu
 * kini cukup SATU KETUKAN lewat tombol di halaman ini (beforeinstallprompt).
 * Hasilnya: ikon baru yang membuka FULL-SCREEN tanpa Chrome, langsung ke Mode HP.
 */

import Link from 'next/link';
import { useEffect, useState } from 'react';
import HpHeader from '../HpHeader';
import { WARNA } from '../bahan';

type PromptApp = Event & { prompt: () => Promise<void>; userChoice?: Promise<{ outcome: string }> };

export default function PasangApp() {
  const [standalone, setStandalone] = useState(false);
  const [prompt, setPrompt] = useState<PromptApp | null>(null);
  const [terpasang, setTerpasang] = useState(false);
  const [menunggu, setMenunggu] = useState(false);

  useEffect(() => {
    const standaloneSekarang = window.matchMedia('(display-mode: standalone)').matches
      || (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
    setStandalone(standaloneSekarang);

    const tangkap = (e: Event) => {
      e.preventDefault();
      setPrompt(e as PromptApp);
    };
    const sukses = () => {
      setTerpasang(true);
      setPrompt(null);
    };
    window.addEventListener('beforeinstallprompt', tangkap);
    window.addEventListener('appinstalled', sukses);
    return () => {
      window.removeEventListener('beforeinstallprompt', tangkap);
      window.removeEventListener('appinstalled', sukses);
    };
  }, []);

  const pasang = async () => {
    if (!prompt) return;
    setMenunggu(true);
    try {
      await prompt.prompt();
      await prompt.userChoice;
    } catch {
      /* popup ditutup — biarkan tombol tetap ada */
    }
    setMenunggu(false);
  };

  return (
    <div className="hp-page">
      <HpHeader tag="PANDUAN PWA" back />
      <p className="hp-eyebrow">PASANG APLIKASI <b>·</b> ANDROID</p>
      <h1 className="hp-heading">Selalu siap di HP.</h1>
      <p className="hp-lede">Buka NusaQuant lebih cepat dari layar utama, tanpa mencari tab browser.</p>

      <div className="hp-card hp-notice">
        <b>Ikon lama masih membuka Chrome?</b><p>Itu kemungkinan shortcut browser. Pasang ulang lewat tombol instal atau menu Chrome di bawah, lalu hapus ikon lama jika aplikasi baru terbuka dalam mode layar penuh.</p>
      </div>

      {standalone || terpasang ? (
        <div className="hp-card hp-installed">
          <span className="hp-empty-icon" aria-hidden="true">✓</span>
          <b>{standalone ? 'NusaQuant terbuka sebagai aplikasi' : 'Instalasi berhasil'}</b>
          <p>Jika masih ada ikon lama yang membuka tab Chrome, hapus ikon lama itu agar tidak tertukar.</p>
        </div>
      ) : (
        <>
          <button type="button" className="hp-install-button" onClick={() => void pasang()} disabled={!prompt || menunggu}>
            {menunggu ? 'Lihat dialog pemasangan…' : prompt ? 'Pasang aplikasi →' : 'Instal langsung tidak tersedia'}
          </button>
          <p className="hp-install-hint">{prompt ? 'Dialog resmi browser akan muncul. Pilih “Instal”.' : 'Browser ini belum menawarkan pemasangan langsung. Coba cara manual di bawah.'}</p>
        </>
      )}

      <div className="hp-section-label">CARA MANUAL <small>Jika tombol tidak tersedia</small></div>
      <div className="hp-card hp-guide">
        <b>Pasang dari Chrome Android</b>
        <ol style={{ margin: '8px 0 0', paddingLeft: 20, fontSize: 12.5, lineHeight: 1.8, color: '#33463c' }}>
          <li>Buka halaman ini di <b>Chrome HP</b> (tanpa centang "Situs desktop").</li>
          <li>Menu <b>⋮</b> kanan atas.</li>
          <li>Pilih <b>"Instal aplikasi"</b> — kalau tidak ada, pilih <b>"Tambahkan ke layar utama"</b> lalu <b>"Instal"</b>.</li>
          <li>Konfirmasi <b>Instal</b> → ikon aplikasi muncul di layar utama.</li>
          <li><b>Hapus ikon lama</b> (yang membuka Chrome) — tekan lama → Hapus.</li>
        </ol>
      </div>

      <div className="hp-card hp-guide" style={{ borderLeft: '3px solid #0d7a4b' }}>
        <b>Periksa setelah terpasang</b>
        <ul style={{ margin: '8px 0 0', paddingLeft: 20, fontSize: 12.5, lineHeight: 1.8, color: '#33463c' }}>
          <li>Membuka <b>full-screen tanpa address bar</b> Chrome.</li>
          <li>Langsung mendarat di <b>Mode HP</b> (Beranda · Papan · Posisi · Meja).</li>
          <li>Di daftar aplikasi muncul sebagai <b>"NusaQuant"</b> dengan ikon hijau sendiri.</li>
        </ul>
      </div>

      <div style={{ fontSize: 11, color: WARNA.muted, textAlign: 'center', margin: '4px 0 10px' }}>
        <Link href="/hp" style={{ color: WARNA.greenDark, fontWeight: 700 }}>← kembali ke Mode HP</Link>
      </div>
    </div>
  );
}
