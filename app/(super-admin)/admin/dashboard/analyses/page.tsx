import Link from 'next/link';
import { getSelectedCompany } from '@/lib/company-context';
import { createAdminClient } from '@/lib/supabase/admin';
import { CreateAnalysisForm } from '../_components/create-analysis-form';
import { AnalysisRowActions } from '../_components/analysis-row-actions';

export default async function AnalysesPage() {
  const company = await getSelectedCompany();

  if (!company) {
    return (
      <div>
        <div className="mb-6">
          <h1 className="text-xl font-semibold text-slate-900">Análisis</h1>
          <p className="text-sm text-slate-500">Crea, publica y administra los análisis por empresa.</p>
        </div>
        <div className="rounded-lg border border-dashed border-slate-300 bg-white p-10 text-center shadow-sm">
          <p className="text-sm text-slate-500">
            Selecciona una empresa en el panel izquierdo para ver y crear sus análisis.
          </p>
        </div>
      </div>
    );
  }

  const admin = createAdminClient();

  const { data: analysisTypes } = await admin.from('analysis_types').select('id, name').order('name');
  const { data: analyses } = await admin
    .from('analyses')
    .select('id, title, status, period_start, period_end')
    .eq('company_id', company.id)
    .is('deleted_at', null)
    .order('created_at', { ascending: false });

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Análisis</h1>
        <p className="text-sm text-slate-500">
          Viendo: <span className="font-medium text-slate-700">{company.name}</span>
        </p>
      </div>

      <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-base font-semibold text-slate-900">Crear análisis</h2>
        {(!analysisTypes || analysisTypes.length === 0) && (
          <p className="mb-3 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-700">
            No hay tipos de análisis en analytics.analysis_types — agrega al menos uno desde SQL
            para poder crear análisis.
          </p>
        )}
        <CreateAnalysisForm companyId={company.id} analysisTypes={analysisTypes || []} />
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-base font-semibold text-slate-900">Listado</h2>

        {analyses && analyses.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                  <th className="py-3 pr-6">Título</th>
                  <th className="py-3 pr-6">Período</th>
                  <th className="py-3 pr-6">Estado</th>
                  <th className="py-3 pr-6" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {analyses.map((a) => (
                  <tr key={a.id}>
                    <td className="py-3 pr-6 text-slate-800">{a.title}</td>
                    <td className="py-3 pr-6 text-slate-500">
                      {a.period_start} — {a.period_end}
                    </td>
                    <td className="py-3 pr-6">
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                          a.status === 'published'
                            ? 'bg-green-50 text-green-700'
                            : 'bg-amber-50 text-amber-700'
                        }`}
                      >
                        {a.status === 'published' ? 'Publicado' : 'Borrador'}
                      </span>
                    </td>
                    <td className="py-3 pr-6">
                      <div className="flex items-center gap-3">
                        <Link
                          href={`/admin/dashboard/analyses/${a.id}`}
                          className="text-xs font-medium text-slate-600 hover:underline"
                        >
                          Ver detalle
                        </Link>
                        <AnalysisRowActions analysisId={a.id} companyId={company.id} status={a.status} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-slate-400">Aún no hay análisis para esta empresa.</p>
        )}
      </section>
    </div>
  );
}
