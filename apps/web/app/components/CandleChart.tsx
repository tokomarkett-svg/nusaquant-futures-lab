'use client';

import { useEffect, useState } from 'react';

type Candle = { open_time: string; open: number; high: number; low: number; close: number };

const SYMBOLS = ['BTCUSDT', 'ETHUSDT', 'ADAUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT', 'DOGEUSDT', 'AVAXUSDT', 'LINKUSDT', 'SUIUSDT'];

export default function CandleChart() {
  const [symbol, setSymbol] = useState('BTCUSDT');
  const [interval_, setInterval_] = useState<'15m' | '1h'>('1h');
  const [candles, setCandles] = useState<Candle[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const response = await fetch(`/api/candles?symbol=${symbol}&interval=${interval_}`, { cache: 'no-store' });
        const payload = await response.json();
        if (!alive) return;
        if (!payload.ok || payload.candles.length === 0) {
          setError('Belum ada candle tersimpan untuk symbol ini.');
          setCandles([]);
          return;
        }
        setError(null);
        setCandles(payload.candles as Candle[]);
      } catch {
        if (alive) setError('Data candle tidak terjangkau.');
      }
    };
    void load();
    const timer = setInterval(() => void load(), 60_000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [symbol, interval_]);

  const W = 760;
  const H = 280;
  const M = 34;
  const view = candles.slice(-80);
  const highs = view.map((candle) => candle.high);
  const lows = view.map((candle) => candle.low);
  const max = Math.max(...highs);
  const min = Math.min(...lows);
  const span = Math.max(max - min, Number.EPSILON);
  const y = (price: number) => M + (H - 2 * M) * (1 - (price - min) / span);
  const step = (W - 2 * M) / Math.max(view.length, 1);
  const body = Math.max(step * 0.62, 2);
  const last = view.at(-1);

  return (
    <section style={{ background: 'var(--panel, #101614)', border: '1px solid #1f2a26', borderRadius: 14, padding: 18, marginBottom: 22 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center', marginBottom: 10 }}>
        <div>
          <div style={{ fontSize: 11, letterSpacing: 2, color: '#7dd3a7', textTransform: 'uppercase' }}>Chart candle · data Supabase live</div>
          <div style={{ fontSize: 13, color: '#9fb3ab', marginTop: 4 }}>
            {last ? `${symbol} · ${interval_} · close ${Number(last.close).toPrecision(5)} · candle ${new Date(last.open_time).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })} WIB` : 'memuat…'}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <select value={symbol} onChange={(event) => setSymbol(event.target.value)} style={{ background: '#0c1210', color: '#e5efe9', border: '1px solid #24352e', borderRadius: 8, padding: '6px 8px' }}>
            {SYMBOLS.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
          {(['15m', '1h'] as const).map((item) => (
            <button
              key={item}
              onClick={() => setInterval_(item)}
              style={{
                background: interval_ === item ? '#16a34a' : 'transparent',
                color: interval_ === item ? '#06110b' : '#9fb3ab',
                border: '1px solid #24352e',
                borderRadius: 8,
                padding: '6px 10px',
                fontWeight: 700,
              }}
            >
              {item}
            </button>
          ))}
        </div>
      </div>
      {error ? (
        <p style={{ color: '#f2b8b5', fontSize: 13 }}>{error}</p>
      ) : view.length > 1 ? (
        <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block' }} role="img" aria-label={`Chart candle ${symbol}`}>
          <line x1={M} x2={W - M} y1={y(max)} y2={y(max)} stroke="#1c2723" />
          <line x1={M} x2={W - M} y1={y(min)} y2={y(min)} stroke="#1c2723" />
          <text x={W - M} y={y(max) - 4} fill="#68807a" fontSize="10" textAnchor="end">{max.toPrecision(5)}</text>
          <text x={W - M} y={y(min) + 12} fill="#68807a" fontSize="10" textAnchor="end">{min.toPrecision(5)}</text>
          {view.map((candle, index) => {
            const cx = M + step * (index + 0.5);
            const up = candle.close >= candle.open;
            const color = up ? '#16a34a' : '#dc2626';
            const top = y(Math.max(candle.open, candle.close));
            const height = Math.max(Math.abs(y(candle.open) - y(candle.close)), 1.5);
            return (
              <g key={candle.open_time}>
                <line x1={cx} x2={cx} y1={y(candle.high)} y2={y(candle.low)} stroke={color} strokeWidth="1" />
                <rect x={cx - body / 2} y={top} width={body} height={height} fill={color} rx="1" />
              </g>
            );
          })}
        </svg>
      ) : null}
    </section>
  );
}
