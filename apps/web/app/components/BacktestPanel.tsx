'use client';

import { useState } from 'react';

type Symbol = 'BTCUSDT' | 'ETHUSDT';
type DiagnosticBucket = {
  label: string;
  trades: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number;
  netPnl: number;
  expectancyR: number;
  profitFactor: number | null;
  averageCosts: number;
};
type Diagnostics = {
  bySide: DiagnosticBucket[];
  byQualityScore: DiagnosticBucket[];
  byExitReason: DiagnosticBucket[];
  byRegime: DiagnosticBucket[];
  byPeriod: DiagnosticBucket[];
};
type ValidationSummary = {
  periodStart: number | null;
  periodEnd: number | null;
  sampleCandles: number;
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number;
  profitFactor: number | null;
  expectancyR: number;
  netPnl: number;
  maxDrawdown: number;
  maxDrawdownPct: number;
  gate: 'NOT_READY_SAMPLE' | 'PASS_RESEARCH_GATE' | 'FAIL_NEGATIVE_EXPECTANCY';
};
type Validation = {
  trainFraction: number;
  warmupBars: number;
  splitTime: number | null;
  inSample: ValidationSummary;
  outOfSample: ValidationSummary;
  notes: string[];
};
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
  gate: 'NOT_READY_SAMPLE' | 'PASS_RESEARCH_GATE' | 'FAIL_NEGATIVE_EXPECTANCY';
  trades: Array<{ side: string; entryTime: number; exitTime: number; entry: number; exit: number; netPnl: number; costs: number; rMultiple: number; exitReason: string; qualityScore: number; regime: string }>;
  diagnostics: Diagnostics;
  validation: Validation;
  notes: string[];
};

function money(value: number): string {
  return `${value >= 0 ? '+' : ''}${value.toFixed(2)} USDT`;
}

function readableLabel(value: string): string {
  return value.replaceAll('_', ' ');
}

function profitFactor(value: number | null): string {
  if (value === null) return '—';
  return Number.isFinite(value) ? value.toFixed(2) : '∞';
}

function DiagnosticTable({ title, rows }: { title: string; rows: DiagnosticBucket[] }) {
  return (
    <div className="diagnostic-table-wrap">
      <div className="diagnostic-table-title">{title}</div>
      {rows.length === 0 ? <div className="backtest-note">Belum ada trade.</div> : (
        <div className="diagnostic-scroll">
          <div className="diagnostic-table" role="table" aria-label={title}>
            <div className="diagnostic-row diagnostic-head" role="row">
              <span>Bucket</span><span>Trades</span><span>Win</span><span>Net P/L</span><span>Exp.</span><span>PF</span><span>Avg cost</span>
            </div>
            {rows.map((bucket) => (
              <div className="diagnostic-row" role="row" key={bucket.label}>
                <span>{readableLabel(bucket.label)}</span>
                <span>{bucket.trades}</span>
                <span>{(bucket.winRate * 100).toFixed(1)}%</span>
                <span className={bucket.netPnl >= 0 ? 'positive' : 'negative'}>{money(bucket.netPnl)}</span>
                <span className={bucket.expectancyR >= 0 ? 'positive' : 'negative'}>{bucket.expectancyR.toFixed(2)}R</span>
                <span>{profitFactor(bucket.profitFactor)}</span>
                <span>{bucket.averageCosts.toFixed(2)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function validationGate(value: ValidationSummary['gate']): string {
  if (value === 'PASS_RESEARCH_GATE') return 'PASS';
  if (value === 'NOT_READY_SAMPLE') return 'NOT READY';
  return 'FAIL';
}

function ValidationCard({ title, summary }: { title: string; summary: ValidationSummary }) {
  return (
    <div className="validation-card">
      <div className="validation-card-title">{title}</div>
      <div className="validation-card-gate">{validationGate(summary.gate)}</div>
      <div className="validation-card-grid">
        <span>Trades</span><strong>{summary.totalTrades} · {summary.winningTrades}W / {summary.losingTrades}L</strong>
        <span>Win rate</span><strong>{(summary.winRate * 100).toFixed(1)}%</strong>
        <span>Net P/L</span><strong className={summary.netPnl >= 0 ? 'positive' : 'negative'}>{money(summary.netPnl)}</strong>
        <span>Expectancy</span><strong className={summary.expectancyR >= 0 ? 'positive' : 'negative'}>{summary.expectancyR.toFixed(3)}R</strong>
        <span>Profit factor</span><strong>{profitFactor(summary.profitFactor)}</strong>
        <span>Sample</span><strong>{summary.sampleCandles} candles</strong>
      </div>
    </div>
  );
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
          <div className={`backtest-verdict ${report.gate === 'PASS_RESEARCH_GATE' ? 'backtest-pass' : 'backtest-review'}`}>
            <strong>{report.gate === 'PASS_RESEARCH_GATE' ? 'RESEARCH GATE PASS' : report.gate === 'NOT_READY_SAMPLE' ? 'NOT READY · SAMPLE TOO SMALL' : 'RESEARCH GATE FAIL'}</strong>
            <span>{report.gate === 'NOT_READY_SAMPLE' ? 'Belum cukup trade untuk menyimpulkan performa.' : report.gate === 'PASS_RESEARCH_GATE' ? 'Metrik dasar positif setelah biaya.' : 'Expectancy atau profit factor masih negatif.'}</span>
          </div>
          <div className="backtest-grid">
            <div className="detail"><div className="detail-label">Net P/L</div><div className={`detail-value ${report.netPnl >= 0 ? 'positive' : 'negative'}`}>{money(report.netPnl)}</div></div>
            <div className="detail"><div className="detail-label">Trades</div><div className="detail-value">{report.totalTrades} · {report.winningTrades}W / {report.losingTrades}L</div></div>
            <div className="detail"><div className="detail-label">Win rate</div><div className="detail-value">{(report.winRate * 100).toFixed(1)}%</div></div>
            <div className="detail"><div className="detail-label">Expectancy</div><div className="detail-value">{report.expectancyR.toFixed(3)}R</div></div>
            <div className="detail"><div className="detail-label">Max drawdown</div><div className="detail-value negative">{money(-report.maxDrawdown)} · {(report.maxDrawdownPct * 100).toFixed(2)}%</div></div>
            <div className="detail"><div className="detail-label">Profit factor</div><div className="detail-value">{profitFactor(report.profitFactor)}</div></div>
          </div>
          <div className="backtest-sample">Sample: {sample?.higherCandles ?? 0} candle 1H · {sample?.entryCandles ?? 0} candle 15M</div>
          <div className="backtest-trades-title">Temporal validation · 70/30</div>
          <div className="backtest-note">Periode in-sample dipakai untuk pengembangan, sedangkan out-of-sample hanya untuk menguji generalisasi. Tidak ada parameter yang dituning dari OOS.</div>
          <div className="validation-grid">
            <ValidationCard title="In-sample · 70%" summary={report.validation.inSample} />
            <ValidationCard title="Out-of-sample · 30%" summary={report.validation.outOfSample} />
          </div>
          {report.validation.notes.map((note) => <div className="backtest-note" key={note}>• {note}</div>)}
          <div className="backtest-trades-title">Edge diagnostics</div>
          <div className="backtest-note">Breakdown ini memakai trade yang benar-benar dieksekusi. Gunakan untuk mencari pola kelemahan, bukan untuk tuning threshold secara acak.</div>
          <div className="diagnostic-grid">
            <DiagnosticTable title="By side" rows={report.diagnostics.bySide} />
            <DiagnosticTable title="By quality score" rows={report.diagnostics.byQualityScore} />
            <DiagnosticTable title="By exit reason" rows={report.diagnostics.byExitReason} />
            <DiagnosticTable title="By regime" rows={report.diagnostics.byRegime} />
            <DiagnosticTable title="By entry period" rows={report.diagnostics.byPeriod} />
          </div>
          <div className="backtest-trades-title">Trade diagnostics</div>
          {report.trades.length === 0 ? <div className="backtest-note">Belum ada trade pada sample ini.</div> : <div className="backtest-trades">{report.trades.map((trade, index) => <div className="backtest-trade" key={`${trade.entryTime}-${index}`}><span>#{index + 1} {trade.side} · {trade.regime} · score {trade.qualityScore}</span><strong className={trade.netPnl >= 0 ? 'positive' : 'negative'}>{money(trade.netPnl)} · {trade.rMultiple.toFixed(2)}R</strong><span>{trade.exitReason} · costs {trade.costs.toFixed(2)}</span></div>)}</div>}
          {report.notes.map((note) => <div className="backtest-note" key={note}>• {note}</div>)}
        </>
      ) : <div className="control-message">{message}</div>}
      {report && <div className="control-message">{message}</div>}
    </section>
  );
}
