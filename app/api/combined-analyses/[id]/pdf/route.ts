import { NextResponse } from 'next/server';
import { renderToBuffer } from '@react-pdf/renderer';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { CombinedPdfDocument } from '@/lib/pdf/combined-pdf-document';

// @react-pdf/renderer necesita Node.js completo (Buffer, streams) — no corre en el Edge runtime.
export const runtime = 'nodejs';

const COMBINED_SELECT = 'id, title, status, narrative, company_id, companies(name)';

function sanitizeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9-_ ]/g, '').trim().replace(/\s+/g, '-') || 'analisis-combinado';
}

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  try {
    const supabase = createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });

    const { data: profile } = await supabase.from('profiles').select('role, company_id').eq('id', user.id).single();
    if (!profile) return NextResponse.json({ error: 'Perfil no encontrado.' }, { status: 403 });

    let combined: any = null;

    if (profile.role === 'super_admin') {
      const admin = createAdminClient();
      const { data } = await admin.from('combined_analyses').select(COMBINED_SELECT).eq('id', params.id).is('deleted_at', null).single();
      combined = data;
    } else {
      if (!profile.company_id) return NextResponse.json({ error: 'No autorizado.' }, { status: 403 });
      const { data } = await supabase
        .from('combined_analyses')
        .select(COMBINED_SELECT)
        .eq('id', params.id)
        .eq('company_id', profile.company_id)
        .eq('status', 'published')
        .is('deleted_at', null)
        .single();
      combined = data;
    }

    if (!combined) return NextResponse.json({ error: 'Análisis combinado no encontrado.' }, { status: 404 });

    const companyName = combined.companies?.name || '—';
    const generatedAt = new Date().toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' });

    const buffer = await renderToBuffer(
      CombinedPdfDocument({
        companyName,
        title: combined.title,
        status: combined.status,
        narrative: combined.narrative ?? null,
        generatedAt,
      }) as any
    );

    return new NextResponse(buffer as unknown as BodyInit, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${sanitizeFileName(combined.title)}.pdf"`,
      },
    });
  } catch (e: any) {
    console.error('[COMBINED_PDF] Error generando PDF:', {
      combinedAnalysisId: params.id,
      name: e?.name,
      message: e?.message,
      stack: e?.stack,
    });
    return NextResponse.json({ error: 'No se pudo generar el PDF.', detail: e?.message ?? String(e) }, { status: 500 });
  }
}
