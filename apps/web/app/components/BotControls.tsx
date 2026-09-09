'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

type BotStatus = 'IDLE' | 'STARTING' | 'RUNNING' | 'WAITING_APPROVAL' | 'POSITION_OPEN' | 'PAUSED' | 'COOLDOWN' | 'EMERGENCY';
type SupportedSymbol = 'BTCUSDT' | 'ETHUSDT';
type Session = { status: BotStatus; mode: string; symbol: string; risk_fraction: number; daily_loss_limit: number };
type LatestSignal = { decision: string; stage: string; timing: string; quality_score: number; evaluated_at: string };
type LatestPosition = { side: string; symbol: string; quantity: number | string; entry_price: number | string; stop_loss: number | string; take_profit: number | string; opened_at: string };

type ResponsePayload = { ok: boolean; configured?: boolean; error?: string; session?: Session; latestSignal?: LatestSignal | null; position?: LatestPosition | null };

function readableStatus(status: BotStatus | null): string {
  if (!status) return 'Checking';
  if (status === 'RUNNING') return 'Observing';
  if (status === 'PAUSED') return 'Paused';
  if (status === 'EMERGENCY') return 'Emergency stop';
  if (status === 'IDLE') return 'Idle';
  return status.replace('_', ' ');
}

export default function BotControls() {
  const router = useRouter();
  const [symbol, setSymbol] = useState<SupportedSymbol>('BTCUSDT');
  const [session, setSession] = useState<Session | null>(null);
  const [latestSignal, setLatestSignal] = useState<LatestSignal | null>(null);
  const [position, setPosition] = useState<LatestPosition | null>(null);
  const [configured, setConfigured] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('Memeriksa bot session…');

  const load = useCallback(async () => {
    try {
      const response = await fetch(`/api/bot/session?symbol=${symbol}`, { cache: 'no-store' });
      const payload = await response.json() as ResponsePayload;
      setConfigured(payload.configured !== false);
      if (payload.session) setSession(payload.session);
      setLatestSignal(payload.latestSignal ?? null);
      setPosition(payload.position ?? null);
      setMessage(payload.ok ? 'Paper mode · worker akan mengevaluasi candle closed terbaru.' : payload.error ?? 'Bot session belum siap.');
    } catch {
      setConfigured(false);
      setMessage('Bot control API belum dapat dihubungi.');
    }
  }, [symbol]);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => {
      void load();
      router.refresh();
    }, 15_000);
    return () => window.clearInterval(timer);
  }, [load, router]);

  async function command(action: 'start' | 'pause' | 'approve' | 'emergency') {
    if (action === 'emergency' && !window.confirm('Aktifkan emergency stop untuk paper bot?')) return;
    setBusy(true);
    try {
      const response = await fetch('/api/bot/session', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action, symbol }),
      });
      const payload = await response.json() as ResponsePayload;
      if (payload.session) setSession(payload.session);
      setLatestSignal(payload.latestSignal ?? null);
      setPosition(payload.position ?? null);
      setMessage(payload.ok ? `Session berubah menjadi ${readableStatus(payload.session?.status ?? null)}.` : payload.error ?? 'Perintah gagal.');
      setConfigured(payload.configured !== false);
      router.refresh();
    } catch {
      setMessage('Perintah tidak dapat dikirim.');
    } finally {
      setBusy(false);
    }
  }

  const status = session?.status ?? null;
  return (
    <section className="control-panel">
      <div>
        <div className="panel-title">Bot control</div>
        <div className="panel-kicker">Session: {session?.symbol ?? symbol} · Paper approval only</div>
      </div>
      <label className="symbol-picker">Symbol
        <select value={symbol} onChange={(event) => setSymbol(event.target.value as SupportedSymbol)}>
          <option value="BTCUSDT">BTCUSDT</option>
          <option value="ETHUSDT">ETHUSDT</option>
        </select>
      </label>
      <div className="control-status"><span className={`status-dot status-${status?.toLowerCase() ?? 'idle'}`} />{readableStatus(status)}</div>
      <div className="control-actions">
        <button className="control-btn control-primary" disabled={!configured || busy || status === 'RUNNING' || status === 'WAITING_APPROVAL' || status === 'POSITION_OPEN'} onClick={() => void command('start')}>Start observation</button>
        <button className="control-btn" disabled={!configured || busy || (status !== 'RUNNING' && status !== 'WAITING_APPROVAL')} onClick={() => void command('pause')}>Pause new entries</button>
        <button className="control-btn control-approve" disabled={!configured || busy || status !== 'WAITING_APPROVAL'} onClick={() => void command('approve')}>Approve paper entry</button>
        <button className="control-btn control-danger" disabled={!configured || busy || status === 'EMERGENCY'} onClick={() => void command('emergency')}>Emergency stop</button>
      </div>
      <div className="control-message">{message}</div>
      <div className="control-signal">
        <span>Worker result</span>
        {latestSignal ? <strong>{latestSignal.decision} · {latestSignal.stage} · {latestSignal.quality_score}/100 · {new Date(latestSignal.evaluated_at).toLocaleString('id-ID')}</strong> : <strong>Belum ada evaluasi dari worker</strong>}
      </div>
      <div className="control-signal">
        <span>Paper position</span>
        {position ? <strong>{position.side} {position.symbol} · qty {position.quantity} · entry {position.entry_price} · SL {position.stop_loss} · TP {position.take_profit}</strong> : <strong>Tidak ada posisi terbuka</strong>}
      </div>
    </section>
  );
}
