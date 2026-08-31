import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { SignOutButton } from '@/components/sign-out-button';

export default async function SuperAdminDashboardPage() {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  // La tabla analytics.companies aún no existe — se maneja de forma tolerante
  // hasta que se implemente el motor de análisis.
  const { data: companies } = await supabase
    .from('companies')
    .select('id, name, created_at')
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
        {/* ── Empresas ── */}
        <section className="rounded-lg border border-slate-200 bg-white p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-base font-semibold text-slate-900">Empresas</h2>
            <button className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800">
              + Crear empresa
            </button>
          </div>

          {companies && companies.length > 0 ? (
            <ul className="divide-y divide-slate-100">
              {companies.map((c) => (
                <li key={c.id} className="flex items-center justify-between py-2 text-sm">
                  <span className="text-slate-800">{c.name}</span>
                  <span className="text-slate-400">
                    {new Date(c.created_at).toLocaleDateString()}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-slate-400">
              Aún no hay empresas registradas.
            </p>
          )}
        </section>

        {/* ── Usuarios por empresa ── */}
        <section className="rounded-lg border border-slate-200 bg-white p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-base font-semibold text-slate-900">Usuarios</h2>
            <button className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800">
              + Crear usuario
            </button>
          </div>
          <p className="text-sm text-slate-400">
            Selecciona una empresa para ver y crear sus usuarios.
          </p>
        </section>

        {/* ── Análisis ── */}
        <section className="rounded-lg border border-slate-200 bg-white p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-base font-semibold text-slate-900">Análisis</h2>
            <button className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800">
              + Crear análisis
            </button>
          </div>
          <p className="text-sm text-slate-400">
            El motor de análisis y publicación se implementará más adelante.
          </p>
        </section>
      </div>
    </main>
  );
}
