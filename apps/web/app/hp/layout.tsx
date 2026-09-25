import type { ReactNode } from 'react';
import Tabs from './Tabs';

export const metadata = { title: 'NusaQuant — Mode HP' };

/** Kerangka aplikasi HP: layar maks 520px, tab bawah menempel. Lapisan tampilan saja. */
export default function HpLayout({ children }: { children: ReactNode }) {
  return (
    <div style={{
      maxWidth: 520, margin: '0 auto', minHeight: '100dvh',
      display: 'flex', flexDirection: 'column', background: '#f4f9f5',
    }}>
      <div style={{ flex: 1, paddingBottom: 8 }}>{children}</div>
      <Tabs />
    </div>
  );
}
