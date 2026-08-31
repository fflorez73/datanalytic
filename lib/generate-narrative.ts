import 'server-only';
import { INDICATOR_SECTIONS, formatIndicatorValue } from './financial-indicators';

const ANTHROPIC_MODEL = 'claude-sonnet-4-5-20250929';

export type FinancialNarrative = {
  resumen_ejecutivo: string;
  observaciones: string[];
  alertas: string[];
  tendencia: 'positiva' | 'estable' | 'negativa' | 'sin_datos_suficientes';
  recomendacion: string;
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

function buildSystemPrompt(): string {
  return `Eres un analista financiero experto con años de experiencia evaluando la salud financiera de empresas latinoamericanas a partir de sus estados financieros e indicadores.

Tu tarea es leer los indicadores financieros calculados de una empresa y producir un análisis ejecutivo breve, específico y accionable — nunca genérico. Cita los valores reales de los indicadores en tus observaciones (por ejemplo "la razón corriente de 2.20 indica una cobertura holgada del pasivo corriente" en vez de "la liquidez es buena"). Si un indicador no está disponible, no inventes un valor ni lo menciones como si existiera.

Responde ÚNICAMENTE con un objeto JSON válido, sin texto antes ni después, sin bloques de código markdown (nada de \`\`\`json ni \`\`\`), con exactamente esta estructura:
{
  "resumen_ejecutivo": "2-3 frases sobre el estado general de la empresa según estos indicadores",
  "observaciones": ["observación específica citando un valor real", "..."],
  "alertas": ["alerta específica si hay un problema serio", "..."],
  "tendencia": "positiva" | "estable" | "negativa" | "sin_datos_suficientes",
  "recomendacion": "recomendación concreta sobre viabilidad/continuidad del negocio basada en estos números"
}

Reglas:
- "alertas" debe quedar como array vacío [] si no hay problemas serios — no inventes alertas para llenar el campo.
- "tendencia" debe ser "sin_datos_suficientes" si la mayoría de los indicadores no están disponibles.
- No uses frases genéricas de relleno ("la empresa muestra un desempeño aceptable"). Cada observación debe referirse a un número concreto de los indicadores dados.
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
${
  warnings.length > 0
    ? `\nCuentas que no se pudieron identificar en el archivo fuente (por eso algunos indicadores no están disponibles):\n${warnings
        .map((w) => `- ${w}`)
        .join('\n')}`
    : ''
}

Genera el análisis ejecutivo en el formato JSON indicado.`;
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
    Array.isArray(obj.observaciones) &&
    Array.isArray(obj.alertas) &&
    typeof obj.recomendacion === 'string' &&
    ['positiva', 'estable', 'negativa', 'sin_datos_suficientes'].includes(obj.tendencia);

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
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.warn('[NARRATIVE] ANTHROPIC_API_KEY no configurada — se omite la narrativa ejecutiva.');
    return null;
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: ANTHROPIC_MODEL,
        max_tokens: 1200,
        system: buildSystemPrompt(),
        messages: [{ role: 'user', content: buildUserPrompt(input) }],
      }),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      console.error('[NARRATIVE] Anthropic API error:', response.status, errText.substring(0, 500));
      return null;
    }

    const data = await response.json();
    const text = data.content?.[0]?.text;
    if (!text) {
      console.error('[NARRATIVE] Respuesta de Anthropic sin contenido de texto:', JSON.stringify(data).substring(0, 300));
      return null;
    }

    const parsed = parseNarrativeJson(text);
    if (!parsed) {
      console.error('[NARRATIVE] No se pudo parsear/validar el JSON de la respuesta:', text.substring(0, 500));
      return null;
    }

    return parsed;
  } catch (e: any) {
    console.error('[NARRATIVE] Excepción llamando a Anthropic:', e.message);
    return null;
  }
}
