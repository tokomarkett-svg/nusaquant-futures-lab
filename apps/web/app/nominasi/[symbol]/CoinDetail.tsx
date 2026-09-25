'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import ZoneChart from '../../components/ZoneChart';
import type { CoinDetail as CoinDetailPayload, SetupMarkers, Ticket } from '../../../lib/binance';

const TIMEFRAMES = ['5m', '15m', '1h', '4h'] as const;
type Timeframe = (typeof TIMEFRAMES)[number];

type Payload = CoinDetailPayload & { ok: boolean };

const RISK_USDT = 0.31; // 1% dari modal latihan 31 USDT
const TARGET_R = 2;

function digitsFor(price: number) {
  if (price >= 100) return 2;
  if (price >= 1) return 4;
  if (price >= 0.01) return 5;
  return 7;
}

function SetupChecklist({ setup, title, digits }: { setup: SetupMarkers; title: string; digits: number }) {
  const rows: Array<[string, boolean, string]> = [
    ['X (bel pintu)', setup.x !== null, setup.x ? new Date(setup.x).toISOString().slice(11, 16) + ' UTC' : 'belum'],
    ['Candle 1 sah', setup.candle1 !== null, setup.candle1 ? new Date(setup.candle1).toISOString().slice(11, 16) + ' UTC' : 'belum'],
    ['Candle 2 (close tembus)', setup.candle2 !== null, setup.candle2 ? new Date(setup.candle2).toISOString().slice(11, 16) + ' UTC' : 'belum'],
    [`Kedaluwarsa (maks 12 candle)`, setup.staleBars === null ? true : setup.staleBars <= 12, setup.staleBars === null ? '—' : `${setup.staleBars} candle sejak X`],
  ];
  return (
    <div className="diagnostic-table-wrap">
      <div className="diagnostic-table-title">{title} {setup.valid ? '· PAKET LENGKAP ✔' : ''}</div>
      <div style={{ display: 'grid', gap: 6 }}>
        {rows.map(([label, ok, value]) => (
          <div key={label} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 11.5, fontFamily: "'DM Mono', monospace" }}>
            <span style={{ color: 'var(--muted)' }}>{ok ? '✔' : '✖'} {label}</span>
            <span style={{ color: ok ? 'var(--ink)' : 'var(--amber)' }}>{value}</span>
          </div>
        ))}
      </div>
      {setup.notes.length > 0 && (
        <div style={{ marginTop: 8, color: 'var(--muted)', fontSize: 11, lineHeight: 1.55 }}>{setup.notes.join(' ')}</div>
      )}
      {setup.valid && (
        <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid #edf2ee', fontSize: 11, fontFamily: "'DM Mono', monospace", color: 'var(--ink)' }}>
          Entry di close candle 2 · stop di ujung buntut candle 1 · target 2R
        </div>
      )}
    </div>
  );
}

function TicketPanel({ ticket, digits, label }: { ticket: Ticket | null; digits: number; label: string }) {
  if (!ticket) {
    return (
      <div className="diagnostic-table-wrap">
        <div className="diagnostic-table-title">{label}</div>
        <div style={{ color: 'var(--muted)', fontSize: 11.5, lineHeight: 1.6 }}>
          Belum ada tiket: paket X → candle 1 → candle 2 belum lengkap. Tidak ada tiket = tidak ada entri. (Menunggu itu bagian dari sistem.)
        </div>
      </div>
    );
  }
  const tone = ticket.actionable ? { bg: '#eaf8ef', border: '#c8e9d5', fg: 'var(--green-dark)', text: 'SIAP / MASIH BISA DIEKSEKUSI' }
    : { bg: '#fff4e8', border: '#f3ddc2', fg: 'var(--amber)', text: 'TIDAK BISA DIEKSEKUSI LAGI — TUNGGU SETUP BARU' };
  return (
    <div className="diagnostic-table-wrap" style={{ background: tone.bg, borderColor: tone.border }}>
      <div className="diagnostic-table-title" style={{ color: tone.fg }}>{label} · {tone.text}</div>
      <div style={{ display: 'grid', gap: 6, fontSize: 12, fontFamily: "'DM Mono', monospace" }}>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: 'var(--muted)' }}>entry (close candle 2)</span><b>{ticket.entry.toFixed(digits)}</b></div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: 'var(--muted)' }}>stop (ujung buntut candle 1)</span><span style={{ color: 'var(--red)' }}>{ticket.stop.toFixed(digits)}</span></div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: 'var(--muted)' }}>target 2R</span><span style={{ color: 'var(--green-dark)' }}>{ticket.target.toFixed(digits)}</span></div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: 'var(--muted)' }}>jarak entry→stop</span><span>{ticket.riskDistance.toFixed(digits)} ({ticket.riskPct.toFixed(2)}%)</span></div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: 'var(--muted)' }}>ukuran coin (1R = 0,31 USDT)</span><b>{ticket.sizeCoin.toLocaleString('id-ID', { maximumFractionDigits: 4 })}</b></div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: 'var(--muted)' }}>risiko / imbalan</span><span>{ticket.riskUsdt} USDT → {ticket.rewardUsdt} USDT</span></div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: 'var(--muted)' }}>harga sekarang vs entry</span><span style={{ color: ticket.chaseRisk ? 'var(--amber)' : 'var(--ink)' }}>{ticket.distanceNowPct >= 0 ? '+' : ''}{ticket.distanceNowPct.toFixed(2)}%</span></div>
      </div>
      {ticket.warnings.length > 0 && (
        <div style={{ marginTop: 8, color: 'var(--amber)', fontSize: 11, lineHeight: 1.6 }}>⚠ {ticket.warnings.join(' · ')}</div>
      )}
    </div>
  );
}

export default function CoinDetail({ symbol }: { symbol: string }) {
  const [timeframe, setTimeframe] = useState<Timeframe>('15m');
  const [payload, setPayload] = useState<Payload | null>(null);
  const [livePrice, setLivePrice] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetch(`/api/coin/${symbol}?interval=${timeframe}`, { cache: 'no-store' });
      const body = await response.json();
      if (!body.ok) throw new Error(body.error ?? 'Gagal memuat data coin.');
      setPayload(body as Payload);
      setUpdatedAt(new Date().toLocaleTimeString('id-ID'));
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  }, [symbol, timeframe]);

  const loadPrice = useCallback(async () => {
    try {
      const response = await fetch('/api/harga', { cache: 'no-store' });
      const body = await response.json();
      if (body.ok && body.prices[symbol]) setLivePrice(body.prices[symbol] as number);
    } catch {
      /* biarkan harga terakhir */
    }
  }, [symbol]);

  useEffect(() => {
    void load();
    void loadPrice();
    const candleTimer = setInterval(() => void load(), 60_000);
    const priceTimer = setInterval(() => void loadPrice(), 5_000);
    return () => {
      clearInterval(candleTimer);
      clearInterval(priceTimer);
    };
  }, [load, loadPrice]);

  if (error) {
    return (
      <div className="panel" style={{ padding: 18, borderRadius: 18, color: 'var(--red)' }}>
        {error} — <Link href="/nominasi">kembali ke papan</Link>
      </div>
    );
  }
  if (!payload) {
    return <div className="panel" style={{ padding: 20, borderRadius: 18, color: 'var(--muted)' }}>Memuat chart {symbol}…</div>;
  }

  const shown = livePrice ?? payload.last;
  const digits = digitsFor(shown);
  const zones = payload.zones;
  const distLong = ((shown - zones.long.pintu) / shown) * 100;
  const distShort = ((zones.short.pintu - shown) / shown) * 100;
  const inLongBand = shown <= zones.long.pintu && shown >= zones.long.batal;
  const inShortBand = shown >= zones.short.pintu && shown <= zones.short.batal;

  const zoneTable = (label: string, zone: { pintu: number; manis: number; batal: number }, distance: number, inside: boolean) => (
    <div className="diagnostic-table-wrap">
      <div className="diagnostic-table-title">{label}</div>
      <div style={{ display: 'grid', gap: 6, fontSize: 11.5, fontFamily: "'DM Mono', monospace" }}>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: 'var(--muted)' }}>pintu</span><b>{zone.pintu.toFixed(digits)}</b></div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: 'var(--muted)' }}>manis</span><span>{zone.manis.toFixed(digits)}</span></div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: 'var(--muted)' }}>batal</span><span>{zone.batal.toFixed(digits)}</span></div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ color: 'var(--muted)' }}>jarak harga</span>
          <span style={{ color: inside ? 'var(--amber)' : 'var(--ink)' }}>{inside ? 'di dalam pita' : `${distance.toFixed(2)}%`}</span>
        </div>
      </div>
    </div>
  );

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <section className="panel" style={{ padding: '14px 16px', borderRadius: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <Link href="/nominasi" className="control-btn" style={{ textDecoration: 'none' }}>← Papan</Link>
          <h2 style={{ margin: 0, fontSize: 18 }}>{symbol.replace('USDT', '')}/USDT</h2>
          <span style={{ fontSize: 10.5, fontWeight: 800, padding: '3px 8px', borderRadius: 6, background: '#f3efff', color: '#5b3fa8', border: '1px solid #ded2ff' }}>PAPER ONLY</span>
          <span style={{ marginLeft: 'auto', fontFamily: "'DM Mono', monospace", fontSize: 20, fontWeight: 700 }}>{shown.toFixed(digits)}</span>
        </div>
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 10, fontSize: 11.5, fontFamily: "'DM Mono', monospace", color: 'var(--muted)' }}>
          <span>High 24j <b style={{ color: 'var(--ink)' }}>{zones.high.toFixed(digits)}</b></span>
          <span>Low 24j <b style={{ color: 'var(--ink)' }}>{zones.low.toFixed(digits)}</b></span>
          <span>range <b style={{ color: 'var(--ink)' }}>{zones.range.toFixed(digits)}</b> ({zones.rangePct.toFixed(2)}%)</span>
          <span>gate 1H <b style={{ color: payload.gate.gate === 'HIJAU' ? 'var(--green-dark)' : payload.gate.gate === 'MERAH' ? 'var(--red)' : 'var(--amber)' }}>{payload.gate.gate}</b></span>
          <span>data {payload.dataAgeMin} mnt lalu</span>
          {updatedAt && <span>refresh {updatedAt}</span>}
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
          {TIMEFRAMES.map((tf) => (
            <button key={tf} onClick={() => setTimeframe(tf)} className="control-btn" style={tf === timeframe ? { background: 'var(--green-dark)', color: 'white', borderColor: 'var(--green-dark)' } : undefined}>{tf}</button>
          ))}
          <span style={{ marginLeft: 'auto', color: 'var(--muted)', fontSize: 11, alignSelf: 'center' }}>garis ditarik otomatis dari High/Low 24 jam · harga live 5 dtk</span>
        </div>
      </section>

      <section style={{ display: 'grid', gap: 10 }}>
        <ZoneChart
          candles={payload.candles}
          zones={zones}
          ma25={timeframe === '1h' ? payload.ma25 : undefined}
          ma99={timeframe === '1h' ? payload.ma99 : undefined}
          markers={[payload.setupLong, payload.setupShort]}
          livePrice={livePrice}
          height={430}
        />
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 11, color: 'var(--muted)' }}>
          <span style={{ color: '#0e7490' }}>▬ pintu/manis/batal long (dari High 24j)</span>
          <span style={{ color: '#b45309' }}>▬ pintu/manis/batal short (dari Low 24j)</span>
          <span style={{ color: '#eab308' }}>▬ MA25</span>
          <span style={{ color: '#a855f7' }}>▬ MA99</span>
          <span>X = bel pintu · 1 = candle 1 · 2 = candle 2</span>
        </div>
      </section>

      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12 }}>
        {zoneTable('ZONA LONG', zones.long, distLong, inLongBand)}
        {zoneTable('ZONA SHORT (cermin)', zones.short, distShort, inShortBand)}
      </section>

      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12 }}>
        <SetupChecklist setup={payload.setupLong} title="SKENARIO LONG" digits={digits} />
        <SetupChecklist setup={payload.setupShort} title="SKENARIO SHORT" digits={digits} />
      </section>

      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12 }}>
        <TicketPanel ticket={payload.ticketLong} digits={digits} label="TIKET LONG (otomatis)" />
        <TicketPanel ticket={payload.ticketShort} digits={digits} label="TIKET SHORT (otomatis)" />
      </section>

      <section className="panel" style={{ padding: '14px 16px', borderRadius: 18 }}>
        <div className="eyebrow" style={{ color: 'var(--green)' }}>Kalkulator risiko — hitung dulu sendiri, ini pembanding</div>
        <div style={{ marginTop: 8, color: 'var(--muted)', fontSize: 11.5, lineHeight: 1.7, fontFamily: "'DM Mono', monospace" }}>
          1R = 1% dari modal latihan = <b style={{ color: 'var(--ink)' }}>{RISK_USDT} USDT</b><br />
          ukuran coin = 1R ÷ jarak entry ke stop · target = entry ± {TARGET_R}× jarak<br />
          jarak long (entry ke buntut candle 1) dan jarak short dihitung dari paket yang terdeteksi di atas.
        </div>
      </section>
    </div>
  );
}
