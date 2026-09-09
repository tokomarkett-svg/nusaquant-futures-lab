import { evaluateIntelligentSignal, type Candle, type IntelligentSignal } from '@nusaquant/core';
import SupabaseStatus from './components/SupabaseStatus';

function makeCandles(count: number, start: number, interval: number, trend: number, phase: number): Candle[] {
  const candles: Candle[] = [];
  let previousClose = start;

  for (let index = 0; index < count; index += 1) {
    const wave = Math.sin((index + phase) / 8) * start * 0.0025;
    const micro = Math.sin((index + phase) / 2.7) * start * 0.0008;
    const pullback = index > count - 12 ? (index - (count - 12)) * -start * 0.00025 : 0;
    const close = previousClose + trend + wave * 0.08 + micro + pullback;
    const open = previousClose;
    const high = Math.max(open, close) + start * (0.0009 + Math.abs(Math.sin(index)) * 0.0005);
    const low = Math.min(open, close) - start * (0.0008 + Math.abs(Math.cos(index)) * 0.00045);
    const volume = 800 + Math.abs(Math.sin(index / 4)) * 300 + (index > count - 4 ? 180 : 0);

    candles.push({
      time: Date.now() - (count - index) * interval,
      open,
      high,
      low,
      close,
      volume,
    });
    previousClose = close;
  }

  return candles;
}

function formatPrice(value: number | null): string {
  if (value === null) return '—';
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(value);
}

function chartPoints(candles: Candle[]): string {
  const visible = candles.slice(-48);
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

function MarketRow({ pair, price, change, candles, signal }: { pair: string; price: number; change: string; candles: Candle[]; signal: string }) {
  return (
    <div className="market-row">
      <div className="pair"><span className="pair-icon">{pair.slice(0, 3)}</span>{pair}</div>
      <div className="market-value">{formatPrice(price)}</div>
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
        {reasons.map((reason) => (
          <div className={`reason ${evaluation.decision === 'NO_TRADE' ? 'reason-blocked' : ''}`} key={reason}>
            <span className="reason-mark">{evaluation.decision === 'NO_TRADE' ? '!' : '✓'}</span>
            <span>{reason}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

export default function HomePage() {
  const btcEntry = makeCandles(260, 62500, 15 * 60 * 1000, 19, 2);
  const btcHigher = makeCandles(260, 59200, 60 * 60 * 1000, 42, 4);
  const ethEntry = makeCandles(260, 3420, 15 * 60 * 1000, 1.1, 8);
  const btcSignal = evaluateIntelligentSignal({ higherTimeframe: btcHigher, entryTimeframe: btcEntry, equity: 10000 });
  const ethSignal = evaluateIntelligentSignal({ higherTimeframe: btcHigher, entryTimeframe: ethEntry, equity: 10000 });

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
              <p className="lede">Dashboard awal NusaQuant memisahkan signal engine, risk engine, dan execution. Versi ini masih paper trading dengan data demo yang deterministik—belum terhubung ke dana atau akun Binance.</p>
            </div>
            <div className="hero-note"><strong>Guardrail aktif.</strong><br />No trade adalah keputusan yang sah. Bot tidak dipaksa mengirim sinyal ketika kondisi pasar tidak memenuhi aturan.</div>
          </div>

          <div className="metrics">
            <div className="metric-card"><div className="metric-label">Paper equity</div><div className="metric-value">10,000.00</div><div className="metric-foot">USDT · sandbox</div></div>
            <div className="metric-card"><div className="metric-label">Risk / trade</div><div className="metric-value">0.25%</div><div className="metric-foot">25.00 USDT cap</div></div>
            <div className="metric-card"><div className="metric-label">Daily loss limit</div><div className="metric-value">1.00%</div><div className="metric-foot">Circuit breaker ready</div></div>
            <div className="metric-card"><div className="metric-label">Market mode</div><div className="metric-value">{btcSignal.regime.replace('_', ' ')}</div><div className="metric-foot">1H regime filter</div></div>
          </div>

          <div className="grid">
            <section className="panel">
              <div className="panel-header">
                <div><div className="panel-title">Market watch</div><div className="panel-kicker">Synthetic candles · live connector belum aktif</div></div>
                <div className="panel-tag">15M / 1H</div>
              </div>
              <div className="market-list">
                <MarketRow pair="BTCUSDT" price={btcEntry[btcEntry.length - 1].close} change="+1.84%" candles={btcEntry} signal={btcSignal.decision} />
                <MarketRow pair="ETHUSDT" price={ethEntry[ethEntry.length - 1].close} change="+0.72%" candles={ethEntry} signal={ethSignal.decision} />
              </div>
              <div className="chart-wrap">
                <svg className="chart" viewBox="0 0 500 100" role="img" aria-label="Synthetic BTC price chart">
                  <defs><linearGradient id="chartFill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#b9e9ca" stopOpacity=".72" /><stop offset="100%" stopColor="#b9e9ca" stopOpacity="0" /></linearGradient></defs>
                  <polyline className="chart-area" points={`0,100 ${chartPoints(btcEntry)} 500,100`} />
                  <polyline className="chart-line" points={chartPoints(btcEntry)} />
                </svg>
                <div className="chart-legend"><span>48 closed candles</span><span>Demo data only</span></div>
              </div>
            </section>
            <DecisionPanel evaluation={btcSignal} />
          </div>

          <div className="footer-note"><span><strong>Next build:</strong> historical data adapter → backtest runner → paper execution state machine.</span><span>v0.1.0 · 09 Sep 2026</span></div>
        </main>
      </div>
    </div>
  );
}
