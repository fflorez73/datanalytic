import 'server-only';
import Anthropic from '@anthropic-ai/sdk';
import { getComparisonIndicators, formatComparisonValue } from './comparison-indicators';
import { MODULE_META } from './module-meta';

const ANTHROPIC_MODEL = 'claude-opus-5';

export type CombinedNarrative = {
  resumen_ejecutivo: string;
  dictamen: 'favorable' | 'favorable_con_observaciones' | 'requiere_atencion' | 'critico';
  fuentes_utilizadas: { tipo: string; periodo: string; titulo: string }[];
  hallazgos_clave: string[];
  conexiones_identificadas: { descripcion: string; modulos_involucrados: string[] }[];
  riesgos: { descripcion: string; nivel: 'verde' | 'amarillo' | 'rojo'; prioridad: 'alta' | 'media' | 'baja' }[];
  recomendaciones: { accion: string; responsable_sugerido: string; horizonte: string }[];
  conclusion: string;
};

export type CombinedSourceInput = {
  analysisId: string;
  code: string; // analysis_types.code real, p.ej. 'ventas' — para extraer indicadores
  moduleFamily: string; // familia canónica (ver getModuleFamily) — vocabulario para "modulos_involucrados"
  typeName: string;
  periodStart: string;
  periodEnd: string;
  title: string;
  resumenEjecutivo: string | null;
  hallazgosClave: string[];
  results: unknown;
};

const MODULE_VOCAB = Object.keys(MODULE_META);

function buildSourceSummary(s: CombinedSourceInput, index: number): string {
  const lines: string[] = [];
  lines.push(`Fuente ${index + 1} — módulo "${s.moduleFamily}" (${s.typeName})`);
  lines.push(`  Título: ${s.title}`);
  lines.push(`  Período: ${s.periodStart} a ${s.periodEnd}`);

  const indicators = getComparisonIndicators(s.code, s.results);
  if (indicators.length > 0) {
    lines.push('  Indicadores principales:');
    for (const ind of indicators) {
      lines.push(`    - ${ind.label}: ${formatComparisonValue(ind.value, ind.format)}`);
    }
  }

  if (s.resumenEjecutivo) {
    lines.push(`  Resumen ejecutivo de este análisis: ${s.resumenEjecutivo}`);
  }
  if (s.hallazgosClave.length > 0) {
    lines.push('  Hallazgos clave de este análisis:');
    for (const h of s.hallazgosClave) lines.push(`    - ${h}`);
  }

  return lines.join('\n');
}

function buildSystemPrompt(): string {
  return `Actúa como un consultor senior de estrategia que prepara un "Reporte Especial de Síntesis" para la junta directiva de una empresa latinoamericana, cruzando 2 o más análisis ya publicados de distintos módulos (financiero, clientes, ventas, inventarios, operativo, nómina/talento humano, costos y rentabilidad) de la misma empresa.

Tu tarea NO es resumir cada análisis por separado — eso ya existe en cada informe individual y la junta ya lo leyó. Tu valor agregado es encontrar CONEXIONES reales entre los módulos: patrones, causas y efectos que solo se ven al mirar varios análisis a la vez. Ejemplos del tipo de insight que se busca (son solo ejemplos ilustrativos, no fuerces estos temas si los datos entregados no los sugieren):
- Relación entre rentabilidad por producto/proyecto y rotación de inventario de esos mismos productos.
- Relación entre rotación de personal (o ausentismo) y desempeño/productividad operativa.
- Relación entre concentración de clientes y estacionalidad o crecimiento de ventas.
- Relación entre estructura de costos/margen y variación presupuestal comercial.
- Relación entre liquidez/endeudamiento financiero y decisiones observadas en otros módulos (inversión, nómina, inventario).

REGLA DE HONESTIDAD, la más importante de este informe: si los análisis entregados en este caso concreto NO tienen ninguna conexión temática real entre sí (p.ej. períodos muy distintos, módulos sin relación de causalidad plausible, o simplemente datos insuficientes para cruzar), DEBES decirlo explícitamente en "resumen_ejecutivo" y dejar "conexiones_identificadas" vacío o con muy pocas entradas genuinas — nunca inventes una relación forzada solo para llenar el campo. Una síntesis honesta que diga "no se identificaron conexiones significativas más allá de lo ya reportado individualmente" vale más que una que invente causalidad donde no la hay.

Responde ÚNICAMENTE con un objeto JSON válido, sin texto antes ni después, sin bloques de código markdown (nada de \`\`\`json ni \`\`\`), con exactamente esta estructura:
{
  "resumen_ejecutivo": "3-5 frases sobre qué revela el cruce de estos análisis en conjunto, tono de informe de junta directiva",
  "dictamen": "favorable" | "favorable_con_observaciones" | "requiere_atencion" | "critico",
  "fuentes_utilizadas": [{ "tipo": "nombre legible del tipo de análisis tal como se te dio entre paréntesis, ej. 'Análisis de Ventas' — NUNCA el slug de módulo entre comillas", "periodo": "período del análisis fuente", "titulo": "título del análisis fuente" }],
  "hallazgos_clave": ["hallazgo con cifra concreta, citando el módulo de origen", "..."],
  "conexiones_identificadas": [
    { "descripcion": "insight concreto que cruza 2+ módulos, con cifras de ambos lados de la conexión", "modulos_involucrados": ["usa exactamente estos valores según aplique: ${MODULE_VOCAB.map((m) => `'${m}'`).join(', ')}"] }
  ],
  "riesgos": [{ "descripcion": "riesgo que surge específicamente del cruce entre módulos, no un riesgo ya reportado en un solo análisis individual", "nivel": "verde" | "amarillo" | "rojo", "prioridad": "alta" | "media" | "baja" }],
  "recomendaciones": [{ "accion": "acción concreta que solo tiene sentido viendo el cruce de módulos", "responsable_sugerido": "rol responsable", "horizonte": "plazo sugerido (p.ej. 'inmediato', '30 días', 'próximo trimestre')" }],
  "conclusion": "2-3 frases de cierre sobre el valor de esta síntesis y el dictamen general"
}

Reglas:
- "fuentes_utilizadas" debe listar TODAS las fuentes entregadas, en el mismo orden en que se te presentaron. El campo "tipo" de cada una es el nombre legible del tipo de análisis (el texto entre paréntesis de cada fuente, ej. "Análisis de Ventas"), NUNCA el slug de módulo entre comillas que aparece antes del paréntesis (ese slug es SOLO para "modulos_involucrados").
- Cada elemento de "conexiones_identificadas.modulos_involucrados" debe ser uno de los slugs exactos de módulo indicados arriba (en minúsculas, sin acentos) — nunca inventes un nombre de módulo distinto.
- "dictamen" refleja la severidad combinada de lo que el cruce revela, no un promedio de los dictámenes individuales — si el cruce no revela nada preocupante nuevo, "favorable" o "favorable_con_observaciones" son válidos aunque algún análisis individual haya sido más severo por su cuenta.
- No repitas literalmente los hallazgos_clave de cada análisis individual — solo inclúyelos si son necesarios para sustentar una conexión o hallazgo cruzado.
- No agregues explicaciones, disculpas ni texto fuera del objeto JSON.`;
}

function buildUserPrompt(input: { companyName: string; title: string; sources: CombinedSourceInput[] }): string {
  const sourcesText = input.sources.map((s, i) => buildSourceSummary(s, i)).join('\n\n');

  return `Empresa: ${input.companyName}
Título del reporte combinado: ${input.title}
Número de análisis fuente: ${input.sources.length}

${sourcesText}

Genera el "Reporte Especial de Síntesis" en el formato JSON indicado, listando en "fuentes_utilizadas" las ${input.sources.length} fuentes en el mismo orden en que se presentaron arriba.`;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) => typeof v === 'string');
}

function parseNarrativeJson(text: string): CombinedNarrative | null {
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
    Array.isArray(obj.fuentes_utilizadas) &&
    obj.fuentes_utilizadas.every((f: any) => f && typeof f.tipo === 'string' && typeof f.periodo === 'string' && typeof f.titulo === 'string') &&
    isStringArray(obj.hallazgos_clave) &&
    Array.isArray(obj.conexiones_identificadas) &&
    obj.conexiones_identificadas.every((c: any) => c && typeof c.descripcion === 'string' && isStringArray(c.modulos_involucrados)) &&
    Array.isArray(obj.riesgos) &&
    obj.riesgos.every((r: any) => r && typeof r.descripcion === 'string' && ['verde', 'amarillo', 'rojo'].includes(r.nivel) && ['alta', 'media', 'baja'].includes(r.prioridad)) &&
    Array.isArray(obj.recomendaciones) &&
    obj.recomendaciones.every((r: any) => r && typeof r.accion === 'string' && typeof r.responsable_sugerido === 'string' && typeof r.horizonte === 'string') &&
    typeof obj.conclusion === 'string';

  return isValid ? (obj as CombinedNarrative) : null;
}

/**
 * Genera la síntesis cruzada de un Análisis Combinado vía la API de
 * Anthropic. A diferencia de los demás módulos, aquí la narrativa ES el
 * producto (combined_analyses no tiene columna "results" propia) — un
 * fallo real (no solo API key ausente) debe tratarse como error visible
 * para el admin, no como narrative=null silencioso.
 */
export async function generateCombinedNarrative(input: {
  companyName: string;
  title: string;
  sources: CombinedSourceInput[];
}): Promise<CombinedNarrative | null> {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.warn('[COMBINED_NARRATIVE] ANTHROPIC_API_KEY no configurada — no se puede generar la síntesis.');
    return null;
  }

  const client = new Anthropic();

  try {
    const response = await client.messages.create({
      model: ANTHROPIC_MODEL,
      // Varias fuentes completas (indicadores + resumen + hallazgos de cada
      // una) inflan el prompt más que un solo análisis — ver nota en
      // generate-sales-narrative.ts / generate-operations-narrative.ts sobre
      // por qué 8000 no basta con prompts de este tamaño.
      max_tokens: 12000,
      system: buildSystemPrompt(),
      messages: [{ role: 'user', content: buildUserPrompt(input) }],
    });

    const textBlock = response.content.find((b): b is Anthropic.TextBlock => b.type === 'text');
    if (!textBlock) {
      console.error('[COMBINED_NARRATIVE] Respuesta de Anthropic sin contenido de texto:', JSON.stringify(response).substring(0, 300));
      return null;
    }

    const parsed = parseNarrativeJson(textBlock.text);
    if (!parsed) {
      console.error('[COMBINED_NARRATIVE] No se pudo parsear/validar el JSON de la respuesta:', textBlock.text.substring(0, 500));
      return null;
    }

    return parsed;
  } catch (e: any) {
    console.error('[COMBINED_NARRATIVE] Excepción llamando a Anthropic:', e.message);
    return null;
  }
}
