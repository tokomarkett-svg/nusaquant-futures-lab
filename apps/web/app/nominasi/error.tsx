'use client';

/** Layar ramah saat halaman papan gagal dimuat — bukan layar crash gelap lagi. */
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div style={{ minHeight: '60vh', display: 'grid', placeItems: 'center', padding: 24 }}>
      <div style={{ maxWidth: 380, textAlign: 'center', background: '#fff', border: '1px solid #e2ece5', borderRadius: 16, padding: '22px 20px' }}>
        <div style={{ fontSize: 30 }}>🛠️</div>
        <b style={{ display: 'block', marginTop: 6, fontSize: 16 }}>Papan sempat tersandung</b>
        <p style={{ color: 'var(--muted)', fontSize: 13, lineHeight: 1.6, margin: '8px 0 0' }}>
          Biasanya karena versi baru baru saja dipasang atau sinyal putus sesaat.
          Tarik napas, tekan tombolnya lagi — data diambil ulang dari Binance, tidak ada yang rusak permanen.
        </p>
        <button
          onClick={reset}
          className="control-btn"
          style={{ marginTop: 14, fontWeight: 800, background: 'var(--green-dark)', color: 'white', borderColor: 'var(--green-dark)' }}
        >
          ↻ COBA LAGI
        </button>
        <div style={{ marginTop: 10, color: 'var(--muted)', fontSize: 11 }}>
          Kalau berkali-kali gagal: tarik-to-refresh halaman, atau tunggu 1 menit lalu buka lagi.{error.digest ? ` (kode ${error.digest.slice(0, 8)})` : ''}
        </div>
      </div>
    </div>
  );
}
