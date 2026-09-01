import { NextResponse } from 'next/server';
import { renderToBuffer } from '@react-pdf/renderer';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { AnalysisPdfDocument } from '@/lib/pdf/analysis-pdf-document';
import { CustomerPdfDocument } from '@/lib/pdf/customer-pdf-document';
import { SalesPdfDocument } from '@/lib/pdf/sales-pdf-document';
import { InventoryPdfDocument } from '@/lib/pdf/inventory-pdf-document';
import { OperationsPdfDocument } from '@/lib/pdf/operations-pdf-document';
import { HrPdfDocument } from '@/lib/pdf/hr-pdf-document';
import { CostProfitabilityPdfDocument } from '@/lib/pdf/cost-profitability-pdf-document';
import { CUSTOMER_ANALYSIS_TYPE_CODES } from '@/lib/customer-analytics';
import { SALES_ANALYSIS_TYPE_CODES } from '@/lib/sales-analytics';
import { INVENTORY_ANALYSIS_TYPE_CODES } from '@/lib/inventory-analytics';
import { OPERATIONS_ANALYSIS_TYPE_CODES } from '@/lib/operations-analytics';
import { HR_ANALYSIS_TYPE_CODES } from '@/lib/hr-analytics';
import { COST_PROFITABILITY_ANALYSIS_TYPE_CODES } from '@/lib/cost-profitability-analytics';

// @react-pdf/renderer necesita Node.js completo (Buffer, streams) — no corre en el Edge runtime.
export const runtime = 'nodejs';

const ANALYSIS_SELECT =
  'id, title, status, period_start, period_end, results, narrative, company_id, analysis_type_id, companies(name), analysis_types(name, code)';

function sanitizeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9-_ ]/g, '').trim().replace(/\s+/g, '-') || 'analisis';
}

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  // Todo el handler queda envuelto en un único try/catch — antes solo el
  // renderToBuffer estaba protegido. createAdminClient() (lanza si falta
  // SUPABASE_SERVICE_ROLE_KEY) y las consultas a Supabase quedaban fuera:
  // cualquier excepción ahí producía la página de error genérica de
  // Next.js/Vercel, sin el log detallado que sí teníamos para el render —
  // exactamente el tipo de fallo que es imposible de diagnosticar solo con
  // las métricas resumidas de Vercel. Ahora cualquier excepción, sea cual
  // sea su origen, queda logueada con mensaje+stack antes de responder.
  try {
    const supabase = createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });

    const { data: profile } = await supabase.from('profiles').select('role, company_id').eq('id', user.id).single();
    if (!profile) return NextResponse.json({ error: 'Perfil no encontrado.' }, { status: 403 });

    let analysis: any = null;

    if (profile.role === 'super_admin') {
      const admin = createAdminClient();
      const { data } = await admin.from('analyses').select(ANALYSIS_SELECT).eq('id', params.id).is('deleted_at', null).single();
      analysis = data;
    } else {
      if (!profile.company_id) return NextResponse.json({ error: 'No autorizado.' }, { status: 403 });
      const { data } = await supabase
        .from('analyses')
        .select(ANALYSIS_SELECT)
        .eq('id', params.id)
        .eq('company_id', profile.company_id)
        .eq('status', 'published')
        .is('deleted_at', null)
        .single();
      analysis = data;
    }

    if (!analysis) return NextResponse.json({ error: 'Análisis no encontrado.' }, { status: 404 });

    const companyName = analysis.companies?.name || '—';
    const analysisTypeName = analysis.analysis_types?.name || '—';
    const analysisTypeCode = analysis.analysis_types?.code || '';
    const generatedAt = new Date().toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' });

    const isCustomerAnalysis = (CUSTOMER_ANALYSIS_TYPE_CODES as readonly string[]).includes(analysisTypeCode);
    const isSalesAnalysis = (SALES_ANALYSIS_TYPE_CODES as readonly string[]).includes(analysisTypeCode);
    const isInventoryAnalysis = (INVENTORY_ANALYSIS_TYPE_CODES as readonly string[]).includes(analysisTypeCode);
    const isOperationsAnalysis = (OPERATIONS_ANALYSIS_TYPE_CODES as readonly string[]).includes(analysisTypeCode);
    const isHrAnalysis = (HR_ANALYSIS_TYPE_CODES as readonly string[]).includes(analysisTypeCode);
    const isCostProfitabilityAnalysis = (COST_PROFITABILITY_ANALYSIS_TYPE_CODES as readonly string[]).includes(analysisTypeCode);

    const documentProps = {
      companyName,
      title: analysis.title,
      analysisTypeName,
      periodStart: analysis.period_start,
      periodEnd: analysis.period_end,
      status: analysis.status,
      results: analysis.results,
      narrative: analysis.narrative ?? null,
      generatedAt,
    };

    const buffer = await renderToBuffer(
      isCustomerAnalysis
        ? CustomerPdfDocument(documentProps as any)
        : isSalesAnalysis
          ? SalesPdfDocument(documentProps as any)
          : isInventoryAnalysis
            ? InventoryPdfDocument(documentProps as any)
            : isOperationsAnalysis
              ? OperationsPdfDocument(documentProps as any)
              : isHrAnalysis
                ? HrPdfDocument(documentProps as any)
                : isCostProfitabilityAnalysis
                  ? CostProfitabilityPdfDocument(documentProps as any)
                  : AnalysisPdfDocument(documentProps as any)
    );

    return new NextResponse(buffer as unknown as BodyInit, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${sanitizeFileName(analysis.title)}.pdf"`,
      },
    });
  } catch (e: any) {
    // No tragar el error — @react-pdf/renderer lanza excepciones específicas
    // (p.ej. estilos inválidos, valores no numéricos en un Svg/View), y
    // createAdminClient()/las consultas a Supabase también pueden lanzar
    // (p.ej. env var faltante) — un catch genérico en el cliente no puede
    // diagnosticar ninguno de los dos sin este log.
    console.error('[PDF] Error generando PDF:', {
      analysisId: params.id,
      name: e?.name,
      message: e?.message,
      stack: e?.stack,
    });
    return NextResponse.json({ error: 'No se pudo generar el PDF.', detail: e?.message ?? String(e) }, { status: 500 });
  }
}
