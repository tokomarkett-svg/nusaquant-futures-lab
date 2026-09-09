import type { Regime } from './index';

export type WindowStatus = 'UPCOMING' | 'ACTIVE' | 'EXPIRED' | 'INSUFFICIENT_DATA' | 'BLOCKED';

export interface WindowProfile {
  id: string;
  label: string;
  startMinute: number;
  endMinute: number;
  preferredRegimes: Regime[];
  sampleSize: number;
  setupCount: number;
  winRate: number | null;
  expectancyR: number | null;
  notes?: string;
}

export interface OpportunityWindow {
  id: string;
  label: string;
  startMinute: number;
  endMinute: number;
  localStart: string;
  localEnd: string;
  status: WindowStatus;
  qualityScore: number;
  sampleSize: number;
  setupCount: number;
  expectancyR: number | null;
  rationale: string[];
  requiredConditions: string[];
}

export interface DailyMarketPlan {
  dateKey: string;
  timezone: string;
  generatedAt: string;
  currentMinute: number;
  regime: Regime;
  windows: OpportunityWindow[];
  notes: string[];
}

interface LocalTimeParts {
  dateKey: string;
  hour: number;
  minute: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function getLocalTimeParts(date: Date, timezone: string): LocalTimeParts {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? 0);
  const year = get('year');
  const month = get('month');
  const day = get('day');
  return {
    dateKey: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
    hour: get('hour'),
    minute: get('minute'),
  };
}

function formatMinute(minute: number): string {
  const normalized = ((minute % 1440) + 1440) % 1440;
  return `${String(Math.floor(normalized / 60)).padStart(2, '0')}:${String(normalized % 60).padStart(2, '0')}`;
}

function isInWindow(currentMinute: number, startMinute: number, endMinute: number): boolean {
  if (startMinute === endMinute) return false;
  if (startMinute < endMinute) return currentMinute >= startMinute && currentMinute < endMinute;
  return currentMinute >= startMinute || currentMinute < endMinute;
}

function isBeforeWindow(currentMinute: number, startMinute: number, endMinute: number): boolean {
  if (isInWindow(currentMinute, startMinute, endMinute)) return false;
  if (startMinute < endMinute) return currentMinute < startMinute;
  return currentMinute < startMinute && currentMinute >= endMinute;
}

function createScore(profile: WindowProfile, regime: Regime): number {
  if (profile.sampleSize <= 0 || profile.expectancyR === null) return 0;
  const sampleFactor = clamp(profile.sampleSize / 100, 0, 1);
  const expectancyFactor = clamp((profile.expectancyR + 0.5) / 1.5, 0, 1);
  const regimeFactor = profile.preferredRegimes.includes(regime) ? 1 : 0.35;
  const setupFactor = clamp(profile.setupCount / Math.max(profile.sampleSize, 1), 0, 1);
  return Math.round(clamp((sampleFactor * 35) + (expectancyFactor * 35) + (regimeFactor * 20) + (setupFactor * 10), 0, 100));
}

export function createDailyMarketPlan({
  now = new Date(),
  timezone = 'Asia/Jakarta',
  regime,
  profiles,
  minimumSampleSize = 30,
  blocked = false,
}: {
  now?: Date;
  timezone?: string;
  regime: Regime;
  profiles: WindowProfile[];
  minimumSampleSize?: number;
  blocked?: boolean;
}): DailyMarketPlan {
  const local = getLocalTimeParts(now, timezone);
  const currentMinute = local.hour * 60 + local.minute;
  const notes: string[] = [];
  const windows = profiles.map((profile): OpportunityWindow => {
    const enoughData = profile.sampleSize >= minimumSampleSize && profile.expectancyR !== null;
    const current = isInWindow(currentMinute, profile.startMinute, profile.endMinute);
    const before = isBeforeWindow(currentMinute, profile.startMinute, profile.endMinute);
    const regimeMatches = profile.preferredRegimes.includes(regime);
    const status: WindowStatus = blocked
      ? 'BLOCKED'
      : !enoughData
        ? 'INSUFFICIENT_DATA'
        : current
          ? 'ACTIVE'
          : before
            ? 'UPCOMING'
            : 'EXPIRED';
    const rationale: string[] = [];
    if (!enoughData) rationale.push(`Data historis belum cukup: ${profile.sampleSize}/${minimumSampleSize} sampel minimum.`);
    if (enoughData) rationale.push(`Expectancy historis: ${profile.expectancyR?.toFixed(2)}R.`);
    if (regimeMatches) rationale.push(`Regime ${regime} sesuai dengan profile window.`);
    else rationale.push(`Regime ${regime} tidak sepenuhnya sesuai; window tidak boleh menjadi alasan entry tunggal.`);
    if (blocked) rationale.push('Window diblokir oleh risk governor.');
    if (profile.notes) rationale.push(profile.notes);

    return {
      id: profile.id,
      label: profile.label,
      startMinute: profile.startMinute,
      endMinute: profile.endMinute,
      localStart: formatMinute(profile.startMinute),
      localEnd: formatMinute(profile.endMinute),
      status,
      qualityScore: enoughData ? createScore(profile, regime) : 0,
      sampleSize: profile.sampleSize,
      setupCount: profile.setupCount,
      expectancyR: profile.expectancyR,
      rationale,
      requiredConditions: [
        'Regime dan struktur market masih valid',
        'Candle confirmation sudah close',
        'Risk-reward memenuhi batas',
        'Harga belum melewati maximum chase distance',
      ],
    };
  });

  if (profiles.length === 0) notes.push('Belum ada profile waktu dari backtest; bot hanya melakukan observasi umum.');
  if (profiles.some((profile) => profile.sampleSize < minimumSampleSize)) notes.push('Window tanpa sampel cukup hanya menjadi watchlist, bukan prediksi entry.');
  notes.push('Jam adalah prioritas pengamatan, bukan sinyal entry. Kondisi harga real-time tetap wajib dikonfirmasi.');

  return {
    dateKey: local.dateKey,
    timezone,
    generatedAt: now.toISOString(),
    currentMinute,
    regime,
    windows,
    notes,
  };
}

export function getActiveOpportunity(plan: DailyMarketPlan): OpportunityWindow | null {
  return plan.windows.find((window) => window.status === 'ACTIVE') ?? null;
}
