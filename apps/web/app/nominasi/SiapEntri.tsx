'use client';

import { useState } from 'react';
import type { BoardRow } from '../../lib/binance';

const orderSideOf = (side: 'LONG' | 'SHORT') => (side === 'LONG' ? 'BUY' : 'SELL');
const digitsFor = (price: number) => (price >= 100 ? 2 : price >= 1 ? 4 : price >= 0.01 ? 5 : 7);

export default function SiapEntri({ rows, prices }: { rows: BoardRow[]; prices: Record<string, number> }) {
  const [copied, setCopied] = useState<string | null>(null);
  const ready = rows.filter((row) => row.ticket?.actionable && row.gateAlign).slice(0, 3);
  if (ready.length === 0) return null;

  const salin = async (row: BoardRow) => {
    const t = row.ticket;
    if (!t) return;
    const digits = digitsFor(t.entry);
    const text = `${orderSideOf(row.side)} ${row.symbol} ${t.entry.toFixed(digits)} SL ${t.stop.toFixed(digits)} TP ${t.target.toFixed(digits)}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(row.symbol);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      /* browser menolak clipboard — abaikan */
    }
  };

  return (
    <section style={{ display: 'grid', gap: 10 }}>
      {ready.map((row) => {
        const t = row.ticket;
        if (!t) return null;
        const digits = digitsFor(t.entry);
        const live = prices[row.symbol] ?? row.last;
        const runR = Math.abs(live - t.entry) / (t.riskDistance || 1);
        const lari = runR > 0.5;
        const salinText = `${orderSideOf(row.side)} ${row.symbol} ${t.entry.toFixed(digits)} SL ${t.stop.toFixed(digits)} TP ${t.target.toFixed(digits)}`;
        return (
          <div key={row.symbol + String(t.entry)} style={{ border: '1px solid #1c5c34', borderRadius: 14, padding: '14px 16px', background: 'linear-gradient(180deg,#f2fbf5,#e9f7ee)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 11, fontWeight: 800, padding: '3px 10px', borderRadius: 8, background: 'var(--green-dark)', color: 'white' }}>🎯 SIAP ENTRI</span>
              <b style={{ fontSize: 16 }}>{row.symbol.replace('USDT', '')}</b>
              <span style={{ fontSize: 11, fontWeight: 800, padding: '3px 10px', borderRadius: 8, background: row.side === 'LONG' ? '#dff3e6' : '#fde8e8', color: row.side === 'LONG' ? 'var(--green-dark)' : 'var(--red)' }}>{row.side} · {orderSideOf(row.side)}</span>
              <span style={{ marginLeft: 'auto', color: 'var(--muted)', fontSize: 11 }}>gate 1H {row.gate} ✔</span>
            </div>

            <div style={{ marginTop: 8 }}>
              <div style={{ color: 'var(--muted)', fontSize: 11, fontWeight: 800, letterSpacing: '.08em' }}>ENTRY</div>
              <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 32, fontWeight: 700, lineHeight: 1.1 }}>{t.entry.toFixed(digits)}</div>
            </div>

            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginTop: 8, fontFamily: "'DM Mono', monospace", fontSize: 13 }}>
              <span>🛑 SL <b style={{ color: 'var(--red)' }}>{t.stop.toFixed(digits)}</b> <span style={{ color: 'var(--muted)' }}>−{t.riskUsdt} USDT</span></span>
              <span>✅ TP <b style={{ color: 'var(--green-dark)' }}>{t.target.toFixed(digits)}</b> <span style={{ color: 'var(--muted)' }}>+{t.rewardUsdt} USDT</span></span>
              <span>📦 {t.sizeCoin.toLocaleString('id-ID', { maximumFractionDigits: 2 })} coin</span>
            </div>

            <div style={{ marginTop: 8, fontSize: 11.5, color: lari ? 'var(--amber)' : 'var(--muted)' }}>
              Harga sekarang {live.toFixed(digits)} · {lari
                ? `sudah lari ${runR.toFixed(1)}R dari entry — JANGAN KEJAR, tunggu tiket baru`
                : `masih dekat pintu (${runR.toFixed(1)}R)`}
            </div>

            <button
              onClick={() => void salin(row)}
              className="control-btn"
              style={{ marginTop: 10, fontWeight: 800, borderColor: copied === row.symbol ? 'var(--green-dark)' : undefined, color: copied === row.symbol ? 'var(--green-dark)' : undefined }}
            >
              {copied === row.symbol ? 'TERSALIN ✓' : '📋 SALIN TIKET'}
            </button>
            <span style={{ marginLeft: 10, fontSize: 11, color: 'var(--muted)' }}>{salinText}</span>
          </div>
        );
      })}
    </section>
  );
}
