import ApprovalClient from './ApprovalClient';

export const dynamic = 'force-dynamic';

export default async function ApprovalPage({ searchParams }: { searchParams: Promise<{ symbol?: string; side?: string }> }) {
  const params = await searchParams;
  return <ApprovalClient symbol={params.symbol ?? ''} side={params.side ?? ''} />;
}
