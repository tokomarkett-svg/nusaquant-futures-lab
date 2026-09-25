'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const TAB = [
  { href: '/hp', emoji: '🏠', label: 'Beranda' },
  { href: '/hp/papan', emoji: '📊', label: 'Papan' },
  { href: '/hp/posisi', emoji: '💼', label: 'Posisi' },
  { href: '/hp/meja', emoji: '📓', label: 'Meja' },
] as const;

/** Tab bawah ala aplikasi — jangkauan jempol, aktif diberi latar mint. */
export default function Tabs() {
  const pathname = usePathname();
  return (
    <nav style={{
      position: 'sticky', bottom: 0, display: 'flex', background: '#ffffff',
      borderTop: '1px solid var(--line,#dce6df)', padding: '7px 6px calc(12px + env(safe-area-inset-bottom))',
    }}>
      {TAB.map((tab) => {
        const aktif = pathname === tab.href;
        return (
          <Link key={tab.href} href={tab.href} style={{ textDecoration: 'none' }}>
            <div style={{
              flex: 1, textAlign: 'center', fontSize: 10, fontWeight: 700,
              color: aktif ? 'var(--green-dark,#0b5135)' : '#8ba194',
              background: aktif ? 'var(--mint,#d6f5e2)' : 'transparent',
              borderRadius: 12, padding: '5px 12px',
            }}>
              <span style={{ fontSize: 15, display: 'block' }}>{tab.emoji}</span>
              {tab.label}
            </div>
          </Link>
        );
      })}
    </nav>
  );
}
