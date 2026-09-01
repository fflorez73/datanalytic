import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { SignOutButton } from '@/components/sign-out-button';
import { CombinedAnalysisDetail, type CombinedSource } from '@/components/combined-analysis-detail';
import { getModuleFamily } from '@/lib/comparison-indicators';

export default async function ClientCombinedAnalysisDetailPage({ params }: { params: { id: string } }) {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const { data: profile } = await supabase.from('profiles').select('company_id').eq('id', user.id).single();

  if (!profile?.company_id) notFound();

  const { data: combined } = await supabase
    .from('combined_analyses')
    .select(
      'id, title, status, narrative, company_id, companies(name), combined_analysis_sources(analysis_id, analyses(id, title, period_start, period_end, analysis_types(name, code)))'
    )
    .eq('id', params.id)
    .eq('company_id', profile.company_id)
    .eq('status', 'published')
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
    <main className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div>
            <h1 className="text-lg font-semibold text-slate-900">Datanalytic</h1>
            <p className="text-sm text-slate-500">{user.email}</p>
          </div>
          <SignOutButton />
        </div>
      </header>

      <div className="mx-auto max-w-6xl space-y-6 px-6 py-8">
        <Link href="/dashboard" className="text-xs text-slate-400 hover:underline">
          ← Volver
        </Link>

        <CombinedAnalysisDetail
          id={combined.id}
          title={combined.title}
          companyName={companyName}
          status={combined.status}
          narrative={combined.narrative as any}
          sources={sources}
          sourceHref={(analysisId) => `/dashboard/analyses/${analysisId}`}
          pdfEndpoint={`/api/combined-analyses/${combined.id}/pdf`}
        />
      </div>
    </main>
  );
}
