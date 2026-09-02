import 'server-only';
import { getComparisonIndicators, formatComparisonValue } from './comparison-indicators';
import { generateNarrativeWithFallback, type AiProvider } from './ai-client';

export type ComparisonNarrative = {
  resumen: string;
  tendencia_general: 'positiva' | 'estable' | 'negativa' | 'mixta';
  observaciones: string[];
  /** Proveedor de IA que generó esta narrativa — 'gemini' solo cuando Claude falló y se usó el respaldo. */
  ai_provider?: AiProvider;
};

function buildPeriodsSummary(code: string, periods: { periodEnd: string; results: unknown }[]): string {
  return periods
    .map((p) => {
      const indicators = getComparisonIndicators(code, p.results);
      const lines = indicators
        .filter((i) => i.value !== null)
        .map((i) => `  - ${i.label}: ${formatComparisonValue(i.value, i.format)}`);
      return `Período ${p.periodEnd}:\n${lines.length > 0 ? lines.join('\n') : '  (sin indicadores calculables)'}`;
    })
    .join('\n\n');
}

function buildSystemPrompt(): string {
  return `Actúa como un analista que interpreta brevemente, para un ejecutivo que ya está viendo el gráfico de barras con las cifras, la evolución de los indicadores principales de un tipo de análisis a través de varios períodos. No repitas mecánicamente cada cifra del gráfico — sintetiza qué está pasando y por qué importa.

Responde ÚNICAMENTE con un objeto JSON válido, sin texto antes ni después, sin bloques de código markdown (nada de \`\`\`json ni \`\`\`), con exactamente esta estructura:
{
  "resumen": "2-3 frases interpretando la evolución entre los períodos, citando al menos una cifra concreta",
  "tendencia_general": "positiva" | "estable" | "negativa" | "mixta",
  "observaciones": ["observación específica citando cifras y el período al que corresponde", "..."]
}

Reglas:
- "tendencia_general" es "mixta" cuando distintos indicadores se mueven en direcciones opuestas (p.ej. mejora el margen pero empeora la liquidez) — no fuerces "positiva" o "negativa" si la evolución no es consistente en todos los indicadores.
- "observaciones" son 2-4 puntos, cada uno con una cifra concreta y, cuando aplique, el período o el cambio porcentual — nunca una afirmación vaga sin número.
- Si algún indicador no tiene datos en todos los períodos, dilo explícitamente en vez de ignorarlo silenciosamente.
- No agregues explicaciones, disculpas ni texto fuera del objeto JSON.`;
}

function buildUserPrompt(input: { typeName: string; code: string; periods: { periodEnd: string; results: unknown }[] }): string {
  return `Tipo de análisis: ${input.typeName}
Períodos a comparar (${input.periods.length}), en orden cronológico:

${buildPeriodsSummary(input.code, input.periods)}

Genera la interpretación breve en el formato JSON indicado.`;
}

function parseNarrativeJson(text: string): ComparisonNarrative | null {
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
    typeof obj.resumen === 'string' &&
    ['positiva', 'estable', 'negativa', 'mixta'].includes(obj.tendencia_general) &&
    Array.isArray(obj.observaciones) &&
    obj.observaciones.every((o: unknown) => typeof o === 'string');

  return isValid ? (obj as ComparisonNarrative) : null;
}

/**
 * Interpretación breve on-demand de una comparación de períodos — no se
 * persiste en base de datos, se genera al momento cuando el cliente
 * selecciona los períodos a comparar (ver components/compare-periods-panel.tsx).
 * Llamada liviana: prompt corto (solo los indicadores ya extraídos por
 * getComparisonIndicators, no resultados completos) y max_tokens acotado.
 */
export async function generateComparisonNarrative(input: {
  typeName: string;
  code: string;
  periods: { periodEnd: string; results: unknown }[];
}): Promise<ComparisonNarrative | null> {
  if (input.periods.length < 2) return null;

  try {
    const { data, provider } = await generateNarrativeWithFallback({
      system: buildSystemPrompt(),
      user: buildUserPrompt(input),
      // Prompt corto (unos pocos indicadores por período), pero claude-opus-5
      // gasta presupuesto de "thinking" antes de escribir el JSON incluso en
      // respuestas cortas — ver nota extensa en generate-combined-narrative.ts.
      // Medido con datos reales (3 períodos financieros de producción):
      // output_tokens 522-668, thinking_tokens 0 en 4 corridas — pero el
      // thinking de claude-opus-5 es adaptativo e impredecible (en los otros
      // módulos se midió hasta 4254 con prompts de tamaño similar o menor),
      // así que el margen no se limita al mínimo 2x de lo observado (~1336):
      // 8000 deja un colchón mucho mayor sin acercarse al techo de 21333 que
      // exige streaming (calculateNonstreamingTimeout).
      maxTokens: 8000,
      parse: parseNarrativeJson,
      logPrefix: '[COMPARISON_NARRATIVE]',
    });

    return { ...data, ai_provider: provider };
  } catch (e: any) {
    console.error('[COMPARISON_NARRATIVE] No se pudo generar la interpretación (Claude y Gemini fallaron):', {
      message: e?.message,
      status: e?.status,
      name: e?.name,
      error: e?.error ? JSON.stringify(e.error) : undefined,
      headers: e?.headers ? JSON.stringify(e.headers) : undefined,
      stack: e?.stack,
    });
    return null;
  }
}
