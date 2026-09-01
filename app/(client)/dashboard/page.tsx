import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { SignOutButton } from '@/components/sign-out-button';

export default async function ClientDashboardPage() {
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

  const { data: analyses } = profile?.company_id
    ? await supabase
        .from('analyses')
        .select('id, title, period_start, period_end')
        .eq('company_id', profile.company_id)
        .eq('status', 'published')
        .is('deleted_at', null)
        .order('period_end', { ascending: false })
    : { data: null };

  return (
    <main className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div>
            <h1 className="text-lg font-semibold text-slate-900">Datanalytic</h1>
            <div className="mt-1 leading-tight">
              <p className="text-[11px] text-slate-400">Producto Mindaxis - Francisco Flórez</p>
              <p className="text-[11px] text-slate-400">Ciencia de datos aplicada al crecimiento empresarial</p>
            </div>
            <p className="mt-1 text-sm text-slate-500">{user.email}</p>
          </div>
          <SignOutButton />
        </div>
      </header>

      <div className="mx-auto max-w-6xl space-y-8 px-6 py-8">
        {/* ── Análisis publicados ── */}
        <section className="rounded-lg border border-slate-200 bg-white p-6">
          <h2 className="mb-4 text-base font-semibold text-slate-900">
            Análisis publicados
          </h2>

          {analyses && analyses.length > 0 ? (
            <ul className="divide-y divide-slate-100">
              {analyses.map((a) => (
                <li key={a.id} className="flex items-center justify-between py-2 text-sm">
                  <Link href={`/dashboard/analyses/${a.id}`} className="text-slate-800 hover:underline">
                    {a.title}
                  </Link>
                  <span className="text-slate-400">
                    {a.period_start} — {a.period_end}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-slate-400">
              Aún no hay análisis publicados para tu empresa.
            </p>
          )}
        </section>

        {/* ── Comparar entre períodos ── */}
        <section className="rounded-lg border border-slate-200 bg-white p-6">
          <h2 className="mb-4 text-base font-semibold text-slate-900">
            Comparar períodos
          </h2>
          <p className="text-sm text-slate-400">
            El motor de comparación y las gráficas se implementarán más adelante.
          </p>
        </section>
      </div>
    </main>
  );
}
