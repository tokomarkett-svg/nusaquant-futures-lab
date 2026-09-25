import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'NusaQuant Futures Lab',
  description: 'Research dashboard for rule-based Binance Futures paper trading.',
  appleWebApp: { capable: true, statusBarStyle: 'black-translucent', title: 'NusaQuant' },
  icons: { apple: '/apple-icon.png' },
};

export const viewport: Viewport = {
  themeColor: '#0e2a1d',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="id">
      <body>{children}</body>
    </html>
  );
}
