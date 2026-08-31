import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { SignOutButton } from '@/components/sign-out-button';
import { ToggleCompanyButton } from '../../_components/toggle-company-button';
import { CreateUserForm } from '../../_components/create-user-form';

const SIZE_LABELS: Record<string, string> = {
  micro: 'Micro',
  pequena: 'Pequeña',
  mediana: 'Mediana',
  grande: 'Grande',
  corporativa: 'Corporativa',
};

export default async function CompanyDetailPage({ params }: { params: { id: string } }) {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const admin = createAdminClient();

  const { data: company } = await admin
    .from('companies')
    .select('id, name, nit, sector, size, active, created_at')
    .eq('id', params.id)
    .single();

  if (!company) notFound();

  const { data: users } = await admin
    .from('profiles')
    .select('id, email, full_name, role, created_at')
    .eq('company_id', params.id)
    .order('created_at', { ascending: false });

  return (
    <main className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div>
            <Link href="/admin/dashboard" className="text-xs text-slate-400 hover:underline">
              ← Volver
            </Link>
            <h1 className="text-lg font-semibold text-slate-900">{company.name}</h1>
          </div>
          <SignOutButton />
        </div>
      </header>

      <div className="mx-auto max-w-6xl space-y-8 px-6 py-8">
        {/* ── Datos de la empresa ── */}
        <section className="rounded-lg border border-slate-200 bg-white p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-base font-semibold text-slate-900">Datos de la empresa</h2>
            <ToggleCompanyButton companyId={company.id} active={company.active} />
          </div>
          <dl className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
            <div>
              <dt className="text-xs uppercase text-slate-400">NIT</dt>
              <dd className="text-slate-800">{company.nit || '—'}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase text-slate-400">Sector</dt>
              <dd className="text-slate-800">{company.sector || '—'}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase text-slate-400">Tamaño</dt>
              <dd className="text-slate-800">{SIZE_LABELS[company.size] || company.size}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase text-slate-400">Estado</dt>
              <dd className="text-slate-800">{company.active ? 'Activa' : 'Inactiva'}</dd>
            </div>
          </dl>
        </section>

        {/* ── Crear usuario ── */}
        <section className="rounded-lg border border-slate-200 bg-white p-6">
          <h2 className="mb-4 text-base font-semibold text-slate-900">Crear usuario</h2>
          <CreateUserForm companyId={company.id} />
        </section>

        {/* ── Listado de usuarios ── */}
        <section className="rounded-lg border border-slate-200 bg-white p-6">
          <h2 className="mb-4 text-base font-semibold text-slate-900">Usuarios</h2>

          {users && users.length > 0 ? (
            <ul className="divide-y divide-slate-100">
              {users.map((u) => (
                <li key={u.id} className="flex items-center justify-between py-2 text-sm">
                  <div>
                    <p className="text-slate-800">{u.full_name || '—'}</p>
                    <p className="text-slate-400">{u.email}</p>
                  </div>
                  <span className="text-xs text-slate-400">{u.role}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-slate-400">Aún no hay usuarios para esta empresa.</p>
          )}
        </section>
      </div>
    </main>
  );
}
