'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const TAB = [
  { href: '/hp', label: 'Beranda', icon: 'home' },
  { href: '/hp/papan', label: 'Papan', icon: 'grid' },
  { href: '/hp/posisi', label: 'Posisi', icon: 'chart' },
  { href: '/hp/meja', label: 'Meja', icon: 'book' },
] as const;

function Icon({ name }: { name: (typeof TAB)[number]['icon'] }) {
  const common = { viewBox: '0 0 24 24', 'aria-hidden': true as const };
  if (name === 'home') return <svg {...common}><path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z"/><path d="M9 21v-7h6v7"/></svg>;
  if (name === 'grid') return <svg {...common}><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>;
  if (name === 'chart') return <svg {...common}><path d="M3 20h18"/><path d="M4 16 9 11l4 3 7-9"/><path d="M16 5h4v4"/></svg>;
  return <svg {...common}><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 3v18M11 8h6M11 12h6M11 16h4"/></svg>;
}

/** Navigasi bawah: ikon SVG konsisten, area sentuh >= 44px, tab aktif jelas. */
export default function Tabs() {
  const pathname = usePathname();
  return (
    <nav className="hp-tabs" aria-label="Navigasi aplikasi">
      {TAB.map((tab) => {
        const aktif = tab.href === '/hp' ? pathname === '/hp' : pathname.startsWith(tab.href);
        return (
          <Link key={tab.href} href={tab.href} className="hp-tab" data-active={aktif} aria-current={aktif ? 'page' : undefined}>
            <Icon name={tab.icon} />
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
