import 'server-only';
import Anthropic from '@anthropic-ai/sdk';
import { INDICATOR_SECTIONS, formatIndicatorValue } from './financial-indicators';

const ANTHROPIC_MODEL = 'claude-opus-5';

const SECCION_TITULOS = [
  'Diagnóstico de Rentabilidad',
  'ROE mediante DuPont',
  'ROA y Creación de Valor',
  'Estructura Financiera y Solvencia',
  'Liquidez y Capital de Trabajo',
  'Cartera, Inventarios y Ciclo de Caja',
] as const;

export type FinancialNarrative = {
  resumen_ejecutivo: string;
  dictamen: 'favorable' | 'favorable_con_observaciones' | 'requiere_atencion' | 'critico';
  hallazgos_clave: string[];
  secciones: { titulo: string; analisis: string }[];
  riesgos: {
    descripcion: string;
    nivel: 'verde' | 'amarillo' | 'rojo';
    tendencia: 'mejora' | 'estable' | 'deterioro';
    prioridad: 'alta' | 'media' | 'baja';
  }[];
  senales_alerta: string[];
  recomendaciones: { accion: string; responsable_sugerido: string; horizonte: string }[];
  conclusion: string;
};

function buildIndicatorsSummary(results: any): string {
  const lines: string[] = [];
  for (const section of INDICATOR_SECTIONS) {
    lines.push(`${section.title}:`);
    for (const item of section.items) {
      const value = results?.[section.key]?.[item.key];
      const formatted =
        value === null || value === undefined ? 'no disponible' : formatIndicatorValue(value, item.format);
      lines.push(`  - ${item.label}: ${formatted}`);
    }
  }
  return lines.join('\n');
}

function buildComposicionSummary(results: any): string {
  const activos = results?.composicion_activos;
  const financiacion = results?.composicion_financiacion;
  if (!activos && !financiacion) return '';

  const pct = (v: unknown) => (typeof v === 'number' ? `${(v * 100).toFixed(1)}%` : 'no disponible');
  const lines: string[] = ['\nComposición del Balance:'];

  if (activos) {
    lines.push(
      `  - Composición de Activos: Efectivo ${pct(activos.efectivo_pct)}, Cuentas por Cobrar ${pct(activos.cxc_pct)}, Inventarios ${pct(activos.inventarios_pct)}, Otros Activo Corriente ${pct(activos.otros_ac_pct)}, Activo No Corriente ${pct(activos.activo_nc_pct)}.`
    );
  }
  if (financiacion) {
    lines.push(
      `  - Composición de Financiación: Pasivo Corto Plazo ${pct(financiacion.pasivo_cp_pct)}, Pasivo Largo Plazo ${pct(financiacion.pasivo_lp_pct)}, Patrimonio ${pct(financiacion.patrimonio_pct)}.`
    );
  }
  return lines.join('\n');
}

function buildCoherenciaSummary(results: any): string {
  const c = results?.coherencia_contable;
  if (!c) return '';
  if (c.inconsistente) {
    return `\nVERIFICACIÓN DE COHERENCIA CONTABLE — INCONSISTENCIA DETECTADA:\n  ${c.mensaje}\n  Diferencia: ${(c.diferencia_pct * 100).toFixed(1)}% (umbral de alerta: 5%). Esta inconsistencia DEBE tratarse como riesgo de prioridad alta.`;
  }
  return `\nVerificación de coherencia contable: la Utilidad del ejercicio del Balance (${formatIndicatorValue(c.utilidad_balance, 'currency')}) y la Utilidad Neta del Estado de Resultados (${formatIndicatorValue(c.utilidad_neta_pl, 'currency')}) son consistentes (diferencia de ${(c.diferencia_pct * 100).toFixed(1)}%).`;
}

function buildComparativoSummary(results: any): string {
  const comparativo = results?.comparativo_periodo_anterior;
  if (!comparativo || typeof comparativo !== 'object') return '';

  const lines: string[] = [`\nComparativo contra el período cerrado en ${comparativo.period_end_base}:`];

  const cuentaLabels: Record<string, { label: string; format: 'currency' }> = {
    ventas: { label: 'Ventas Netas', format: 'currency' },
    utilidad_neta: { label: 'Utilidad Neta', format: 'currency' },
    utilidad_operacional: { label: 'EBIT', format: 'currency' },
  };

  function pushEntries(sectionKey: string, items: { key: string; label: string; format: any }[]) {
    const sectionEntries = comparativo.indicadores?.[sectionKey];
    if (!sectionEntries) return;
    for (const item of items) {
      const entry = sectionEntries[item.key];
      if (!entry) continue;
      const actual = formatIndicatorValue(entry.valor_actual, item.format);
      const anterior = formatIndicatorValue(entry.valor_anterior, item.format);
      const variacion =
        entry.variacion_puntos_porcentuales !== null
          ? `${entry.variacion_puntos_porcentuales >= 0 ? '+' : ''}${entry.variacion_puntos_porcentuales.toFixed(2)} puntos porcentuales`
          : entry.variacion_relativa_pct !== null
            ? `${entry.variacion_relativa_pct >= 0 ? '+' : ''}${entry.variacion_relativa_pct.toFixed(2)}%`
            : `variación absoluta ${entry.variacion_absoluta}`;
      lines.push(`  - ${item.label}: de ${anterior} a ${actual} (${variacion})`);
    }
  }

  pushEntries(
    'cuentas',
    Object.entries(cuentaLabels).map(([key, v]) => ({ key, label: v.label, format: v.format }))
  );
  for (const section of INDICATOR_SECTIONS) {
    pushEntries(section.key, section.items);
  }

  return lines.length > 1 ? lines.join('\n') : '';
}

function buildSystemPrompt(): string {
  return `Actúa como un CFO / analista financiero senior de una firma consultora, preparando un informe ejecutivo de diagnóstico financiero integral para la junta directiva de una empresa latinoamericana — con la profundidad y el rigor de un informe de asesor externo, no un resumen automático. Tu audiencia son directores que toman decisiones de negocio, no contadores: sé directo, específico y accionable, nunca genérico.

Cita SIEMPRE cifras exactas de los indicadores entregados (p.ej. "la razón corriente de 2.20 indica una cobertura holgada del pasivo corriente" en vez de "la liquidez es buena"). Cuando haya comparativo contra el período anterior, úsalo para hablar de tendencia y priorizar qué cambió, citando esas cifras también. Si un indicador no está disponible, no inventes un valor ni lo menciones como si existiera.

Responde ÚNICAMENTE con un objeto JSON válido, sin texto antes ni después, sin bloques de código markdown (nada de \`\`\`json ni \`\`\`), con exactamente esta estructura:
{
  "resumen_ejecutivo": "2-4 frases sobre el estado general de la empresa, tono de informe de junta directiva",
  "dictamen": "favorable" | "favorable_con_observaciones" | "requiere_atencion" | "critico",
  "hallazgos_clave": ["hallazgo con cifra concreta", "..."],
  "secciones": [
    { "titulo": "Diagnóstico de Rentabilidad", "analisis": "párrafo de 3-5 líneas" },
    { "titulo": "ROE mediante DuPont", "analisis": "párrafo de 3-5 líneas" },
    { "titulo": "ROA y Creación de Valor", "analisis": "párrafo de 3-5 líneas" },
    { "titulo": "Estructura Financiera y Solvencia", "analisis": "párrafo de 3-5 líneas" },
    { "titulo": "Liquidez y Capital de Trabajo", "analisis": "párrafo de 3-5 líneas" },
    { "titulo": "Cartera, Inventarios y Ciclo de Caja", "analisis": "párrafo de 3-5 líneas" }
  ],
  "riesgos": [
    { "descripcion": "riesgo concreto citando el indicador que lo origina", "nivel": "verde" | "amarillo" | "rojo", "tendencia": "mejora" | "estable" | "deterioro", "prioridad": "alta" | "media" | "baja" }
  ],
  "senales_alerta": ["umbral concreto a vigilar, ej: 'DSO > 70 días' o 'Cobertura de intereses por debajo de 3x'"],
  "recomendaciones": [
    { "accion": "acción concreta y accionable", "responsable_sugerido": "rol responsable (p.ej. 'Gerencia Financiera', 'Tesorería', 'Contabilidad / Revisoría Fiscal')", "horizonte": "plazo sugerido (p.ej. 'inmediato', '30 días', 'próximo trimestre')" }
  ],
  "conclusion": "2-3 frases de cierre sobre viabilidad/continuidad del negocio y el dictamen general"
}

Cada "analisis" de "secciones" debe tener la misma profundidad que el cuerpo de un informe de junta directiva real: no una lista de bullets ni una frase suelta, sino un párrafo narrativo de 3-5 líneas que conecte varias cifras entre sí (p.ej. cómo el crecimiento de ventas y el control de gastos explican la expansión del margen, o cómo el desapalancamiento simultáneo a la mejora de rentabilidad es una señal de calidad). Usa exactamente los 6 títulos de sección indicados arriba, en ese orden.

Reglas:
- "dictamen" refleja la severidad combinada: "favorable" si todo está saludable, "favorable_con_observaciones" si hay puntos a vigilar sin riesgo serio, "requiere_atencion" si hay uno o más indicadores en zona de alerta, "critico" si hay riesgo real de continuidad o incumplimiento.
- Si el contexto incluye una VERIFICACIÓN DE COHERENCIA CONTABLE con inconsistencia detectada, esa inconsistencia es SIEMPRE un riesgo de "prioridad": "alta" — inclúyela como el primer riesgo del array, con "nivel": "amarillo" (es una alerta de calidad de datos, no una falla operativa), y menciónala explícitamente en el resumen ejecutivo y en la sección "Estructura Financiera y Solvencia" o donde corresponda. Nunca la omitas ni la minimices.
- "riesgos" prioriza de mayor a menor severidad ("prioridad": "alta" primero); no inventes riesgos para llenar el campo si no los hay, pero la inconsistencia contable (si existe) siempre cuenta como uno.
- "senales_alerta" son umbrales concretos y verificables a futuro (con número), no advertencias vagas — p.ej. "DSO > 70 días", "Cobertura de intereses por debajo de 3x", "Reversión del margen bruto por debajo de X%".
- "recomendaciones" deben ser accionables y específicas — nunca frases de relleno ("mejorar la gestión financiera"). Si hay inconsistencia contable, la primera recomendación debe ser reconciliarla con Contabilidad/Revisoría Fiscal, horizonte "inmediato".
- No uses frases genéricas de relleno. Cada afirmación debe referirse a un número concreto de los indicadores dados.
- No agregues explicaciones, disculpas ni texto fuera del objeto JSON.`;
}

function buildUserPrompt(input: {
  companyName: string;
  periodStart: string;
  periodEnd: string;
  analysisTypeName: string;
  results: any;
}): string {
  const warnings: string[] = Array.isArray(input.results?.warnings) ? input.results.warnings : [];

  return `Empresa: ${input.companyName}
Período analizado: ${input.periodStart} a ${input.periodEnd}
Tipo de análisis: ${input.analysisTypeName}

Indicadores calculados:
${buildIndicatorsSummary(input.results)}
${buildComposicionSummary(input.results)}
${buildCoherenciaSummary(input.results)}
${buildComparativoSummary(input.results)}
${
  warnings.length > 0
    ? `\nAdvertencias del motor de cálculo:\n${warnings.map((w) => `- ${w}`).join('\n')}`
    : ''
}

Genera el informe ejecutivo en el formato JSON indicado, usando exactamente estos 6 títulos de sección en este orden: ${SECCION_TITULOS.map((t) => `"${t}"`).join(', ')}.`;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) => typeof v === 'string');
}

function parseNarrativeJson(text: string): FinancialNarrative | null {
  // Red de seguridad por si el modelo igual envuelve la respuesta en markdown
  // pese a la instrucción explícita de no hacerlo.
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '');

  let obj: any;
  try {
    obj = JSON.parse(cleaned);
  } catch {
    return null;
  }

  const isValid =
    obj &&
    typeof obj.resumen_ejecutivo === 'string' &&
    ['favorable', 'favorable_con_observaciones', 'requiere_atencion', 'critico'].includes(obj.dictamen) &&
    isStringArray(obj.hallazgos_clave) &&
    Array.isArray(obj.secciones) &&
    obj.secciones.every((s: any) => s && typeof s.titulo === 'string' && typeof s.analisis === 'string') &&
    Array.isArray(obj.riesgos) &&
    obj.riesgos.every(
      (r: any) =>
        r &&
        typeof r.descripcion === 'string' &&
        ['verde', 'amarillo', 'rojo'].includes(r.nivel) &&
        ['mejora', 'estable', 'deterioro'].includes(r.tendencia) &&
        ['alta', 'media', 'baja'].includes(r.prioridad)
    ) &&
    isStringArray(obj.senales_alerta) &&
    Array.isArray(obj.recomendaciones) &&
    obj.recomendaciones.every(
      (r: any) =>
        r && typeof r.accion === 'string' && typeof r.responsable_sugerido === 'string' && typeof r.horizonte === 'string'
    ) &&
    typeof obj.conclusion === 'string';

  return isValid ? (obj as FinancialNarrative) : null;
}

/**
 * Genera la narrativa ejecutiva de un análisis financiero vía la API de Anthropic.
 * Nunca lanza — devuelve null en cualquier fallo (sin API key, error de red,
 * respuesta no-2xx, o JSON inválido/con forma inesperada) para que el llamador
 * pueda guardar narrative=null sin bloquear la creación del análisis.
 */
export async function generateNarrative(input: {
  companyName: string;
  periodStart: string;
  periodEnd: string;
  analysisTypeName: string;
  results: any;
}): Promise<FinancialNarrative | null> {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.warn('[NARRATIVE] ANTHROPIC_API_KEY no configurada — se omite la narrativa ejecutiva.');
    return null;
  }

  const client = new Anthropic();

  try {
    const response = await client.messages.create({
      model: ANTHROPIC_MODEL,
      max_tokens: 8000,
      system: buildSystemPrompt(),
      messages: [{ role: 'user', content: buildUserPrompt(input) }],
    });

    const textBlock = response.content.find((b): b is Anthropic.TextBlock => b.type === 'text');
    if (!textBlock) {
      console.error('[NARRATIVE] Respuesta de Anthropic sin contenido de texto:', JSON.stringify(response).substring(0, 300));
      return null;
    }

    const parsed = parseNarrativeJson(textBlock.text);
    if (!parsed) {
      console.error('[NARRATIVE] No se pudo parsear/validar el JSON de la respuesta:', textBlock.text.substring(0, 500));
      return null;
    }

    return parsed;
  } catch (e: any) {
    console.error('[NARRATIVE] Excepción llamando a Anthropic:', e.message);
    return null;
  }
}
