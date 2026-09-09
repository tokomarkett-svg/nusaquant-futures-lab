import { evaluateIntelligentSignal, type Candle, type IntelligentSignal } from '@nusaquant/core';
import { loadMarketSnapshot } from '../lib/market';
import SupabaseStatus from './components/SupabaseStatus';
import BotControls from './components/BotControls';

export const dynamic = 'force-dynamic';

function formatPrice(value: number | null): string {
  if (value === null) return '—';
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(value);
}

function formatChange(candles: Candle[]): string {
  if (candles.length < 2) return '—';
  const current = candles[candles.length - 1].close;
  const previous = candles[Math.max(0, candles.length - 17)].close;
  if (!previous) return '—';
  const change = ((current - previous) / previous) * 100;
  return `${change >= 0 ? '+' : ''}${change.toFixed(2)}%`;
}

function chartPoints(candles: Candle[]): string {
  const visible = candles.slice(-48);
  if (visible.length === 0) return '0,88 500,88';
  if (visible.length === 1) return `0,88 500,88`;
  const closes = visible.map((candle) => candle.close);
  const min = Math.min(...closes);
  const max = Math.max(...closes);
  const range = max - min || 1;
  return closes
    .map((value, index) => {
      const x = (index / (closes.length - 1)) * 500;
      const y = 88 - ((value - min) / range) * 72;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
}

function MarketRow({ pair, candles, signal }: { pair: string; candles: Candle[]; signal: string }) {
  const latest = candles.at(-1)?.close ?? null;
  const change = formatChange(candles);
  return (
    <div className="market-row">
      <div className="pair"><span className="pair-icon">{pair.slice(0, 3)}</span>{pair}</div>
      <div className="market-value">{formatPrice(latest)}</div>
      <div className={change.startsWith('-') ? 'market-muted negative' : 'market-muted positive'}>{change}</div>
      <div className="market-muted">{signal} · {candles.length} bars</div>
    </div>
  );
}

function DecisionPanel({ evaluation }: { evaluation: IntelligentSignal }) {
  const directionColor = evaluation.decision === 'LONG' ? 'positive' : evaluation.decision === 'SHORT' ? 'negative' : '';
  const reasons = evaluation.blockers.length === 0
    ? evaluation.evidence.filter((item) => item.passed).map((item) => item.explanation)
    : evaluation.blockers;

  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <div className="panel-title">Intelligence engine</div>
          <div className="panel-kicker">Context → setup → trigger · BTCUSDT · 15M</div>
        </div>
        <div className="panel-tag">{evaluation.regime}</div>
      </div>
      <div className="signal-box">
        <div>
          <div className="signal-label">Keputusan saat ini</div>
          <div className={`signal-direction ${directionColor}`}>{evaluation.decision}</div>
          <div className="signal-quality">Stage: <strong>{evaluation.stage}</strong> · Timing: <strong>{evaluation.timing}</strong> · Bot boleh menolak setup ketika syarat belum lengkap.</div>
        </div>
        <div className="signal-score">{evaluation.qualityScore}/100</div>
      </div>
      <div className="detail-grid">
        <div className="detail"><div className="detail-label">Entry</div><div className="detail-value">{formatPrice(evaluation.entry)}</div></div>
        <div className="detail"><div className="detail-label">Stop loss</div><div className="detail-value">{formatPrice(evaluation.stopLoss)}</div></div>
        <div className="detail"><div className="detail-label">Take profit</div><div className="detail-value">{formatPrice(evaluation.takeProfit)}</div></div>
        <div className="detail"><div className="detail-label">Risk amount</div><div className="detail-value">{evaluation.riskAmount ? `${evaluation.riskAmount.toFixed(2)} USDT` : '—'}</div></div>
      </div>
      <div className="reasons">
        <div className="reasons-title">Mengapa bot mengambil keputusan ini?</div>
        {reasons.length === 0 ? <div className="reason"><span className="reason-mark">!</span><span>Belum ada cukup data untuk evaluasi.</span></div> : reasons.map((reason) => (
          <div className={`reason ${evaluation.decision === 'NO_TRADE' ? 'reason-blocked' : ''}`} key={reason}>
            <span className="reason-mark">{evaluation.decision === 'NO_TRADE' ? '!' : '✓'}</span>
            <span>{reason}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

export default async function HomePage() {
  const market = await loadMarketSnapshot();
  const btc = market.candles.BTCUSDT ?? { entry: [], higher: [] };
  const eth = market.candles.ETHUSDT ?? { entry: [], higher: [] };
  const btcSignal = evaluateIntelligentSignal({ higherTimeframe: btc.higher, entryTimeframe: btc.entry, equity: 10000 });
  const ethSignal = evaluateIntelligentSignal({ higherTimeframe: eth.higher, entryTimeframe: eth.entry, equity: 10000 });
  const dataLabel = market.source === 'SUPABASE' && btc.entry.length > 0 ? 'Supabase candles · closed data' : 'Menunggu market candles';

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

          <div className="metrics">
            <div className="metric-card"><div className="metric-label">Paper equity</div><div className="metric-value">10,000.00</div><div className="metric-foot">USDT · sandbox</div></div>
            <div className="metric-card"><div className="metric-label">Risk / trade</div><div className="metric-value">0.25%</div><div className="metric-foot">25.00 USDT cap</div></div>
            <div className="metric-card"><div className="metric-label">Daily loss limit</div><div className="metric-value">1.00%</div><div className="metric-foot">Circuit breaker ready</div></div>
            <div className="metric-card"><div className="metric-label">Market mode</div><div className="metric-value">{btcSignal.regime.replace('_', ' ')}</div><div className="metric-foot">1H regime filter</div></div>
          </div>

          <div className="grid">
            <section className="panel">
              <div className="panel-header">
                <div><div className="panel-title">Market watch</div><div className="panel-kicker">{dataLabel}</div></div>
                <div className="panel-tag">15M / 1H</div>
              </div>
              <div className="market-list">
                <MarketRow pair="BTCUSDT" candles={btc.entry} signal={btcSignal.decision} />
                <MarketRow pair="ETHUSDT" candles={eth.entry} signal={ethSignal.decision} />
              </div>
              <div className="chart-wrap">
                <svg className="chart" viewBox="0 0 500 100" role="img" aria-label="BTC closed candle chart">
                  <defs><linearGradient id="chartFill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#b9e9ca" stopOpacity=".72" /><stop offset="100%" stopColor="#b9e9ca" stopOpacity="0" /></linearGradient></defs>
                  <polyline className="chart-area" points={`0,100 ${chartPoints(btc.entry)} 500,100`} />
                  <polyline className="chart-line" points={chartPoints(btc.entry)} />
                </svg>
                <div className="chart-legend"><span>{btc.entry.length} closed candles</span><span>{market.source === 'SUPABASE' ? 'Supabase data' : 'Waiting for data'}</span></div>
              </div>
            </section>
            <DecisionPanel evaluation={btcSignal} />
          </div>

          <div className="footer-note"><span><strong>Next build:</strong> paper controls → signal persistence → real-time worker state.</span><span>v0.2.0 · 09 Sep 2026</span></div>
        </main>
      </div>
    </div>
  );
}
