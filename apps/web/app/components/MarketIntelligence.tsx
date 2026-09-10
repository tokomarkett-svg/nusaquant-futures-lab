'use client';

import { useEffect, useState } from 'react';
import type { Candle, IntelligentSignal } from '@nusaquant/core';

type Symbol = 'BTCUSDT' | 'ETHUSDT';
type MarketItem = { symbol: Symbol; candles: Candle[]; signal: IntelligentSignal };

function broadcastSymbol(symbol: Symbol): void {
  window.dispatchEvent(new CustomEvent('nusaquant-symbol-change', { detail: symbol }));
}

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
  if (visible.length === 1) return '0,88 500,88';
  const closes = visible.map((candle) => candle.close);
  const min = Math.min(...closes);
  const max = Math.max(...closes);
  const range = max - min || 1;
  return closes.map((value, index) => {
    const x = (index / (closes.length - 1)) * 500;
    const y = 88 - ((value - min) / range) * 72;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
}

function MarketRow({ item }: { item: MarketItem }) {
  const latest = item.candles.at(-1)?.close ?? null;
  const change = formatChange(item.candles);
  return (
    <div className="market-row">
      <div className="pair"><span className="pair-icon">{item.symbol.slice(0, 3)}</span>{item.symbol}</div>
      <div className="market-value">{formatPrice(latest)}</div>
      <div className={change.startsWith('-') ? 'market-muted negative' : 'market-muted positive'}>{change}</div>
      <div className="market-muted">{item.signal.decision} · {item.candles.length} bars</div>
    </div>
  );
}

function DecisionPanel({ item }: { item: MarketItem }) {
  const { signal } = item;
  const directionColor = signal.decision === 'LONG' ? 'positive' : signal.decision === 'SHORT' ? 'negative' : '';
  const reasons = signal.blockers.length === 0
    ? signal.evidence.filter((evidence) => evidence.passed).map((evidence) => evidence.explanation)
    : signal.blockers;
  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <div className="panel-title">Intelligence engine</div>
          <div className="panel-kicker">Context → setup → trigger · {item.symbol} · 15M</div>
        </div>
        <div className="panel-tag">{signal.regime}</div>
      </div>
      <div className="signal-box">
        <div>
          <div className="signal-label">Keputusan saat ini</div>
          <div className={`signal-direction ${directionColor}`}>{signal.decision}</div>
          <div className="signal-quality">Stage: <strong>{signal.stage}</strong> · Timing: <strong>{signal.timing}</strong> · Bot boleh menolak setup ketika syarat belum lengkap.</div>
        </div>
        <div className="signal-score">{signal.qualityScore}/100</div>
      </div>
      <div className="detail-grid">
        <div className="detail"><div className="detail-label">Entry</div><div className="detail-value">{formatPrice(signal.entry)}</div></div>
        <div className="detail"><div className="detail-label">Stop loss</div><div className="detail-value">{formatPrice(signal.stopLoss)}</div></div>
        <div className="detail"><div className="detail-label">Take profit</div><div className="detail-value">{formatPrice(signal.takeProfit)}</div></div>
        <div className="detail"><div className="detail-label">Risk amount</div><div className="detail-value">{signal.riskAmount ? `${signal.riskAmount.toFixed(2)} USDT` : '—'}</div></div>
      </div>
      <div className="reasons">
        <div className="reasons-title">Mengapa bot mengambil keputusan ini?</div>
        {reasons.length === 0 ? <div className="reason"><span className="reason-mark">!</span><span>Belum ada cukup data untuk evaluasi.</span></div> : reasons.map((reason) => (
          <div className={`reason ${signal.decision === 'NO_TRADE' ? 'reason-blocked' : ''}`} key={reason}>
            <span className="reason-mark">{signal.decision === 'NO_TRADE' ? '!' : '✓'}</span>
            <span>{reason}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

export default function MarketIntelligence({ items, source }: { items: MarketItem[]; source: string }) {
  const [selected, setSelected] = useState<Symbol>('BTCUSDT');
  useEffect(() => {
    const handleSymbolChange = (event: Event) => {
      const next = (event as CustomEvent<Symbol>).detail;
      if (next === 'BTCUSDT' || next === 'ETHUSDT') setSelected(next);
    };
    window.addEventListener('nusaquant-symbol-change', handleSymbolChange);
    return () => window.removeEventListener('nusaquant-symbol-change', handleSymbolChange);
  }, []);
  const selectedItem = items.find((item) => item.symbol === selected) ?? items[0];
  if (!selectedItem) return null;
  return (
    <div className="market-intelligence-grid">
      <section className="panel">
        <div className="panel-header">
          <div><div className="panel-title">Market watch</div><div className="panel-kicker">{source === 'SUPABASE' ? 'Supabase candles · closed data' : 'Menunggu market candles'}</div></div>
          <div className="panel-tag">15M / 1H</div>
        </div>
        <div className="market-list">{items.map((item) => <MarketRow item={item} key={item.symbol} />)}</div>
        <div className="chart-wrap">
          <svg className="chart" viewBox="0 0 500 100" role="img" aria-label={`${selectedItem.symbol} closed candle chart`}>
            <defs><linearGradient id="chartFill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#b9e9ca" stopOpacity=".72" /><stop offset="100%" stopColor="#b9e9ca" stopOpacity="0" /></linearGradient></defs>
            <polyline className="chart-area" points={`0,100 ${chartPoints(selectedItem.candles)} 500,100`} />
            <polyline className="chart-line" points={chartPoints(selectedItem.candles)} />
          </svg>
          <div className="chart-legend"><span>{selectedItem.candles.length} closed candles</span><span>{source === 'SUPABASE' ? 'Supabase data' : 'Waiting for data'}</span></div>
        </div>
      </section>
      <div>
        <div className="intelligence-selector">
          <span>Analysing symbol</span>
          <select value={selected} onChange={(event) => {
            const next = event.target.value as Symbol;
            setSelected(next);
            broadcastSymbol(next);
          }}>
            {items.map((item) => <option value={item.symbol} key={item.symbol}>{item.symbol}</option>)}
          </select>
        </div>
        <DecisionPanel item={selectedItem} />
      </div>
    </div>
  );
}
