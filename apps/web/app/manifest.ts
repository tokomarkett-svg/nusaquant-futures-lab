import type { MetadataRoute } from 'next';

/** Manifest PWA: dipasang sebagai aplikasi di HP — aplikasi dibuka langsung di MODE HP (/hp). */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'NusaQuant',
    short_name: 'NusaQuant',
    description: 'NusaQuant mode HP: tiket siap entri pintu–manis–batal, papan, posisi, dan meja 20-trade.',
    start_url: '/hp',
    id: '/hp',
    scope: '/',
    display: 'standalone',
    display_override: ['standalone', 'minimal-ui'],
    background_color: '#f4f9f5',
    theme_color: '#0e2a1d',
    orientation: 'portrait',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
