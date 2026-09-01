import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/admin';
import { CombinedAnalysisDetail, type CombinedSource } from '@/components/combined-analysis-detail';
import { getModuleFamily } from '@/lib/comparison-indicators';

export default async function AdminCombinedAnalysisDetailPage({ params }: { params: { id: string } }) {
  const admin = createAdminClient();

  const { data: combined } = await admin
    .from('combined_analyses')
    .select(
      'id, title, status, narrative, company_id, companies(name), combined_analysis_sources(analysis_id, analyses(id, title, period_start, period_end, analysis_types(name, code)))'
    )
    .eq('id', params.id)
    .is('deleted_at', null)
    .single();

  if (!combined) notFound();

  const companyName = (combined as any).companies?.name || '—';

  const sources: CombinedSource[] = ((combined as any).combined_analysis_sources ?? [])
    .map((s: any) => {
      const a = s.analyses;
      if (!a) return null;
      const code = a.analysis_types?.code ?? '';
      return {
        id: a.id,
        title: a.title,
        typeName: a.analysis_types?.name ?? 'Análisis',
        moduleFamily: getModuleFamily(code),
        periodStart: a.period_start,
        periodEnd: a.period_end,
      };
    })
    .filter((s: CombinedSource | null): s is CombinedSource => s !== null)
    .sort((a: CombinedSource, b: CombinedSource) => a.periodStart.localeCompare(b.periodStart));

  return (
    <div className="space-y-6">
      <Link href="/admin/dashboard/combined-analyses" className="text-xs text-slate-400 hover:underline">
        ← Volver a análisis combinado
      </Link>

      <CombinedAnalysisDetail
        id={combined.id}
        title={combined.title}
        companyName={companyName}
        status={combined.status}
        narrative={combined.narrative as any}
        sources={sources}
        sourceHref={(analysisId) => `/admin/dashboard/analyses/${analysisId}`}
        pdfEndpoint={`/api/combined-analyses/${combined.id}/pdf`}
      />
    </div>
  );
}
