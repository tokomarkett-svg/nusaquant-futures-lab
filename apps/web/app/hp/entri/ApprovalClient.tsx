'use client';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import HpHeader from '../HpHeader';
import { fmt } from '../bahan';

type Ticket = { symbol: string; side: 'LONG' | 'SHORT'; setupKey: string; expiresAt: string;
  entry: number; stop: number; target: number; qty: number; riskUsdt: number };

export default function ApprovalClient({ symbol: rawSymbol, side: rawSide }: { symbol: string; side: string }) {
  const symbol = rawSymbol.toUpperCase();
  const side = rawSide === 'SHORT' ? 'SHORT' : rawSide === 'LONG' ? 'LONG' : '';
  const client = useMemo<SupabaseClient | null>(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    return url && key ? createClient(url, key) : null;
  }, []);
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [token, setToken] = useState<string | null>(null);
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [executionEnabled, setExecutionEnabled] = useState(false);
  const [confirm, setConfirm] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  useEffect(() => {
    if (!client) return;
    void client.auth.getSession().then(({ data }) => setToken(data.session?.access_token ?? null));
    const { data: { subscription } } = client.auth.onAuthStateChange((_event, session) => {
      setToken(session?.access_token ?? null);
      setTicket(null);
    });
    return () => subscription.unsubscribe();
  }, [client]);

  const sendCode = async () => {
    if (!client) return;
    setBusy(true); setStatus('');
    const { error } = await client.auth.signInWithOtp({ email: email.trim(), options: { shouldCreateUser: false } });
    setStatus(error ? `Gagal kirim kode: ${error.message}` : 'Kode login dikirim ke email operator yang terdaftar.');
    setBusy(false);
  };
  const verifyCode = async () => {
    if (!client) return;
    setBusy(true); setStatus('');
    const { error } = await client.auth.verifyOtp({ email: email.trim(), token: otp.trim(), type: 'email' });
    setStatus(error ? `Kode salah/kedaluwarsa: ${error.message}` : 'Login berhasil. Periksa tiket terbaru sebelum konfirmasi.');
    setBusy(false);
  };
  const preview = async () => {
    if (!token || !side) return;
    setBusy(true); setStatus(''); setTicket(null);
    try {
      const r = await fetch(`/api/meja/preview?symbol=${encodeURIComponent(symbol)}&side=${side}`, {
        headers: { authorization: `Bearer ${token}` }, cache: 'no-store',
      });
      const body = await r.json() as { ok: boolean; error?: string; ticket?: Ticket; executionEnabled?: boolean };
      if (!body.ok || !body.ticket) throw new Error(body.error ?? 'Tiket tidak siap.');
      setTicket(body.ticket); setExecutionEnabled(Boolean(body.executionEnabled));
      setStatus(body.executionEnabled ? 'Tiket terverifikasi. Periksa setiap angka; konfirmasi hanya untuk Demo.' : 'Tiket valid, tetapi eksekusi Demo masih terkunci di server.');
    } catch (e) { setStatus(e instanceof Error ? e.message : 'Gagal memeriksa tiket.'); }
    setBusy(false);
  };
  const approve = async () => {
    if (!token || !ticket || confirm !== `DEMO ${symbol} ${side}` || !agreed || !executionEnabled) return;
    setBusy(true); setStatus('Mengirim satu persetujuan; jangan tutup layar atau menekan lagi…');
    const oldKey = ticket.setupKey;
    setTicket(null); // never allow repeat even on an ambiguous response
    try {
      const r = await fetch('/api/meja/demo', {
        method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({ symbol, side, environment: 'TESTNET', setupKey: oldKey, confirm }),
      });
      const body = await r.json() as { ok: boolean; error?: string; position?: { entry: number; orders: string[] } };
      setStatus(body.ok ? `DEMO terverifikasi: entry ${body.position?.entry} dan SL/TP tercatat. Cek akun Binance Demo & Meja.`
        : body.error ?? 'Status tidak pasti; cek akun Demo. Jangan ulangi tiket ini.');
    } catch {
      setStatus('Respons tidak pasti. PERIKSA Binance Demo dan Meja; jangan ulangi order ini.');
    }
    setBusy(false); setConfirm(''); setAgreed(false);
  };

  return <div className="hp-page">
    <HpHeader tag="PERSETUJUAN MANUAL" back />
    <p className="hp-eyebrow">ORDER <b>·</b> TANGAN PEMILIK</p>
    <h1 className="hp-heading">Keputusan ada padamu.</h1>
    <p className="hp-lede">Alarm Telegram hanya pemberitahuan. Tidak ada order tanpa login dan konfirmasi Anda di halaman ini.</p>
    <div className="hp-card hp-notice"><b>TESTNET (uang virtual) dahulu.</b><p>Order Binance Futures asli terkunci di kode. Tiket harus segar; server menghitung ulang X → C1 → C2 dan gate saat Anda menekan konfirmasi.</p></div>
    {!client ? <div className="hp-error">Login Supabase belum dikonfigurasi. Tidak ada order yang dapat dikirim.</div> : !token ? (
      <div className="hp-card hp-guide" style={{ display: 'grid', gap: 10 }}>
        <b>Login email operator</b>
        <input type="email" autoComplete="email" placeholder="Email operator yang terdaftar" value={email} onChange={e => setEmail(e.target.value)} className="hp-input" />
        <button type="button" className="hp-install-button" disabled={busy || !email.trim()} onClick={() => void sendCode()}>Kirim kode masuk</button>
        <input type="text" inputMode="numeric" autoComplete="one-time-code" placeholder="Kode dari email" value={otp} onChange={e => setOtp(e.target.value)} className="hp-input" />
        <button type="button" className="hp-install-button" disabled={busy || !otp.trim()} onClick={() => void verifyCode()}>Verifikasi kode</button>
      </div>
    ) : (
      <>
        <button type="button" className="hp-back" onClick={() => { void client.auth.signOut(); setTicket(null); }}>Keluar dari akun operator</button>
        <div className="hp-card hp-guide"><b>{symbol || 'Belum ada simbol'} · {side || 'Belum ada arah'}</b><p className="hp-lede">Pratinjau selalu meminta data Futures baru; tidak menggunakan angka alarm lama.</p>
          <button type="button" className="hp-install-button" disabled={busy || !side || !symbol} onClick={() => void preview()}>Periksa tiket saat ini</button>
        </div>
        {ticket && <div className="hp-ticket" aria-label="Pratinjau tiket Demo">
          <div className="hp-ready">DEMO · BELUM ORDER</div>
          <h2>{ticket.symbol} · {ticket.side}</h2>
          <p>Rencana entry {fmt(ticket.entry)} · SL {fmt(ticket.stop)} · TP {fmt(ticket.target)}</p>
          <p>Ukuran {ticket.qty.toLocaleString('id-ID', { maximumFractionDigits: 5 })} koin · risiko rencana {ticket.riskUsdt} USDT</p>
          <p>Kedaluwarsa: {new Date(ticket.expiresAt).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })} WIB</p>
          {executionEnabled ? <>
            <label className="hp-confirm"><input type="checkbox" checked={agreed} onChange={e => setAgreed(e.target.checked)} /> Saya telah memeriksa simbol, arah, SL, TP, dan menerima bahwa ini order TESTNET.</label>
            <label className="hp-confirm">Ketik <b>DEMO {symbol} {side}</b> untuk mengonfirmasi:
              <input className="hp-input" value={confirm} onChange={e => setConfirm(e.target.value)} autoComplete="off" />
            </label>
            <button type="button" className="hp-cta" disabled={busy || !agreed || confirm !== `DEMO ${symbol} ${side}`} onClick={() => void approve()}>Setujui SATU order Demo →</button>
          </> : <div className="hp-ticket-warning">Eksekusi masih terkunci. Tidak ada order yang dapat dikirim.</div>}
        </div>}
      </>
    )}
    {status && <div className="hp-card hp-notice" role="status">{status}</div>}
    <div className="hp-link-grid"><Link className="hp-link" href="/hp">← Beranda</Link><Link className="hp-link" href="/hp/posisi">Lihat posisi paper</Link></div>
  </div>;
}
