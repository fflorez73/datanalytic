import 'server-only';
import Anthropic from '@anthropic-ai/sdk';
import { formatSalesValue, type SalesAnalyticsResult } from './sales-analytics';

const ANTHROPIC_MODEL = 'claude-opus-5';

const SECCION_BASE = ['Evolución y Desempeño de Ventas', 'Análisis Pareto y Concentración de Producto', 'Estacionalidad y Tendencia'] as const;
const SECCION_RENTABILIDAD = 'Rentabilidad por Línea/Canal' as const;

export type SalesNarrative = {
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

function buildResultsSummary(results: SalesAnalyticsResult): string {
  const lines: string[] = [];
  const r = results.resumen;

  if (r) {
    lines.push('Resumen de ventas del período:');
    lines.push(`  - Ventas totales: ${formatSalesValue(r.ventasTotales, 'currency')} | Transacciones: ${r.numTransacciones}`);
    lines.push(`  - Ticket promedio: ${formatSalesValue(r.ticketPromedio, 'currency')}`);
    if (r.unidadesTotales !== null) lines.push(`  - Unidades totales vendidas: ${formatSalesValue(r.unidadesTotales, 'integer')}`);
    if (r.margenBrutoPct !== null) {
      lines.push(`  - Margen bruto total: ${formatSalesValue(r.margenBrutoPct, 'percent')} (${formatSalesValue(r.margenBrutoTotal, 'currency')})`);
    }
  }

  const comp = results.comparativo_periodo_anterior;
  if (comp) {
    lines.push('');
    lines.push(`Comparativo contra el período cerrado en ${comp.period_end_base}:`);
    const labels: Record<string, { label: string; format: 'currency' | 'percent' | 'integer' }> = {
      ventas_totales: { label: 'Ventas totales', format: 'currency' },
      ticket_promedio: { label: 'Ticket promedio', format: 'currency' },
      margen_bruto_pct: { label: 'Margen bruto', format: 'percent' },
      num_transacciones: { label: 'Número de transacciones', format: 'integer' },
    };
    for (const [key, entry] of Object.entries(comp.indicadores)) {
      if (!entry) continue;
      const def = labels[key];
      const variacion = entry.variacion_relativa_pct !== null
        ? `${entry.variacion_relativa_pct >= 0 ? '+' : ''}${entry.variacion_relativa_pct.toFixed(1)}%`
        : `variación absoluta ${entry.variacion_absoluta}`;
      lines.push(`  - ${def.label}: de ${formatSalesValue(entry.valor_anterior, def.format)} a ${formatSalesValue(entry.valor_actual, def.format)} (${variacion})`);
    }
  }

  if (results.evolucionTemporal.length > 0) {
    lines.push('');
    lines.push('Evolución mensual de ventas:');
    for (const p of results.evolucionTemporal) {
      lines.push(`  - ${p.periodo}: ${formatSalesValue(p.monto, 'currency')}${p.cantidad !== null ? ` (${formatSalesValue(p.cantidad, 'integer')} unidades)` : ''}`);
    }
  }

  if (results.estacionalidad) {
    lines.push('');
    lines.push('Estacionalidad:');
    if (results.estacionalidad.mesPico) lines.push(`  - Mes pico: ${results.estacionalidad.mesPico.periodo} con ${formatSalesValue(results.estacionalidad.mesPico.monto, 'currency')}`);
    if (results.estacionalidad.mesValle) lines.push(`  - Mes valle: ${results.estacionalidad.mesValle.periodo} con ${formatSalesValue(results.estacionalidad.mesValle.monto, 'currency')}`);
    if (results.estacionalidad.coeficienteVariacion !== null) lines.push(`  - Coeficiente de variación mensual: ${results.estacionalidad.coeficienteVariacion.toFixed(2)} (más alto = más volátil)`);
  }

  if (results.pareto) {
    lines.push('');
    lines.push(`Análisis Pareto (agrupado por ${results.pareto.dimension === 'producto' ? 'producto/categoría' : 'cliente'}):`);
    lines.push(`  - ${results.pareto.itemsPara80pct} de ${results.pareto.totalItems} ${results.pareto.dimension === 'producto' ? 'productos' : 'clientes'} generan el 80% de las ventas.`);
    for (const item of results.pareto.items.slice(0, 10)) {
      lines.push(`  - ${item.nombre}: ${formatSalesValue(item.monto, 'currency')} (${item.pctTotal.toFixed(1)}% del total, acumulado ${item.pctAcumulado.toFixed(1)}%)`);
    }
  }

  if (results.margenPorProducto && results.margenPorProducto.length > 0) {
    lines.push('');
    lines.push('Margen por producto/categoría (ordenado de mayor a menor margen):');
    for (const m of results.margenPorProducto) {
      lines.push(`  - ${m.nombre}: margen ${m.margenPct.toFixed(1)}% sobre ${formatSalesValue(m.monto, 'currency')} de ventas (costo ${formatSalesValue(m.costo, 'currency')})`);
    }
  }

  if (results.canal && results.canal.length > 0) {
    lines.push('');
    lines.push('Desempeño por canal:');
    for (const c of results.canal) {
      lines.push(`  - ${c.nombre}: ${formatSalesValue(c.monto, 'currency')} (${c.pctTotal.toFixed(1)}% del total, ${c.numTransacciones} transacciones)`);
    }
  }

  return lines.join('\n');
}

function buildSystemPrompt(incluirRentabilidad: boolean): string {
  const titulos = incluirRentabilidad ? [...SECCION_BASE, SECCION_RENTABILIDAD] : [...SECCION_BASE];
  const seccionesJson = titulos.map((t) => `    { "titulo": "${t}", "analisis": "párrafo de 3-5 líneas" }`).join(',\n');

  return `Actúa como un analista comercial senior de una firma consultora, preparando un informe ejecutivo de diagnóstico de ventas para la junta directiva de una empresa latinoamericana — con la profundidad y el rigor de un informe de asesor externo, no un resumen automático. Tu audiencia son directores que toman decisiones comerciales, no analistas de datos: sé directo, específico y accionable, nunca genérico.

Cita SIEMPRE cifras exactas de los datos entregados (p.ej. "las ventas de agosto cayeron 12% frente a julio" en vez de "las ventas bajaron"). Identifica productos/categorías/canales por su nombre exacto en cada afirmación relevante. Si un dato no está disponible (p.ej. no hay margen o no hay canal), no lo inventes ni lo menciones como si existiera — omite esa sección de análisis.

Responde ÚNICAMENTE con un objeto JSON válido, sin texto antes ni después, sin bloques de código markdown (nada de \`\`\`json ni \`\`\`), con exactamente esta estructura:
{
  "resumen_ejecutivo": "2-4 frases sobre el estado general de las ventas del período, tono de informe de junta directiva",
  "dictamen": "favorable" | "favorable_con_observaciones" | "requiere_atencion" | "critico",
  "hallazgos_clave": ["hallazgo con cifra concreta", "..."],
  "secciones": [
${seccionesJson}
  ],
  "riesgos": [
    { "descripcion": "riesgo concreto citando la cifra/producto/canal que lo origina", "nivel": "verde" | "amarillo" | "rojo", "tendencia": "mejora" | "estable" | "deterioro", "prioridad": "alta" | "media" | "baja" }
  ],
  "senales_alerta": ["umbral concreto a vigilar, ej: 'Ventas mensuales por debajo de $X' o 'Concentración Top-5 superando el 70%'"],
  "recomendaciones": [
    { "accion": "acción concreta y accionable", "responsable_sugerido": "rol responsable (p.ej. 'Comercial / Ventas', 'Marketing', 'Pricing / Finanzas', 'Cadena de Suministro')", "horizonte": "plazo sugerido (p.ej. 'inmediato', '30 días', 'próximo trimestre')" }
  ],
  "conclusion": "2-3 frases de cierre sobre la salud comercial y el dictamen general"
}

Cada "analisis" de "secciones" debe tener la misma profundidad que el cuerpo de un informe de junta directiva real: no una lista de bullets ni una frase suelta, sino un párrafo narrativo de 3-5 líneas que conecte varias cifras entre sí (p.ej. cómo la concentración en pocos productos explica la vulnerabilidad frente a estacionalidad, o cómo el crecimiento del ticket promedio compensa una caída en el número de transacciones). Usa exactamente estos ${titulos.length} títulos de sección en este orden: ${titulos.map((t) => `"${t}"`).join(', ')}.${incluirRentabilidad ? '' : ' No incluyas una sección de rentabilidad — no hay datos de costo ni de canal disponibles.'}

Reglas:
- "dictamen" refleja la severidad combinada: "favorable" si las ventas crecen o son estables con márgenes sanos y base diversificada, "favorable_con_observaciones" si hay puntos a vigilar (concentración moderada, estacionalidad marcada) sin riesgo serio, "requiere_atencion" si hay caída de ventas, concentración alta (Top-5 > 70%) o margen débil, "critico" si hay caída pronunciada de ventas o deterioro de margen que amenace la viabilidad del negocio.
- "riesgos" prioriza de mayor a menor severidad ("prioridad": "alta" primero); no inventes riesgos para llenar el campo si no los hay, pero la concentración de producto/cliente (Pareto) y, si hay comparativo, la variación de ventas siempre deben evaluarse como candidatos.
- "senales_alerta" son umbrales concretos y verificables a futuro (con número), no advertencias vagas.
- "recomendaciones" deben ser accionables y específicas, nunca frases de relleno ("mejorar las ventas"). Prioriza: (1) proteger/expandir los productos o canales de mejor desempeño, (2) diversificar si hay concentración alta, (3) atender la estacionalidad si es marcada, (4) mejorar el mix de margen si hay productos de bajo margen relevantes.
- No uses frases genéricas de relleno. Cada afirmación debe referirse a un número o nombre concreto de los datos dados.
- No agregues explicaciones, disculpas ni texto fuera del objeto JSON.`;
}

function buildUserPrompt(input: {
  companyName: string;
  periodStart: string;
  periodEnd: string;
  analysisTypeName: string;
  results: SalesAnalyticsResult;
}): string {
  const warnings = input.results.warnings;

  return `Empresa: ${input.companyName}
Período analizado: ${input.periodStart} a ${input.periodEnd}
Tipo de análisis: ${input.analysisTypeName}

${buildResultsSummary(input.results)}
${warnings.length > 0 ? `\nAdvertencias del motor de cálculo:\n${warnings.map((w) => `- ${w}`).join('\n')}` : ''}

Genera el informe ejecutivo en el formato JSON indicado.`;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) => typeof v === 'string');
}

function parseNarrativeJson(text: string, expectedSecciones: number): SalesNarrative | null {
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
    obj.secciones.length >= expectedSecciones &&
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

  return isValid ? (obj as SalesNarrative) : null;
}

/**
 * Genera la narrativa ejecutiva de un análisis de ventas vía la API de
 * Anthropic. Nunca lanza — devuelve null en cualquier fallo para que el
 * llamador pueda guardar narrative=null sin bloquear la creación del análisis.
 */
export async function generateSalesNarrative(input: {
  companyName: string;
  periodStart: string;
  periodEnd: string;
  analysisTypeName: string;
  results: SalesAnalyticsResult;
}): Promise<SalesNarrative | null> {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.warn('[SALES_NARRATIVE] ANTHROPIC_API_KEY no configurada — se omite la narrativa ejecutiva.');
    return null;
  }

  const incluirRentabilidad = Boolean(
    (input.results.margenPorProducto && input.results.margenPorProducto.length > 0) ||
      (input.results.canal && input.results.canal.length > 0)
  );
  const expectedSecciones = incluirRentabilidad ? SECCION_BASE.length + 1 : SECCION_BASE.length;

  const client = new Anthropic();

  try {
    const response = await client.messages.create({
      model: ANTHROPIC_MODEL,
      // Más alto que financial/customer: el prompt de ventas puede incluir
      // muchas más líneas de datos crudas a la vez (evolución mensual, Pareto de
      // hasta 10 productos, margen por producto, canal) y el modelo consume una
      // porción no despreciable del presupuesto en "thinking" antes de escribir
      // el JSON — con 8000 se observó stop_reason "max_tokens" y JSON truncado
      // en pruebas con un dataset de tamaño realista; 12000 luego mostró poco
      // margen también (ver nota extensa en generate-combined-narrative.ts:
      // 10485/12000 con datos reales de otro módulo). 20000 sigue por debajo
      // del techo de 21333 que exige pasar a streaming (calculateNonstreamingTimeout).
      max_tokens: 20000,
      system: buildSystemPrompt(incluirRentabilidad),
      messages: [{ role: 'user', content: buildUserPrompt(input) }],
    });

    if (response.stop_reason === 'max_tokens') {
      console.error('[SALES_NARRATIVE] Respuesta truncada por max_tokens (thinking + output excedieron el presupuesto) — usage:', JSON.stringify(response.usage));
      return null;
    }

    const textBlock = response.content.find((b): b is Anthropic.TextBlock => b.type === 'text');
    if (!textBlock) {
      console.error('[SALES_NARRATIVE] Respuesta de Anthropic sin contenido de texto:', JSON.stringify(response).substring(0, 300));
      return null;
    }

    const parsed = parseNarrativeJson(textBlock.text, expectedSecciones);
    if (!parsed) {
      console.error('[SALES_NARRATIVE] No se pudo parsear/validar el JSON de la respuesta:', textBlock.text.substring(0, 500));
      return null;
    }

    return parsed;
  } catch (e: any) {
    console.error('[SALES_NARRATIVE] Excepción llamando a Anthropic:', {
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
