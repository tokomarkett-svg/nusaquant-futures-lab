'use client';

import { useEffect, useState } from 'react';

type HealthState = {
  ok: boolean;
  configured: boolean;
  message: string;
  candles?: number;
};

export default function DbStatus() {
  const [state, setState] = useState<HealthState>({
    ok: false,
    configured: false,
    message: 'Memeriksa database lokal…',
  });

  useEffect(() => {
    let active = true;
    fetch('/api/health/db', { cache: 'no-store' })
      .then(async (response) => {
        const payload = await response.json() as HealthState;
        if (active) setState(payload);
      })
      .catch(() => {
        if (active) setState({ ok: false, configured: false, message: 'Health check tidak dapat dihubungi.' });
      });
    return () => { active = false; };
  }, []);

  return (
    <div className={`health-badge ${state.ok ? 'health-connected' : 'health-pending'}`} title={state.message}>
      <span className={`health-dot ${state.ok ? '' : 'health-dot-pending'}`} />
      {state.ok ? `SQLite connected · ${state.candles ?? 0} candle` : state.configured ? 'SQLite query error' : 'SQLite pending'}
    </div>
  );
}
