import 'server-only';
import Anthropic from '@anthropic-ai/sdk';
import { formatOperationsValue, type OperationsAnalyticsResult } from './operations-analytics';

const ANTHROPIC_MODEL = 'claude-opus-5';

const SECCION_TITULOS = [
  'Productividad y Utilización de Capacidad',
  'Cumplimiento de Metas y Desempeño Comparativo',
  'Calidad: Tiempos de Ciclo y Tasa de Defectos',
  'Eficiencia de Costo Operativo',
] as const;

export type OperationsNarrative = {
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

function buildResultsSummary(results: OperationsAnalyticsResult): string {
  const lines: string[] = [];
  const r = results.resumen;

  if (r) {
    lines.push(`Resumen operativo (${r.numAreas} área(s)/proceso(s) analizados):`);
    lines.push(`  - Unidades producidas/servicios totales: ${r.unidadesProducidasTotal !== null ? formatOperationsValue(r.unidadesProducidasTotal, 'integer') : 'no disponible'}`);
    lines.push(`  - Productividad promedio (unidades/hora-hombre): ${r.productividadPromedio !== null ? r.productividadPromedio.toFixed(2) : 'no disponible (falta unidades y/o horas-hombre)'}`);
    lines.push(`  - Utilización de capacidad promedio: ${r.utilizacionCapacidadPromedio !== null ? formatOperationsValue(r.utilizacionCapacidadPromedio, 'percent') : 'no disponible (falta capacidad instalada)'}`);
    lines.push(`  - Cumplimiento de meta promedio: ${r.cumplimientoMetaPromedio !== null ? formatOperationsValue(r.cumplimientoMetaPromedio, 'percent') : 'no disponible (falta meta/objetivo)'}`);
    lines.push(`  - Tasa de defectos/reprocesos promedio: ${r.tasaDefectosPromedio !== null ? formatOperationsValue(r.tasaDefectosPromedio, 'percent') : 'no disponible (falta columna de defectos)'}`);
    lines.push(`  - Costo por unidad promedio: ${r.costoPorUnidadPromedio !== null ? formatOperationsValue(r.costoPorUnidadPromedio, 'currency') : 'no disponible (falta costo operativo)'}`);
    lines.push(`  - Ausentismo promedio: ${r.ausentismoPromedio !== null ? formatOperationsValue(r.ausentismoPromedio, 'percent') : 'no disponible'}`);
  }

  const comp = results.comparativo_periodo_anterior;
  if (comp) {
    lines.push('');
    lines.push(`Comparativo contra el período cerrado en ${comp.period_end_base}:`);
    const labels: Record<string, { label: string; format: 'percent' | 'ratio' | 'currency' }> = {
      productividad_promedio: { label: 'Productividad promedio', format: 'ratio' },
      utilizacion_capacidad_promedio: { label: 'Utilización de capacidad', format: 'percent' },
      cumplimiento_meta_promedio: { label: 'Cumplimiento de meta', format: 'percent' },
      tasa_defectos_promedio: { label: 'Tasa de defectos', format: 'percent' },
      costo_por_unidad_promedio: { label: 'Costo por unidad', format: 'currency' },
    };
    for (const [key, entry] of Object.entries(comp.indicadores)) {
      if (!entry) continue;
      const def = labels[key];
      const variacion = entry.variacion_relativa_pct !== null
        ? `${entry.variacion_relativa_pct >= 0 ? '+' : ''}${entry.variacion_relativa_pct.toFixed(1)}%`
        : `variación absoluta ${entry.variacion_absoluta}`;
      lines.push(`  - ${def.label}: de ${formatOperationsValue(entry.valor_anterior, def.format)} a ${formatOperationsValue(entry.valor_actual, def.format)} (${variacion})`);
    }
  }

  if (results.items.length > 0) {
    lines.push('');
    lines.push('Detalle por área/proceso:');
    for (const it of results.items) {
      const parts: string[] = [];
      if (it.unidadesProducidas !== null) parts.push(`producción ${formatOperationsValue(it.unidadesProducidas, 'integer')}`);
      if (it.productividad !== null) parts.push(`productividad ${it.productividad.toFixed(2)} u/h-h`);
      if (it.utilizacionCapacidadPct !== null) parts.push(`utilización ${formatOperationsValue(it.utilizacionCapacidadPct, 'percent')}`);
      if (it.cumplimientoMetaPct !== null) parts.push(`cumplimiento meta ${formatOperationsValue(it.cumplimientoMetaPct, 'percent')}`);
      if (it.tiempoCiclo !== null) parts.push(`tiempo de ciclo ${it.tiempoCiclo.toFixed(2)}`);
      if (it.tasaDefectosPct !== null) parts.push(`tasa defectos ${formatOperationsValue(it.tasaDefectosPct, 'percent')}`);
      if (it.costoPorUnidad !== null) parts.push(`costo/unidad ${formatOperationsValue(it.costoPorUnidad, 'currency')}`);
      if (it.ausentismoPct !== null) parts.push(`ausentismo ${formatOperationsValue(it.ausentismoPct, 'percent')}`);
      lines.push(`  - ${it.area}${it.periodo ? ` (${it.periodo})` : ''}: ${parts.length > 0 ? parts.join(', ') : 'sin indicadores calculables'}`);
    }
  }

  if (results.ranking) {
    lines.push('');
    lines.push(`Ranking comparativo (métrica usada: ${results.ranking.metrica}, por ser la de mayor cobertura de datos):`);
    if (results.ranking.mejor) lines.push(`  - Mejor desempeño: ${results.ranking.mejor.area} (${results.ranking.mejor.valor.toFixed(2)})`);
    if (results.ranking.peor) lines.push(`  - Peor desempeño: ${results.ranking.peor.area} (${results.ranking.peor.valor.toFixed(2)})`);
    lines.push(`  - Orden completo: ${results.ranking.items.map((i) => `${i.area} (${i.valor.toFixed(2)})`).join(', ')}`);
  } else {
    lines.push('');
    lines.push('Ranking comparativo: NO DISPONIBLE — ningún área tiene datos suficientes para productividad, utilización o cumplimiento de meta.');
  }

  if (results.tiempoCiclo) {
    lines.push('');
    lines.push(`Tiempo de ciclo: promedio ${results.tiempoCiclo.promedio.toFixed(2)}, desviación estándar ${results.tiempoCiclo.desviacionEstandar.toFixed(2)}, coeficiente de variación ${results.tiempoCiclo.coeficienteVariacion.toFixed(2)}.`);
  } else {
    lines.push('');
    lines.push('Tiempo de ciclo: NO DISPONIBLE — ninguna fila trae esa columna.');
  }

  if (results.correlacionAusentismoProductividad) {
    const c = results.correlacionAusentismoProductividad;
    lines.push('');
    lines.push(`Correlación aparente ausentismo vs. productividad: coeficiente ${c.coeficiente.toFixed(2)} (lectura: ${c.lectura}), calculada sobre ${c.numAreas} área(s) con ambos datos. Es una correlación observacional simple, no un análisis causal.`);
  }

  return lines.join('\n');
}

function buildSystemPrompt(): string {
  return `Actúa como un experto en gestión de operaciones y productividad (aplicable tanto a manufactura como a servicios, según lo que los datos sugieran) de una firma consultora, preparando un informe ejecutivo de diagnóstico operativo para la junta directiva de una empresa latinoamericana — con la profundidad y el rigor de un informe de asesor externo, no un resumen automático. Tu audiencia son directores que toman decisiones operativas, no analistas de datos: sé directo, específico y accionable, nunca genérico.

Este módulo es deliberadamente flexible: la empresa pudo haber suministrado solo algunas de las columnas posibles (producción, horas-hombre, capacidad, meta, tiempo de ciclo, defectos, costo, ausentismo). Cita SIEMPRE cifras exactas de los datos entregados, identificando el área/proceso/turno exacto en cada afirmación relevante. CUANDO UN INDICADOR O UNA SECCIÓN COMPLETA NO TENGA DATOS SUFICIENTES (aparece como "no disponible" o "NO DISPONIBLE" en el resumen), DEBES decirlo explícitamente en esa sección o hallazgo — nunca inventes una cifra ni description genérica para rellenar. Es preferible una sección corta y honesta ("no se pudo evaluar X por falta de la columna Y") que una narrativa que simule tener datos que no existen.

Responde ÚNICAMENTE con un objeto JSON válido, sin texto antes ni después, sin bloques de código markdown (nada de \`\`\`json ni \`\`\`), con exactamente esta estructura:
{
  "resumen_ejecutivo": "2-4 frases sobre el estado general de la operación, tono de informe de junta directiva",
  "dictamen": "favorable" | "favorable_con_observaciones" | "requiere_atencion" | "critico",
  "hallazgos_clave": ["hallazgo con cifra concreta y área/proceso identificado cuando aplique", "..."],
  "secciones": [
    { "titulo": "Productividad y Utilización de Capacidad", "analisis": "párrafo de 3-5 líneas, o explicación honesta de qué falta si no hay datos" },
    { "titulo": "Cumplimiento de Metas y Desempeño Comparativo", "analisis": "párrafo de 3-5 líneas, o explicación honesta de qué falta si no hay datos" },
    { "titulo": "Calidad: Tiempos de Ciclo y Tasa de Defectos", "analisis": "párrafo de 3-5 líneas, o explicación honesta de qué falta si no hay datos" },
    { "titulo": "Eficiencia de Costo Operativo", "analisis": "párrafo de 3-5 líneas, o explicación honesta de qué falta si no hay datos" }
  ],
  "riesgos": [
    { "descripcion": "riesgo concreto citando el área/indicador que lo origina", "nivel": "verde" | "amarillo" | "rojo", "tendencia": "mejora" | "estable" | "deterioro", "prioridad": "alta" | "media" | "baja" }
  ],
  "senales_alerta": ["umbral concreto a vigilar, ej: 'Utilización de Planta 2 por debajo de 70%' o 'Tasa de defectos superando 5%'"],
  "recomendaciones": [
    { "accion": "acción concreta y accionable, citando área/proceso específico cuando aplique", "responsable_sugerido": "rol responsable (p.ej. 'Gerencia de Operaciones', 'Calidad', 'Recursos Humanos', 'Planeación de Producción')", "horizonte": "plazo sugerido (p.ej. 'inmediato', '30 días', 'próximo trimestre')" }
  ],
  "conclusion": "2-3 frases de cierre sobre la salud operativa y el dictamen general"
}

Cada "analisis" de "secciones" con datos disponibles debe tener la misma profundidad que el cuerpo de un informe de junta directiva real: un párrafo narrativo de 3-5 líneas que conecte varias cifras entre sí (p.ej. cómo la baja utilización de una planta convive con sobretiempo en otra, evidenciando un problema de balanceo de carga, no de capacidad total). Usa exactamente los 4 títulos de sección indicados arriba, en ese orden.

Reglas:
- "dictamen" refleja la severidad combinada de los indicadores SÍ disponibles: "favorable" si utilización/cumplimiento son altos y defectos bajos, "favorable_con_observaciones" si hay puntos a vigilar sin amenaza real, "requiere_atencion" si hay áreas con utilización o cumplimiento por debajo del umbral de alerta, o defectos/ausentismo elevados, "critico" si hay un problema operativo severo y generalizado. Si casi no hay datos calculables, el dictamen no puede ser "favorable" solo por ausencia de problemas detectados — usa "favorable_con_observaciones" y dilo en el resumen.
- "riesgos" prioriza de mayor a menor severidad ("prioridad": "alta" primero); no inventes riesgos para llenar el campo si no los hay.
- "senales_alerta" son umbrales concretos y verificables a futuro (con número), no advertencias vagas.
- "recomendaciones" deben ser accionables y específicas, nunca frases de relleno ("mejorar la eficiencia operativa"). Prioriza: (1) corregir el área/proceso de peor desempeño identificado en el ranking, (2) atacar la causa de la tasa de defectos si es alta, (3) rebalancear capacidad entre áreas si hay dispersión de utilización, (4) investigar la correlación ausentismo-productividad si se reportó como relevante.
- No uses frases genéricas de relleno. Cada afirmación debe referirse a un número o área concreta de los datos dados.
- No agregues explicaciones, disculpas ni texto fuera del objeto JSON.`;
}

function buildUserPrompt(input: {
  companyName: string;
  periodStart: string;
  periodEnd: string;
  analysisTypeName: string;
  results: OperationsAnalyticsResult;
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

function parseNarrativeJson(text: string): OperationsNarrative | null {
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

  return isValid ? (obj as OperationsNarrative) : null;
}

/**
 * Genera la narrativa ejecutiva de un análisis operativo vía la API de
 * Anthropic. Nunca lanza — devuelve null en cualquier fallo para que el
 * llamador pueda guardar narrative=null sin bloquear la creación del análisis.
 */
export async function generateOperationsNarrative(input: {
  companyName: string;
  periodStart: string;
  periodEnd: string;
  analysisTypeName: string;
  results: OperationsAnalyticsResult;
}): Promise<OperationsNarrative | null> {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.warn('[OPERATIONS_NARRATIVE] ANTHROPIC_API_KEY no configurada — se omite la narrativa ejecutiva.');
    return null;
  }

  const client = new Anthropic();

  try {
    const response = await client.messages.create({
      model: ANTHROPIC_MODEL,
      // Ver nota en generate-sales-narrative.ts / generate-inventory-narrative.ts /
      // generate-combined-narrative.ts. 20000 sigue por debajo del techo de
      // 21333 que exige pasar a streaming (calculateNonstreamingTimeout).
      max_tokens: 20000,
      system: buildSystemPrompt(),
      messages: [{ role: 'user', content: buildUserPrompt(input) }],
    });

    if (response.stop_reason === 'max_tokens') {
      console.error('[OPERATIONS_NARRATIVE] Respuesta truncada por max_tokens (thinking + output excedieron el presupuesto) — usage:', JSON.stringify(response.usage));
      return null;
    }

    const textBlock = response.content.find((b): b is Anthropic.TextBlock => b.type === 'text');
    if (!textBlock) {
      console.error('[OPERATIONS_NARRATIVE] Respuesta de Anthropic sin contenido de texto:', JSON.stringify(response).substring(0, 300));
      return null;
    }

    const parsed = parseNarrativeJson(textBlock.text);
    if (!parsed) {
      console.error('[OPERATIONS_NARRATIVE] No se pudo parsear/validar el JSON de la respuesta:', textBlock.text.substring(0, 500));
      return null;
    }

    return parsed;
  } catch (e: any) {
    console.error('[OPERATIONS_NARRATIVE] Excepción llamando a Anthropic:', {
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
