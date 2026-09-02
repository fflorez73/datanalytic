import 'server-only';
import { formatCustomerValue, type CustomerAnalyticsResult } from './customer-analytics';
import { generateNarrativeWithFallback, type AiProvider } from './ai-client';

const SECCION_TITULOS = [
  'Perfil de la Cartera y Concentración',
  'Segmentación RFM y Mapa de Valor',
  'Riesgo de Churn y Calidad de Relación',
  'Creación de Valor Comercial y Eficiencia',
] as const;

export type CustomerNarrative = {
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

function buildResultsSummary(results: CustomerAnalyticsResult): string {
  const lines: string[] = [];
  const r = results.resumen;
  const c = results.concentracion;

  if (r && c) {
    lines.push('Resumen de cartera:');
    lines.push(`  - Ingreso total: ${formatCustomerValue(r.ingresoTotal, 'currency')} | Clientes analizados: ${r.numClientes}`);
    lines.push(`  - Clientes Activos / En Riesgo: ${r.clientesActivos} / ${r.clientesRiesgo}`);
    lines.push(`  - % Ingreso en Activos / En Riesgo: ${formatCustomerValue(r.pctIngresoActivos, 'percent')} / ${formatCustomerValue(r.pctIngresoRiesgo, 'percent')}`);
    lines.push(`  - Ticket promedio ponderado: ${formatCustomerValue(r.ticketPromedioPonderado, 'currency')}`);
    lines.push(`  - Tickets de soporte totales: ${r.ticketsSoporteTotales}`);
    lines.push(`  - Antigüedad media (meses): ${r.antiguedadMedia ?? 'no disponible'}`);
    lines.push('');
    lines.push('Concentración:');
    lines.push(`  - Share Top-1: ${formatCustomerValue(c.shareTop1, 'percent')} | Share Top-3: ${formatCustomerValue(c.shareTop3, 'percent')}`);
    lines.push(`  - Clientes que aportan 80% del ingreso: ${c.clientesPara80pct} de ${c.totalClientes}`);
    lines.push(`  - Ingreso medio por cliente: ${formatCustomerValue(c.ingresoMedioPorCliente, 'currency')}`);
  }

  if (results.clientes.length > 0) {
    lines.push('');
    lines.push('Detalle por cliente (ordenado por ingreso):');
    for (const cl of results.clientes) {
      lines.push(
        `  - ${cl.id}: ${formatCustomerValue(cl.monto, 'currency')} (${formatCustomerValue(cl.pctIngreso, 'percent')} del total), Freq/año ${cl.frecuencia}, Ticket ${formatCustomerValue(cl.ticketPromedio, 'currency')}, Antigüedad ${cl.antiguedadMeses ?? 'N/D'} meses, Recencia ${cl.recenciaDias ?? 'N/D'} días, RFM ${cl.rfmTotal}/15 (R${cl.scoreR}F${cl.scoreF}M${cl.scoreM}), Segmento: ${cl.segmento}, CLV Proxy ${formatCustomerValue(cl.clvProxy, 'currency')}, Tickets soporte: ${cl.ticketsSoporte}${cl.estadoDeclarado ? `, Estado declarado: ${cl.estadoDeclarado}` : ''}`
      );
    }
  }

  if (results.segmentos.length > 0) {
    lines.push('');
    lines.push('Indicadores por segmento RFM:');
    for (const s of results.segmentos) {
      lines.push(
        `  - ${s.segmento}: ${s.clientes} cliente(s) (${formatCustomerValue(s.pctClientes, 'percent')} de la base), ingreso ${formatCustomerValue(s.ingreso, 'currency')} (${formatCustomerValue(s.pctIngreso, 'percent')} del total), tickets soporte ${s.ticketsSoporte}, soporte/$1000 ingreso ${s.soportePorMil.toFixed(2)}, ticket promedio ${formatCustomerValue(s.ticketPromedio, 'currency')}, recencia media ${s.recenciaMedia ?? 'N/D'} días`
      );
    }
  }

  if (results.valorEficiencia) {
    const v = results.valorEficiencia;
    lines.push('');
    lines.push('Valor y eficiencia — Activos vs. En Riesgo vs. Total:');
    lines.push(
      `  - Activos: ingreso ${formatCustomerValue(v.activos.ingreso, 'currency')} (${formatCustomerValue(v.activos.pctIngreso, 'percent')}), soporte/$1000 ${v.activos.soportePorMil.toFixed(2)}, ticket ${formatCustomerValue(v.activos.ticketPromedio, 'currency')}, recencia media ${v.activos.recenciaMedia ?? 'N/D'} días`
    );
    lines.push(
      `  - En Riesgo: ingreso ${formatCustomerValue(v.riesgo.ingreso, 'currency')} (${formatCustomerValue(v.riesgo.pctIngreso, 'percent')}), soporte/$1000 ${v.riesgo.soportePorMil.toFixed(2)}, ticket ${formatCustomerValue(v.riesgo.ticketPromedio, 'currency')}, recencia media ${v.riesgo.recenciaMedia ?? 'N/D'} días`
    );
  }

  if (results.clientesRiesgo.length > 0) {
    lines.push('');
    lines.push('Diagnóstico individual — clientes en riesgo:');
    for (const c of results.clientesRiesgo) {
      lines.push(
        `  - ${c.id}: última compra ${c.fechaUltimaCompra ?? 'N/D'} (recencia ${c.recenciaDias ?? 'N/D'} días), Freq/año ${c.frecuencia}, monto ${formatCustomerValue(c.monto, 'currency')}, tickets soporte ${c.ticketsSoporte}, diagnóstico preliminar del motor: "${c.diagnostico}"`
      );
    }
  }

  if (results.upsell.length > 0) {
    lines.push('');
    lines.push('Candidatos a upsell / cross-sell identificados por el motor (activos con RFM medio-alto):');
    for (const u of results.upsell) {
      lines.push(`  - ${u.id} (${u.segmento}): monto ${formatCustomerValue(u.monto, 'currency')}, ticket ${formatCustomerValue(u.ticketPromedio, 'currency')}, antigüedad ${u.antiguedadMeses ?? 'N/D'} meses`);
    }
  }

  return lines.join('\n');
}

function buildSystemPrompt(): string {
  return `Actúa como un analista comercial / CFO senior de una firma consultora, preparando un informe ejecutivo de diagnóstico de clientes, ventas y mercadeo para la junta directiva de una empresa latinoamericana — con la profundidad y el rigor de un informe de asesor externo, no un resumen automático. Tu audiencia son directores que toman decisiones comerciales, no analistas de datos: sé directo, específico y accionable, nunca genérico.

Cita SIEMPRE cifras exactas de los datos entregados (p.ej. "CL-1006 aporta $28,500, el 40.9% del ingreso total" en vez de "hay un cliente muy grande"). Identifica clientes por su ID/nombre exacto en cada afirmación relevante. Si un dato no está disponible para algún cliente, no lo inventes ni lo menciones como si existiera.

Responde ÚNICAMENTE con un objeto JSON válido, sin texto antes ni después, sin bloques de código markdown (nada de \`\`\`json ni \`\`\`), con exactamente esta estructura:
{
  "resumen_ejecutivo": "2-4 frases sobre el estado general de la cartera de clientes, tono de informe de junta directiva",
  "dictamen": "favorable" | "favorable_con_observaciones" | "requiere_atencion" | "critico",
  "hallazgos_clave": ["hallazgo con cifra concreta y cliente identificado cuando aplique", "..."],
  "secciones": [
    { "titulo": "Perfil de la Cartera y Concentración", "analisis": "párrafo de 3-5 líneas" },
    { "titulo": "Segmentación RFM y Mapa de Valor", "analisis": "párrafo de 3-5 líneas" },
    { "titulo": "Riesgo de Churn y Calidad de Relación", "analisis": "párrafo de 3-5 líneas" },
    { "titulo": "Creación de Valor Comercial y Eficiencia", "analisis": "párrafo de 3-5 líneas" }
  ],
  "riesgos": [
    { "descripcion": "riesgo concreto citando cliente(s) e indicador que lo origina", "nivel": "verde" | "amarillo" | "rojo", "tendencia": "mejora" | "estable" | "deterioro", "prioridad": "alta" | "media" | "baja" }
  ],
  "senales_alerta": ["umbral concreto a vigilar, ej: 'Recencia de cualquier Activo > 45 días' o 'Share del Top-1 superando 45% del ingreso'"],
  "recomendaciones": [
    { "accion": "acción concreta y accionable, citando cliente(s) específicos cuando aplique", "responsable_sugerido": "rol responsable (p.ej. 'Comercial / Key Account', 'Servicio al Cliente', 'CFO / Comercial / BI')", "horizonte": "plazo sugerido (p.ej. 'inmediato', '30 días', 'próximo trimestre')" }
  ],
  "conclusion": "2-3 frases de cierre sobre la salud de la cartera y el dictamen general"
}

Cada "analisis" de "secciones" debe tener la misma profundidad que el cuerpo de un informe de junta directiva real: no una lista de bullets ni una frase suelta, sino un párrafo narrativo de 3-5 líneas que conecte varias cifras entre sí (p.ej. cómo la concentración en el Top-1 y la calidad del segmento Champions/Leales explican la resiliencia del revenue, o cómo la asimetría entre ingreso aportado y tickets de soporte evidencia el costo real de servir al segmento en riesgo). Usa exactamente los 4 títulos de sección indicados arriba, en ese orden.

Reglas:
- "dictamen" refleja la severidad combinada: "favorable" si la cartera está sana y diversificada, "favorable_con_observaciones" si hay concentración o riesgo acotado sin amenaza real al negocio, "requiere_atencion" si hay concentración alta (Top-1 > 40%) o churn relevante (>25% de clientes en riesgo) sin plan de acción evidente, "critico" si hay riesgo real de pérdida de ingreso material en el corto plazo.
- "riesgos" prioriza de mayor a menor severidad ("prioridad": "alta" primero); no inventes riesgos para llenar el campo si no los hay, pero la concentración de ingreso (share Top-1 y Top-3) y el segmento En Riesgo siempre deben evaluarse como candidatos.
- "senales_alerta" son umbrales concretos y verificables a futuro (con número), no advertencias vagas.
- "recomendaciones" deben ser accionables y específicas, nunca frases de relleno ("mejorar la atención al cliente"). Prioriza: (1) proteger al/los cliente(s) Champion de mayor concentración, (2) decisión explícita sobre cada cliente en Riesgo (win-back o desinversión), (3) desarrollo de los candidatos a upsell/cross-sell identificados, (4) reducción de la asimetría de soporte si aplica.
- No uses frases genéricas de relleno. Cada afirmación debe referirse a un número o cliente concreto de los datos dados.
- No agregues explicaciones, disculpas ni texto fuera del objeto JSON.`;
}

function buildUserPrompt(input: {
  companyName: string;
  periodStart: string;
  periodEnd: string;
  analysisTypeName: string;
  results: CustomerAnalyticsResult;
}): string {
  const warnings = input.results.warnings;

  return `Empresa: ${input.companyName}
Período analizado: ${input.periodStart} a ${input.periodEnd}
Tipo de análisis: ${input.analysisTypeName}
Fecha de referencia del modelo RFM (fin de período): ${input.results.fechaReferencia ?? input.periodEnd}

${buildResultsSummary(input.results)}
${warnings.length > 0 ? `\nAdvertencias del motor de cálculo:\n${warnings.map((w) => `- ${w}`).join('\n')}` : ''}

Genera el informe ejecutivo en el formato JSON indicado, usando exactamente estos 4 títulos de sección en este orden: ${SECCION_TITULOS.map((t) => `"${t}"`).join(', ')}.`;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) => typeof v === 'string');
}

function parseNarrativeJson(text: string): CustomerNarrative | null {
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

  return isValid ? (obj as CustomerNarrative) : null;
}

/**
 * Genera la narrativa ejecutiva de un análisis de clientes vía la API de
 * Anthropic. Nunca lanza — devuelve null en cualquier fallo para que el
 * llamador pueda guardar narrative=null sin bloquear la creación del análisis.
 */
export async function generateCustomerNarrative(input: {
  companyName: string;
  periodStart: string;
  periodEnd: string;
  analysisTypeName: string;
  results: CustomerAnalyticsResult;
}): Promise<CustomerNarrative | null> {
  try {
    const { data, provider } = await generateNarrativeWithFallback({
      system: buildSystemPrompt(),
      user: buildUserPrompt(input),
      // claude-opus-5 piensa ("thinking" adaptativo) por defecto y ese gasto
      // de tokens es variable — ver nota extensa en generate-combined-narrative.ts
      // (ahí se midió output_tokens llegando a 10485/12000 con datos reales).
      // 8000 quedaba con poco margen; 16000 sigue muy por debajo del techo de
      // 21333 que exige pasar a streaming (client.calculateNonstreamingTimeout).
      maxTokens: 16000,
      parse: parseNarrativeJson,
      logPrefix: '[CUSTOMER_NARRATIVE]',
    });

    return { ...data, ai_provider: provider };
  } catch (e: any) {
    console.error('[CUSTOMER_NARRATIVE] No se pudo generar la narrativa ejecutiva (Claude y Gemini fallaron):', {
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
