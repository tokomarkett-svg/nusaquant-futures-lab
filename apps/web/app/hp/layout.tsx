import type { ReactNode } from 'react';
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
    <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', background: '#f4f9f5' }}>
      <PeringatanMode />
      <PendaftarSw />
      <div style={{ flex: 1, width: '100%', maxWidth: 520, margin: '0 auto', display: 'flex', flexDirection: 'column' }}>
        <div style={{ flex: 1, paddingBottom: 8 }}>{children}</div>
        <Tabs />
      </div>
    </div>
  );
}
