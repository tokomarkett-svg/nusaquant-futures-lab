'use client';

import { useCallback, useEffect, useState } from 'react';

type BotStatus = 'IDLE' | 'STARTING' | 'RUNNING' | 'WAITING_APPROVAL' | 'POSITION_OPEN' | 'PAUSED' | 'COOLDOWN' | 'EMERGENCY';
type Session = { status: BotStatus; mode: string; symbol: string; risk_fraction: number; daily_loss_limit: number };

type ResponsePayload = { ok: boolean; configured?: boolean; error?: string; session?: Session };

function readableStatus(status: BotStatus | null): string {
  if (!status) return 'Checking';
  if (status === 'RUNNING') return 'Observing';
  if (status === 'PAUSED') return 'Paused';
  if (status === 'EMERGENCY') return 'Emergency stop';
  if (status === 'IDLE') return 'Idle';
  return status.replace('_', ' ');
}

export default function BotControls() {
  const [session, setSession] = useState<Session | null>(null);
  const [configured, setConfigured] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('Memeriksa bot session…');

  const load = useCallback(async () => {
    try {
      const response = await fetch('/api/bot/session', { cache: 'no-store' });
      const payload = await response.json() as ResponsePayload;
      setConfigured(payload.configured !== false);
      if (payload.session) setSession(payload.session);
      setMessage(payload.ok ? 'Paper mode · belum ada order real.' : payload.error ?? 'Bot session belum siap.');
    } catch {
      setConfigured(false);
      setMessage('Bot control API belum dapat dihubungi.');
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function command(action: 'start' | 'pause' | 'emergency') {
    if (action === 'emergency' && !window.confirm('Aktifkan emergency stop untuk paper bot?')) return;
    setBusy(true);
    try {
      const response = await fetch('/api/bot/session', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const payload = await response.json() as ResponsePayload;
      if (payload.session) setSession(payload.session);
      setMessage(payload.ok ? `Session berubah menjadi ${readableStatus(payload.session?.status ?? null)}.` : payload.error ?? 'Perintah gagal.');
      setConfigured(payload.configured !== false);
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
        <div className="panel-kicker">Session: {session?.symbol ?? 'BTCUSDT'} · Paper approval only</div>
      </div>
      <div className="control-status"><span className={`status-dot status-${status?.toLowerCase() ?? 'idle'}`} />{readableStatus(status)}</div>
      <div className="control-actions">
        <button className="control-btn control-primary" disabled={!configured || busy || status === 'RUNNING'} onClick={() => void command('start')}>Start observation</button>
        <button className="control-btn" disabled={!configured || busy || status !== 'RUNNING'} onClick={() => void command('pause')}>Pause new entries</button>
        <button className="control-btn control-danger" disabled={!configured || busy || status === 'EMERGENCY'} onClick={() => void command('emergency')}>Emergency stop</button>
      </div>
      <div className="control-message">{message}</div>
    </section>
  );
}
