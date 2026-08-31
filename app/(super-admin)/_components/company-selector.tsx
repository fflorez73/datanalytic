'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { setSelectedCompany } from '../actions';

export function CompanySelector({
  companies,
  selectedCompanyId,
}: {
  companies: { id: string; name: string }[];
  selectedCompanyId: string | null;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value || null;
    startTransition(async () => {
      await setSelectedCompany(value);
      router.refresh();
    });
  };

  return (
    <div className="border-b border-slate-200 px-4 py-3">
      <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-slate-400">
        Empresa
      </label>
      <select
        value={selectedCompanyId ?? ''}
        onChange={handleChange}
        disabled={isPending}
        className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-700 focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500 disabled:opacity-50"
      >
        <option value="">Todas las empresas</option>
        {companies.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
    </div>
  );
}
