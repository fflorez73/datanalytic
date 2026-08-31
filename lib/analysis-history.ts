import 'server-only';

/**
 * Otros análisis publicados de la misma empresa + mismo tipo, con resultados
 * calculados — para el gráfico de tendencia histórica. Acepta cualquier
 * cliente supabase-js (admin o de sesión) ya que ambos comparten la misma
 * interfaz de consulta.
 */
export async function fetchAnalysisHistory(
  supabase: any,
  params: { companyId: string; analysisTypeId: string; excludeId: string }
): Promise<{ periodLabel: string; results: unknown }[]> {
  const { data } = await supabase
    .from('analyses')
    .select('id, period_end, results')
    .eq('company_id', params.companyId)
    .eq('analysis_type_id', params.analysisTypeId)
    .eq('status', 'published')
    .neq('id', params.excludeId)
    .is('deleted_at', null)
    .order('period_end', { ascending: true });

  if (!data) return [];

  return data
    .filter((row: any) => row.results && typeof row.results === 'object' && Object.keys(row.results).length > 0)
    .map((row: any) => ({ periodLabel: row.period_end, results: row.results }));
}
