'use server';

import { revalidatePath } from 'next/cache';
import ExcelJS from 'exceljs';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export type ActionState = { error?: string; success?: boolean };

const COMPANY_SIZES = ['micro', 'pequena', 'mediana', 'grande', 'corporativa'] as const;

async function requireSuperAdmin() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) throw new Error('No autenticado.');

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (profile?.role !== 'super_admin') throw new Error('No autorizado.');

  return user;
}

// ================================================================
// EMPRESAS
// ================================================================

export async function createCompany(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  try {
    await requireSuperAdmin();

    const name = String(formData.get('name') || '').trim();
    const nit = String(formData.get('nit') || '').trim() || null;
    const sector = String(formData.get('sector') || '').trim() || null;
    const size = String(formData.get('size') || '');

    if (!name) return { error: 'El nombre de la empresa es obligatorio.' };
    if (!COMPANY_SIZES.includes(size as (typeof COMPANY_SIZES)[number])) {
      return { error: 'Selecciona un tamaño de empresa válido.' };
    }

    const admin = createAdminClient();
    const { error } = await admin.from('companies').insert({ name, nit, sector, size });
    if (error) return { error: `No se pudo crear la empresa: ${error.message}` };

    revalidatePath('/admin/dashboard');
    return { success: true };
  } catch (e: any) {
    return { error: e.message || 'Error inesperado.' };
  }
}

export async function toggleCompanyActive(companyId: string, active: boolean) {
  await requireSuperAdmin();

  const admin = createAdminClient();
  const { error } = await admin.from('companies').update({ active }).eq('id', companyId);
  if (error) throw new Error(error.message);

  revalidatePath('/admin/dashboard');
  revalidatePath(`/admin/dashboard/companies/${companyId}`);
}

// ================================================================
// USUARIOS
// ================================================================

export async function createCompanyUser(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  try {
    await requireSuperAdmin();

    const companyId = String(formData.get('company_id') || '');
    const email = String(formData.get('email') || '').trim();
    const fullName = String(formData.get('full_name') || '').trim();
    const password = String(formData.get('password') || '');

    if (!companyId) return { error: 'Falta la empresa.' };
    if (!email) return { error: 'El correo es obligatorio.' };
    if (password.length < 8) return { error: 'La contraseña temporal debe tener al menos 8 caracteres.' };

    const admin = createAdminClient();

    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

    if (createError || !created?.user) {
      return { error: `No se pudo crear el usuario: ${createError?.message || 'error desconocido'}` };
    }

    const { error: profileError } = await admin
      .from('profiles')
      .update({ company_id: companyId, role: 'client', full_name: fullName || null })
      .eq('id', created.user.id);

    if (profileError) {
      return { error: `Usuario creado, pero no se pudo asignar su perfil: ${profileError.message}` };
    }

    revalidatePath(`/admin/dashboard/companies/${companyId}`);
    return { success: true };
  } catch (e: any) {
    return { error: e.message || 'Error inesperado.' };
  }
}

// ================================================================
// ANÁLISIS
// ================================================================

function parseCsv(text: string) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return { rows: [] as Record<string, unknown>[] };

  const headers = lines[0].split(',').map((h) => h.trim());
  const rows = lines.slice(1).map((line) => {
    const values = line.split(',');
    const record: Record<string, unknown> = {};
    headers.forEach((header, i) => {
      record[header || `col_${i + 1}`] = values[i]?.trim() ?? null;
    });
    return record;
  });

  return { rows };
}

async function parseSpreadsheet(file: File) {
  const buffer = Buffer.from(await file.arrayBuffer());
  const name = file.name.toLowerCase();

  if (name.endsWith('.csv')) {
    return { fileName: file.name, ...parseCsv(buffer.toString('utf-8')) };
  }

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
  const sheet = workbook.worksheets[0];
  if (!sheet) return { fileName: file.name, sheet: null, rows: [] as Record<string, unknown>[] };

  const headerRow = sheet.getRow(1).values as unknown[];
  const headers = headerRow.slice(1).map((h) => String(h ?? '').trim());

  const rows: Record<string, unknown>[] = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const values = (row.values as unknown[]).slice(1);
    const record: Record<string, unknown> = {};
    headers.forEach((header, i) => {
      record[header || `col_${i + 1}`] = values[i] ?? null;
    });
    rows.push(record);
  });

  return { fileName: file.name, sheet: sheet.name, rows };
}

export async function createAnalysis(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requireSuperAdmin();

    const companyId = String(formData.get('company_id') || '');
    const analysisTypeId = String(formData.get('analysis_type_id') || '');
    const title = String(formData.get('title') || '').trim();
    const periodStart = String(formData.get('period_start') || '');
    const periodEnd = String(formData.get('period_end') || '');
    const file = formData.get('file') as File | null;

    if (!companyId) return { error: 'Selecciona una empresa.' };
    if (!analysisTypeId) return { error: 'Selecciona un tipo de análisis.' };
    if (!title) return { error: 'El título es obligatorio.' };
    if (!periodStart || !periodEnd) return { error: 'Define el período del análisis.' };

    let sourceData: unknown = {};
    if (file && file.size > 0) {
      try {
        sourceData = await parseSpreadsheet(file);
      } catch (e: any) {
        return { error: `No se pudo leer el archivo: ${e.message || 'formato inválido'}` };
      }
    }

    const admin = createAdminClient();
    const { error } = await admin.from('analyses').insert({
      company_id: companyId,
      analysis_type_id: analysisTypeId,
      title,
      period_start: periodStart,
      period_end: periodEnd,
      source_data: sourceData,
      results: {},
      status: 'draft',
      created_by: user.id,
    });

    if (error) return { error: `No se pudo crear el análisis: ${error.message}` };

    revalidatePath(`/admin/dashboard/companies/${companyId}`);
    revalidatePath('/admin/dashboard');
    return { success: true };
  } catch (e: any) {
    return { error: e.message || 'Error inesperado.' };
  }
}

export async function publishAnalysis(analysisId: string, companyId: string) {
  await requireSuperAdmin();

  const admin = createAdminClient();
  const { error } = await admin
    .from('analyses')
    .update({ status: 'published', published_at: new Date().toISOString() })
    .eq('id', analysisId);

  if (error) throw new Error(error.message);

  revalidatePath(`/admin/dashboard/companies/${companyId}`);
  revalidatePath('/admin/dashboard');
}

export async function deleteAnalysis(analysisId: string, companyId: string) {
  await requireSuperAdmin();

  const admin = createAdminClient();
  const { error } = await admin
    .from('analyses')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', analysisId);

  if (error) throw new Error(error.message);

  revalidatePath(`/admin/dashboard/companies/${companyId}`);
  revalidatePath('/admin/dashboard');
}
