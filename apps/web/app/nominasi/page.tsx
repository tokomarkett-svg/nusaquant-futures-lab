import Link from 'next/link';
import PapanNominasi from './PapanNominasi';
import MejaPaper from './MejaPaper';

export const dynamic = 'force-dynamic';

export default function NominasiPage() {
  return (
    <div className="shell">
      <div className="container">
        <header className="topbar">
          <div className="brand">
            <div className="brand-mark">N</div>
            <div>
              <div className="brand-name">NusaQuant</div>
              <div className="brand-sub">Papan Nominasi / Sistem Pintu–Manis–Batal</div>
            </div>
          </div>
          <div className="top-actions">
            <div className="mode-badge">Paper trading</div>
            <Link href="/" className="control-btn" style={{ textDecoration: 'none' }}>← Dasbor utama</Link>
          </div>
        </header>
        <main style={{ paddingBottom: 40 }}>
          <div className="hero-row" style={{ marginBottom: 20 }}>
            <div>
              <div className="eyebrow">Radar · semua pair USDT</div>
              <h1 style={{ margin: '10px 0' }}>Bot yang memantau, kamu yang memutuskan.</h1>
              <p className="lede">
                Papan ini memindai seluruh pasar dengan aturan kita sendiri — bukan sinyal pinjaman siapa pun.
                Klik satu coin untuk melihat chart 5m/15m/1H/4H lengkap dengan garis pintu, manis, dan batal yang digambar otomatis.
              </p>
            </div>
            <div className="hero-note">
              <strong>Tanpa order.</strong><br />
              Ini layar pantauan. Tidak ada tombol beli/jual, tidak ada dana tersambung — paper trading sampai 20 trade disiplin selesai.
            </div>
          </div>
          <PapanNominasi />
          <div style={{ marginTop: 12 }}>
            <MejaPaper />
          </div>
        </main>
      </div>
    </div>
  );
}
