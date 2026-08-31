import { NextResponse } from 'next/server';
import { renderToBuffer } from '@react-pdf/renderer';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { AnalysisPdfDocument } from '@/lib/pdf/analysis-pdf-document';

// @react-pdf/renderer necesita Node.js completo (Buffer, streams) — no corre en el Edge runtime.
export const runtime = 'nodejs';

const ANALYSIS_SELECT =
  'id, title, status, period_start, period_end, results, narrative, company_id, analysis_type_id, companies(name), analysis_types(name)';

function sanitizeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9-_ ]/g, '').trim().replace(/\s+/g, '-') || 'analisis';
}

export async function GET(_request: Request, { params }: { params: { id: string } }) {
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
  const generatedAt = new Date().toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' });

  try {
    const buffer = await renderToBuffer(
      AnalysisPdfDocument({
        companyName,
        title: analysis.title,
        analysisTypeName,
        periodStart: analysis.period_start,
        periodEnd: analysis.period_end,
        status: analysis.status,
        results: analysis.results,
        narrative: analysis.narrative ?? null,
        generatedAt,
      })
    );

    return new NextResponse(buffer as unknown as BodyInit, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${sanitizeFileName(analysis.title)}.pdf"`,
      },
    });
  } catch (e: any) {
    // No tragar el error — @react-pdf/renderer lanza excepciones específicas
    // (p.ej. estilos inválidos, valores no numéricos en un Svg/View) que un
    // catch genérico en el cliente no puede diagnosticar sin este log.
    console.error('[PDF] Error generando PDF:', { analysisId: params.id, message: e?.message, stack: e?.stack });
    return NextResponse.json({ error: 'No se pudo generar el PDF.' }, { status: 500 });
  }
}
