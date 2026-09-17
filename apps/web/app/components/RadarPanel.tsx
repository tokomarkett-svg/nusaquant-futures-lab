'use client';

import { useEffect, useState } from 'react';

type RadarRow = {
  symbol: string;
  regime: 'UP' | 'DOWN' | 'FLAT';
  last_price: number;
  prev_range_pct: number;
  dist_long_pct: number;
  dist_short_pct: number;
  touched: 'LONG' | 'SHORT' | null;
  updated_at: string;
};

const regimeColor: Record<RadarRow['regime'], string> = {
  UP: '#16a34a',
  DOWN: '#dc2626',
  FLAT: '#6b7280',
};

function relevance(row: RadarRow): { side: 'LONG' | 'SHORT'; dist: number } {
  if (row.touched) return { side: row.touched, dist: 0 };
  const long = row.dist_long_pct;
  const short = row.dist_short_pct;
  return long <= short ? { side: 'LONG', dist: long } : { side: 'SHORT', dist: short };
}

export default function RadarPanel() {
  const [rows, setRows] = useState<RadarRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const response = await fetch('/api/radar', { cache: 'no-store' });
        const payload = await response.json();
        if (!alive) return;
        if (!payload.ok) {
          setError('Radar belum aktif — migrasi market_radar belum dijalankan atau worker radar belum dinyalakan.');
          setRows([]);
          return;
        }
        setError(null);
        setRows(payload.rows as RadarRow[]);
      } catch {
        if (alive) setError('Radar tidak terjangkau.');
      }
    };
    void load();
    const timer = setInterval(() => void load(), 60_000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, []);

  const sorted = [...rows].sort((a, b) => relevance(a).dist - relevance(b).dist);
  const hot = rows.filter((row) => row.touched !== null).length;

  return (
    <section style={{ background: 'var(--panel, #101614)', border: '1px solid #1f2a26', borderRadius: 14, padding: '18px 18px 10px', marginBottom: 22 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 11, letterSpacing: 2, color: '#7dd3a7', textTransform: 'uppercase' }}>Radar universe</div>
          <div style={{ fontSize: 13, color: '#9fb3ab', marginTop: 4 }}>
            Menyimak {rows.length || '…'} perpetual likuid · {hot} menyentuh gate hari ini · radar hanya mengamati; eksekusi tetap milik playbook yang lulus riset.
          </div>
        </div>
        <div style={{ fontSize: 11, color: '#68807a' }}>refresh 60 dtk</div>
      </div>
      {error ? (
        <p style={{ color: '#f2b8b5', fontSize: 13, padding: '12px 0' }}>{error}</p>
      ) : (
        <div style={{ maxHeight: 320, overflowY: 'auto', marginTop: 10 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
            <thead>
              <tr style={{ color: '#7d938c', textAlign: 'left' }}>
                <th style={{ padding: '6px 8px' }}>Symbol</th>
                <th style={{ padding: '6px 8px' }}>Regime harian</th>
                <th style={{ padding: '6px 8px', textAlign: 'right' }}>Harga</th>
                <th style={{ padding: '6px 8px', textAlign: 'right' }}>Range kemarin</th>
                <th style={{ padding: '6px 8px' }}>Jarak ke gate (searah regime)</th>
                <th style={{ padding: '6px 8px' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((row) => {
                const rel = relevance(row);
                return (
                  <tr key={row.symbol} style={{ borderTop: '1px solid #1c2723' }}>
                    <td style={{ padding: '6px 8px', fontWeight: 600 }}>{row.symbol.replace('USDT', '')}<span style={{ color: '#68807a' }}>/USDT</span></td>
                    <td style={{ padding: '6px 8px', color: regimeColor[row.regime], fontWeight: 700 }}>{row.regime === 'UP' ? '▲ UP' : row.regime === 'DOWN' ? '▼ DOWN' : '• FLAT'}</td>
                    <td style={{ padding: '6px 8px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{Number(row.last_price).toPrecision(5)}</td>
                    <td style={{ padding: '6px 8px', textAlign: 'right' }}>{Number(row.prev_range_pct).toFixed(2)}%</td>
                    <td style={{ padding: '6px 8px', color: rel.dist <= 0 ? '#16a34a' : rel.dist < 1 ? '#eab308' : '#9fb3ab' }}>
                      {rel.side} {rel.dist <= 0 ? '0.00% (tertembus)' : `${rel.dist.toFixed(2)}%`}
                    </td>
                    <td style={{ padding: '6px 8px' }}>
                      {row.touched
                        ? <span style={{ color: '#0b1210', background: '#facc15', borderRadius: 999, padding: '2px 8px', fontWeight: 700 }}>MENYALA {row.touched}</span>
                        : <span style={{ color: '#7d938c' }}>disimak</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
