'use client';

import { useEffect, useState } from 'react';

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
  byTriggerRange: DiagnosticBucket[];
  byEntryDistance: DiagnosticBucket[];
  byPeriod: DiagnosticBucket[];
};
type ExecutionAudit = {
  grossPnlBeforeCosts: number;
  totalCosts: number;
  netPnlAfterCosts: number;
  costImpactPctOfGross: number;
  averageGrossPnlPerTrade: number;
  averageCostPerTrade: number;
  grossProfitFactor: number | null;
  grossExpectancyR: number;
  stopLossTrades: number;
  takeProfitTrades: number;
  timeExitTrades: number;
  stopLossRate: number;
  takeProfitRate: number;
  timeExitRate: number;
};
type ExcursionAudit = {
  averageMfeR: number;
  averageMaeR: number;
  stopLossTradesWithMfeAtLeastHalfR: number;
  stopLossTradesWithMfeAtLeastOneR: number;
  stopLossPositiveMfeRate: number;
  averageStopLossMfeR: number;
  averageStopLossMaeR: number;
  averageTakeProfitMfeR: number;
  averageTimeExitMfeR: number;
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
  grossWins: number;
  grossLosses: number;
  maxDrawdown: number;
  maxDrawdownPct: number;
  gate: 'NOT_READY_SAMPLE' | 'PASS_RESEARCH_GATE' | 'FAIL_NEGATIVE_EXPECTANCY';
};
type WalkForwardFold = {
  index: number;
  trainCandles: number;
  testCandles: number;
  testStart: number | null;
  testEnd: number | null;
  summary: ValidationSummary;
};
type WalkForward = {
  foldCount: number;
  warmupBars: number;
  aggregate: ValidationSummary;
  folds: WalkForwardFold[];
  notes: string[];
};
type Validation = {
  trainFraction: number;
  warmupBars: number;
  splitTime: number | null;
  inSample: ValidationSummary;
  outOfSample: ValidationSummary;
  notes: string[];
};
type ResearchVariant = {
  name: string;
  rule: string;
  baseline: ValidationSummary;
  baselineValidation: Validation;
  candidate: ValidationSummary;
  candidateValidation: Validation;
};
function broadcastSymbol(symbol: Symbol): void {
  window.dispatchEvent(new CustomEvent('nusaquant-symbol-change', { detail: symbol }));
}

type CompactSummary = {
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
  gate: ValidationSummary['gate'];
};
type ResearchCandidateResult = {
  name: string;
  rule: string;
  dataStatus?: 'READY' | 'MISSING_DATA';
  summary: CompactSummary;
  validation: Validation;
  walkForward: WalkForward;
};
type ResearchResult = {
  version: number;
  symbol: Symbol;
  sample: { higherCandles: number; entryCandles: number; fundingPoints?: number; metricsPoints?: number; latestEntryTime: number | null };
  baseline: { summary: CompactSummary; validation: Validation; walkForward: WalkForward };
  candidates: Record<string, ResearchCandidateResult>;
  notes: string[];
};
type ResearchJob = {
  id: string;
  symbol: Symbol;
  status: 'QUEUED' | 'RUNNING' | 'COMPLETED' | 'FAILED';
  progress: number;
  requested_at: string;
  started_at: string | null;
  completed_at: string | null;
  result: ResearchResult | null;
  error: string | null;
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
  trades: Array<{ side: string; entryTime: number; exitTime: number; entry: number; exit: number; netPnl: number; costs: number; rMultiple: number; exitReason: string; qualityScore: number; regime: string; barsHeld: number; triggerRangeAtr: number; entryDistanceToEmaAtr: number; stopDistanceAtr: number; maxFavorableExcursionR: number; maxAdverseExcursionR: number }>;
  diagnostics: Diagnostics;
  executionAudit: ExecutionAudit;
  excursionAudit: ExcursionAudit;
  validation: Validation;
  walkForward: WalkForward;
  researchVariant: ResearchVariant;
  researchRetestVariant: ResearchVariant;
  researchFollowThroughVariant: ResearchVariant;
  researchProfitProtectionVariant: ResearchVariant;
  researchMeanReversionVariant: ResearchVariant;
  researchBreakoutVariant: ResearchVariant;
  notes: string[];
};

function money(value: number): string {
  return `${value >= 0 ? '+' : ''}${value.toFixed(2)} USDT`;
}

function timestamp(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  return Number.isFinite(value) ? new Date(value).toLocaleString('id-ID') : '—';
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

function ExecutionAuditCard({ audit }: { audit: ExecutionAudit }) {
  return (
    <div className="execution-audit-wrap">
      <div className="validation-card-title">Execution audit · baseline</div>
      <div className="backtest-note">Membedakan masalah fill/biaya dari masalah kualitas signal. Ini diagnosis, bukan parameter tuning. Persentase cost/gross hanya referensi; saat gross hampir nol, angkanya dapat melonjak.</div>
      <div className="execution-audit-grid">
        <div><span>Gross P/L sebelum biaya</span><strong className={audit.grossPnlBeforeCosts >= 0 ? 'positive' : 'negative'}>{money(audit.grossPnlBeforeCosts)}</strong></div>
        <div><span>Total biaya</span><strong className="negative">{audit.totalCosts.toFixed(2)} USDT</strong></div>
        <div><span>Net P/L sesudah biaya</span><strong className={audit.netPnlAfterCosts >= 0 ? 'positive' : 'negative'}>{money(audit.netPnlAfterCosts)}</strong></div>
        <div><span>Cost / gross reference</span><strong>{(audit.costImpactPctOfGross * 100).toFixed(2)}%</strong></div>
        <div><span>Gross rata-rata / trade</span><strong className={audit.averageGrossPnlPerTrade >= 0 ? 'positive' : 'negative'}>{money(audit.averageGrossPnlPerTrade)}</strong></div>
        <div><span>Biaya rata-rata / trade</span><strong className="negative">{audit.averageCostPerTrade.toFixed(2)} USDT</strong></div>
        <div><span>Gross expectancy</span><strong className={audit.grossExpectancyR >= 0 ? 'positive' : 'negative'}>{audit.grossExpectancyR.toFixed(3)}R</strong></div>
        <div><span>Gross profit factor</span><strong>{profitFactor(audit.grossProfitFactor)}</strong></div>
        <div><span>Stop loss</span><strong className="negative">{audit.stopLossTrades} · {(audit.stopLossRate * 100).toFixed(1)}%</strong></div>
        <div><span>Take profit</span><strong className="positive">{audit.takeProfitTrades} · {(audit.takeProfitRate * 100).toFixed(1)}%</strong></div>
        <div><span>Time exit</span><strong>{audit.timeExitTrades} · {(audit.timeExitRate * 100).toFixed(1)}%</strong></div>
      </div>
    </div>
  );
}

function ExcursionAuditCard({ audit }: { audit: ExcursionAudit }) {
  const evidence = audit.stopLossPositiveMfeRate >= 0.4;
  return (
    <div className="execution-audit-wrap">
      <div className="validation-card-title">Exit pathology audit · MAE/MFE</div>
      <div className="backtest-note">MAE/MFE dihitung dari trade yang benar-benar dieksekusi. Candle exit tidak dipakai untuk MFE agar tidak mengklaim urutan intrabar yang tidak diketahui; audit ini bukan perubahan rule.</div>
      <div className="execution-audit-grid">
        <div><span>Rata-rata MFE</span><strong>{audit.averageMfeR.toFixed(2)}R</strong></div>
        <div><span>Rata-rata MAE</span><strong className="negative">{audit.averageMaeR.toFixed(2)}R</strong></div>
        <div><span>SL yang sempat +0.5R</span><strong className={evidence ? 'negative' : ''}>{audit.stopLossTradesWithMfeAtLeastHalfR} · {(audit.stopLossPositiveMfeRate * 100).toFixed(1)}%</strong></div>
        <div><span>SL yang sempat +1R</span><strong>{audit.stopLossTradesWithMfeAtLeastOneR}</strong></div>
        <div><span>Rata-rata MFE sebelum SL</span><strong>{audit.averageStopLossMfeR.toFixed(2)}R</strong></div>
        <div><span>Rata-rata MAE pada SL</span><strong className="negative">{audit.averageStopLossMaeR.toFixed(2)}R</strong></div>
        <div><span>Rata-rata MFE pada TP</span><strong className="positive">{audit.averageTakeProfitMfeR.toFixed(2)}R</strong></div>
        <div><span>Rata-rata MFE pada time exit</span><strong>{audit.averageTimeExitMfeR.toFixed(2)}R</strong></div>
      </div>
      <div className="backtest-note">{evidence ? 'Ada indikasi stop-loss perlu diaudit lebih lanjut: sebagian besar trade yang stop sudah sempat bergerak positif. Ini belum cukup untuk mengubah stop tanpa validasi OOS.' : 'Belum ada bukti kuat bahwa stop-loss saja adalah akar masalah; jangan ubah stop secara manual.'}</div>
    </div>
  );
}

function ResearchJobPanel({ job }: { job: ResearchJob }) {
  const result = job.result;
  return (
    <div className="research-variant-wrap">
      <div className="validation-card-title">Full-history research worker · {job.symbol}</div>
      <div className="backtest-note">Job {job.id} · status {job.status} · progress {job.progress}% · sample {result?.sample.entryCandles ?? '—'} candle 15M / {result?.sample.higherCandles ?? '—'} candle 1H / {result?.sample.fundingPoints ?? '—'} funding points / {result?.sample.metricsPoints ?? '—'} metrics points · periode {result ? `${timestamp(result.baseline.summary.periodStart)} — ${timestamp(result.baseline.summary.periodEnd)}` : '—'}</div>
      {job.status === 'FAILED' ? <div className="variant-verdict variant-reject"><strong>RESEARCH JOB FAILED</strong><span>{job.error ?? 'Worker mengembalikan error tanpa detail.'}</span></div> : job.status !== 'COMPLETED' ? <div className="variant-verdict"><strong>RESEARCH JOB {job.status}</strong><span>Perhitungan berjalan di worker; tidak memakai request browser yang mudah timeout.</span></div> : result ? (
        <>
          <div className="validation-grid">
            <ValidationCard title="Full-history baseline" summary={result.baseline.summary as ValidationSummary} />
            <ValidationCard title="Full-history OOS · 30%" summary={result.baseline.validation.outOfSample} />
          </div>
          <div className="backtest-note">Walk-forward aggregate: {validationGate(result.baseline.walkForward.aggregate.gate)} · {result.baseline.walkForward.aggregate.totalTrades} trades · {result.baseline.walkForward.aggregate.expectancyR.toFixed(3)}R · PF {profitFactor(result.baseline.walkForward.aggregate.profitFactor)}</div>
          {Object.values(result.candidates).map((candidate) => (
            <div className="backtest-note" key={candidate.name}>
              <strong>{candidate.name}</strong>{candidate.dataStatus === 'MISSING_DATA' ? ' · MISSING_DATA (bukan bukti menolak)' : ''} · full {money(candidate.summary.netPnl)} · {candidate.summary.expectancyR.toFixed(3)}R · PF {profitFactor(candidate.summary.profitFactor)} · OOS {money(candidate.validation.outOfSample.netPnl)} · {candidate.validation.outOfSample.expectancyR.toFixed(3)}R · PF {profitFactor(candidate.validation.outOfSample.profitFactor)} · WF {validationGate(candidate.walkForward.aggregate.gate)} · {candidate.walkForward.aggregate.expectancyR.toFixed(3)}R · PF {profitFactor(candidate.walkForward.aggregate.profitFactor)}
            </div>
          ))}
          {result.notes.map((note) => <div className="backtest-note" key={note}>• {note}</div>)}
        </>
      ) : null}
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

function ResearchVariantPanel({ variant }: { variant: ResearchVariant }) {
  const baselineOos = variant.baselineValidation.outOfSample;
  const candidateOos = variant.candidateValidation.outOfSample;
  const candidateImprovedOos = candidateOos.gate === 'PASS_RESEARCH_GATE'
    && candidateOos.expectancyR > baselineOos.expectancyR
    && (candidateOos.profitFactor ?? 0) > (baselineOos.profitFactor ?? 0);
  return (
    <div className="research-variant-wrap">
      <div className="validation-card-title">Research-only candidate · {variant.name}</div>
      <div className="backtest-note">{variant.rule}</div>
      <div className={`variant-verdict ${candidateImprovedOos ? 'variant-accept' : 'variant-reject'}`}>
        <strong>{candidateImprovedOos ? 'CANDIDATE MAY PROCEED TO WALK-FORWARD' : 'CANDIDATE REJECTED FOR NOW'}</strong>
        <span>{candidateImprovedOos ? 'OOS expectancy dan profit factor mengungguli baseline.' : 'Candidate belum menunjukkan edge OOS; tidak dipromosikan ke paper/live.'}</span>
      </div>
      <div className="validation-grid">
        <ValidationCard title="Baseline full sample" summary={variant.baseline} />
        <ValidationCard title="Candidate full sample" summary={variant.candidate} />
        <ValidationCard title="Candidate OOS 30%" summary={variant.candidateValidation.outOfSample} />
      </div>
    </div>
  );
}

function WalkForwardTable({ validation }: { validation: WalkForward }) {
  return (
    <div className="walk-forward-wrap">
      <div className="validation-card-title">{validation.foldCount} forward folds · aggregate {validationGate(validation.aggregate.gate)}</div>
      <div className="diagnostic-scroll">
        <div className="walk-forward-table">
          <div className="walk-forward-row walk-forward-head"><span>Fold</span><span>Train</span><span>Test</span><span>Trades</span><span>Win</span><span>Net P/L</span><span>Exp.</span><span>PF</span></div>
          {validation.folds.map((fold) => <div className="walk-forward-row" key={fold.index}><span>#{fold.index}</span><span>{fold.trainCandles}</span><span>{fold.testCandles}</span><span>{fold.summary.totalTrades}</span><span>{(fold.summary.winRate * 100).toFixed(1)}%</span><span className={fold.summary.netPnl >= 0 ? 'positive' : 'negative'}>{money(fold.summary.netPnl)}</span><span className={fold.summary.expectancyR >= 0 ? 'positive' : 'negative'}>{fold.summary.expectancyR.toFixed(2)}R</span><span>{profitFactor(fold.summary.profitFactor)}</span></div>)}
          <div className="walk-forward-row walk-forward-total"><span>ALL</span><span>—</span><span>{validation.aggregate.sampleCandles}</span><span>{validation.aggregate.totalTrades}</span><span>{(validation.aggregate.winRate * 100).toFixed(1)}%</span><span className={validation.aggregate.netPnl >= 0 ? 'positive' : 'negative'}>{money(validation.aggregate.netPnl)}</span><span className={validation.aggregate.expectancyR >= 0 ? 'positive' : 'negative'}>{validation.aggregate.expectancyR.toFixed(2)}R</span><span>{profitFactor(validation.aggregate.profitFactor)}</span></div>
        </div>
      </div>
    </div>
  );
}

export default function BacktestPanel() {
  const [symbol, setSymbol] = useState<Symbol>('BTCUSDT');
  const [report, setReport] = useState<Report | null>(null);
  const [sample, setSample] = useState<{ higherCandles: number; entryCandles: number; latestEntryTime?: number | null } | null>(null);
  const [lastRunAt, setLastRunAt] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('Belum ada backtest yang dijalankan.');
  const [researchJob, setResearchJob] = useState<ResearchJob | null>(null);

  useEffect(() => {
    const handleSymbolChange = (event: Event) => {
      const nextSymbol = (event as CustomEvent<Symbol>).detail;
      if (nextSymbol === 'BTCUSDT' || nextSymbol === 'ETHUSDT') {
        setSymbol(nextSymbol);
        setReport(null);
        setSample(null);
        setLastRunAt(null);
        setMessage(`Siap menjalankan backtest ${nextSymbol}.`);
      }
    };
    window.addEventListener('nusaquant-symbol-change', handleSymbolChange);
    return () => window.removeEventListener('nusaquant-symbol-change', handleSymbolChange);
  }, []);

  useEffect(() => {
    let active = true;
    const loadLatestResearchJob = async () => {
      try {
        const response = await fetch('/api/backtest/jobs', { cache: 'no-store' });
        const payload = await response.json().catch(() => ({})) as { ok?: boolean; jobs?: ResearchJob[] };
        const latest = payload.jobs?.find((job) => job.symbol === symbol);
        if (active && latest) setResearchJob(latest);
      } catch {
        // The dashboard remains usable if the research status endpoint is temporarily unavailable.
      }
    };
    void loadLatestResearchJob();
    return () => { active = false; };
  }, [symbol]);

  useEffect(() => {
    if (!researchJob || researchJob.status === 'COMPLETED' || researchJob.status === 'FAILED') return;
    let active = true;
    const poll = async () => {
      const response = await fetch('/api/backtest/jobs', { cache: 'no-store' });
      const payload = await response.json().catch(() => ({})) as { ok?: boolean; jobs?: ResearchJob[] };
      const current = payload.jobs?.find((job) => job.id === researchJob.id);
      if (active && current) setResearchJob(current);
    };
    const timer = window.setInterval(() => void poll(), 10_000);
    void poll();
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [researchJob]);

  async function startResearchJob() {
    setResearchJob(null);
    setMessage(`Meminta full-history research job ${symbol}…`);
    try {
      const response = await fetch('/api/backtest/jobs', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ symbol }),
      });
      const payload = await response.json().catch(() => ({})) as { ok?: boolean; job?: ResearchJob; error?: string };
      if (!response.ok || !payload.ok || !payload.job) {
        setMessage(payload.error ?? `Research job ${symbol} gagal dibuat (HTTP ${response.status}).`);
        return;
      }
      setResearchJob(payload.job);
      setMessage(`Full-history research job ${payload.job.id} masuk queue. Worker akan menghitung di background.`);
    } catch {
      setMessage('Research job API tidak dapat dihubungi.');
    }
  }

  async function run() {
    setBusy(true);
    setReport(null);
    setSample(null);
    setLastRunAt(null);
    setMessage(`Menjalankan backtest ${symbol} dengan biaya, slippage, dan funding…`);
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 120_000);
    try {
      const response = await fetch('/api/backtest', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ symbol }),
        cache: 'no-store',
        signal: controller.signal,
      });
      const payload = await response.json().catch(() => ({})) as { ok: boolean; error?: string; report?: Report; sample?: typeof sample };
      if (!response.ok || !payload.ok || !payload.report) {
        setMessage(payload.error ?? `Backtest ${symbol} gagal (HTTP ${response.status}).`);
        return;
      }
      setReport(payload.report);
      setSample(payload.sample ?? null);
      setLastRunAt(Date.now());
      setMessage(`Backtest ${symbol} selesai · candle terakhir ${timestamp(payload.sample?.latestEntryTime)}. Hasil ini belum menjadi dasar live trading.`);
    } catch (error) {
      setMessage(error instanceof DOMException && error.name === 'AbortError'
        ? `Backtest ${symbol} timeout setelah 120 detik. Server tidak mengembalikan hasil.`
        : `Backtest ${symbol} tidak dapat dihubungi.`);
    } finally {
      window.clearTimeout(timeout);
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
          <select value={symbol} onChange={(event) => {
            const nextSymbol = event.target.value as Symbol;
            setSymbol(nextSymbol);
            broadcastSymbol(nextSymbol);
            setReport(null);
            setSample(null);
            setLastRunAt(null);
            setMessage(`Siap menjalankan backtest ${nextSymbol}.`);
          }}>
            <option value="BTCUSDT">BTCUSDT</option>
            <option value="ETHUSDT">ETHUSDT</option>
          </select>
          <button className="control-btn control-primary" disabled={busy} onClick={() => void run()}>{busy ? 'Running…' : 'Run backtest'}</button>
          <button className="control-btn" disabled={busy || researchJob?.status === 'QUEUED' || researchJob?.status === 'RUNNING'} onClick={() => void startResearchJob()}>Full-history research</button>
        </div>
      </div>
      {researchJob && <ResearchJobPanel job={researchJob} />}
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
          <div className="backtest-sample">Run terakhir {timestamp(lastRunAt)} · sample {sample?.higherCandles ?? 0} candle 1H · {sample?.entryCandles ?? 0} candle 15M · data terakhir {timestamp(sample?.latestEntryTime)}</div>
          <ExecutionAuditCard audit={report.executionAudit} />
          <ExcursionAuditCard audit={report.excursionAudit} />
          <div className="backtest-trades-title">Temporal validation · 70/30</div>
          <div className="backtest-note">Periode in-sample dipakai untuk pengembangan, sedangkan out-of-sample hanya untuk menguji generalisasi. Tidak ada parameter yang dituning dari OOS.</div>
          <div className="validation-grid">
            <ValidationCard title="In-sample · 70%" summary={report.validation.inSample} />
            <ValidationCard title="Out-of-sample · 30%" summary={report.validation.outOfSample} />
          </div>
          {report.validation.notes.map((note) => <div className="backtest-note" key={note}>• {note}</div>)}
          <div className="backtest-trades-title">Research-only entry hypothesis</div>
          <ResearchVariantPanel variant={report.researchVariant} />
          <ResearchVariantPanel variant={report.researchRetestVariant} />
          <ResearchVariantPanel variant={report.researchFollowThroughVariant} />
          <ResearchVariantPanel variant={report.researchProfitProtectionVariant} />
          <ResearchVariantPanel variant={report.researchMeanReversionVariant} />
          <ResearchVariantPanel variant={report.researchBreakoutVariant} />
          <div className="backtest-trades-title">Walk-forward validation</div>
          <div className="backtest-note">Tiga test window berurutan dipakai untuk melihat konsistensi performa lintas waktu. Ini bukan parameter tuning dan belum menggantikan paper execution.</div>
          <WalkForwardTable validation={report.walkForward} />
          {report.walkForward.notes.map((note) => <div className="backtest-note" key={note}>• {note}</div>)}
          <div className="backtest-trades-title">Edge diagnostics</div>
          <div className="backtest-note">Breakdown ini memakai trade yang benar-benar dieksekusi. Gunakan untuk mencari pola kelemahan, bukan untuk tuning threshold secara acak.</div>
          <div className="diagnostic-grid">
            <DiagnosticTable title="By side" rows={report.diagnostics.bySide} />
            <DiagnosticTable title="By quality score" rows={report.diagnostics.byQualityScore} />
            <DiagnosticTable title="By exit reason" rows={report.diagnostics.byExitReason} />
            <DiagnosticTable title="By regime" rows={report.diagnostics.byRegime} />
            <DiagnosticTable title="By trigger range / ATR" rows={report.diagnostics.byTriggerRange} />
            <DiagnosticTable title="By entry distance / EMA20" rows={report.diagnostics.byEntryDistance} />
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
