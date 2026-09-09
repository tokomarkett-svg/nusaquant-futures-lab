'use client';

import { useState } from 'react';

type Symbol = 'BTCUSDT' | 'ETHUSDT';
type Report = {
  initialEquity: number;
  finalEquity: number;
  netPnl: number;
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number;
  profitFactor: number | null;
  expectancyR: number;
  maxDrawdown: number;
  maxDrawdownPct: number;
  notes: string[];
};

function money(value: number): string {
  return `${value >= 0 ? '+' : ''}${value.toFixed(2)} USDT`;
}

export default function BacktestPanel() {
  const [symbol, setSymbol] = useState<Symbol>('BTCUSDT');
  const [report, setReport] = useState<Report | null>(null);
  const [sample, setSample] = useState<{ higherCandles: number; entryCandles: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('Belum ada backtest yang dijalankan.');

  async function run() {
    setBusy(true);
    setMessage('Menjalankan backtest dengan biaya, slippage, dan funding…');
    try {
      const response = await fetch('/api/backtest', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ symbol }),
      });
      const payload = await response.json() as { ok: boolean; error?: string; report?: Report; sample?: typeof sample };
      if (!payload.ok || !payload.report) {
        setMessage(payload.error ?? 'Backtest gagal.');
        return;
      }
      setReport(payload.report);
      setSample(payload.sample ?? null);
      setMessage(`Backtest ${symbol} selesai. Hasil ini belum menjadi dasar live trading.`);
    } catch {
      setMessage('Backtest tidak dapat dihubungi.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel backtest-panel">
      <div className="panel-header">
        <div>
          <div className="panel-title">Backtest gate</div>
          <div className="panel-kicker">Biaya, slippage, funding, dan stop/target konservatif diperhitungkan</div>
        </div>
        <div className="backtest-controls">
          <select value={symbol} onChange={(event) => setSymbol(event.target.value as Symbol)}>
            <option value="BTCUSDT">BTCUSDT</option>
            <option value="ETHUSDT">ETHUSDT</option>
          </select>
          <button className="control-btn control-primary" disabled={busy} onClick={() => void run()}>{busy ? 'Running…' : 'Run backtest'}</button>
        </div>
      </div>
      {report ? (
        <>
          <div className="backtest-grid">
            <div className="detail"><div className="detail-label">Net P/L</div><div className={`detail-value ${report.netPnl >= 0 ? 'positive' : 'negative'}`}>{money(report.netPnl)}</div></div>
            <div className="detail"><div className="detail-label">Trades</div><div className="detail-value">{report.totalTrades} · {report.winningTrades}W / {report.losingTrades}L</div></div>
            <div className="detail"><div className="detail-label">Win rate</div><div className="detail-value">{(report.winRate * 100).toFixed(1)}%</div></div>
            <div className="detail"><div className="detail-label">Expectancy</div><div className="detail-value">{report.expectancyR.toFixed(3)}R</div></div>
            <div className="detail"><div className="detail-label">Max drawdown</div><div className="detail-value negative">{money(-report.maxDrawdown)} · {(report.maxDrawdownPct * 100).toFixed(2)}%</div></div>
            <div className="detail"><div className="detail-label">Profit factor</div><div className="detail-value">{report.profitFactor === null ? '—' : Number.isFinite(report.profitFactor) ? report.profitFactor.toFixed(2) : '∞'}</div></div>
          </div>
          <div className="backtest-sample">Sample: {sample?.higherCandles ?? 0} candle 1H · {sample?.entryCandles ?? 0} candle 15M</div>
          {report.notes.map((note) => <div className="backtest-note" key={note}>• {note}</div>)}
        </>
      ) : <div className="control-message">{message}</div>}
      {report && <div className="control-message">{message}</div>}
    </section>
  );
}
