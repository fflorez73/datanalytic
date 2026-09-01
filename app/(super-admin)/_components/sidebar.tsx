'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { SignOutButton } from '@/components/sign-out-button';
import { CompanySelector } from './company-selector';

const NAV_ITEMS = [
  { href: '/admin/dashboard/companies', label: 'Empresas' },
  { href: '/admin/dashboard/users', label: 'Usuarios' },
  { href: '/admin/dashboard/analyses', label: 'Análisis' },
];

export function Sidebar({
  userEmail,
  companies,
  selectedCompanyId,
}: {
  userEmail: string;
  companies: { id: string; name: string }[];
  selectedCompanyId: string | null;
}) {
  const pathname = usePathname();

  return (
    <aside className="flex h-full w-60 flex-shrink-0 flex-col border-r border-slate-200 bg-white">
      <div className="border-b border-slate-200 px-5 py-5">
        <Link href="/admin/dashboard" className="text-base font-semibold text-slate-900">
          Datanalytic
        </Link>
        <div className="mt-1 leading-tight">
          <p className="text-[11px] text-slate-400">Producto Mindaxis - Francisco Flórez</p>
          <p className="text-[11px] text-slate-400">Ciencia de datos aplicada al crecimiento empresarial</p>
        </div>
        <p className="mt-1.5 text-xs text-slate-400">Super Admin</p>
      </div>

      <CompanySelector companies={companies} selectedCompanyId={selectedCompanyId} />

      <nav className="flex-1 space-y-1 px-3 py-4">
        {NAV_ITEMS.map((item) => {
          const isActive = pathname === item.href || pathname?.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`block rounded-md px-3 py-2 text-sm font-medium transition ${
                isActive ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-slate-200 px-4 py-4">
        <p className="mb-2 truncate text-xs text-slate-500" title={userEmail}>
          {userEmail}
        </p>
        <SignOutButton />
      </div>
    </aside>
  );
}
