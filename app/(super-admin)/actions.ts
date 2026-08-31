'use server';

import { cookies } from 'next/headers';
import { COMPANY_COOKIE } from '@/lib/company-context';

export async function setSelectedCompany(companyId: string | null) {
  if (companyId) {
    cookies().set(COMPANY_COOKIE, companyId, { path: '/', maxAge: 60 * 60 * 24 * 30 });
  } else {
    cookies().delete(COMPANY_COOKIE);
  }
}
