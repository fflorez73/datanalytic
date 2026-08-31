import Link from 'next/link';
import { getSelectedCompany } from '@/lib/company-context';
import { createAdminClient } from '@/lib/supabase/admin';

export default async function UsersPage() {
  const company = await getSelectedCompany();

  if (!company) {
    return (
      <div>
        <div className="mb-6">
          <h1 className="text-xl font-semibold text-slate-900">Usuarios</h1>
          <p className="text-sm text-slate-500">Usuarios del sistema, por empresa.</p>
        </div>
        <div className="rounded-lg border border-dashed border-slate-300 bg-white p-10 text-center shadow-sm">
          <p className="text-sm text-slate-500">
            Selecciona una empresa en el panel izquierdo para ver sus usuarios.
          </p>
        </div>
      </div>
    );
  }

  const admin = createAdminClient();

  const { data: users } = await admin
    .from('profiles')
    .select('id, email, full_name, role, created_at')
    .eq('company_id', company.id)
    .order('created_at', { ascending: false });

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Usuarios</h1>
          <p className="text-sm text-slate-500">
            Viendo: <span className="font-medium text-slate-700">{company.name}</span>
          </p>
        </div>
        <Link
          href={`/admin/dashboard/companies/${company.id}`}
          className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-slate-800"
        >
          + Crear usuario
        </Link>
      </div>

      <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        {users && users.length > 0 ? (
          <ul className="divide-y divide-slate-100">
            {users.map((u) => (
              <li key={u.id} className="flex items-center justify-between py-3 text-sm">
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
  );
}
