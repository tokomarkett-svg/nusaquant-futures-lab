'use client';

/**
 * CEK SISTEM (mode HP) — satu layar untuk menjawab "apakah semuanya masih jalan?".
 * Diperiksa langsung dari HP pemilik:
 *  · Papan & harga (web API)      · Supabase (via meja & skor)
 *  · Worker Railway (health)      · Mesin PMB (pindai live papan-json + umur data)
 * Hanya MEMBACA — tidak menyentuh mesin, tidak menulis apa pun.
 */

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
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
    { nama: 'Mesin PMB (pindai live)', status: 'cek', detail: 'memindai…' },
  ]);
  const [diuji, setDiuji] = useState(false);

  const jalankan = useCallback(async () => {
    setDiuji(true);
    const hasil: Item[] = new Array(6);

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

    const worker = await ukur(`${WORKER}/health`);
    const w = worker?.json as { ok?: boolean; market?: string } | undefined;
    hasil[4] = w?.ok ? {
      nama: 'Worker Railway', status: 'ok',
      detail: `hidup · pasar ${w.market ?? '?'} · ${(worker!.ms / 1000).toFixed(1)} dtk`,
    } : { nama: 'Worker Railway', status: 'gagal', detail: 'tidak terjangkau dari HP ini' };

    const pmb = await ukur(`${WORKER}/data/papan-json`, 30000);
    const j = pmb?.json as { ok?: boolean; rows?: Array<{ symbol: string; siap: boolean; market?: string }>; market?: string; at?: string; error?: string } | undefined;
    const umurPmb = j?.at ? Math.round((Date.now() - new Date(j.at).getTime()) / 60_000) : null;
    hasil[5] = j?.ok ? {
      nama: 'Mesin PMB (pindai live)', status: 'ok',
      detail: `${j.rows?.length ?? 0} kandidat teratas · ${j.rows?.filter((r) => r.siap).length ?? 0} siap · pasar ${j.market ?? j.rows?.[0]?.market ?? '?'} · pindai ${umurPmb ?? '?'} mnt lalu`,
    } : {
      nama: 'Mesin PMB (pindai live)', status: worker?.json ? 'lambat' : 'gagal',
      detail: j?.error ?? 'pindai pasar sedang rate-limit/timeout; worker tetap hidup',
    };

    setItems(hasil);
    setDiuji(false);
  }, []);

  useEffect(() => { void jalankan(); }, [jalankan]);

  const semuaOk = items.every((i) => i.status === 'ok');

  return (
    <div style={{ padding: '10px 12px 0' }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '2px 2px 10px' }}>
        <Link href="/hp" style={{ textDecoration: 'none', color: WARNA.ink, fontSize: 18 }}>‹</Link>
        <b style={{ fontSize: 15 }}>Cek Sistem</b>
        <button onClick={() => void jalankan()} disabled={diuji} style={{ marginLeft: 'auto', border: '1px solid #cfe0d5', background: '#f6fbf7', color: WARNA.greenDark, fontWeight: 800, fontSize: 11, borderRadius: 999, padding: '5px 12px', cursor: 'pointer' }}>
          {diuji ? '⏳ memeriksa…' : '🔄 periksa ulang'}
        </button>
      </header>

      <div style={{
        background: semuaOk ? WARNA.mintSoft : '#fff6e2', border: `1px solid ${semuaOk ? '#bfe8d1' : '#ecd9a0'}`,
        borderRadius: 16, padding: '13px 14px', marginBottom: 10, textAlign: 'center',
      }}>
        <div style={{ fontSize: 24 }}>{semuaOk ? '🟢' : '🟡'}</div>
        <b style={{ fontSize: 13.5 }}>{semuaOk ? 'SEMUA SISTEM JALAN' : diuji ? 'sedang memeriksa…' : 'ADA YANG PERLU DILIHAT'}</b>
      </div>

      {items.map((item) => (
        <div key={item.nama} style={{ background: '#fff', border: '1px solid var(--line)', borderLeft: `3px solid ${WARNA_S[item.status]}`, borderRadius: 14, padding: '10px 12px', marginBottom: 8 }}>
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
