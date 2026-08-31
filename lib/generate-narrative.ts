import 'server-only';
import Anthropic from '@anthropic-ai/sdk';
import { INDICATOR_SECTIONS, formatIndicatorValue } from './financial-indicators';

const ANTHROPIC_MODEL = 'claude-opus-5';

export type FinancialNarrative = {
  resumen_ejecutivo: string;
  dictamen: 'favorable' | 'favorable_con_observaciones' | 'requiere_atencion' | 'critico';
  hallazgos_clave: string[];
  observaciones: string[];
  riesgos: { descripcion: string; nivel: 'verde' | 'amarillo' | 'rojo'; tendencia: 'mejora' | 'estable' | 'deterioro' }[];
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

function buildComparativoSummary(results: any): string {
  const comparativo = results?.comparativo_periodo_anterior;
  if (!comparativo || typeof comparativo !== 'object') return '';

  const lines: string[] = [`\nComparativo contra el período cerrado en ${comparativo.period_end_base}:`];

  for (const section of INDICATOR_SECTIONS) {
    const sectionEntries = comparativo.indicadores?.[section.key];
    if (!sectionEntries) continue;

    for (const item of section.items) {
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

  return lines.length > 1 ? lines.join('\n') : '';
}

function buildSystemPrompt(): string {
  return `Actúa como un CFO / analista financiero senior preparando el informe ejecutivo de indicadores financieros para la junta directiva de una empresa latinoamericana. Tu audiencia son directores que toman decisiones de negocio, no contadores — sé directo, específico y accionable, nunca genérico.

Cita siempre cifras exactas de los indicadores entregados (por ejemplo "la razón corriente de 2.20 indica una cobertura holgada del pasivo corriente" en vez de "la liquidez es buena"). Si se entrega un comparativo contra el período anterior, úsalo para hablar de tendencia y priorizar qué cambió, citando también esas cifras. Si un indicador no está disponible, no inventes un valor ni lo menciones como si existiera.

Responde ÚNICAMENTE con un objeto JSON válido, sin texto antes ni después, sin bloques de código markdown (nada de \`\`\`json ni \`\`\`), con exactamente esta estructura:
{
  "resumen_ejecutivo": "2-4 frases sobre el estado general de la empresa según estos indicadores, en tono de informe de junta directiva",
  "dictamen": "favorable" | "favorable_con_observaciones" | "requiere_atencion" | "critico",
  "hallazgos_clave": ["hallazgo con cifra concreta", "..."],
  "observaciones": ["observación específica citando un valor real", "..."],
  "riesgos": [
    { "descripcion": "riesgo concreto citando el indicador que lo origina", "nivel": "verde" | "amarillo" | "rojo", "tendencia": "mejora" | "estable" | "deterioro" }
  ],
  "recomendaciones": [
    { "accion": "acción concreta y accionable", "responsable_sugerido": "rol responsable (p.ej. 'Gerencia Financiera', 'Tesorería', 'Gerencia Comercial')", "horizonte": "plazo sugerido (p.ej. 'inmediato', '30 días', 'próximo trimestre')" }
  ],
  "conclusion": "1-2 frases de cierre sobre viabilidad/continuidad del negocio basada en estos números"
}

Reglas:
- "dictamen" debe reflejar honestamente la severidad combinada de los indicadores: "favorable" si todo está saludable, "favorable_con_observaciones" si hay puntos a vigilar pero sin riesgo serio, "requiere_atencion" si hay uno o más indicadores en zona de alerta, "critico" si hay riesgo real de continuidad o incumplimiento.
- "riesgos" debe quedar como array vacío [] si no hay problemas serios — no inventes riesgos para llenar el campo. Prioriza los riesgos de mayor a menor severidad (nivel "rojo" primero).
- "tendencia" en cada riesgo debe basarse en el comparativo contra el período anterior cuando esté disponible; usa "estable" si no hay comparativo o el indicador no cambió de forma relevante.
- "recomendaciones" deben ser accionables y específicas al negocio — nunca frases de relleno ("mejorar la gestión financiera"). Cada una debe tener responsable y horizonte concretos.
- No uses frases genéricas de relleno ("la empresa muestra un desempeño aceptable"). Cada hallazgo y observación debe referirse a un número concreto de los indicadores dados.
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
${buildComparativoSummary(input.results)}
${
  warnings.length > 0
    ? `\nCuentas que no se pudieron identificar en el archivo fuente (por eso algunos indicadores no están disponibles):\n${warnings
        .map((w) => `- ${w}`)
        .join('\n')}`
    : ''
}

Genera el informe ejecutivo en el formato JSON indicado.`;
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
    isStringArray(obj.observaciones) &&
    Array.isArray(obj.riesgos) &&
    obj.riesgos.every(
      (r: any) =>
        r &&
        typeof r.descripcion === 'string' &&
        ['verde', 'amarillo', 'rojo'].includes(r.nivel) &&
        ['mejora', 'estable', 'deterioro'].includes(r.tendencia)
    ) &&
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
      max_tokens: 4000,
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
