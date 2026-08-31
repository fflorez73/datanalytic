import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { SignOutButton } from '@/components/sign-out-button';
import { CreateCompanyForm } from './_components/create-company-form';
import { ToggleCompanyButton } from './_components/toggle-company-button';
import { CreateAnalysisForm } from './_components/create-analysis-form';
import { AnalysisRowActions } from './_components/analysis-row-actions';

const SIZE_LABELS: Record<string, string> = {
  micro: 'Micro',
  pequena: 'Pequeña',
  mediana: 'Mediana',
  grande: 'Grande',
  corporativa: 'Corporativa',
};

export default async function SuperAdminDashboardPage() {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  // Lecturas con service_role — esta ruta ya está protegida por rol en middleware.ts
  const admin = createAdminClient();

  const { data: companies } = await admin
    .from('companies')
    .select('id, name, nit, size, active, created_at')
    .order('created_at', { ascending: false });

  const { data: analysisTypes } = await admin
    .from('analysis_types')
    .select('id, name')
    .order('name');

  const { data: analyses } = await admin
    .from('analyses')
    .select('id, title, status, period_start, period_end, company_id, companies(name)')
    .is('deleted_at', null)
    .order('created_at', { ascending: false });

  return (
    <main className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div>
            <h1 className="text-lg font-semibold text-slate-900">Datanalytic — Super Admin</h1>
            <p className="text-sm text-slate-500">{user.email}</p>
          </div>
          <SignOutButton />
        </div>
      </header>

      <div className="mx-auto max-w-6xl space-y-8 px-6 py-8">
        {/* ── Crear empresa ── */}
        <section className="rounded-lg border border-slate-200 bg-white p-6">
          <h2 className="mb-4 text-base font-semibold text-slate-900">Crear empresa</h2>
          <CreateCompanyForm />
        </section>

        {/* ── Listado de empresas ── */}
        <section className="rounded-lg border border-slate-200 bg-white p-6">
          <h2 className="mb-4 text-base font-semibold text-slate-900">Empresas</h2>

          {companies && companies.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-xs uppercase text-slate-500">
                    <th className="py-2 pr-4">Nombre</th>
                    <th className="py-2 pr-4">NIT</th>
                    <th className="py-2 pr-4">Tamaño</th>
                    <th className="py-2 pr-4">Estado</th>
                    <th className="py-2 pr-4">Creada</th>
                    <th className="py-2 pr-4" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {companies.map((c) => (
                    <tr key={c.id}>
                      <td className="py-2 pr-4">
                        <Link
                          href={`/admin/dashboard/companies/${c.id}`}
                          className="font-medium text-slate-900 hover:underline"
                        >
                          {c.name}
                        </Link>
                      </td>
                      <td className="py-2 pr-4 text-slate-600">{c.nit || '—'}</td>
                      <td className="py-2 pr-4 text-slate-600">{SIZE_LABELS[c.size] || c.size}</td>
                      <td className="py-2 pr-4">
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                            c.active ? 'bg-green-50 text-green-700' : 'bg-slate-100 text-slate-500'
                          }`}
                        >
                          {c.active ? 'Activa' : 'Inactiva'}
                        </span>
                      </td>
                      <td className="py-2 pr-4 text-slate-400">
                        {new Date(c.created_at).toLocaleDateString()}
                      </td>
                      <td className="py-2 pr-4">
                        <ToggleCompanyButton companyId={c.id} active={c.active} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-slate-400">Aún no hay empresas registradas.</p>
          )}
        </section>

        {/* ── Crear análisis ── */}
        <section className="rounded-lg border border-slate-200 bg-white p-6">
          <h2 className="mb-4 text-base font-semibold text-slate-900">Crear análisis</h2>
          {(!analysisTypes || analysisTypes.length === 0) && (
            <p className="mb-3 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-700">
              No hay tipos de análisis en analytics.analysis_types — agrega al menos uno desde SQL
              para poder crear análisis.
            </p>
          )}
          <CreateAnalysisForm
            companies={(companies || []).map((c) => ({ id: c.id, name: c.name }))}
            analysisTypes={analysisTypes || []}
          />
        </section>

        {/* ── Listado de análisis ── */}
        <section className="rounded-lg border border-slate-200 bg-white p-6">
          <h2 className="mb-4 text-base font-semibold text-slate-900">Análisis</h2>

          {analyses && analyses.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-xs uppercase text-slate-500">
                    <th className="py-2 pr-4">Empresa</th>
                    <th className="py-2 pr-4">Título</th>
                    <th className="py-2 pr-4">Período</th>
                    <th className="py-2 pr-4">Estado</th>
                    <th className="py-2 pr-4" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {analyses.map((a: any) => (
                    <tr key={a.id}>
                      <td className="py-2 pr-4 text-slate-800">{a.companies?.name || '—'}</td>
                      <td className="py-2 pr-4 text-slate-800">{a.title}</td>
                      <td className="py-2 pr-4 text-slate-500">
                        {a.period_start} — {a.period_end}
                      </td>
                      <td className="py-2 pr-4">
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                            a.status === 'published'
                              ? 'bg-green-50 text-green-700'
                              : 'bg-amber-50 text-amber-700'
                          }`}
                        >
                          {a.status === 'published' ? 'Publicado' : 'Borrador'}
                        </span>
                      </td>
                      <td className="py-2 pr-4">
                        <AnalysisRowActions analysisId={a.id} companyId={a.company_id} status={a.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-slate-400">Aún no hay análisis creados.</p>
          )}
        </section>
      </div>
    </main>
  );
}
