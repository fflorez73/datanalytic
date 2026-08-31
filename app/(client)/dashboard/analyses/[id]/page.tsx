import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { SignOutButton } from '@/components/sign-out-button';
import { AnalysisDetail } from '@/components/analysis-detail';
import { fetchAnalysisHistory } from '@/lib/analysis-history';

export default async function ClientAnalysisDetailPage({ params }: { params: { id: string } }) {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('company_id')
    .eq('id', user.id)
    .single();

  if (!profile?.company_id) notFound();

  const { data: analysis } = await supabase
    .from('analyses')
    .select(
      'id, title, status, period_start, period_end, results, narrative, company_id, analysis_type_id, companies(name), analysis_types(name)'
    )
    .eq('id', params.id)
    .eq('company_id', profile.company_id)
    .eq('status', 'published')
    .is('deleted_at', null)
    .single();

  if (!analysis) notFound();

  const companyName = (analysis as any).companies?.name || '—';
  const analysisTypeName = (analysis as any).analysis_types?.name || '—';

  const others = await fetchAnalysisHistory(supabase, {
    companyId: analysis.company_id,
    analysisTypeId: analysis.analysis_type_id,
    excludeId: analysis.id,
  });

  const history =
    others.length > 0
      ? [...others, { periodLabel: analysis.period_end, results: analysis.results }].sort((a, b) =>
          a.periodLabel < b.periodLabel ? -1 : 1
        )
      : undefined;

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

        <AnalysisDetail
          id={analysis.id}
          title={analysis.title}
          companyName={companyName}
          periodStart={analysis.period_start}
          periodEnd={analysis.period_end}
          analysisTypeName={analysisTypeName}
          status={analysis.status}
          results={analysis.results}
          narrative={analysis.narrative}
          history={history}
        />
      </div>
    </main>
  );
}
