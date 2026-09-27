'use client';

/**
 * CEK SISTEM (mode HP) — satu layar untuk menjawab "apakah semuanya masih jalan?".
 * Diperiksa langsung dari HP pemilik:
 *  · Papan & harga (web API)      · Supabase (via meja & skor)
 *  · Worker Railway (health)      · Mesin Pertarungan (aggTrades Futures)
 * Hanya MEMBACA — tidak menyentuh mesin, tidak menulis apa pun.
 */

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import HpHeader from '../HpHeader';
import { WARNA } from '../bahan';

const WORKER = 'https://nusaquantworker-production.up.railway.app';

type Status = 'cek' | 'ok' | 'lambat' | 'gagal';
type Item = { nama: string; status: Status; detail: string };

const EMOJI: Record<Status, string> = { cek: '⏳', ok: '✅', lambat: '🐢', gagal: '❌' };
const WARNA_S: Record<Status, string> = { cek: WARNA.muted, ok: '#0d7a4b', lambat: '#9a6b00', gagal: WARNA.red };

async function ukur(url: string, ms = 12000): Promise<{ json: unknown; ms: number } | null> {
  const mulai = Date.now();
  try {
    const r = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(ms) });
    if (!r.ok) return null;
    return { json: await r.json(), ms: Date.now() - mulai };
  } catch {
    return null;
  }
}

export default function CekSistem() {
  const [items, setItems] = useState<Item[]>([
    { nama: 'Papan (web API)', status: 'cek', detail: 'memindai…' },
    { nama: 'Harga live', status: 'cek', detail: 'memuat…' },
    { nama: 'Supabase — posisi meja', status: 'cek', detail: 'membaca…' },
    { nama: 'Supabase — skor 20 trade', status: 'cek', detail: 'membaca…' },
    { nama: 'Worker Railway', status: 'cek', detail: 'memanggil…' },
    { nama: 'Mesin Pertarungan (Futures)', status: 'cek', detail: 'memindai…' },
    { nama: 'Telegram + Otak Pertarungan', status: 'cek', detail: 'memeriksa siklus…' },
    { nama: 'Binance Demo / Live', status: 'cek', detail: 'memeriksa akun demo baca-saja…' },
  ]);
  const [diuji, setDiuji] = useState(false);

  const jalankan = useCallback(async () => {
    setDiuji(true);
    const hasil: Item[] = new Array(8);

    const papan = await ukur('/api/nominasi');
    const p = papan?.json as { ok?: boolean; funnel?: { scanned?: number; board?: number }; market?: string; at?: string } | undefined;
    const umurDetik = p?.at ? Math.round((Date.now() - new Date(p.at).getTime()) / 1000) : null;
    hasil[0] = p?.ok ? {
      nama: 'Papan (web API)', status: 'ok',
      detail: `${p.funnel?.board ?? 0} koin di papan · sumber ${p.market ?? '?'} · data ${umurDetik ?? '?'} dtk lalu`,
    } : { nama: 'Papan (web API)', status: 'gagal', detail: 'API tidak menjawab' };

    const harga = await ukur('/api/harga');
    const h = harga?.json as { ok?: boolean; prices?: Record<string, number> } | undefined;
    hasil[1] = h?.ok ? {
      nama: 'Harga live', status: 'ok',
      detail: `${Object.keys(h.prices ?? {}).length} pair · ${(harga!.ms / 1000).toFixed(1)} dtk`,
    } : { nama: 'Harga live', status: 'gagal', detail: 'API tidak menjawab' };

    const meja = await ukur('/api/meja');
    const m = meja?.json as { ok?: boolean; open?: unknown[]; today?: { trades: number } | null; error?: string } | undefined;
    hasil[2] = m?.ok ? {
      nama: 'Supabase — posisi meja', status: 'ok',
      detail: `${m.open?.length ?? 0} posisi terbuka · ${m.today?.trades ?? 0} trade hari ini`,
    } : { nama: 'Supabase — posisi meja', status: 'gagal', detail: m?.error ?? 'tidak terhubung (cek Supabase/Vercel env)' };

    const skor = await ukur('/api/meja/skor');
    const s = skor?.json as { ok?: boolean; total?: number; rTotal?: number; error?: string } | undefined;
    hasil[3] = s?.ok ? {
      nama: 'Supabase — skor 20 trade', status: 'ok',
      detail: `${s.total ?? 0} trade disiplin · total ${(s.rTotal ?? 0) >= 0 ? '+' : ''}${s.rTotal ?? 0}R`,
    } : { nama: 'Supabase — skor 20 trade', status: 'gagal', detail: s?.error ?? 'tidak terhubung' };

    const worker = await ukur(`${WORKER}/health/runtime`);
    const w = worker?.json as {
      ok?: boolean; market?: string; modes?: { alerts?: boolean; telegramAllowed?: boolean; telegramConfigured?: boolean; desk?: boolean; deskStoreConfigured?: boolean };
      alerts?: { lastCycleAt?: string | null; startupDeliveredAt?: string | null; lastFailureAt?: string | null; scanned?: number };
      desk?: { lastCycleAt?: string | null; lastFailureAt?: string | null; scanned?: number };
    } | undefined;
    hasil[4] = w?.ok ? {
      nama: 'Worker Railway', status: 'ok',
      detail: `hidup · pasar ${w.market ?? '?'} · ${(worker!.ms / 1000).toFixed(1)} dtk`,
    } : { nama: 'Worker Railway', status: 'gagal', detail: 'tidak terjangkau dari HP ini' };

    const pmb = await ukur(`${WORKER}/data/champion-json`, 30000);
    const j = pmb?.json as { ok?: boolean; rows?: Array<{ symbol: string; windows: number; status: string; decision?: { stage: string } | null }>; at?: string; error?: string } | undefined;
    const umurPmb = j?.at ? Math.round((Date.now() - new Date(j.at).getTime()) / 60_000) : null;
    hasil[5] = j?.ok ? {
      nama: 'Mesin Pertarungan (Futures)', status: j.rows?.some(r => r.windows >= 23) ? 'ok' : 'lambat',
      detail: `${j.rows?.length ?? 0} simbol footprint · ${j.rows?.filter((r) => r.decision?.stage === 'SIAP').length ?? 0} siap · ${j.rows?.map(r => `${r.symbol} ${r.windows}/23: ${r.status}`).join(' | ') ?? 'menunggu'} · pindai ${umurPmb ?? '?'} mnt lalu`,
    } : {
      nama: 'Mesin Pertarungan (Futures)', status: worker?.json ? 'lambat' : 'gagal',
      detail: j?.error ?? 'transaksi Futures belum tersedia; tidak ada tiket',
    };

    const baru = (tanggal?: string | null) => Boolean(tanggal && Date.now() - new Date(tanggal).getTime() < 6 * 60_000);
    const siap = Boolean(w?.modes?.alerts && w.modes.telegramAllowed && w.modes.telegramConfigured &&
      true);
    const siklus = Boolean(baru(w?.alerts?.lastCycleAt));
    const sapa = Boolean(w?.alerts?.startupDeliveredAt);
    hasil[6] = !w?.ok ? {
      nama: 'Telegram + Otak Pertarungan', status: 'gagal', detail: 'Diagnostik worker belum bisa dibaca.',
    } : {
      nama: 'Telegram + Otak Pertarungan', status: siap && siklus && sapa ? 'ok' : 'lambat',
      detail: `Konfigurasi ${siap ? 'aktif' : 'belum lengkap'} · Telegram ${sapa ? 'pesan sapa terkirim' : 'belum terbukti terkirim'} · scan ${w.alerts?.scanned ?? 0} koin · meja paper lama tidak membuka posisi baru · ${siklus ? 'siklus segar' : 'siklus belum segar'}`,
    };

    const demo = await ukur(`${WORKER}/health/testnet`);
    const t = demo?.json as { ok?: boolean; configured?: boolean; authenticated?: boolean; oneWay?: boolean; enabled?: boolean; reason?: string } | undefined;
    hasil[7] = {
      nama: 'Binance Demo / Live', status: t?.ok ? 'ok' : 'lambat',
      detail: t?.ok ? `Kunci Demo terverifikasi baca-saja · akun One-way · order Demo ${t.enabled ? 'diizinkan jika pemilik login & setujui' : 'masih terkunci'} · LIVE ASLI TERKUNCI`
        : `Demo ${t?.configured ? 'terkonfigurasi tapi belum lolos cek akun' : 'belum dikonfigurasi'} · ${t?.reason ?? 'diagnostik tidak tersedia'} · LIVE ASLI TERKUNCI`,
    };

    setItems(hasil);
    setDiuji(false);
  }, []);

  useEffect(() => { void jalankan(); }, [jalankan]);

  const semuaOk = items.length > 0 && items.every((i) => i.status === 'ok');

  return (
    <div className="hp-page">
      <HpHeader tag="DIAGNOSTIK" back />
      <p className="hp-eyebrow">CEK SISTEM <b>·</b> BUKTI HIDUP</p>
      <h1 className="hp-heading">Semua terhubung?</h1>
      <p className="hp-lede">Status layanan dibaca langsung. Halaman ini tidak mengirim order atau mengubah mesin.</p>
      <button type="button" className="hp-link hp-refresh" onClick={() => void jalankan()} disabled={diuji}>{diuji ? '⏳ Memeriksa…' : '↻ Periksa ulang'}</button>

      <div className="hp-card hp-system-summary" style={{ borderLeft: `4px solid ${semuaOk ? WARNA.greenDark : '#bd8b38'}` }}>
        <span aria-hidden="true" className="hp-system-icon">{diuji ? '◌' : semuaOk ? '✓' : '!'}</span>
        <div><b>{diuji ? 'Sedang memeriksa…' : semuaOk ? 'Semua sistem jalan' : 'Ada yang perlu dilihat'}</b><p>{diuji ? 'Mengambil status terbaru.' : semuaOk ? 'Seluruh pemeriksaan berhasil.' : 'Baca tiap baris untuk menemukan sumber masalah.'}</p></div>
      </div>

      {items.map((item) => (
        <div key={item.nama} className="hp-card hp-check" style={{ borderLeft: `3px solid ${WARNA_S[item.status]}` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span>{EMOJI[item.status]}</span>
            <b style={{ fontSize: 13 }}>{item.nama}</b>
          </div>
          <div style={{ fontSize: 11, color: WARNA.muted, marginTop: 3, lineHeight: 1.5 }}>{item.detail}</div>
        </div>
      ))}

      <div style={{ fontSize: 11, color: WARNA.muted, lineHeight: 1.6, textAlign: 'center', margin: '4px 0 10px' }}>
        Pemeriksaan hanya MEMBACA. Kalau ada ❌: Supabase/Worker padam → cek Railway & Vercel;
        kalau semua ✅ tapi notif tak muncul → cek variabel PMB_NOTIF=1 di Railway.
        <br /><Link href="/hp" style={{ color: WARNA.greenDark, fontWeight: 700 }}>← kembali ke Mode HP</Link>
      </div>
    </div>
  );
}
