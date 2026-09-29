'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import HpHeader from '../HpHeader';
import { fmt } from '../bahan';

type Ticket = { symbol: string; side: 'LONG' | 'SHORT'; setupKey: string; expiresAt: string;
  entry: number; stop: number; target: number; qty: number; riskUsdt: number };

type SessionState = { loading: boolean; configured: boolean; loggedIn: boolean };

export default function ApprovalClient({ symbol: rawSymbol, side: rawSide }: { symbol: string; side: string }) {
  const symbol = rawSymbol.toUpperCase();
  const side = rawSide === 'SHORT' ? 'SHORT' : rawSide === 'LONG' ? 'LONG' : '';
  const [session, setSession] = useState<SessionState>({ loading: true, configured: false, loggedIn: false });
  const [password, setPassword] = useState('');
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [executionEnabled, setExecutionEnabled] = useState(false);
  const [confirm, setConfirm] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');

  const refreshSession = async () => {
    try {
      const r = await fetch('/api/auth/session', { cache: 'no-store' });
      const body = await r.json() as { configured: boolean; operator: { id: string } | null };
      setSession({ loading: false, configured: body.configured, loggedIn: Boolean(body.operator) });
    } catch {
      setSession({ loading: false, configured: false, loggedIn: false });
    }
  };

  useEffect(() => { void refreshSession(); }, []);

  const login = async () => {
    if (!password) return;
    setBusy(true); setStatus('');
    try {
      const r = await fetch('/api/auth/login', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const body = await r.json() as { ok: boolean; error?: string };
      if (!body.ok) throw new Error(body.error ?? 'Login gagal.');
      setPassword('');
      await refreshSession();
      setStatus('Login berhasil. Anda dapat memeriksa tiket.');
    } catch (e) { setStatus(e instanceof Error ? e.message : 'Login gagal.'); }
    setBusy(false);
  };

  const logout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' }).catch(() => undefined);
    setTicket(null);
    await refreshSession();
  };

  const preview = async () => {
    if (!side) return;
    setBusy(true); setStatus(''); setTicket(null);
    try {
      const r = await fetch(`/api/meja/preview?symbol=${encodeURIComponent(symbol)}&side=${side}`, { cache: 'no-store' });
      const body = await r.json() as { ok: boolean; error?: string; ticket?: Ticket; executionEnabled?: boolean };
      if (!body.ok || !body.ticket) throw new Error(body.error ?? 'Tiket tidak siap.');
      setTicket(body.ticket); setExecutionEnabled(Boolean(body.executionEnabled));
      setStatus(body.executionEnabled ? 'Tiket terverifikasi. Periksa setiap angka; konfirmasi hanya untuk Demo.' : 'Tiket valid, tetapi eksekusi Demo masih terkunci di server.');
    } catch (e) { setStatus(e instanceof Error ? e.message : 'Gagal memeriksa tiket.'); }
    setBusy(false);
  };

  const approve = async () => {
    if (!ticket || confirm !== `DEMO ${symbol} ${side}` || !agreed || !executionEnabled) return;
    setBusy(true); setStatus('Mengirim satu persetujuan; jangan tutup layar atau menekan lagi…');
    const oldKey = ticket.setupKey;
    setTicket(null); // never allow repeat even on an ambiguous response
    try {
      const r = await fetch('/api/meja/demo', {
        method: 'POST', headers: { 'content-type': 'application/json' },
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
    <div className="hp-card hp-notice"><b>TESTNET (uang virtual) dahulu.</b><p>Order Binance Futures asli terkunci di kode. Tiket harus segar; server membaca ulang pertarungan transaksi Futures, X 0,705 → C1 → close C2 dan harga terbaru saat Anda menekan konfirmasi.</p></div>
    {session.loading ? <div className="hp-card">Memeriksa sesi operator…</div>
      : !session.configured ? <div className="hp-error">Login operator belum dikonfigurasi. Tidak ada order yang dapat dikirim.</div>
      : !session.loggedIn ? (
      <div className="hp-card hp-guide" style={{ display: 'grid', gap: 10 }}>
        <b>Login operator</b>
        <p className="hp-lede" style={{ margin: 0 }}>Masukkan kata sandi operator yang dikonfigurasi di server. Sesi disimpan aman di cookie httpOnly dan kedaluwarsa setelah 12 jam.</p>
        <input type="password" autoComplete="current-password" placeholder="Kata sandi operator" value={password}
          onChange={e => setPassword(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') void login(); }}
          className="hp-input" />
        <button type="button" className="hp-install-button" disabled={busy || !password} onClick={() => void login()}>Masuk</button>
      </div>
    ) : (
      <>
        <button type="button" className="hp-back" onClick={() => { void logout(); }}>Keluar dari akun operator</button>
        <div className="hp-card hp-guide"><b>{symbol || 'Belum ada simbol'} · {side || 'Belum ada arah'}</b><p className="hp-lede">Pratinjau hanya menerima tiket Chris Crypto dari data Futures segar; tidak membaca rumus MA lama.</p>
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
