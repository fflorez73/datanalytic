import 'server-only';
import { formatInventoryValue, type InventoryAnalyticsResult } from './inventory-analytics';
import { generateNarrativeWithFallback, type AiProvider } from './ai-client';

const SECCION_TITULOS = [
  'Valorización y Niveles de Stock',
  'Rotación y Cobertura de Inventario',
  'Clasificación ABC',
  'Riesgo de Quiebre y Obsolescencia',
] as const;

export type InventoryNarrative = {
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
  /** Proveedor de IA que generó esta narrativa — 'gemini' solo cuando Claude falló y se usó el respaldo. */
  ai_provider?: AiProvider;
};

function buildResultsSummary(results: InventoryAnalyticsResult): string {
  const lines: string[] = [];
  const r = results.resumen;

  if (r) {
    lines.push('Resumen de inventario:');
    lines.push(`  - Valor total del inventario: ${formatInventoryValue(r.valorTotalInventario, 'currency')} en ${r.numSkus} SKU(s)`);
    if (r.rotacionAnualizada !== null) lines.push(`  - Rotación anualizada: ${r.rotacionAnualizada.toFixed(2)}x/año (período: ${r.rotacionPeriodo?.toFixed(2)}x)`);
    if (r.coberturaDiasPromedio !== null) lines.push(`  - Cobertura promedio: ${formatInventoryValue(r.coberturaDiasPromedio, 'days')}`);
    lines.push(`  - % del valor en riesgo de quiebre: ${formatInventoryValue(r.pctValorRiesgoQuiebre, 'percent')} (${r.pctSkusRiesgoQuiebre.toFixed(1)}% de los SKUs)`);
    lines.push(`  - % del valor en sobrestock: ${formatInventoryValue(r.pctValorSobrestock, 'percent')}`);
    lines.push(`  - % del valor obsoleto/dead stock: ${formatInventoryValue(r.pctValorObsoleto, 'percent')}`);
  }

  const comp = results.comparativo_periodo_anterior;
  if (comp) {
    lines.push('');
    lines.push(`Comparativo contra el período cerrado en ${comp.period_end_base}:`);
    const labels: Record<string, { label: string; format: 'currency' | 'percent' | 'ratio' | 'days' }> = {
      valor_total_inventario: { label: 'Valor total inventario', format: 'currency' },
      rotacion_anualizada: { label: 'Rotación anualizada', format: 'ratio' },
      cobertura_dias_promedio: { label: 'Cobertura promedio', format: 'days' },
      pct_valor_riesgo_quiebre: { label: '% valor en riesgo de quiebre', format: 'percent' },
    };
    for (const [key, entry] of Object.entries(comp.indicadores)) {
      if (!entry) continue;
      const def = labels[key];
      const variacion = entry.variacion_relativa_pct !== null
        ? `${entry.variacion_relativa_pct >= 0 ? '+' : ''}${entry.variacion_relativa_pct.toFixed(1)}%`
        : `variación absoluta ${entry.variacion_absoluta}`;
      lines.push(`  - ${def.label}: de ${formatInventoryValue(entry.valor_anterior, def.format)} a ${formatInventoryValue(entry.valor_actual, def.format)} (${variacion})`);
    }
  }

  if (results.valorizacionPorCategoria.length > 0) {
    lines.push('');
    lines.push('Valorización por categoría:');
    for (const c of results.valorizacionPorCategoria) {
      lines.push(`  - ${c.categoria}: ${formatInventoryValue(c.valor, 'currency')} (${c.pctTotal.toFixed(1)}% del total, ${c.numSkus} SKU(s))`);
    }
  }

  if (results.abcResumenPorClase.length > 0) {
    lines.push('');
    lines.push('Clasificación ABC (Pareto por valor):');
    for (const c of results.abcResumenPorClase) {
      lines.push(`  - Clase ${c.clase}: ${c.numSkus} SKU(s) (${c.pctSkus.toFixed(1)}% del catálogo) representan ${formatInventoryValue(c.valor, 'currency')} (${c.pctValor.toFixed(1)}% del valor total)`);
    }
  }

  if (results.items.length > 0) {
    lines.push('');
    lines.push('Detalle por SKU (ordenado por valor, top 15):');
    for (const it of results.items.slice(0, 15)) {
      lines.push(
        `  - ${it.sku}${it.categoria ? ` (${it.categoria})` : ''}: valor ${formatInventoryValue(it.valorInventario, 'currency')} (${it.pctValorTotal.toFixed(1)}%), clase ${it.claseAbc}, stock ${it.stock}, ${it.rotacionPeriodo !== null ? `rotación período ${it.rotacionPeriodo.toFixed(2)}x` : 'sin rotación calculada'}${it.coberturaDias !== null ? `, cobertura ${it.coberturaDias.toFixed(0)} días` : ''}${it.enRiesgoQuiebre ? ' — EN RIESGO DE QUIEBRE' : ''}${it.enSobrestock ? ' — SOBRESTOCK' : ''}${it.esObsoleto ? ' — OBSOLETO' : ''}`
      );
    }
  }

  if (results.riesgoQuiebre.length > 0) {
    lines.push('');
    lines.push('Diagnóstico individual — SKUs en riesgo de quiebre:');
    for (const it of results.riesgoQuiebre) {
      lines.push(
        `  - ${it.sku}${it.categoria ? ` (${it.categoria})` : ''}: stock ${it.stock}, cobertura ${it.coberturaDias !== null ? `${it.coberturaDias.toFixed(0)} días` : 'N/D'}, lead time ${it.leadTimeDias ?? 'N/D (umbral genérico 7d)'}, punto de reorden estimado ${it.puntoReorden ?? 'N/D'}, diagnóstico: "${it.diagnostico}"`
      );
    }
  }

  if (results.sobrestock.length > 0) {
    lines.push('');
    lines.push('SKUs en sobrestock (top 10):');
    for (const it of results.sobrestock.slice(0, 10)) {
      lines.push(`  - ${it.sku}${it.categoria ? ` (${it.categoria})` : ''}: valor inmovilizado ${formatInventoryValue(it.valorInventario, 'currency')}, ${it.diagnostico}`);
    }
  }

  if (results.obsolescencia.length > 0) {
    lines.push('');
    lines.push('SKUs obsoletos / dead stock (top 10):');
    for (const it of results.obsolescencia.slice(0, 10)) {
      lines.push(`  - ${it.sku}${it.categoria ? ` (${it.categoria})` : ''}: valor inmovilizado ${formatInventoryValue(it.valorInventario, 'currency')}, ${it.diagnostico}`);
    }
  }

  if (results.controlEstado && results.controlEstado.length > 0) {
    lines.push('');
    lines.push('Control de estado del inventario:');
    for (const e of results.controlEstado) {
      lines.push(`  - ${e.estado}: ${e.numSkus} SKU(s), ${formatInventoryValue(e.valor, 'currency')} (${e.pctValor.toFixed(1)}% del valor total)`);
    }
  }

  if (results.proveedores && results.proveedores.length > 0) {
    lines.push('');
    lines.push('Concentración por proveedor:');
    for (const p of results.proveedores.slice(0, 10)) {
      lines.push(`  - ${p.proveedor}: ${formatInventoryValue(p.valor, 'currency')} (${p.pctTotal.toFixed(1)}% del total, ${p.numSkus} SKU(s))`);
    }
  }

  return lines.join('\n');
}

function buildSystemPrompt(): string {
  return `Actúa como un experto en gestión de inventarios / supply chain de una firma consultora, preparando un informe ejecutivo de diagnóstico de inventarios para la junta directiva de una empresa latinoamericana — con la profundidad y el rigor de un informe de asesor externo, no un resumen automático. Tu audiencia son directores que toman decisiones de operaciones y capital de trabajo, no analistas de datos: sé directo, específico y accionable, nunca genérico.

Cita SIEMPRE cifras exactas de los datos entregados (p.ej. "el SKU-104 tiene 6 días de cobertura frente a un lead time de 15 días" en vez de "hay riesgo de quiebre"). Identifica SKUs/productos/categorías/proveedores por su nombre o código exacto en cada afirmación relevante. Si un dato no está disponible (p.ej. no hay lead time o no hay estado), no lo inventes ni lo menciones como si existiera.

Responde ÚNICAMENTE con un objeto JSON válido, sin texto antes ni después, sin bloques de código markdown (nada de \`\`\`json ni \`\`\`), con exactamente esta estructura:
{
  "resumen_ejecutivo": "2-4 frases sobre el estado general del inventario, tono de informe de junta directiva",
  "dictamen": "favorable" | "favorable_con_observaciones" | "requiere_atencion" | "critico",
  "hallazgos_clave": ["hallazgo con cifra concreta y SKU/categoría identificado cuando aplique", "..."],
  "secciones": [
    { "titulo": "Valorización y Niveles de Stock", "analisis": "párrafo de 3-5 líneas" },
    { "titulo": "Rotación y Cobertura de Inventario", "analisis": "párrafo de 3-5 líneas" },
    { "titulo": "Clasificación ABC", "analisis": "párrafo de 3-5 líneas" },
    { "titulo": "Riesgo de Quiebre y Obsolescencia", "analisis": "párrafo de 3-5 líneas" }
  ],
  "riesgos": [
    { "descripcion": "riesgo concreto citando SKU(s)/categoría e indicador que lo origina", "nivel": "verde" | "amarillo" | "rojo", "tendencia": "mejora" | "estable" | "deterioro", "prioridad": "alta" | "media" | "baja" }
  ],
  "senales_alerta": ["umbral concreto a vigilar, ej: 'Cobertura de cualquier SKU clase A por debajo de 15 días' o 'Valor obsoleto superando el 10% del inventario'"],
  "recomendaciones": [
    { "accion": "acción concreta y accionable, citando SKU(s)/categoría/proveedor específicos cuando aplique", "responsable_sugerido": "rol responsable (p.ej. 'Compras / Abastecimiento', 'Logística / Almacén', 'Comercial / Ventas', 'Finanzas')", "horizonte": "plazo sugerido (p.ej. 'inmediato', '30 días', 'próximo trimestre')" }
  ],
  "conclusion": "2-3 frases de cierre sobre la salud del inventario y el dictamen general"
}

Cada "analisis" de "secciones" debe tener la misma profundidad que el cuerpo de un informe de junta directiva real: no una lista de bullets ni una frase suelta, sino un párrafo narrativo de 3-5 líneas que conecte varias cifras entre sí (p.ej. cómo la concentración de valor en la clase A explica dónde debe enfocarse el control, o cómo el sobrestock en una categoría convive con quiebres en otra evidenciando un problema de planeación, no de capital). Usa exactamente los 4 títulos de sección indicados arriba, en ese orden.

Reglas:
- "dictamen" refleja la severidad combinada: "favorable" si la rotación es sana, la cobertura razonable y el riesgo de quiebre/obsolescencia bajo, "favorable_con_observaciones" si hay puntos a vigilar (sobrestock moderado, algunos SKUs en riesgo) sin amenaza real, "requiere_atencion" si el valor en riesgo de quiebre o el valor obsoleto superan el 15% del inventario, o la rotación es baja, "critico" si hay quiebres activos en SKUs clase A o una porción crítica del capital de trabajo inmovilizada en obsolescencia.
- "riesgos" prioriza de mayor a menor severidad ("prioridad": "alta" primero); no inventes riesgos para llenar el campo si no los hay, pero el riesgo de quiebre en clase A y el valor obsoleto/dead stock siempre deben evaluarse como candidatos.
- "senales_alerta" son umbrales concretos y verificables a futuro (con número), no advertencias vagas.
- "recomendaciones" deben ser accionables y específicas, nunca frases de relleno ("mejorar la gestión de inventario"). Prioriza: (1) resolver quiebres activos o inminentes en SKUs clase A, (2) liquidar o dar de baja el dead stock/obsolescencia, (3) ajustar el punto de reorden donde el lead time lo justifique, (4) revisar la concentración por proveedor si es alta.
- No uses frases genéricas de relleno. Cada afirmación debe referirse a un número o SKU/categoría concreto de los datos dados.
- No agregues explicaciones, disculpas ni texto fuera del objeto JSON.`;
}

function buildUserPrompt(input: {
  companyName: string;
  periodStart: string;
  periodEnd: string;
  analysisTypeName: string;
  results: InventoryAnalyticsResult;
}): string {
  const warnings = input.results.warnings;

  return `Empresa: ${input.companyName}
Período analizado: ${input.periodStart} a ${input.periodEnd}
Tipo de análisis: ${input.analysisTypeName}
Fecha de referencia para obsolescencia (fin de período): ${input.results.fechaReferencia ?? input.periodEnd}

${buildResultsSummary(input.results)}
${warnings.length > 0 ? `\nAdvertencias del motor de cálculo:\n${warnings.map((w) => `- ${w}`).join('\n')}` : ''}

Genera el informe ejecutivo en el formato JSON indicado, usando exactamente estos 4 títulos de sección en este orden: ${SECCION_TITULOS.map((t) => `"${t}"`).join(', ')}.`;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) => typeof v === 'string');
}

function parseNarrativeJson(text: string): InventoryNarrative | null {
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

  return isValid ? (obj as InventoryNarrative) : null;
}

/**
 * Genera la narrativa ejecutiva de un análisis de inventarios vía la API de
 * Anthropic. Nunca lanza — devuelve null en cualquier fallo para que el
 * llamador pueda guardar narrative=null sin bloquear la creación del análisis.
 */
export async function generateInventoryNarrative(input: {
  companyName: string;
  periodStart: string;
  periodEnd: string;
  analysisTypeName: string;
  results: InventoryAnalyticsResult;
}): Promise<InventoryNarrative | null> {
  try {
    const { data, provider } = await generateNarrativeWithFallback({
      system: buildSystemPrompt(),
      user: buildUserPrompt(input),
      // Ver nota en generate-sales-narrative.ts / generate-combined-narrative.ts:
      // con datasets de tamaño realista (muchos SKUs) el consumo variable de
      // "thinking" tokens deja poco margen a max_tokens bajos. 20000 sigue por
      // debajo del techo de 21333 que exige pasar a streaming
      // (calculateNonstreamingTimeout).
      maxTokens: 20000,
      parse: parseNarrativeJson,
      logPrefix: '[INVENTORY_NARRATIVE]',
    });

    return { ...data, ai_provider: provider };
  } catch (e: any) {
    console.error('[INVENTORY_NARRATIVE] No se pudo generar la narrativa ejecutiva (Claude y Gemini fallaron):', {
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
