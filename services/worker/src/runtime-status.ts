/** Diagnostik baca-saja untuk memastikan worker tidak hanya menjawab /health.
 * Tidak memuat token, chat ID, detail posisi, atau isi pesan Telegram. */
export const runtimeStatus = {
  alerts: { lastCycleAt: null as string | null, lastFailureAt: null as string | null, scanned: 0, delivered: 0 },
  desk: { lastCycleAt: null as string | null, lastFailureAt: null as string | null, scanned: 0, opened: 0, closed: 0 },
};

export function runtimeSnapshot(market: string | null, now = new Date().toISOString()) {
  return {
    ok: true,
    at: now,
    market: market ?? 'UNKNOWN',
    modes: {
      alerts: process.env.RUN_ALERTS === 'true',
      telegramAllowed: process.env.PMB_NOTIF === '1',
      telegramConfigured: Boolean(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID),
      desk: process.env.RUN_DESK === 'true',
      deskStoreConfigured: Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY),
    },
    alerts: { ...runtimeStatus.alerts },
    desk: { ...runtimeStatus.desk },
  };
}
