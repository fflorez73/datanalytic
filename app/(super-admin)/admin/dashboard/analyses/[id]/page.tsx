import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/admin';
import { AnalysisDetail } from '@/components/analysis-detail';

export default async function AdminAnalysisDetailPage({ params }: { params: { id: string } }) {
  const admin = createAdminClient();

  const { data: analysis } = await admin
    .from('analyses')
    .select(
      'id, title, status, period_start, period_end, results, company_id, companies(name), analysis_types(name)'
    )
    .eq('id', params.id)
    .is('deleted_at', null)
    .single();

  if (!analysis) notFound();

  const companyName = (analysis as any).companies?.name || '—';
  const analysisTypeName = (analysis as any).analysis_types?.name || '—';

  return (
    <div className="space-y-6">
      <Link href="/admin/dashboard/analyses" className="text-xs text-slate-400 hover:underline">
        ← Volver a análisis
      </Link>

      <AnalysisDetail
        title={analysis.title}
        companyName={companyName}
        periodStart={analysis.period_start}
        periodEnd={analysis.period_end}
        analysisTypeName={analysisTypeName}
        status={analysis.status}
        results={analysis.results}
      />
    </div>
  );
}
