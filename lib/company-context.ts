import 'server-only';
import { cookies } from 'next/headers';
import { createAdminClient } from '@/lib/supabase/admin';

export const COMPANY_COOKIE = 'datanalytic_company_id';

export function getSelectedCompanyIdRaw(): string | null {
  return cookies().get(COMPANY_COOKIE)?.value || null;
}

export async function getActiveCompanies(): Promise<{ id: string; name: string }[]> {
  const admin = createAdminClient();
  const { data } = await admin.from('companies').select('id, name').eq('active', true).order('name');
  return data ?? [];
}

/** Empresa seleccionada, validada contra las empresas activas (null si no hay selección o ya no está activa). */
export async function getSelectedCompany(): Promise<{ id: string; name: string } | null> {
  const id = getSelectedCompanyIdRaw();
  if (!id) return null;

  const companies = await getActiveCompanies();
  return companies.find((c) => c.id === id) ?? null;
}
