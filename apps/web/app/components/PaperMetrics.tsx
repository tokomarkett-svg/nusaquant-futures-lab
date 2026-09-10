'use client';

import { useEffect, useState } from 'react';

type Symbol = 'BTCUSDT' | 'ETHUSDT';
type Metrics = {
  ok: boolean;
  configured?: boolean;
  symbol?: Symbol;
  equity?: number;
  realizedPnl?: number;
  dailyLoss?: number;
  dailyLossLimit?: number;
  riskPerTrade?: number;
  closedTrades?: number;
  openPosition?: boolean;
  signalEvaluations?: number;
  error?: string;
};

function money(value: number): string {
  return `${value >= 0 ? '+' : ''}${value.toFixed(2)}`;
}

export default function PaperMetrics() {
  const [symbol, setSymbol] = useState<Symbol>('BTCUSDT');
  const [metrics, setMetrics] = useState<Metrics | null>(null);

  useEffect(() => {
    const handleSymbolChange = (event: Event) => {
      const nextSymbol = (event as CustomEvent<Symbol>).detail;
      if (nextSymbol === 'BTCUSDT' || nextSymbol === 'ETHUSDT') setSymbol(nextSymbol);
    };
    window.addEventListener('nusaquant-symbol-change', handleSymbolChange);
    return () => window.removeEventListener('nusaquant-symbol-change', handleSymbolChange);
  }, []);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const response = await fetch(`/api/bot/metrics?symbol=${symbol}`, { cache: 'no-store' });
        const payload = await response.json() as Metrics;
        if (active) setMetrics(payload);
      } catch {
        if (active) setMetrics({ ok: false, error: 'Paper metrics tidak dapat dihubungi.' });
      }
    };
    void load();
    const timer = window.setInterval(() => void load(), 15_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [symbol]);

  const equity = metrics?.equity ?? 10_000;
  const riskPerTrade = metrics?.riskPerTrade ?? 25;
  const dailyLoss = metrics?.dailyLoss ?? 0;
  const dailyLossLimit = metrics?.dailyLossLimit ?? 100;
  const dailyLossPercent = dailyLossLimit > 0 ? Math.min(100, (dailyLoss / dailyLossLimit) * 100) : 0;
  const hasError = metrics?.ok === false;

  return (
    <div className="metrics" aria-label={`Paper metrics ${symbol}`}>
      <div className="metric-card">
        <div className="metric-label">Paper equity · {symbol}</div>
        <div className="metric-value">{equity.toFixed(2)}</div>
        <div className="metric-foot">USDT · sandbox · {metrics?.openPosition ? 'position open' : 'no open position'}</div>
      </div>
      <div className="metric-card">
        <div className="metric-label">Risk / trade</div>
        <div className="metric-value">{riskPerTrade.toFixed(2)}</div>
        <div className="metric-foot">USDT cap · {((riskPerTrade / equity) * 100).toFixed(2)}%</div>
      </div>
      <div className="metric-card">
        <div className="metric-label">Daily loss</div>
        <div className="metric-value">{dailyLoss.toFixed(2)}</div>
        <div className="metric-foot">USDT · {dailyLossPercent.toFixed(1)}% of limit {dailyLossLimit.toFixed(2)}</div>
      </div>
      <div className="metric-card">
        <div className="metric-label">Paper activity</div>
        <div className="metric-value">{metrics?.closedTrades ?? 0} trades</div>
        <div className="metric-foot">{metrics?.signalEvaluations ?? 0} saved signals · P/L {money(metrics?.realizedPnl ?? 0)}</div>
      </div>
      {hasError && <div className="metric-error" role="status">{metrics?.error ?? 'Paper metrics belum tersedia.'}</div>}
    </div>
  );
}
