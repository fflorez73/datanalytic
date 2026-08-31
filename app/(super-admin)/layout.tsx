import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getActiveCompanies, getSelectedCompanyIdRaw } from '@/lib/company-context';
import { Sidebar } from './_components/sidebar';

export default async function SuperAdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const companies = await getActiveCompanies();
  const selectedCompanyId = getSelectedCompanyIdRaw();

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50">
      <Sidebar userEmail={user.email ?? ''} companies={companies} selectedCompanyId={selectedCompanyId} />
      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-6xl px-6 py-8 lg:px-10">{children}</div>
      </main>
    </div>
  );
}
