import KoinHp from '../KoinHp';

export const metadata = { title: 'NusaQuant — Detail Koin (Mode HP)' };

/** Pembungkus server: ambil simbol dari rute, teruskan ke komponen klien. */
export default async function Page({ params }: { params: Promise<{ symbol: string }> }) {
  const { symbol } = await params;
  return <KoinHp symbol={symbol.toUpperCase()} />;
}
