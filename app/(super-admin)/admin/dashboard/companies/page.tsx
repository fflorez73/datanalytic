import Link from 'next/link';
import { createAdminClient } from '@/lib/supabase/admin';
import { CreateCompanyForm } from '../_components/create-company-form';
import { ToggleCompanyButton } from '../_components/toggle-company-button';

const SIZE_LABELS: Record<string, string> = {
  micro: 'Micro',
  pequena: 'Pequeña',
  mediana: 'Mediana',
  grande: 'Grande',
  corporativa: 'Corporativa',
};

export default async function CompaniesPage() {
  const admin = createAdminClient();

  const { data: companies } = await admin
    .from('companies')
    .select('id, name, nit, size, active, created_at')
    .order('created_at', { ascending: false });

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Empresas</h1>
        <p className="text-sm text-slate-500">Crea y administra las empresas del sistema.</p>
      </div>

      <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-base font-semibold text-slate-900">Crear empresa</h2>
        <CreateCompanyForm />
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-base font-semibold text-slate-900">Listado</h2>

        {companies && companies.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                  <th className="py-3 pr-6">Nombre</th>
                  <th className="py-3 pr-6">NIT</th>
                  <th className="py-3 pr-6">Tamaño</th>
                  <th className="py-3 pr-6">Estado</th>
                  <th className="py-3 pr-6">Creada</th>
                  <th className="py-3 pr-6" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {companies.map((c) => (
                  <tr key={c.id}>
                    <td className="py-3 pr-6">
                      <Link
                        href={`/admin/dashboard/companies/${c.id}`}
                        className="font-medium text-slate-900 hover:underline"
                      >
                        {c.name}
                      </Link>
                    </td>
                    <td className="py-3 pr-6 text-slate-600">{c.nit || '—'}</td>
                    <td className="py-3 pr-6 text-slate-600">{SIZE_LABELS[c.size] || c.size}</td>
                    <td className="py-3 pr-6">
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                          c.active ? 'bg-green-50 text-green-700' : 'bg-slate-100 text-slate-500'
                        }`}
                      >
                        {c.active ? 'Activa' : 'Inactiva'}
                      </span>
                    </td>
                    <td className="py-3 pr-6 text-slate-400">
                      {new Date(c.created_at).toLocaleDateString()}
                    </td>
                    <td className="py-3 pr-6">
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
    </div>
  );
}
