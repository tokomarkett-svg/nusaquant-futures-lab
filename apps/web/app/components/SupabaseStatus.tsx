'use client';

import { useEffect, useState } from 'react';

type HealthState = {
  ok: boolean;
  configured: boolean;
  message: string;
  rows?: number;
};

export default function SupabaseStatus() {
  const [state, setState] = useState<HealthState>({
    ok: false,
    configured: false,
    message: 'Memeriksa koneksi database…',
  });

  useEffect(() => {
    let active = true;
    fetch('/api/health/supabase', { cache: 'no-store' })
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
      {state.ok ? `Supabase connected · ${state.rows ?? 0} candles` : state.configured ? 'Supabase query error' : 'Supabase pending'}
    </div>
  );
}
