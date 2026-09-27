import type { ReactNode } from 'react';
import './hp.css';
import Tabs from './Tabs';
import PeringatanMode from './PeringatanMode';
import PendaftarSw from './PendaftarSw';

export const metadata = { title: 'NusaQuant — Mode HP' };

/**
 * Kerangka aplikasi HP: kolom maks 520px, tab bawah menempel di dasar layar.
 * Di layar sempit (<640px) kolom memenuhi layar penuh — terasa seperti aplikasi native.
 * Di layar lebar (mis. Chrome "Situs desktop") tetap rapi di tengah + panduan muncul.
 */
export default function HpLayout({ children }: { children: ReactNode }) {
  return (
    <div className="hp-root" style={{ display: 'flex', flexDirection: 'column' }}>
      <PeringatanMode />
      <PendaftarSw />
      <div className="hp-frame">
        <main className="hp-main" id="konten-utama">{children}</main>
        <Tabs />
      </div>
    </div>
  );
}
