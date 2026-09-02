import 'server-only';
import Anthropic from '@anthropic-ai/sdk';
import { formatHrValue, type HrAnalyticsResult } from './hr-analytics';

const ANTHROPIC_MODEL = 'claude-opus-5';

const SECCION_TITULOS = [
  'Costo y Estructura de Nómina',
  'Rotación y Estabilidad del Talento',
  'Ausentismo y Horas Extra',
  'Desempeño y Riesgo de Fuga',
] as const;

export type HrNarrative = {
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

function buildResultsSummary(results: HrAnalyticsResult): string {
  const lines: string[] = [];
  const r = results.resumen;

  if (r) {
    lines.push(`Resumen de nómina y talento (${r.numEmpleados} empleado(s) en el archivo):`);
    lines.push(`  - Costo total de nómina: ${r.costoNominaTotal !== null ? formatHrValue(r.costoNominaTotal, 'currency') : 'no disponible (falta columna de salario)'}`);
    lines.push(`  - Costo promedio por empleado: ${r.costoPromedioPorEmpleado !== null ? formatHrValue(r.costoPromedioPorEmpleado, 'currency') : 'no disponible'}`);
    lines.push(`  - Tasa de rotación del período: ${r.tasaRotacionPct !== null ? formatHrValue(r.tasaRotacionPct, 'percent') : 'no disponible (falta fecha de salida)'} (${r.numSalidasPeriodo} salida(s) en el período)`);
    if (r.tasaRotacionVoluntariaPct !== null) {
      lines.push(`  - Rotación voluntaria: ${formatHrValue(r.tasaRotacionVoluntariaPct, 'percent')} | Rotación involuntaria: ${formatHrValue(r.tasaRotacionInvoluntariaPct, 'percent')}`);
    }
    lines.push(`  - Antigüedad promedio: ${r.antiguedadPromedioMeses !== null ? formatHrValue(r.antiguedadPromedioMeses, 'months') : 'no disponible (falta fecha de ingreso)'}`);
    lines.push(`  - Ausentismo promedio: ${r.ausentismoPromedioPct !== null ? formatHrValue(r.ausentismoPromedioPct, 'percent') : 'no disponible (falta días de ausencia)'}`);
    lines.push(`  - Costo de horas extra: ${r.costoHorasExtraTotal !== null ? formatHrValue(r.costoHorasExtraTotal, 'currency') : 'no disponible'}${r.pctHorasExtraSobreNomina !== null ? ` (${formatHrValue(r.pctHorasExtraSobreNomina, 'percent')} sobre nómina base)` : ''}`);
    lines.push(`  - Empleados en riesgo de fuga (alto desempeño + baja antigüedad): ${r.numRiesgoFuga}`);
  }

  const comp = results.comparativo_periodo_anterior;
  if (comp) {
    lines.push('');
    lines.push(`Comparativo contra el período cerrado en ${comp.period_end_base}:`);
    const labels: Record<string, { label: string; format: 'currency' | 'percent' | 'months' }> = {
      costo_nomina_total: { label: 'Costo total nómina', format: 'currency' },
      tasa_rotacion: { label: 'Tasa de rotación', format: 'percent' },
      ausentismo_promedio: { label: 'Ausentismo promedio', format: 'percent' },
      pct_horas_extra_sobre_nomina: { label: '% horas extra sobre nómina', format: 'percent' },
      antiguedad_promedio_meses: { label: 'Antigüedad promedio', format: 'months' },
    };
    for (const [key, entry] of Object.entries(comp.indicadores)) {
      if (!entry) continue;
      const def = labels[key];
      const variacion = entry.variacion_relativa_pct !== null
        ? `${entry.variacion_relativa_pct >= 0 ? '+' : ''}${entry.variacion_relativa_pct.toFixed(1)}%`
        : `variación absoluta ${entry.variacion_absoluta}`;
      lines.push(`  - ${def.label}: de ${formatHrValue(entry.valor_anterior, def.format)} a ${formatHrValue(entry.valor_actual, def.format)} (${variacion})`);
    }
  }

  if (results.costoPorArea.length > 0) {
    lines.push('');
    lines.push('Costo de nómina por área:');
    for (const c of results.costoPorArea) {
      lines.push(`  - ${c.area}: ${formatHrValue(c.costoTotal, 'currency')} (${c.pctTotal.toFixed(1)}% del total), ${c.numEmpleados} empleado(s), promedio ${formatHrValue(c.costoPromedio, 'currency')}`);
    }
  }

  if (results.rotacionPorArea.length > 0) {
    lines.push('');
    lines.push('Rotación por área:');
    for (const rt of results.rotacionPorArea) {
      lines.push(`  - ${rt.area}: ${rt.tasaPct.toFixed(1)}% (${rt.salidas} salida(s) sobre headcount promedio de ${rt.headcountPromedio.toFixed(1)})`);
    }
  }

  if (results.ausentismoPorArea.length > 0) {
    lines.push('');
    lines.push('Ausentismo por área:');
    for (const a of results.ausentismoPorArea) {
      lines.push(`  - ${a.area}: ${a.tasaPct.toFixed(1)}% (${a.diasAusenciaPromedio.toFixed(1)} días promedio, ${a.numEmpleados} empleado(s))`);
    }
  }

  if (results.horasExtraPorArea.length > 0) {
    lines.push('');
    lines.push('Horas extra por área:');
    for (const h of results.horasExtraPorArea) {
      lines.push(`  - ${h.area}: ${formatHrValue(h.costo, 'currency')}${h.pctSobreNominaArea !== null ? ` (${h.pctSobreNominaArea.toFixed(1)}% sobre nómina del área)` : ''}`);
    }
  }

  if (results.estructuraSalarial.length > 0) {
    lines.push('');
    lines.push('Estructura salarial por área:');
    for (const e of results.estructuraSalarial) {
      lines.push(`  - ${e.area}: rango ${formatHrValue(e.min, 'currency')}-${formatHrValue(e.max, 'currency')}, mediana ${formatHrValue(e.mediana, 'currency')}, promedio ${formatHrValue(e.promedio, 'currency')}, desviación estándar ${formatHrValue(e.desviacionEstandar, 'currency')} (${e.numEmpleados} empleado(s))`);
    }
  }

  if (results.antiguedadDistribucion.length > 0) {
    lines.push('');
    lines.push('Distribución de antigüedad:');
    for (const d of results.antiguedadDistribucion) {
      lines.push(`  - ${d.rango}: ${d.count} empleado(s)`);
    }
  }

  if (results.riesgoFugaEmpleados.length > 0) {
    lines.push('');
    lines.push('Empleados en riesgo de fuga (alto desempeño, baja antigüedad):');
    for (const e of results.riesgoFugaEmpleados) {
      lines.push(`  - ${e.empleado}${e.area ? ` (${e.area}${e.cargo ? `, ${e.cargo}` : ''})` : ''}: antigüedad ${e.antiguedadMeses.toFixed(1)} meses, desempeño ${e.desempeno.toFixed(1)}`);
    }
  }

  if (results.correlacionDesempenoRotacion) {
    const c = results.correlacionDesempenoRotacion;
    lines.push('');
    lines.push(`Correlación aparente desempeño vs. rotación: coeficiente ${c.coeficiente.toFixed(2)} (lectura: ${c.lectura}), sobre ${c.numEmpleados} empleado(s). Observacional, no causal.`);
  }

  if (results.correlacionDesempenoAusentismo) {
    const c = results.correlacionDesempenoAusentismo;
    lines.push('');
    lines.push(`Correlación aparente desempeño vs. ausentismo: coeficiente ${c.coeficiente.toFixed(2)} (lectura: ${c.lectura}), sobre ${c.numEmpleados} empleado(s). Observacional, no causal.`);
  }

  return lines.join('\n');
}

function buildSystemPrompt(): string {
  return `Actúa como un experto en gestión de talento humano / people analytics de una firma consultora, preparando un informe ejecutivo de diagnóstico de nómina y talento para la junta directiva de una empresa latinoamericana — con la profundidad y el rigor de un informe de asesor externo, no un resumen automático. Tu audiencia son directores que toman decisiones sobre capital humano y costo laboral, no analistas de datos: sé directo, específico y accionable, nunca genérico.

Este módulo es deliberadamente flexible: la empresa pudo haber suministrado solo algunas de las columnas posibles (salario, fechas de ingreso/salida, horas extra, ausencias, desempeño). Cita SIEMPRE cifras exactas de los datos entregados, identificando el área/empleado/cargo exacto en cada afirmación relevante cuando corresponda (evita nombrar empleados individuales salvo en la sección de riesgo de fuga, donde es el propósito). CUANDO UN INDICADOR O UNA SECCIÓN COMPLETA NO TENGA DATOS SUFICIENTES (aparece como "no disponible" en el resumen), DEBES decirlo explícitamente — nunca inventes una cifra ni una descripción genérica para rellenar. Es preferible una sección corta y honesta ("no se pudo evaluar X por falta de la columna Y") que una narrativa que simule tener datos que no existen.

Responde ÚNICAMENTE con un objeto JSON válido, sin texto antes ni después, sin bloques de código markdown (nada de \`\`\`json ni \`\`\`), con exactamente esta estructura:
{
  "resumen_ejecutivo": "2-4 frases sobre el estado general de la nómina y el talento, tono de informe de junta directiva",
  "dictamen": "favorable" | "favorable_con_observaciones" | "requiere_atencion" | "critico",
  "hallazgos_clave": ["hallazgo con cifra concreta y área/indicador identificado cuando aplique", "..."],
  "secciones": [
    { "titulo": "Costo y Estructura de Nómina", "analisis": "párrafo de 3-5 líneas, o explicación honesta de qué falta si no hay datos" },
    { "titulo": "Rotación y Estabilidad del Talento", "analisis": "párrafo de 3-5 líneas, o explicación honesta de qué falta si no hay datos" },
    { "titulo": "Ausentismo y Horas Extra", "analisis": "párrafo de 3-5 líneas, o explicación honesta de qué falta si no hay datos" },
    { "titulo": "Desempeño y Riesgo de Fuga", "analisis": "párrafo de 3-5 líneas, o explicación honesta de qué falta si no hay datos" }
  ],
  "riesgos": [
    { "descripcion": "riesgo concreto citando el área/indicador que lo origina", "nivel": "verde" | "amarillo" | "rojo", "tendencia": "mejora" | "estable" | "deterioro", "prioridad": "alta" | "media" | "baja" }
  ],
  "senales_alerta": ["umbral concreto a vigilar, ej: 'Rotación del área Comercial por encima de 12%' o 'Ausentismo superando 6%'"],
  "recomendaciones": [
    { "accion": "acción concreta y accionable, citando área/empleado/indicador específico cuando aplique", "responsable_sugerido": "rol responsable (p.ej. 'Gerencia de Recursos Humanos', 'Compensación y Beneficios', 'Gerencia del área afectada')", "horizonte": "plazo sugerido (p.ej. 'inmediato', '30 días', 'próximo trimestre')" }
  ],
  "conclusion": "2-3 frases de cierre sobre la salud del capital humano y el dictamen general"
}

Cada "analisis" de "secciones" con datos disponibles debe tener la misma profundidad que el cuerpo de un informe de junta directiva real: un párrafo narrativo de 3-5 líneas que conecte varias cifras entre sí (p.ej. cómo la concentración de horas extra en un área convive con alta rotación en esa misma área, evidenciando sobrecarga estructural, no picos puntuales; o cómo el riesgo de fuga se concentra en el área de mayor costo de nómina). Usa exactamente los 4 títulos de sección indicados arriba, en ese orden.

Reglas:
- "dictamen" refleja la severidad combinada de los indicadores SÍ disponibles: "favorable" si rotación/ausentismo/horas extra están en rango sano y no hay riesgo de fuga relevante, "favorable_con_observaciones" si hay puntos a vigilar sin amenaza real, "requiere_atencion" si hay rotación o ausentismo por encima del umbral de alerta, o riesgo de fuga concentrado en personal clave, "critico" si hay un problema de retención o de costo laboral severo y generalizado. Si casi no hay datos calculables, el dictamen no puede ser "favorable" solo por ausencia de problemas detectados — usa "favorable_con_observaciones" y dilo en el resumen.
- "riesgos" prioriza de mayor a menor severidad ("prioridad": "alta" primero); no inventes riesgos para llenar el campo si no los hay, pero el riesgo de fuga de personal de alto desempeño (si existe) siempre debe evaluarse como candidato de prioridad alta.
- "senales_alerta" son umbrales concretos y verificables a futuro (con número), no advertencias vagas.
- "recomendaciones" deben ser accionables y específicas, nunca frases de relleno ("mejorar el clima laboral"). Prioriza: (1) retener al personal identificado en riesgo de fuga, (2) atacar la causa raíz de la rotación o el ausentismo en el área de peor desempeño, (3) revisar la dependencia estructural de horas extra si es alta, (4) revisar equidad/dispersión salarial si es marcada.
- No uses frases genéricas de relleno. Cada afirmación debe referirse a un número, área o empleado concreto de los datos dados.
- No agregues explicaciones, disculpas ni texto fuera del objeto JSON.`;
}

function buildUserPrompt(input: {
  companyName: string;
  periodStart: string;
  periodEnd: string;
  analysisTypeName: string;
  results: HrAnalyticsResult;
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

function parseNarrativeJson(text: string): HrNarrative | null {
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

  return isValid ? (obj as HrNarrative) : null;
}

/**
 * Genera la narrativa ejecutiva de un análisis de nómina y talento vía la
 * API de Anthropic. Nunca lanza — devuelve null en cualquier fallo para que
 * el llamador pueda guardar narrative=null sin bloquear la creación del análisis.
 */
export async function generateHrNarrative(input: {
  companyName: string;
  periodStart: string;
  periodEnd: string;
  analysisTypeName: string;
  results: HrAnalyticsResult;
}): Promise<HrNarrative | null> {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.warn('[HR_NARRATIVE] ANTHROPIC_API_KEY no configurada — se omite la narrativa ejecutiva.');
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
      console.error('[HR_NARRATIVE] Respuesta truncada por max_tokens (thinking + output excedieron el presupuesto) — usage:', JSON.stringify(response.usage));
      return null;
    }

    const textBlock = response.content.find((b): b is Anthropic.TextBlock => b.type === 'text');
    if (!textBlock) {
      console.error('[HR_NARRATIVE] Respuesta de Anthropic sin contenido de texto:', JSON.stringify(response).substring(0, 300));
      return null;
    }

    const parsed = parseNarrativeJson(textBlock.text);
    if (!parsed) {
      console.error('[HR_NARRATIVE] No se pudo parsear/validar el JSON de la respuesta:', textBlock.text.substring(0, 500));
      return null;
    }

    return parsed;
  } catch (e: any) {
    console.error('[HR_NARRATIVE] Excepción llamando a Anthropic:', {
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
