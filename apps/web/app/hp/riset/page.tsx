import Link from 'next/link';
import HpHeader from '../HpHeader';
import btc from '../../../../../reports/local-research-champion-footprint-btcusdt-2026-09-20-25.json';
import eth from '../../../../../reports/local-research-champion-footprint-ethusdt-2026-09-20-25.json';

export const metadata = { title: 'NusaQuant — Riset Order Flow Tanpa MA' };

const data = [btc, eth];
const langkah = [
  { n: '01', title: 'Konteks', detail: 'Swing candle tertutup 1H dan 4H: HH/HL atau LH/LL. Bukan MA.' },
  { n: '02', title: 'Lokasi', detail: 'Discount atau premium di luar value area transaksi nyata; pita swing 0,705–0,886.' },
  { n: '03', title: 'Absorption', detail: 'Pembeli/penjual agresif, tetapi harga tak melanjutkan ekstrem; partisipasi harus hidup.' },
  { n: '04', title: 'Konfirmasi', detail: 'Percobaan kedua gagal, lalu harga dan delta berbalik bersama pada candle tertutup.' },
];

export default function RisetHp() {
  return <div className="hp-page">
    <HpHeader back tag="RISET SAJA" />
    <p className="hp-eyebrow">METODE VIDEO <b>·</b> BUKAN ALARM</p>
    <h1 className="hp-heading">Baca pertarungan.<br />Bukan menebak arah.</h1>
    <p className="hp-lede">Rumus tanpa MA sudah masuk mesin riset NusaQuant. Hasil di bawah berasal dari arsip transaksi Binance Futures, <b>bukan sinyal langsung</b>.</p>
    <div className="hp-card" style={{ borderLeft: '4px solid #bd7835', marginBottom: 18 }}>
      <strong style={{ display: 'block', fontSize: 15, marginBottom: 7 }}>RISET ARSIP ≠ ALARM LIVE</strong>
      <p style={{ margin: 0, lineHeight: 1.6, fontSize: 13 }}>Jalur Chris Crypto live memakai transaksi Futures dan konfirmasi close C2; hasil uji arsip di bawah tetap bukan bukti profit. Jika jalur Futures tidak lengkap, alarm Chris ditahan; GEX dealer tidak tersedia. Alarm lama tetap aktif. Order baru Chris belum tersedia.</p>
    </div>
    <div className="hp-section-label">URUTAN RUMUS <small>konteks → bukti → risiko</small></div>
    {langkah.map((step) => <div key={step.n} className="hp-card" style={{ display: 'flex', gap: 14, marginBottom: 9, alignItems: 'flex-start' }}>
      <span style={{ color: '#127b53', fontWeight: 800, fontSize: 19, minWidth: 29 }}>{step.n}</span>
      <div><strong style={{ display: 'block', fontSize: 14 }}>{step.title}</strong><small style={{ display: 'block', marginTop: 4, lineHeight: 1.55 }}>{step.detail}</small></div>
    </div>)}
    <div className="hp-section-label">UJI ARSIP NYATA <small>20–25 Sep 2026 UTC</small></div>
    {data.map((report) => <div className="hp-card" key={report.symbol} style={{ marginBottom: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
        <strong style={{ fontSize: 17 }}>{report.symbol}</strong>
        <span style={{ color: '#9c622d', fontWeight: 800, fontSize: 12 }}>{report.candidateCount} KANDIDAT RISET</span>
      </div>
      <p style={{ fontSize: 12, lineHeight: 1.6, marginBottom: 0 }}>{report.sources.reduce((n, day) => n + day.trades, 0).toLocaleString('id-ID')} transaksi · {report.windows.toLocaleString('id-ID')} jendela 5m · {report.evaluated} urutan dengan konteks cukup diperiksa. {report.funnel.KONTEKS} tertahan di konteks, {report.funnel.LOKASI} tertahan di lokasi.</p>
    </div>)}
    <p className="hp-lede">Nol kandidat <b>bukan</b> bukti strategi baik atau buruk. Enam hari dan dua simbol tidak cukup untuk uji luar sampel. Seluruh data arsip dicek checksum dan urutan transaksinya; tanpa data lengkap mesin menolak mengambil keputusan.</p>
    <Link className="hp-cta hp-cta-secondary" href="/hp/siap-chris">Lihat tahap live &amp; Siap Entri Chris ↗</Link>
    <Link className="hp-cta hp-cta-secondary" href="/hp/papan">← Kembali ke Papan sinyal lama</Link>
  </div>;
}
