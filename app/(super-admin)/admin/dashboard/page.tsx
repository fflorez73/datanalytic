import { createAdminClient } from '@/lib/supabase/admin';

export default async function SuperAdminOverviewPage() {
  const admin = createAdminClient();

  const [{ count: activeCompanies }, { count: publishedAnalyses }, { count: draftAnalyses }] =
    await Promise.all([
      admin.from('companies').select('*', { count: 'exact', head: true }).eq('active', true),
      admin
        .from('analyses')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'published')
        .is('deleted_at', null),
      admin
        .from('analyses')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'draft')
        .is('deleted_at', null),
    ]);

  const stats = [
    { label: 'Empresas activas', value: activeCompanies ?? 0 },
    { label: 'Análisis publicados', value: publishedAnalyses ?? 0 },
    { label: 'Análisis en borrador', value: draftAnalyses ?? 0 },
  ];

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-slate-900">Resumen</h1>
        <p className="text-sm text-slate-500">Vista general de Datanalytic.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {stats.map((s) => (
          <div key={s.label} className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
            <p className="text-sm text-slate-500">{s.label}</p>
            <p className="mt-2 text-3xl font-semibold text-slate-900">{s.value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
