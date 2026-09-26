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

  const kartu: React.CSSProperties = { background: '#fff', border: '1px solid var(--line)', borderRadius: 16, padding: '13px 14px', marginBottom: 10 };

  return (
    <div style={{ padding: '10px 12px 0' }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '2px 2px 12px' }}>
        <Link href="/hp" style={{ textDecoration: 'none', color: WARNA.ink, fontSize: 18 }}>‹</Link>
        <b style={{ fontSize: 15 }}>Pasang Aplikasi</b>
        <span style={{ marginLeft: 'auto', fontSize: 10, fontWeight: 800, color: '#0d7a4b', background: WARNA.mintSoft, border: '1px solid #bfe8d1', padding: '3px 9px', borderRadius: 999 }}>SEKALI KETUK</span>
      </header>

      <div style={{ background: '#fff6e2', border: '1px solid #ecd9a0', borderRadius: 14, padding: '11px 13px', fontSize: 12, lineHeight: 1.6, color: '#6b4d0a', marginBottom: 12 }}>
        <b>Kenapa ikon lamamu membuka Chrome?</b> Ikon yang sudah terpasang itu <b>shortcut</b>, bukan aplikasi —
        dan Android <b>mengunci</b> shortcut: tidak ada web di dunia yang bisa mengubahnya jadi aplikasi.
        Solusinya cuma satu: pasang <b>aplikasi resminya</b> lewat tombol di bawah — hasilnya ikon baru yang
        buka full-screen tanpa Chrome, langsung ke Mode HP. Ikon lama tinggal dihapus.
      </div>

      {standalone || terpasang ? (
        <div style={{ background: WARNA.mintSoft, border: '1px solid #bfe8d1', borderRadius: 16, padding: '18px 14px', textAlign: 'center', marginBottom: 12 }}>
          <div style={{ fontSize: 30 }}>✅</div>
          <b style={{ fontSize: 15 }}>Kamu sudah di APLIKASI beneran!</b>
          <div style={{ fontSize: 12, color: WARNA.muted, marginTop: 5, lineHeight: 1.55 }}>
            Sekarang <b>hapus ikon lama</b> yang membuka Chrome, biar nggak ketuker lagi.<br />
            Ikon yang sekarang ini sudah benar: full-screen, langsung Mode HP.
          </div>
        </div>
      ) : (
        <>
          <button
            onClick={() => void pasang()}
            disabled={!prompt || menunggu}
            style={{
              display: 'block', width: '100%', border: 'none', cursor: prompt ? 'pointer' : 'wait',
              borderRadius: 16, padding: '16px 0', fontWeight: 800, fontSize: 16, marginBottom: 8,
              background: prompt ? WARNA.mint : '#e4ede6', color: prompt ? '#06281a' : '#7d8ca0',
            }}
          >
            {prompt ? '📲 PASANG APLIKASI — ketuk di sini' : menunggu ? '⏳ lihat popup Chrome…' : '⏳ menyiapkan pemasangan… (2–5 dtk)'}
          </button>
          <div style={{ fontSize: 11, color: WARNA.muted, textAlign: 'center', marginBottom: 12 }}>
            {prompt
              ? 'Popup resmi Chrome akan muncul → pilih "Instal".'
              : 'Kalau 10 detik tak muncul tombolnya, pakai cara manual di bawah — hasilnya sama.'}
          </div>
        </>
      )}

      <div style={kartu}>
        <b style={{ fontSize: 13 }}>Cara manual (kalau tombol di atas tak muncul)</b>
        <ol style={{ margin: '8px 0 0', paddingLeft: 20, fontSize: 12.5, lineHeight: 1.8, color: '#33463c' }}>
          <li>Buka halaman ini di <b>Chrome HP</b> (tanpa centang "Situs desktop").</li>
          <li>Menu <b>⋮</b> kanan atas.</li>
          <li>Pilih <b>"Instal aplikasi"</b> — kalau tidak ada, pilih <b>"Tambahkan ke layar utama"</b> lalu <b>"Instal"</b>.</li>
          <li>Konfirmasi <b>Instal</b> → ikon aplikasi muncul di layar utama.</li>
          <li><b>Hapus ikon lama</b> (yang membuka Chrome) — tekan lama → Hapus.</li>
        </ol>
      </div>

      <div style={{ ...kartu, borderLeft: '3px solid #0d7a4b' }}>
        <b style={{ fontSize: 13 }}>Ciri aplikasi yang BENAR (bandingkan dengan ikon lama):</b>
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
