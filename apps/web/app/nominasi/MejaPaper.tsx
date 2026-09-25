'use client';

import { useCallback, useEffect, useState } from 'react';

type OpenPosition = {
  symbol: string; side: 'LONG' | 'SHORT'; entry: number; stop: number; target: number;
  sizeCoin: number; openedAt: string; processScore: number | null; setupKey: string;
};

type MejaPayload = {
  ok: boolean;
  error?: string;
  open: OpenPosition[];
  today: {
    trades: number; open: number; closed: number; wins: number; losses: number;
    rTotal: number; pnlUsdt: number; processScoreAvg: number | null;
    lastClosed: { symbol: string; reason: string | null; r: number } | null;
  } | null;
};

const digitsFor = (price: number) => (price >= 100 ? 2 : price >= 1 ? 4 : price >= 0.01 ? 5 : 7);

export default function MejaPaper() {
  const [payload, setPayload] = useState<MejaPayload | null>(null);
  const [prices, setPrices] = useState<Record<string, number>>({});
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetch('/api/meja', { cache: 'no-store' });
      const body = await response.json() as MejaPayload;
      if (!body.ok) { setError(body.error ?? 'Meja tidak terjangkau.'); return; }
      setPayload(body);
      setError(null);
    } catch {
      setError('Meja tidak terjangkau.');
    }
  }, []);

  const loadPrices = useCallback(async () => {
    try {
      const response = await fetch('/api/harga', { cache: 'no-store' });
      const body = await response.json();
      if (body.ok) setPrices(body.prices as Record<string, number>);
    } catch {
      /* biarkan harga terakhir */
    }
  }, []);

  useEffect(() => {
    void load();
    void loadPrices();
    const timer = setInterval(() => void load(), 30_000);
    const priceTimer = setInterval(() => void loadPrices(), 5_000);
    return () => {
      clearInterval(timer);
      clearInterval(priceTimer);
    };
  }, [load, loadPrices]);

  if (error) {
    return (
      <section className="panel" style={{ padding: '14px 16px', borderRadius: 14 }}>
        <strong style={{ fontSize: 14 }}>Meja Paper</strong>
        <div style={{ color: 'var(--muted)', fontSize: 12, marginTop: 6 }}>{error}</div>
      </section>
    );
  }
  if (!payload) return null;

  const today = payload.today;
  const tone = (today?.rTotal ?? 0) > 0 ? 'var(--green-dark)' : (today?.rTotal ?? 0) < 0 ? 'var(--red)' : 'var(--ink)';

  return (
    <section className="panel" style={{ padding: '14px 16px', borderRadius: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <strong style={{ fontSize: 14 }}>Meja Paper (otomatis)</strong>
        <span style={{ fontSize: 10.5, fontWeight: 800, padding: '2px 8px', borderRadius: 6, background: '#f3efff', color: '#5b3fa8', border: '1px solid #ded2ff' }}>UANG DEMO</span>
        <span style={{ marginLeft: 'auto', color: 'var(--muted)', fontSize: 11 }}>refresh 30 dtk</span>
      </div>
      <p style={{ margin: '6px 0 0', color: 'var(--muted)', fontSize: 12, lineHeight: 1.6 }}>
        Bot membuka posisi paper sendiri saat 🎯 tiket siap muncul, memasang SL/TP dari aturan kita, lalu mencatat jurnal otomatis.
        Pagar: maks 2 trade/hari · 2 loss beruntun = tutup meja · risiko 0,31 USDT per trade.
      </p>

      {today && (
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 10, fontFamily: "'DM Mono', monospace", fontSize: 12 }}>
          <span>hari ini <b>{today.trades}</b> trade</span>
          <span>terbuka <b>{today.open}</b></span>
          <span>menang <b style={{ color: 'var(--green-dark)' }}>{today.wins}</b> · kalah <b style={{ color: 'var(--red)' }}>{today.losses}</b></span>
          <span>hasil <b style={{ color: tone }}>{today.rTotal >= 0 ? '+' : ''}{today.rTotal}R</b> ({today.pnlUsdt >= 0 ? '+' : ''}{today.pnlUsdt} USDT)</span>
          <span>nilai proses rata-rata <b>{today.processScoreAvg === null ? '—' : `${today.processScoreAvg}/6`}</b></span>
        </div>
      )}

      {payload.open.length === 0 ? (
        <div style={{ marginTop: 10, color: 'var(--muted)', fontSize: 12 }}>
          Tidak ada posisi paper terbuka sekarang. {today?.lastClosed ? `Terakhir: ${today.lastClosed.symbol} ${today.lastClosed.reason ?? ''} ${today.lastClosed.r >= 0 ? '+' : ''}${today.lastClosed.r}R.` : 'Menunggu tiket siap pertama.'}
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 8, marginTop: 10 }}>
          {payload.open.map((position) => {
            const live = prices[position.symbol] ?? position.entry;
            const digits = digitsFor(live);
            const move = position.side === 'LONG' ? (live - position.entry) / (position.entry - position.stop) : (position.entry - live) / (position.stop - position.entry);
            const moveColor = move > 0 ? 'var(--green-dark)' : move < 0 ? 'var(--red)' : 'var(--ink)';
            return (
              <div key={position.setupKey + position.openedAt} style={{ border: '1px solid #edf2ee', borderRadius: 10, padding: '10px 12px', background: '#fbfdfb' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <b style={{ fontSize: 14 }}>{position.symbol.replace('USDT', '')}</b>
                  <span style={{ fontSize: 10.5, fontWeight: 800, padding: '2px 8px', borderRadius: 6, background: position.side === 'LONG' ? '#eaf8ef' : '#fdeeee', color: position.side === 'LONG' ? 'var(--green-dark)' : 'var(--red)' }}>{position.side}</span>
                  <span style={{ marginLeft: 'auto', fontFamily: "'DM Mono', monospace", fontSize: 14, fontWeight: 700 }}>{live.toFixed(digits)}</span>
                  <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, color: moveColor }}>{move >= 0 ? '+' : ''}{move.toFixed(2)}R</span>
                </div>
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 6, fontFamily: "'DM Mono', monospace", fontSize: 11.5, color: 'var(--muted)' }}>
                  <span>entry <b style={{ color: 'var(--ink)' }}>{position.entry.toFixed(digits)}</b></span>
                  <span>SL <b style={{ color: 'var(--red)' }}>{position.stop.toFixed(digits)}</b></span>
                  <span>TP <b style={{ color: 'var(--green-dark)' }}>{position.target.toFixed(digits)}</b></span>
                  <span>{position.sizeCoin.toLocaleString('id-ID', { maximumFractionDigits: 2 })} coin</span>
                  {position.processScore !== null && <span style={{ marginLeft: 'auto' }}>proses {position.processScore}/6</span>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
