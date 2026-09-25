import type { MetadataRoute } from 'next';

/** Manifest PWA: supaya papan bisa dipasang sebagai aplikasi di HP (tambahkan ke layar utama). */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'NusaQuant — Papan Nominasi',
    short_name: 'NusaQuant',
    description: 'Papan pintu–manis–batal futures: tiket siap entri, meja paper, dan tombol latihan demo.',
    start_url: '/nominasi',
    scope: '/',
    display: 'standalone',
    background_color: '#f6faf7',
    theme_color: '#0e2a1d',
    orientation: 'portrait',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
