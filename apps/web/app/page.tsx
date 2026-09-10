import { evaluateIntelligentSignal } from '@nusaquant/core';
import { loadMarketSnapshot } from '../lib/market';
import SupabaseStatus from './components/SupabaseStatus';
import BotControls from './components/BotControls';
import BacktestPanel from './components/BacktestPanel';
import MarketIntelligence from './components/MarketIntelligence';
import PaperMetrics from './components/PaperMetrics';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const market = await loadMarketSnapshot();
  const btc = market.candles.BTCUSDT ?? { entry: [], higher: [] };
  const eth = market.candles.ETHUSDT ?? { entry: [], higher: [] };
  const btcSignal = evaluateIntelligentSignal({ higherTimeframe: btc.higher, entryTimeframe: btc.entry, equity: 10000 });
  const ethSignal = evaluateIntelligentSignal({ higherTimeframe: eth.higher, entryTimeframe: eth.entry, equity: 10000 });

  return (
    <div className="shell">
      <div className="container">
        <header className="topbar">
          <div className="brand">
            <div className="brand-mark">N</div>
            <div><div className="brand-name">NusaQuant</div><div className="brand-sub">Futures Lab / Research Console</div></div>
          </div>
          <div className="top-actions">
            <div className="mode-badge">Paper trading</div>
            <div className="health-badge"><span className="health-dot" />Core healthy</div>
            <SupabaseStatus />
          </div>
        </header>

        <main>
          <div className="hero-row">
            <div>
              <div className="eyebrow">MVP · decision layer</div>
              <h1>Trading dengan alasan, bukan tebakan.</h1>
              <p className="lede">NusaQuant memisahkan signal engine, risk engine, dan execution. Market watch sekarang membaca candle tertutup dari Supabase; mode tetap paper trading dan belum terhubung ke dana Binance.</p>
            </div>
            <div className="hero-note"><strong>Guardrail aktif.</strong><br />No trade adalah keputusan yang sah. Bot tidak dipaksa mengirim sinyal ketika kondisi pasar tidak memenuhi aturan.</div>
          </div>

          <BotControls />

          <BacktestPanel />

          <PaperMetrics />

          <MarketIntelligence
            source={market.source}
            items={[
              { symbol: 'BTCUSDT', candles: btc.entry, signal: btcSignal },
              { symbol: 'ETHUSDT', candles: eth.entry, signal: ethSignal },
            ]}
          />

          <div className="footer-note"><span><strong>Next gate:</strong> research edge → paper duration → Demo/Testnet adapter (locked).</span><span>v0.3.0 · 11 Sep 2026</span></div>
        </main>
      </div>
    </div>
  );
}
