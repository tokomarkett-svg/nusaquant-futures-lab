'use client';

import { useState } from 'react';
import type { BoardRow } from '../../lib/binance';

const orderSideOf = (side: 'LONG' | 'SHORT') => (side === 'LONG' ? 'BUY' : 'SELL');
const digitsFor = (price: number) => (price >= 100 ? 2 : price >= 1 ? 4 : price >= 0.01 ? 5 : 7);

export default function SiapEntri({ rows, prices }: { rows: BoardRow[]; prices: Record<string, number> }) {
  const [copied, setCopied] = useState<string | null>(null);
  const [buka, setBuka] = useState<Record<string, { state: 'loading' | 'opened' | 'error'; message?: string }>>({});
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

  const entriPaper = async (row: BoardRow) => {
    setBuka((prev) => ({ ...prev, [row.symbol]: { state: 'loading' } }));
    try {
      const response = await fetch('/api/meja/buka', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ symbol: row.symbol, side: row.side }),
      });
      const hasil = await response.json() as { ok: boolean; error?: string; position?: { entry: number } };
      if (!hasil.ok) {
        setBuka((prev) => ({ ...prev, [row.symbol]: { state: 'error', message: hasil.error ?? 'Gagal membuka posisi paper.' } }));
        return;
      }
      setBuka((prev) => ({ ...prev, [row.symbol]: { state: 'opened', message: `POSISI PAPER DIBUKA @ ${hasil.position?.entry} — meja mengawasi SL/TP` } }));
    } catch {
      setBuka((prev) => ({ ...prev, [row.symbol]: { state: 'error', message: 'Server tidak terjangkau — coba lagi.' } }));
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

            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginTop: 10 }}>
              <button
                onClick={() => void salin(row)}
                className="control-btn"
                style={{ fontWeight: 800, borderColor: copied === row.symbol ? 'var(--green-dark)' : undefined, color: copied === row.symbol ? 'var(--green-dark)' : undefined }}
              >
                {copied === row.symbol ? 'TERSALIN ✓' : '📋 SALIN TIKET'}
              </button>
              <button
                onClick={() => void entriPaper(row)}
                disabled={lari || buka[row.symbol]?.state === 'loading' || buka[row.symbol]?.state === 'opened'}
                className="control-btn"
                style={{ fontWeight: 800, background: 'var(--green-dark)', color: 'white', borderColor: 'var(--green-dark)', opacity: lari ? 0.45 : 1 }}
              >
                {buka[row.symbol]?.state === 'loading' ? 'MEMBUKA…' : buka[row.symbol]?.state === 'opened' ? 'TERBUKA ✓' : '⚡ ENTRI (PAPER)'}
              </button>
              <span style={{ fontSize: 11, color: 'var(--muted)' }}>{salinText}</span>
            </div>
            {buka[row.symbol]?.message && (
              <div style={{ marginTop: 6, fontSize: 12, fontWeight: 700, color: buka[row.symbol].state === 'error' ? 'var(--red)' : 'var(--green-dark)' }}>
                {buka[row.symbol].state === 'error' ? '⛔ ' : '✅ '}{buka[row.symbol].message}
              </div>
            )}
          </div>
        );
      })}
    </section>
  );
}
