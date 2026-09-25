'use client';

import type { Candle, SetupMarkers, Zones } from '../../lib/binance';

type Props = {
  candles: Candle[];
  zones: Zones;
  ma25?: number[];
  ma99?: number[];
  markers?: SetupMarkers[];
  livePrice?: number | null;
  height?: number;
  decimals?: number;
};

const UP = '#16a34a';
const DOWN = '#dc2626';

function niceDigits(price: number): number {
  if (price >= 1000) return 2;
  if (price >= 100) return 2;
  if (price >= 1) return 4;
  if (price >= 0.01) return 5;
  return 7;
}

export default function ZoneChart({ candles, zones, ma25, ma99, markers = [], livePrice = null, height = 420, decimals }: Props) {
  if (candles.length < 2) return <div className="chart-empty">Belum ada candle untuk digambar.</div>;
  const digits = decimals ?? niceDigits(zones.high);
  const format = (value: number) => value.toFixed(digits);

  const priceCandidates = [
    ...candles.map((c) => c.low), ...candles.map((c) => c.high),
    zones.long.pintu, zones.long.manis, zones.long.batal,
    zones.short.pintu, zones.short.manis, zones.short.batal,
    zones.high, zones.low,
    ...(livePrice ? [livePrice] : []),
    ...(ma25 ?? []).filter(Number.isFinite), ...(ma99 ?? []).filter(Number.isFinite),
  ];
  const rawMin = Math.min(...priceCandidates);
  const rawMax = Math.max(...priceCandidates);
  const pad = (rawMax - rawMin) * 0.06 || rawMax * 0.01;
  const min = rawMin - pad, max = rawMax + pad;

  const width = 1000;
  const left = 8, right = 108, top = 16, bottom = 30;
  const plotW = width - left - right, plotH = height - top - bottom;
  const xAt = (index: number) => left + (index / (candles.length - 1)) * plotW;
  const yAt = (price: number) => top + ((max - price) / (max - min)) * plotH;
  const candleW = Math.max(1.6, (plotW / candles.length) * 0.62);

  const line = (values: number[]) => {
    const points = values.map((v, i) => (Number.isFinite(v) ? `${xAt(i)},${yAt(v)}` : null)).filter(Boolean) as string[];
    return points.length > 1 ? `M${points.join('L')}` : '';
  };

  const band = (upper: number, lower: number) => ({ y: yAt(upper), h: Math.max(1, yAt(lower) - yAt(upper)) });

  const zoneRows = [
    { key: 'L-pintu', value: zones.long.pintu, label: 'pintu long', color: '#0e7490', dash: '0' },
    { key: 'L-manis', value: zones.long.manis, label: 'manis long', color: '#0e7490', dash: '5 4' },
    { key: 'L-batal', value: zones.long.batal, label: 'batal long', color: '#0e7490', dash: '2 4' },
    { key: 'S-pintu', value: zones.short.pintu, label: 'pintu short', color: '#b45309', dash: '0' },
    { key: 'S-manis', value: zones.short.manis, label: 'manis short', color: '#b45309', dash: '5 4' },
    { key: 'S-batal', value: zones.short.batal, label: 'batal short', color: '#b45309', dash: '2 4' },
  ].filter((row) => row.value >= min && row.value <= max);

  const markerAt = (time: number | null) => {
    if (time === null) return null;
    const index = candles.findIndex((c) => c.time === time);
    if (index < 0) return null;
    const candle = candles[index];
    const isLowSide = candle.close >= candle.open;
    return { index, candle, isLowSide };
  };

  const ticks = [0, Math.floor(candles.length / 4), Math.floor(candles.length / 2), Math.floor((candles.length * 3) / 4), candles.length - 1];
  const timeLabel = (time: number) => {
    const date = new Date(time + 7 * 3_600_000);
    return `${String(date.getUTCDate()).padStart(2, '0')}/${String(date.getUTCMonth() + 1).padStart(2, '0')} ${String(date.getUTCHours()).padStart(2, '0')}:${String(date.getUTCMinutes()).padStart(2, '0')}`;
  };

  const longBand = band(zones.long.pintu, zones.long.batal);
  const shortBand = band(zones.short.batal, zones.short.pintu);
  const lastCandle = candles.at(-1)!;
  const shownPrice = livePrice ?? lastCandle.close;
  const up = shownPrice >= lastCandle.open;
  const liveY = yAt(shownPrice);

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="zone-chart" role="img" aria-label="Chart candle dengan zona pintu manis batal">
      <rect x={0} y={0} width={width} height={height} fill="#0b1220" rx={14} />

      <rect x={left} y={longBand.y} width={plotW} height={longBand.h} fill="#0e7490" opacity={0.14} />
      <rect x={left} y={shortBand.y} width={plotW} height={shortBand.h} fill="#b45309" opacity={0.14} />

      {zoneRows.map((row) => (
        <g key={row.key}>
          <line x1={left} x2={left + plotW} y1={yAt(row.value)} y2={yAt(row.value)} stroke={row.color} strokeWidth={row.dash === '0' ? 1.6 : 1.1} strokeDasharray={row.dash === '0' ? undefined : row.dash} />
          <text x={left + plotW + 6} y={yAt(row.value) + 3.5} fill={row.color} fontSize={10.5} fontFamily="ui-monospace, monospace">{row.label} {format(row.value)}</text>
        </g>
      ))}

      <line x1={left} x2={left + plotW} y1={yAt(zones.high)} y2={yAt(zones.high)} stroke="#64748b" strokeWidth={1} strokeDasharray="1 5" />
      <text x={left + 6} y={yAt(zones.high) - 5} fill="#94a3b8" fontSize={10.5} fontFamily="ui-monospace, monospace">H 24j {format(zones.high)}</text>
      <line x1={left} x2={left + plotW} y1={yAt(zones.low)} y2={yAt(zones.low)} stroke="#64748b" strokeWidth={1} strokeDasharray="1 5" />
      <text x={left + 6} y={yAt(zones.low) + 13} fill="#94a3b8" fontSize={10.5} fontFamily="ui-monospace, monospace">L 24j {format(zones.low)}</text>

      {ma99 && <path d={line(ma99)} fill="none" stroke="#a855f7" strokeWidth={1.3} opacity={0.9} />}
      {ma25 && <path d={line(ma25)} fill="none" stroke="#eab308" strokeWidth={1.3} opacity={0.9} />}

      {candles.map((candle, index) => {
        const x = xAt(index);
        const color = candle.close >= candle.open ? UP : DOWN;
        const bodyTop = yAt(Math.max(candle.open, candle.close));
        const bodyBottom = yAt(Math.min(candle.open, candle.close));
        return (
          <g key={candle.time}>
            <line x1={x} x2={x} y1={yAt(candle.high)} y2={yAt(candle.low)} stroke={color} strokeWidth={1} />
            <rect x={x - candleW / 2} y={bodyTop} width={candleW} height={Math.max(1, bodyBottom - bodyTop)} fill={color} />
          </g>
        );
      })}

      {markers.map((setup) => {
        const items: Array<[string, number | null, string]> = [
          ['X', setup.x, '#38bdf8'],
          ['1', setup.candle1, '#facc15'],
          ['2', setup.candle2, '#4ade80'],
        ];
        return items.map(([label, time, color]) => {
          const spot = markerAt(time);
          if (!spot) return null;
          const { index, candle, isLowSide } = spot;
          const y = isLowSide ? yAt(candle.low) + 14 : yAt(candle.high) - 8;
          return (
            <g key={`${setup.side}-${label}-${time}`}>
              <circle cx={xAt(index)} cy={y} r={8} fill="#0b1220" stroke={color} strokeWidth={1.4} />
              <text x={xAt(index)} y={y + 3.5} fill={color} fontSize={9.5} fontWeight={700} textAnchor="middle">{label}</text>
            </g>
          );
        });
      })}

      <line x1={left} x2={left + plotW} y1={liveY} y2={liveY} stroke={up ? UP : DOWN} strokeWidth={1} strokeDasharray="4 3" />
      <rect x={left + plotW + 2} y={liveY - 9} width={100} height={18} rx={4} fill={up ? UP : DOWN} />
      <text x={left + plotW + 8} y={liveY + 3.5} fill="#f8fafc" fontSize={11} fontWeight={700} fontFamily="ui-monospace, monospace">{format(shownPrice)}</text>

      {ticks.map((index) => (
        <text key={index} x={xAt(index)} y={height - 10} fill="#64748b" fontSize={10} textAnchor="middle" fontFamily="ui-monospace, monospace">{timeLabel(candles[index].time)}</text>
      ))}
    </svg>
  );
}
