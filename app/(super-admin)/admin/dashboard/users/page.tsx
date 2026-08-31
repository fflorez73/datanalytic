import Link from 'next/link';
import { createAdminClient } from '@/lib/supabase/admin';

export default async function UsersPage() {
  const admin = createAdminClient();

  const { data: users } = await admin
    .from('profiles')
    .select('id, email, full_name, role, company_id, created_at, companies(name)')
    .order('created_at', { ascending: false });

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Usuarios</h1>
        <p className="text-sm text-slate-500">
          Todos los usuarios del sistema. Para crear uno nuevo entra al detalle de la empresa
          correspondiente.
        </p>
      </div>

      <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        {users && users.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                  <th className="py-3 pr-6">Nombre</th>
                  <th className="py-3 pr-6">Correo</th>
                  <th className="py-3 pr-6">Empresa</th>
                  <th className="py-3 pr-6">Rol</th>
                  <th className="py-3 pr-6">Creado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {users.map((u: any) => (
                  <tr key={u.id}>
                    <td className="py-3 pr-6 text-slate-800">{u.full_name || '—'}</td>
                    <td className="py-3 pr-6 text-slate-600">{u.email}</td>
                    <td className="py-3 pr-6 text-slate-600">
                      {u.company_id ? (
                        <Link
                          href={`/admin/dashboard/companies/${u.company_id}`}
                          className="hover:underline"
                        >
                          {u.companies?.name || '—'}
                        </Link>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="py-3 pr-6">
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                          u.role === 'super_admin'
                            ? 'bg-purple-50 text-purple-700'
                            : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        {u.role}
                      </span>
                    </td>
                    <td className="py-3 pr-6 text-slate-400">
                      {new Date(u.created_at).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-slate-400">Aún no hay usuarios registrados.</p>
        )}
      </section>
    </div>
  );
}
