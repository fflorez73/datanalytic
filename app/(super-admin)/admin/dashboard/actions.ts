'use server';

import { revalidatePath } from 'next/cache';
import ExcelJS from 'exceljs';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  computeComparativoPeriodoAnterior,
  computeFinancialResults,
  FINANCIAL_ANALYSIS_TYPE_CODES,
} from '@/lib/financial-indicators';
import { generateNarrative, type FinancialNarrative } from '@/lib/generate-narrative';
import { computeCustomerResults, CUSTOMER_ANALYSIS_TYPE_CODES } from '@/lib/customer-analytics';
import { generateCustomerNarrative, type CustomerNarrative } from '@/lib/generate-customer-narrative';

export type ActionState = { error?: string; success?: boolean };

/** true si al menos un indicador de alguna sección quedó con valor (no null/undefined). */
function hasAnyIndicator(results: any): boolean {
  if (!results || typeof results !== 'object') return false;
  return ['liquidez', 'endeudamiento', 'rentabilidad', 'dupont', 'ciclo_efectivo'].some((sectionKey) => {
    const section = results[sectionKey];
    return section && Object.values(section).some((v) => v !== null && v !== undefined);
  });
}

/** true si el motor de clientes pudo identificar al menos un cliente válido. */
function hasAnyCustomer(results: any): boolean {
  return Boolean(results && typeof results === 'object' && Array.isArray(results.clientes) && results.clientes.length > 0);
}

const COMPANY_SIZES = ['micro', 'pequena', 'mediana', 'grande', 'corporativa'] as const;

/**
 * Loguea el error de Postgres/PostgREST completo (message, code, details, hint),
 * no solo error.message — code === '42501' es permiso denegado (falta GRANT),
 * code === '42P01' es que la tabla/schema no existe o no está expuesto a PostgREST.
 */
function logSupabaseError(scope: string, error: any, context?: Record<string, unknown>) {
  console.error(`[${scope}] Supabase error:`, {
    message: error?.message,
    code: error?.code,
    details: error?.details,
    hint: error?.hint,
    ...context,
  });
}

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
    if (error) {
      logSupabaseError('CREATE_COMPANY', error, { name });
      return { error: `No se pudo crear la empresa: ${error.message}` };
    }

    revalidatePath('/admin/dashboard/companies');
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
  if (error) {
    logSupabaseError('TOGGLE_COMPANY_ACTIVE', error, { companyId, active });
    throw new Error(error.message);
  }

  revalidatePath('/admin/dashboard/companies');
  revalidatePath(`/admin/dashboard/companies/${companyId}`);
  revalidatePath('/admin/dashboard');
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
      if (createError) logSupabaseError('CREATE_COMPANY_USER_AUTH', createError, { email, companyId });
      return { error: `No se pudo crear el usuario: ${createError?.message || 'error desconocido'}` };
    }

    // upsert (no update): si el trigger on_auth_user_created (002_handle_new_user.sql)
    // no está instalado en la base de datos — o corre de forma asíncrona — no existe
    // fila previa en profiles para hacer UPDATE sobre ella. Un UPDATE contra una fila
    // inexistente no falla (profileError queda null, 0 filas afectadas): el usuario
    // de auth.users queda creado pero invisible en cualquier listado/consulta por
    // company_id. El upsert garantiza la fila sin depender de ese trigger.
    const { error: profileError } = await admin
      .from('profiles')
      .upsert({ id: created.user.id, email, company_id: companyId, role: 'client', full_name: fullName || null });

    if (profileError) {
      logSupabaseError('CREATE_COMPANY_USER_PROFILE', profileError, { userId: created.user.id, companyId });
      return { error: `Usuario creado, pero no se pudo asignar su perfil: ${profileError.message}` };
    }

    revalidatePath(`/admin/dashboard/companies/${companyId}`);
    revalidatePath('/admin/dashboard/users');
    return { success: true };
  } catch (e: any) {
    return { error: e.message || 'Error inesperado.' };
  }
}

// ================================================================
// ANÁLISIS
// ================================================================

function parseCsv(text: string, sheetLabel: string) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return { rows: [] as Record<string, unknown>[] };

  const headers = lines[0].split(',').map((h) => h.trim());
  const rows = lines.slice(1).map((line) => {
    const values = line.split(',');
    const record: Record<string, unknown> = { sheet: sheetLabel };
    headers.forEach((header, i) => {
      record[header || `col_${i + 1}`] = values[i]?.trim() ?? null;
    });
    return record;
  });

  return { rows };
}

/**
 * ExcelJS devuelve las celdas con fórmula como { formula, result, ... } en vez
 * del número calculado — muy común en balances reales ("Total Activo" = SUM(...)).
 * Sin esto, cualquier fila que dependa de una fórmula se pierde silenciosamente.
 */
function excelCellToPlain(raw: unknown): unknown {
  if (raw && typeof raw === 'object' && 'result' in (raw as Record<string, unknown>)) {
    return (raw as { result: unknown }).result;
  }
  if (raw instanceof Date) return raw.toISOString();
  return raw;
}

async function parseSpreadsheet(file: File) {
  const buffer = Buffer.from(await file.arrayBuffer());
  const name = file.name.toLowerCase();

  if (name.endsWith('.csv')) {
    return { fileName: file.name, ...parseCsv(buffer.toString('utf-8'), file.name) };
  }

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ArrayBuffer);

  if (workbook.worksheets.length === 0) {
    return { fileName: file.name, sheets: [] as string[], rows: [] as Record<string, unknown>[] };
  }

  // No asumimos que la fila 1 es el encabezado — los reportes financieros
  // reales suelen traer título/subtítulo/notas antes de la tabla de datos,
  // y el número de columnas puede variar entre filas. Usamos columnas
  // genéricas por posición (col_1, col_2, ...); el motor de indicadores
  // identifica cuentas por el contenido de cada fila, no por el nombre
  // de columna, así que esto no afecta el matching.
  //
  // Recorremos TODAS las hojas (un Excel financiero típico trae Balance
  // General, Estado de Resultados, Flujo de Caja, etc. en hojas separadas)
  // y etiquetamos cada fila con su hoja de origen para trazabilidad.
  const rows: Record<string, unknown>[] = [];
  const sheetNames: string[] = [];

  for (const sheet of workbook.worksheets) {
    sheetNames.push(sheet.name);
    sheet.eachRow((row) => {
      const values = (row.values as unknown[]).slice(1);
      const record: Record<string, unknown> = { sheet: sheet.name };
      values.forEach((raw, i) => {
        record[`col_${i + 1}`] = excelCellToPlain(raw) ?? null;
      });
      rows.push(record);
    });
  }

  return { fileName: file.name, sheets: sheetNames, rows };
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

    let sourceData: { rows?: Record<string, unknown>[] } = {};
    if (file && file.size > 0) {
      try {
        sourceData = await parseSpreadsheet(file);
      } catch (e: any) {
        return { error: `No se pudo leer el archivo: ${e.message || 'formato inválido'}` };
      }
    }

    const admin = createAdminClient();

    // Si el tipo de análisis es financiero o de clientes, calcular los
    // indicadores a partir de las filas parseadas del archivo. Si no hay
    // filas suficientes para un indicador, ese indicador queda en null (no
    // rompe el análisis).
    let results: any = {};
    let narrative: FinancialNarrative | CustomerNarrative | null = null;

    const [{ data: analysisType }, { data: companyRow }] = await Promise.all([
      admin.from('analysis_types').select('code, name').eq('id', analysisTypeId).single(),
      admin.from('companies').select('name').eq('id', companyId).single(),
    ]);

    if (
      analysisType?.code &&
      (FINANCIAL_ANALYSIS_TYPE_CODES as readonly string[]).includes(analysisType.code) &&
      Array.isArray(sourceData.rows)
    ) {
      results = computeFinancialResults(sourceData.rows, { periodStart, periodEnd });

      // Comparativo automático contra el análisis publicado más reciente de
      // la misma empresa y mismo tipo, con period_end anterior al de este.
      const { data: previousAnalysis } = await admin
        .from('analyses')
        .select('period_end, results')
        .eq('company_id', companyId)
        .eq('analysis_type_id', analysisTypeId)
        .eq('status', 'published')
        .is('deleted_at', null)
        .lt('period_end', periodEnd)
        .order('period_end', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (previousAnalysis?.results && typeof previousAnalysis.results === 'object') {
        results.comparativo_periodo_anterior = computeComparativoPeriodoAnterior(
          results,
          previousAnalysis.results,
          previousAnalysis.period_end
        );
      }

      if (hasAnyIndicator(results) && companyRow?.name) {
        narrative = await generateNarrative({
          companyName: companyRow.name,
          periodStart,
          periodEnd,
          analysisTypeName: analysisType.name,
          results,
        });
      }
    } else if (
      analysisType?.code &&
      (CUSTOMER_ANALYSIS_TYPE_CODES as readonly string[]).includes(analysisType.code) &&
      Array.isArray(sourceData.rows)
    ) {
      results = computeCustomerResults(sourceData.rows, { periodStart, periodEnd });

      if (hasAnyCustomer(results) && companyRow?.name) {
        narrative = await generateCustomerNarrative({
          companyName: companyRow.name,
          periodStart,
          periodEnd,
          analysisTypeName: analysisType.name,
          results,
        });
      }
    }

    const { error } = await admin.from('analyses').insert({
      company_id: companyId,
      analysis_type_id: analysisTypeId,
      title,
      period_start: periodStart,
      period_end: periodEnd,
      source_data: sourceData,
      results,
      narrative,
      status: 'draft',
      created_by: user.id,
    });

    if (error) {
      logSupabaseError('CREATE_ANALYSIS', error, { companyId, analysisTypeId });
      return { error: `No se pudo crear el análisis: ${error.message}` };
    }

    revalidatePath('/admin/dashboard/analyses');
    revalidatePath('/admin/dashboard');
    return { success: true };
  } catch (e: any) {
    return { error: e.message || 'Error inesperado.' };
  }
}

export async function publishAnalysis(analysisId: string, companyId: string) {
  await requireSuperAdmin();

  const admin = createAdminClient();
  // analytics.analyses (migración 001) no tiene columna published_at —
  // solo status + updated_at (este último manejado por la propia tabla).
  const { error, status, statusText } = await admin
    .from('analyses')
    .update({ status: 'published' })
    .eq('id', analysisId);

  if (error) {
    logSupabaseError('PUBLISH_ANALYSIS', error, { analysisId, companyId, httpStatus: status, statusText });
    throw new Error(`No se pudo publicar el análisis: ${error.message}`);
  }

  revalidatePath('/admin/dashboard/analyses');
  revalidatePath('/admin/dashboard');
}

export async function deleteAnalysis(analysisId: string, companyId: string) {
  await requireSuperAdmin();

  const admin = createAdminClient();
  const { error, status, statusText } = await admin
    .from('analyses')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', analysisId);

  if (error) {
    logSupabaseError('DELETE_ANALYSIS', error, { analysisId, companyId, httpStatus: status, statusText });
    throw new Error(`No se pudo eliminar el análisis: ${error.message}`);
  }

  revalidatePath('/admin/dashboard/analyses');
  revalidatePath('/admin/dashboard');
}
