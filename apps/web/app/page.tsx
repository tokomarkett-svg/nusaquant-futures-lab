import { evaluateIntelligentSignal } from '@nusaquant/core';
import { loadMarketSnapshot } from '../lib/market';
import SupabaseStatus from './components/SupabaseStatus';
import BotControls from './components/BotControls';
import BacktestPanel from './components/BacktestPanel';
import MarketIntelligence from './components/MarketIntelligence';

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

          <div className="metrics">
            <div className="metric-card"><div className="metric-label">Paper equity</div><div className="metric-value">10,000.00</div><div className="metric-foot">USDT · sandbox</div></div>
            <div className="metric-card"><div className="metric-label">Risk / trade</div><div className="metric-value">0.25%</div><div className="metric-foot">25.00 USDT cap</div></div>
            <div className="metric-card"><div className="metric-label">Daily loss limit</div><div className="metric-value">1.00%</div><div className="metric-foot">Circuit breaker ready</div></div>
            <div className="metric-card"><div className="metric-label">Market mode</div><div className="metric-value">{btcSignal.regime.replace('_', ' ')}</div><div className="metric-foot">1H regime filter</div></div>
          </div>

          <MarketIntelligence
            source={market.source}
            items={[
              { symbol: 'BTCUSDT', candles: btc.entry, signal: btcSignal },
              { symbol: 'ETHUSDT', candles: eth.entry, signal: ethSignal },
            ]}
          />

          <div className="footer-note"><span><strong>Next build:</strong> paper metrics → Testnet adapter → security gate.</span><span>v0.3.0 · 09 Sep 2026</span></div>
        </main>
      </div>
    </div>
  );
}
