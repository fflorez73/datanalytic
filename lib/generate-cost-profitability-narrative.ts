import 'server-only';
import Anthropic from '@anthropic-ai/sdk';
import { formatCostValue, type CostAnalyticsResult } from './cost-profitability-analytics';

const ANTHROPIC_MODEL = 'claude-opus-5';

const SECCION_TITULOS = [
  'Rentabilidad por Producto/Proyecto',
  'Estructura de Costos y Punto de Equilibrio',
  'Variación Presupuestal',
  'Retorno de Inversión y Recomendaciones de Portafolio',
] as const;

export type CostProfitabilityNarrative = {
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

function buildResultsSummary(results: CostAnalyticsResult): string {
  const lines: string[] = [];
  const r = results.resumen;

  if (r) {
    lines.push(`Resumen de costos y rentabilidad (${r.numProductos} producto(s)/proyecto(s) analizados):`);
    lines.push(`  - Ingreso total: ${r.ingresoTotal !== null ? formatCostValue(r.ingresoTotal, 'currency') : 'no disponible'}`);
    lines.push(`  - Costo variable total: ${r.costoVariableTotal !== null ? formatCostValue(r.costoVariableTotal, 'currency') : 'no disponible'}`);
    lines.push(`  - Costo fijo total: ${r.costoFijoTotal !== null ? formatCostValue(r.costoFijoTotal, 'currency') : 'no disponible'}`);
    lines.push(`  - Margen de contribución total: ${r.margenContribucionTotal !== null ? formatCostValue(r.margenContribucionTotal, 'currency') : 'no disponible (falta ingreso y/o costo variable)'}`);
    lines.push(`  - Margen de contribución % consolidado (ponderado por ingreso): ${r.margenContribucionPromedioPct !== null ? formatCostValue(r.margenContribucionPromedioPct, 'percent') : 'no disponible'}`);
    lines.push(`  - Utilidad neta total: ${r.utilidadNetaTotal !== null ? formatCostValue(r.utilidadNetaTotal, 'currency') : 'no disponible (falta costo fijo asignado)'}`);
    lines.push(`  - Productos/proyectos en pérdida: ${r.numProductosEnPerdida !== null ? `${r.numProductosEnPerdida} de ${r.numProductos}` : 'no evaluable (falta ingreso, costo variable y/o costo fijo)'}`);
    lines.push(`  - Punto de equilibrio consolidado ($): ${r.puntoEquilibrioConsolidadoValor !== null ? formatCostValue(r.puntoEquilibrioConsolidadoValor, 'currency') : 'no disponible (falta costo fijo y/o margen de contribución %)'}`);
    lines.push(`  - Estructura de costos: ${r.pctCostoVariable !== null && r.pctCostoFijo !== null ? `${formatCostValue(r.pctCostoVariable, 'percent')} variable / ${formatCostValue(r.pctCostoFijo, 'percent')} fijo` : 'no disponible'}`);
    lines.push(`  - Variación presupuestal consolidada (ponderada por presupuesto): ${r.variacionPresupuestalPromedioPct !== null ? `${r.variacionPresupuestalPromedioPct >= 0 ? '+' : ''}${formatCostValue(r.variacionPresupuestalPromedioPct, 'percent')}` : 'no disponible (falta columna de presupuesto/meta de ingreso)'}`);
    lines.push(`  - ROI consolidado: ${r.roiConsolidadoPct !== null ? formatCostValue(r.roiConsolidadoPct, 'percent') : 'no disponible (falta inversión inicial)'}`);
  }

  const comp = results.comparativo_periodo_anterior;
  if (comp) {
    lines.push('');
    lines.push(`Comparativo contra el período cerrado en ${comp.period_end_base}:`);
    const labels: Record<string, { label: string; format: 'percent' | 'currency' }> = {
      ingreso_total: { label: 'Ingreso total', format: 'currency' },
      costo_total: { label: 'Costo total', format: 'currency' },
      margen_contribucion_promedio_pct: { label: 'Margen de contribución %', format: 'percent' },
      utilidad_neta_total: { label: 'Utilidad neta total', format: 'currency' },
      roi_consolidado_pct: { label: 'ROI consolidado', format: 'percent' },
    };
    for (const [key, entry] of Object.entries(comp.indicadores)) {
      if (!entry) continue;
      const def = labels[key];
      const variacion = entry.variacion_relativa_pct !== null
        ? `${entry.variacion_relativa_pct >= 0 ? '+' : ''}${entry.variacion_relativa_pct.toFixed(1)}%`
        : `variación absoluta ${entry.variacion_absoluta}`;
      lines.push(`  - ${def.label}: de ${formatCostValue(entry.valor_anterior, def.format)} a ${formatCostValue(entry.valor_actual, def.format)} (${variacion})`);
    }
  }

  if (results.items.length > 0) {
    lines.push('');
    lines.push('Detalle por producto/proyecto:');
    for (const it of results.items) {
      const parts: string[] = [];
      if (it.ingreso !== null) parts.push(`ingreso ${formatCostValue(it.ingreso, 'currency')}`);
      if (it.margenContribucionPct !== null) parts.push(`margen contribución ${formatCostValue(it.margenContribucionPct, 'percent')}`);
      if (it.utilidadNeta !== null) parts.push(`utilidad neta ${formatCostValue(it.utilidadNeta, 'currency')}`);
      if (it.puntoEquilibrioValor !== null) parts.push(`punto de equilibrio ${formatCostValue(it.puntoEquilibrioValor, 'currency')}`);
      if (it.variacionPresupuestalPct !== null) parts.push(`var. presupuestal ${it.variacionPresupuestalPct >= 0 ? '+' : ''}${formatCostValue(it.variacionPresupuestalPct, 'percent')}`);
      if (it.roiPct !== null) parts.push(`ROI ${formatCostValue(it.roiPct, 'percent')}`);
      if (it.enPerdida === true) parts.push('EN PÉRDIDA');
      lines.push(`  - ${it.producto}: ${parts.length > 0 ? parts.join(', ') : 'sin indicadores calculables'}`);
    }
  }

  if (results.ranking) {
    lines.push('');
    lines.push(`Ranking de rentabilidad (métrica usada: ${results.ranking.metrica}, por ser la de mayor cobertura de datos):`);
    if (results.ranking.mejor) lines.push(`  - Más rentable: ${results.ranking.mejor.producto} (${results.ranking.mejor.valor.toFixed(2)})`);
    if (results.ranking.peor) lines.push(`  - Menos rentable: ${results.ranking.peor.producto} (${results.ranking.peor.valor.toFixed(2)})`);
    lines.push(`  - Orden completo: ${results.ranking.items.map((i) => `${i.producto} (${i.valor.toFixed(2)}${i.enPerdida ? ', en pérdida' : ''})`).join(', ')}`);
  } else {
    lines.push('');
    lines.push('Ranking de rentabilidad: NO DISPONIBLE — ningún producto/proyecto tiene datos suficientes para utilidad neta o margen de contribución.');
  }

  if (results.productosEnPerdida.length > 0) {
    lines.push('');
    lines.push('Productos/proyectos en pérdida (diagnóstico determinístico):');
    for (const p of results.productosEnPerdida) {
      lines.push(`  - ${p.producto}: ${p.diagnostico}`);
    }
  }

  return lines.join('\n');
}

function buildSystemPrompt(): string {
  return `Actúa como un controller / analista senior de costos y control de gestión de una firma consultora, preparando un informe ejecutivo de rentabilidad por producto/proyecto para la junta directiva de una empresa latinoamericana — con la profundidad y el rigor de un informe de asesor externo, no un resumen automático. Tu audiencia son directores que toman decisiones de portafolio (qué producto/proyecto mantener, escalar, reestructurar o descontinuar), no analistas de datos: sé directo, específico y accionable, nunca genérico.

Este módulo es deliberadamente flexible: la empresa pudo haber suministrado solo algunas columnas (ingreso, costo variable, costo fijo, presupuesto, inversión inicial, unidades). Cita SIEMPRE cifras exactas de los datos entregados, identificando el producto/proyecto exacto en cada afirmación relevante. CUANDO UN INDICADOR O UNA SECCIÓN COMPLETA NO TENGA DATOS SUFICIENTES (aparece como "no disponible" o "NO DISPONIBLE" en el resumen), DEBES decirlo explícitamente en esa sección o hallazgo — nunca inventes una cifra ni una descripción genérica para rellenar. Es preferible una sección corta y honesta ("no se pudo evaluar X por falta de la columna Y") que una narrativa que simule tener datos que no existen. Esta misma honestidad aplica al campo "riesgos": nunca describas un indicador como sano si en realidad no fue calculable por falta de datos — dilo como una limitación de información, no como un riesgo "verde".

Responde ÚNICAMENTE con un objeto JSON válido, sin texto antes ni después, sin bloques de código markdown (nada de \`\`\`json ni \`\`\`), con exactamente esta estructura:
{
  "resumen_ejecutivo": "2-4 frases sobre la salud de rentabilidad del portafolio, tono de informe de junta directiva",
  "dictamen": "favorable" | "favorable_con_observaciones" | "requiere_atencion" | "critico",
  "hallazgos_clave": ["hallazgo con cifra concreta y producto/proyecto identificado cuando aplique", "..."],
  "secciones": [
    { "titulo": "Rentabilidad por Producto/Proyecto", "analisis": "párrafo de 3-5 líneas, o explicación honesta de qué falta si no hay datos" },
    { "titulo": "Estructura de Costos y Punto de Equilibrio", "analisis": "párrafo de 3-5 líneas, o explicación honesta de qué falta si no hay datos" },
    { "titulo": "Variación Presupuestal", "analisis": "párrafo de 3-5 líneas, o explicación honesta de qué falta si no hay datos" },
    { "titulo": "Retorno de Inversión y Recomendaciones de Portafolio", "analisis": "párrafo de 3-5 líneas, o explicación honesta de qué falta si no hay datos" }
  ],
  "riesgos": [
    { "descripcion": "riesgo concreto citando el producto/proyecto/indicador que lo origina", "nivel": "verde" | "amarillo" | "rojo", "tendencia": "mejora" | "estable" | "deterioro", "prioridad": "alta" | "media" | "baja" }
  ],
  "senales_alerta": ["umbral concreto a vigilar, ej: 'Margen de contribución del Producto X por debajo de 20%' o 'Variación presupuestal superando -15%'"],
  "recomendaciones": [
    { "accion": "acción concreta y accionable, citando producto/proyecto específico cuando aplique", "responsable_sugerido": "rol responsable (p.ej. 'Gerencia Financiera', 'Control de Gestión', 'Gerencia Comercial', 'Dirección de Portafolio')", "horizonte": "plazo sugerido (p.ej. 'inmediato', '30 días', 'próximo trimestre')" }
  ],
  "conclusion": "2-3 frases de cierre sobre la salud del portafolio y el dictamen general"
}

Cada "analisis" de "secciones" con datos disponibles debe tener la misma profundidad que el cuerpo de un informe de junta directiva real: un párrafo narrativo de 3-5 líneas que conecte varias cifras entre sí (p.ej. cómo un producto con margen de contribución alto puede seguir en pérdida si el costo fijo asignado es desproporcionado, o cómo un ROI atractivo en un proyecto convive con una variación presupuestal negativa que compromete el flujo de caja). Usa exactamente los 4 títulos de sección indicados arriba, en ese orden.

Reglas:
- "dictamen" refleja la severidad combinada de los indicadores SÍ disponibles: "favorable" si la mayoría de productos/proyectos generan utilidad y el margen consolidado es sano, "favorable_con_observaciones" si hay puntos aislados a vigilar sin amenaza real al portafolio, "requiere_atencion" si hay uno o más productos/proyectos en pérdida o con variación presupuestal negativa relevante, "critico" si la pérdida es generalizada o compromete el margen consolidado del portafolio. Si casi no hay datos calculables, el dictamen no puede ser "favorable" solo por ausencia de problemas detectados — usa "favorable_con_observaciones" y dilo en el resumen.
- "riesgos" prioriza de mayor a menor severidad ("prioridad": "alta" primero); no inventes riesgos para llenar el campo si no los hay. Todo producto/proyecto listado como "en pérdida" en el resumen debe reflejarse en al menos un riesgo.
- "senales_alerta" son umbrales concretos y verificables a futuro (con número), no advertencias vagas.
- "recomendaciones" deben ser accionables y específicas, nunca frases de relleno ("mejorar la rentabilidad"). Prioriza: (1) decidir sobre cada producto/proyecto en pérdida (reestructurar precio/costo, o descontinuar), (2) corregir la causa de una variación presupuestal negativa relevante, (3) revisar la asignación de costo fijo si distorsiona la utilidad de un producto con buen margen de contribución, (4) capitalizar el/los producto(s)/proyecto(s) más rentables o con mejor ROI.
- No uses frases genéricas de relleno. Cada afirmación debe referirse a un número o producto/proyecto concreto de los datos dados.
- No agregues explicaciones, disculpas ni texto fuera del objeto JSON.`;
}

function buildUserPrompt(input: {
  companyName: string;
  periodStart: string;
  periodEnd: string;
  analysisTypeName: string;
  results: CostAnalyticsResult;
}): string {
  const warnings = input.results.warnings;

  return `Empresa: ${input.companyName}
Período analizado: ${input.periodStart} a ${input.periodEnd}
Tipo de análisis: ${input.analysisTypeName}

${buildResultsSummary(input.results)}
${warnings.length > 0 ? `\nAdvertencias del motor de cálculo:\n${warnings.map((w) => `- ${w}`).join('\n')}` : ''}

Genera el informe ejecutivo en el formato JSON indicado, usando exactamente estos 4 títulos de sección en este orden: ${SECCION_TITULOS.map((t) => `"${t}"`).join(', ')}.`;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) => typeof v === 'string');
}

function parseNarrativeJson(text: string): CostProfitabilityNarrative | null {
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

  return isValid ? (obj as CostProfitabilityNarrative) : null;
}

/**
 * Genera la narrativa ejecutiva de un análisis de costos y rentabilidad vía
 * la API de Anthropic. Nunca lanza — devuelve null en cualquier fallo para
 * que el llamador pueda guardar narrative=null sin bloquear la creación del
 * análisis.
 */
export async function generateCostProfitabilityNarrative(input: {
  companyName: string;
  periodStart: string;
  periodEnd: string;
  analysisTypeName: string;
  results: CostAnalyticsResult;
}): Promise<CostProfitabilityNarrative | null> {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.warn('[COST_PROFITABILITY_NARRATIVE] ANTHROPIC_API_KEY no configurada — se omite la narrativa ejecutiva.');
    return null;
  }

  const client = new Anthropic();

  try {
    const response = await client.messages.create({
      model: ANTHROPIC_MODEL,
      // Ver nota en generate-sales-narrative.ts / generate-operations-narrative.ts /
      // generate-combined-narrative.ts. 20000 sigue por debajo del techo de
      // 21333 que exige pasar a streaming (calculateNonstreamingTimeout).
      max_tokens: 20000,
      system: buildSystemPrompt(),
      messages: [{ role: 'user', content: buildUserPrompt(input) }],
    });

    if (response.stop_reason === 'max_tokens') {
      console.error('[COST_PROFITABILITY_NARRATIVE] Respuesta truncada por max_tokens (thinking + output excedieron el presupuesto) — usage:', JSON.stringify(response.usage));
      return null;
    }

    const textBlock = response.content.find((b): b is Anthropic.TextBlock => b.type === 'text');
    if (!textBlock) {
      console.error('[COST_PROFITABILITY_NARRATIVE] Respuesta de Anthropic sin contenido de texto:', JSON.stringify(response).substring(0, 300));
      return null;
    }

    const parsed = parseNarrativeJson(textBlock.text);
    if (!parsed) {
      console.error('[COST_PROFITABILITY_NARRATIVE] No se pudo parsear/validar el JSON de la respuesta:', textBlock.text.substring(0, 500));
      return null;
    }

    return parsed;
  } catch (e: any) {
    console.error('[COST_PROFITABILITY_NARRATIVE] Excepción llamando a Anthropic:', {
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
