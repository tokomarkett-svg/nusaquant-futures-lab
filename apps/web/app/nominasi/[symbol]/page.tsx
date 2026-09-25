import Link from 'next/link';
import CoinDetail from './CoinDetail';

export const dynamic = 'force-dynamic';

export default async function CoinPage({ params }: { params: Promise<{ symbol: string }> }) {
  const { symbol } = await params;
  const upper = symbol.toUpperCase();
  return (
    <div className="shell">
      <div className="container">
        <header className="topbar">
          <div className="brand">
            <div className="brand-mark">N</div>
            <div>
              <div className="brand-name">NusaQuant</div>
              <div className="brand-sub">{upper} · chart sistem pintu–manis–batal</div>
            </div>
          </div>
          <div className="top-actions">
            <div className="mode-badge">Paper trading</div>
            <Link href="/nominasi" className="control-btn" style={{ textDecoration: 'none' }}>← Papan nominasi</Link>
          </div>
        </header>
        <main style={{ paddingBottom: 40 }}>
          <CoinDetail symbol={upper} />
        </main>
      </div>
    </div>
  );
}
