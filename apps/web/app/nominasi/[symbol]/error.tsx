'use client';

/** Layar ramah saat halaman gagal dimuat. */
export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div style={{ minHeight: '60vh', display: 'grid', placeItems: 'center', padding: 24 }}>
      <div style={{ maxWidth: 380, textAlign: 'center', background: '#fff', border: '1px solid #e2ece5', borderRadius: 16, padding: '22px 20px' }}>
        <div style={{ fontSize: 30 }}>🛠️</div>
        <b style={{ display: 'block', marginTop: 6, fontSize: 16 }}>Halaman sempat tersandung</b>
        <p style={{ color: 'var(--muted)', fontSize: 13, lineHeight: 1.6, margin: '8px 0 0' }}>
          Biasanya karena versi baru baru saja dipasang atau sinyal putus sesaat. Tekan lagi — tidak ada yang rusak permanen.
        </p>
        <button
          onClick={reset}
          className="control-btn"
          style={{ marginTop: 14, fontWeight: 800, background: 'var(--green-dark)', color: 'white', borderColor: 'var(--green-dark)' }}
        >
          ↻ COBA LAGI
        </button>
      </div>
    </div>
  );
}
