import Link from 'next/link';
import { getSelectedCompany } from '@/lib/company-context';
import { createAdminClient } from '@/lib/supabase/admin';
import { CreateCombinedAnalysisForm, type PublishedAnalysisOption } from '../_components/create-combined-analysis-form';
import { CombinedAnalysisRowActions } from '../_components/combined-analysis-row-actions';

export default async function CombinedAnalysesPage() {
  const company = await getSelectedCompany();

  if (!company) {
    return (
      <div>
        <div className="mb-6">
          <h1 className="text-xl font-semibold text-slate-900">Análisis Combinado</h1>
          <p className="text-sm text-slate-500">Síntesis por IA de 2+ análisis ya publicados, buscando conexiones entre módulos.</p>
        </div>
        <div className="rounded-lg border border-dashed border-slate-300 bg-white p-10 text-center shadow-sm">
          <p className="text-sm text-slate-500">Selecciona una empresa en el panel izquierdo para ver y crear sus análisis combinados.</p>
        </div>
      </div>
    );
  }

  const admin = createAdminClient();

  const [{ data: publishedAnalyses }, { data: combinedAnalyses }] = await Promise.all([
    admin
      .from('analyses')
      .select('id, title, period_start, period_end, analysis_types(name)')
      .eq('company_id', company.id)
      .eq('status', 'published')
      .is('deleted_at', null)
      .order('period_end', { ascending: false }),
    admin
      .from('combined_analyses')
      .select('id, title, status, created_at, combined_analysis_sources(id)')
      .eq('company_id', company.id)
      .is('deleted_at', null)
      .order('created_at', { ascending: false }),
  ]);

  const publishedOptions: PublishedAnalysisOption[] = (publishedAnalyses ?? []).map((a: any) => ({
    id: a.id,
    title: a.title,
    typeName: a.analysis_types?.name ?? 'Análisis',
    periodStart: a.period_start,
    periodEnd: a.period_end,
  }));

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Análisis Combinado</h1>
        <p className="text-sm text-slate-500">
          Viendo: <span className="font-medium text-slate-700">{company.name}</span>
        </p>
        <p className="mt-1 text-xs text-slate-400">Síntesis por IA de 2+ análisis ya publicados (de cualquier tipo y período), buscando conexiones entre módulos.</p>
      </div>

      <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-base font-semibold text-slate-900">Generar Análisis Combinado</h2>
        <CreateCombinedAnalysisForm companyId={company.id} publishedAnalyses={publishedOptions} />
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-base font-semibold text-slate-900">Listado</h2>

        {combinedAnalyses && combinedAnalyses.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                  <th className="py-3 pr-6">Título</th>
                  <th className="py-3 pr-6">Fuentes</th>
                  <th className="py-3 pr-6">Estado</th>
                  <th className="py-3 pr-6" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {combinedAnalyses.map((c: any) => (
                  <tr key={c.id}>
                    <td className="py-3 pr-6 text-slate-800">{c.title}</td>
                    <td className="py-3 pr-6 text-slate-500">{c.combined_analysis_sources?.length ?? 0} análisis</td>
                    <td className="py-3 pr-6">
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                          c.status === 'published' ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700'
                        }`}
                      >
                        {c.status === 'published' ? 'Publicado' : 'Borrador'}
                      </span>
                    </td>
                    <td className="py-3 pr-6">
                      <div className="flex items-center gap-3">
                        <Link href={`/admin/dashboard/combined-analyses/${c.id}`} className="text-xs font-medium text-slate-600 hover:underline">
                          Ver detalle
                        </Link>
                        <CombinedAnalysisRowActions combinedAnalysisId={c.id} companyId={company.id} status={c.status} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-slate-400">Aún no hay análisis combinados para esta empresa.</p>
        )}
      </section>
    </div>
  );
}
