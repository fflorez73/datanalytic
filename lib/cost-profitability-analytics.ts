export const COST_PROFITABILITY_ANALYSIS_TYPE_CODES = ['costos_rentabilidad'] as const;

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

// ================================================================
// Parseo de celdas — mismo criterio que los demás motores.
// ================================================================

function parseNumericCell(raw: unknown): number | null {
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  if (typeof raw !== 'string') return null;

  const trimmed = raw.trim();
  if (!trimmed) return null;

  const isNegativeParens = /^\(.*\)$/.test(trimmed);
  let cleaned = trimmed.replace(/[()]/g, '').replace(/[$%\s]/g, '');

  if (/,\d{1,2}$/.test(cleaned) && cleaned.includes('.')) {
    cleaned = cleaned.replace(/\./g, '').replace(',', '.');
  } else {
    cleaned = cleaned.replace(/,/g, '');
  }

  if (!/^-?\d+(\.\d+)?$/.test(cleaned)) return null;
  const value = Number(cleaned);
  if (Number.isNaN(value)) return null;
  return isNegativeParens ? -value : value;
}

// ================================================================
// Normalización de filas crudas → registros por producto/proyecto — misma
// detección de fila de encabezado real (título/subtítulo antes de la
// tabla) que los demás motores del proyecto.
// ================================================================

function isPositionalKey(key: string): boolean {
  return /^col_\d+$/.test(key);
}

type CostColumnKey = 'producto' | 'ingreso' | 'costo_variable' | 'costo_fijo' | 'presupuesto' | 'inversion' | 'unidades';

// Orden: reglas específicas ("costo variable/directo", "costo fijo/indirecto",
// "presupuesto o meta de ingreso") antes que las genéricas ("ingreso"/"venta"),
// para no confundir "meta de venta" (presupuesto) con la venta real, ni
// "costo fijo" con la genérica "costo".
const COST_COLUMN_RULES: { key: CostColumnKey; test: (l: string) => boolean }[] = [
  { key: 'costo_variable', test: (l) => (l.includes('costo') || l.includes('gasto')) && (l.includes('variable') || l.includes('directo')) },
  { key: 'costo_fijo', test: (l) => (l.includes('costo') || l.includes('gasto')) && (l.includes('fijo') || l.includes('indirecto') || l.includes('overhead') || l.includes('asignado')) },
  { key: 'presupuesto', test: (l) => l.includes('presupuesto') || (l.includes('meta') && (l.includes('ingreso') || l.includes('venta'))) },
  { key: 'inversion', test: (l) => l.includes('inversion') || l.includes('inversión') || l.includes('capex') },
  { key: 'unidades', test: (l) => l.includes('unidad') || l.includes('volumen') || l.includes('cantidad producid') || l.includes('cantidad vendid') },
  { key: 'ingreso', test: (l) => l.includes('ingreso') || l.includes('venta') || l.includes('revenue') },
  {
    key: 'producto',
    test: (l) => l.includes('producto') || l.includes('proyecto') || l.includes('linea') || l.includes('línea') || l.includes('negocio') || l.includes('nombre') || l.includes('sku') || l.includes('codigo') || l.includes('código'),
  },
];

function countHeaderMatches(row: Record<string, unknown>): number {
  let matches = 0;
  for (const [key, value] of Object.entries(row)) {
    if (key === 'sheet') continue;
    if (typeof value !== 'string') continue;
    const label = value.toLowerCase().trim();
    if (!label) continue;
    if (COST_COLUMN_RULES.some((rule) => rule.test(label))) matches++;
  }
  return matches;
}

function normalizeCostRows(rows: Record<string, unknown>[]): { records: Record<string, unknown>[]; warnings: string[] } {
  const bySheet = new Map<string, Record<string, unknown>[]>();
  for (const row of rows) {
    const sheet = typeof row.sheet === 'string' ? row.sheet : 'default';
    if (!bySheet.has(sheet)) bySheet.set(sheet, []);
    bySheet.get(sheet)!.push(row);
  }

  const records: Record<string, unknown>[] = [];
  const warnings: string[] = [];

  for (const [sheetName, sheetRows] of Array.from(bySheet.entries())) {
    if (sheetRows.length === 0) continue;
    const sampleKeys = Object.keys(sheetRows[0]).filter((k) => k !== 'sheet');
    const positional = sampleKeys.length > 0 && sampleKeys.every(isPositionalKey);

    if (!positional) {
      for (const row of sheetRows) {
        const { sheet: _sheet, ...rest } = row;
        if (Object.values(rest).some((v) => v !== null && v !== undefined && String(v).trim() !== '')) {
          records.push(rest);
        }
      }
      continue;
    }

    const HEADER_SCAN_LIMIT = 15;
    const MIN_HEADER_MATCHES = 2;

    let headerIdx = 0;
    let bestMatches = -1;
    for (let i = 0; i < Math.min(sheetRows.length, HEADER_SCAN_LIMIT); i++) {
      const matches = countHeaderMatches(sheetRows[i]);
      if (matches > bestMatches) {
        bestMatches = matches;
        headerIdx = i;
      }
    }
    if (bestMatches < MIN_HEADER_MATCHES) {
      warnings.push(`No se pudo identificar con confianza la fila de encabezados en la hoja "${sheetName}" — se usó la primera fila.`);
      headerIdx = 0;
    }

    const headerRow = sheetRows[headerIdx];
    const dataRows = sheetRows.slice(headerIdx + 1);
    const colToLabel = new Map<string, string>();
    for (const [key, value] of Object.entries(headerRow)) {
      if (key === 'sheet') continue;
      if (typeof value === 'string' && value.trim()) colToLabel.set(key, value.trim());
    }

    if (colToLabel.size === 0) {
      warnings.push(`No se pudo identificar la fila de encabezados en la hoja "${sheetName}" — se omitió.`);
      continue;
    }

    for (const row of dataRows) {
      const record: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(row)) {
        if (key === 'sheet') continue;
        const label = colToLabel.get(key);
        if (label) record[label] = value;
      }
      if (Object.values(record).some((v) => v !== null && v !== undefined && String(v).trim() !== '')) {
        records.push(record);
      }
    }
  }

  return { records, warnings };
}

// ================================================================
// Extracción de registros por producto/proyecto
// ================================================================

type RawCostRecord = {
  producto: string;
  ingreso: number | null;
  costoVariable: number | null;
  costoFijo: number | null;
  presupuestoIngreso: number | null;
  inversionInicial: number | null;
  unidades: number | null;
};

function extractCostRecords(records: Record<string, unknown>[]): { rows: RawCostRecord[]; warnings: string[] } {
  const rows: RawCostRecord[] = [];
  const warnings: string[] = [];

  let skippedNoProducto = 0;
  let skippedNoData = 0;
  let missingIngreso = 0;
  let missingCostoVariable = 0;
  let missingCostoFijo = 0;
  let missingPresupuesto = 0;
  let missingInversion = 0;
  let missingUnidades = 0;

  for (const record of records) {
    const fields: Partial<Record<CostColumnKey, unknown>> = {};
    for (const [rawKey, value] of Object.entries(record)) {
      const label = rawKey.toLowerCase().trim();
      if (!label) continue;
      for (const rule of COST_COLUMN_RULES) {
        if (!rule.test(label)) continue;
        if (fields[rule.key] === undefined) fields[rule.key] = value;
        break;
      }
    }

    const productoRaw = fields.producto;
    const producto = typeof productoRaw === 'string' ? productoRaw.trim() : typeof productoRaw === 'number' ? String(productoRaw) : '';
    if (!producto) {
      skippedNoProducto++;
      continue;
    }

    const ingreso = parseNumericCell(fields.ingreso);
    const costoVariable = parseNumericCell(fields.costo_variable);
    const costoFijo = parseNumericCell(fields.costo_fijo);
    const presupuestoIngreso = parseNumericCell(fields.presupuesto);
    const inversionInicial = parseNumericCell(fields.inversion);
    const unidades = parseNumericCell(fields.unidades);

    // Filas con un "producto" (texto en la columna correspondiente) pero
    // ningún valor numérico en absoluto no son productos/proyectos reales —
    // suelen ser notas/comentarios al pie del archivo que caen en la misma
    // columna. Contarlas como producto distorsionaría numProductos y, con
    // ello, el % de productos en pérdida del mapa de riesgos.
    if (ingreso === null && costoVariable === null && costoFijo === null && presupuestoIngreso === null && inversionInicial === null && unidades === null) {
      skippedNoData++;
      continue;
    }

    if (ingreso === null) missingIngreso++;
    if (costoVariable === null) missingCostoVariable++;
    if (costoFijo === null) missingCostoFijo++;
    if (presupuestoIngreso === null) missingPresupuesto++;
    if (inversionInicial === null) missingInversion++;
    if (unidades === null) missingUnidades++;

    rows.push({ producto, ingreso, costoVariable, costoFijo, presupuestoIngreso, inversionInicial, unidades });
  }

  const n = rows.length;
  if (skippedNoProducto > 0) warnings.push(`${skippedNoProducto} fila(s) del archivo se descartaron por no tener un producto/proyecto identificable.`);
  if (skippedNoData > 0) warnings.push(`${skippedNoData} fila(s) se descartaron por no traer ningún valor numérico (probablemente notas o comentarios, no productos/proyectos reales).`);
  if (n > 0 && missingIngreso === n) warnings.push('No se identificó la columna de ingreso/ventas — el margen de contribución, la utilidad neta y el punto de equilibrio quedaron sin calcular.');
  if (n > 0 && missingCostoVariable === n) warnings.push('No se identificó la columna de costo variable/directo — el margen de contribución quedó sin calcular.');
  if (n > 0 && missingCostoFijo === n) warnings.push('No se identificó la columna de costo fijo/indirecto — la utilidad neta y el punto de equilibrio quedaron sin calcular.');
  if (n > 0 && missingPresupuesto === n) warnings.push('No se identificó la columna de presupuesto/meta de ingreso — la variación presupuestal quedó sin calcular.');
  if (n > 0 && missingInversion === n) warnings.push('No se identificó la columna de inversión inicial — el ROI quedó sin calcular.');
  if (n > 0 && missingUnidades === n) warnings.push('No se identificó la columna de unidades vendidas/producidas — el punto de equilibrio en unidades quedó sin calcular.');

  return { rows, warnings };
}

// ================================================================
// Cálculo de indicadores — cada uno independiente y null-safe; ningún
// indicador depende de que otro esté disponible.
// ================================================================

export type CostItemComputed = RawCostRecord & {
  margenContribucion: number | null;
  margenContribucionPct: number | null;
  costoTotal: number | null;
  utilidadNeta: number | null;
  precioUnitario: number | null;
  puntoEquilibrioValor: number | null;
  puntoEquilibrioUnidades: number | null;
  variacionPresupuestalPct: number | null;
  roiPct: number | null;
  enPerdida: boolean | null; // null = no evaluable con los datos disponibles
};

export type CostRankingMetrica = 'utilidad_neta' | 'margen_contribucion_pct';

export type CostRanking = {
  metrica: CostRankingMetrica;
  items: { producto: string; valor: number; enPerdida: boolean }[];
  mejor: { producto: string; valor: number } | null;
  peor: { producto: string; valor: number } | null;
};

export type ProductoEnPerdida = { producto: string; utilidadNeta: number | null; margenContribucionPct: number | null; diagnostico: string };

export type ComparativoIndicador = {
  valor_actual: number;
  valor_anterior: number;
  variacion_absoluta: number;
  variacion_relativa_pct: number | null;
};

export type CostComparativo = {
  period_end_base: string;
  indicadores: Partial<
    Record<'ingreso_total' | 'costo_total' | 'margen_contribucion_promedio_pct' | 'utilidad_neta_total' | 'roi_consolidado_pct', ComparativoIndicador>
  >;
};

export type CostAnalyticsResult = {
  items: CostItemComputed[];
  resumen: {
    numProductos: number;
    ingresoTotal: number | null;
    costoVariableTotal: number | null;
    costoFijoTotal: number | null;
    costoTotal: number | null;
    margenContribucionTotal: number | null;
    margenContribucionPromedioPct: number | null;
    utilidadNetaTotal: number | null;
    numProductosEnPerdida: number | null;
    variacionPresupuestalPromedioPct: number | null;
    roiConsolidadoPct: number | null;
    pctCostoVariable: number | null;
    pctCostoFijo: number | null;
    puntoEquilibrioConsolidadoValor: number | null;
  } | null;
  ranking: CostRanking | null;
  productosEnPerdida: ProductoEnPerdida[];
  productoMasRentable: { producto: string; utilidadNeta: number | null; margenContribucionPct: number | null } | null;
  comparativo_periodo_anterior?: CostComparativo | null;
  warnings: string[];
};

export function computeCostProfitabilityResults(
  rows: Record<string, unknown>[],
  _period?: { periodStart?: string; periodEnd?: string }
): CostAnalyticsResult {
  const { records, warnings: normWarnings } = normalizeCostRows(rows);
  const { rows: rawRows, warnings: extractWarnings } = extractCostRecords(records);

  const warnings = [...normWarnings, ...extractWarnings];

  if (rawRows.length === 0) {
    warnings.push('No se pudo identificar ningún producto/proyecto válido en el archivo cargado.');
    return { items: [], resumen: null, ranking: null, productosEnPerdida: [], productoMasRentable: null, warnings };
  }

  const items: CostItemComputed[] = rawRows.map((r) => {
    const margenContribucion = r.ingreso !== null && r.costoVariable !== null ? round(r.ingreso - r.costoVariable) : null;
    const margenContribucionPct = margenContribucion !== null && r.ingreso !== null && r.ingreso > 0 ? round((margenContribucion / r.ingreso) * 100) : null;

    const costoTotal = r.costoVariable !== null && r.costoFijo !== null ? round(r.costoVariable + r.costoFijo) : null;

    const utilidadNeta = margenContribucion !== null && r.costoFijo !== null ? round(margenContribucion - r.costoFijo) : null;

    const precioUnitario = r.ingreso !== null && r.unidades !== null && r.unidades > 0 ? round(r.ingreso / r.unidades) : null;

    // Punto de equilibrio ($) = Costo Fijo / (Margen de Contribución % / 100).
    const puntoEquilibrioValor =
      r.costoFijo !== null && margenContribucionPct !== null && margenContribucionPct > 0 ? round(r.costoFijo / (margenContribucionPct / 100)) : null;

    const puntoEquilibrioUnidades = puntoEquilibrioValor !== null && precioUnitario !== null && precioUnitario > 0 ? round(puntoEquilibrioValor / precioUnitario) : null;

    const variacionPresupuestalPct =
      r.ingreso !== null && r.presupuestoIngreso !== null && r.presupuestoIngreso !== 0 ? round(((r.ingreso - r.presupuestoIngreso) / Math.abs(r.presupuestoIngreso)) * 100) : null;

    const roiPct = utilidadNeta !== null && r.inversionInicial !== null && r.inversionInicial > 0 ? round((utilidadNeta / r.inversionInicial) * 100) : null;

    // "En pérdida" prioriza utilidad neta (ya descuenta costo fijo); si no hay
    // costo fijo disponible, cae a margen de contribución negativo como proxy.
    // Si ninguno de los dos es calculable, queda null (no evaluable) — nunca
    // se asume "false" por defecto, para no maquillar un producto sin datos
    // como sano.
    const enPerdida = utilidadNeta !== null ? utilidadNeta < 0 : margenContribucion !== null ? margenContribucion < 0 : null;

    return {
      ...r,
      margenContribucion,
      margenContribucionPct,
      costoTotal,
      utilidadNeta,
      precioUnitario,
      puntoEquilibrioValor,
      puntoEquilibrioUnidades,
      variacionPresupuestalPct,
      roiPct,
      enPerdida,
    };
  });

  // ── Resumen — totales agregados (no promedio simple de ratios, evita que
  // un producto pequeño distorsione el indicador consolidado) ──
  const conIngreso = items.filter((it) => it.ingreso !== null);
  const ingresoTotal = conIngreso.length > 0 ? round(conIngreso.reduce((s, it) => s + (it.ingreso ?? 0), 0)) : null;

  const conCostoVariable = items.filter((it) => it.costoVariable !== null);
  const costoVariableTotal = conCostoVariable.length > 0 ? round(conCostoVariable.reduce((s, it) => s + (it.costoVariable ?? 0), 0)) : null;

  const conCostoFijo = items.filter((it) => it.costoFijo !== null);
  const costoFijoTotal = conCostoFijo.length > 0 ? round(conCostoFijo.reduce((s, it) => s + (it.costoFijo ?? 0), 0)) : null;

  const costoTotal = costoVariableTotal !== null && costoFijoTotal !== null ? round(costoVariableTotal + costoFijoTotal) : null;

  const conMargen = items.filter((it) => it.margenContribucion !== null);
  const margenContribucionTotal = conMargen.length > 0 ? round(conMargen.reduce((s, it) => s + (it.margenContribucion ?? 0), 0)) : null;

  // Margen % consolidado ponderado por ingreso (no promedio simple de %).
  const ingresoParaMargen = conMargen.reduce((s, it) => s + (it.ingreso ?? 0), 0);
  const margenContribucionPromedioPct = margenContribucionTotal !== null && ingresoParaMargen > 0 ? round((margenContribucionTotal / ingresoParaMargen) * 100) : null;

  const conUtilidad = items.filter((it) => it.utilidadNeta !== null);
  const utilidadNetaTotal = conUtilidad.length > 0 ? round(conUtilidad.reduce((s, it) => s + (it.utilidadNeta ?? 0), 0)) : null;

  const itemsEvaluablesPerdida = items.filter((it) => it.enPerdida !== null);
  const numProductosEnPerdida = itemsEvaluablesPerdida.length > 0 ? itemsEvaluablesPerdida.filter((it) => it.enPerdida).length : null;

  const conPresupuesto = items.filter((it) => it.ingreso !== null && it.presupuestoIngreso !== null);
  const ingresoParaPresupuesto = conPresupuesto.reduce((s, it) => s + (it.ingreso ?? 0), 0);
  const presupuestoTotal = conPresupuesto.reduce((s, it) => s + (it.presupuestoIngreso ?? 0), 0);
  const variacionPresupuestalPromedioPct = conPresupuesto.length > 0 && presupuestoTotal !== 0 ? round(((ingresoParaPresupuesto - presupuestoTotal) / Math.abs(presupuestoTotal)) * 100) : null;

  const conRoi = items.filter((it) => it.utilidadNeta !== null && it.inversionInicial !== null && it.inversionInicial > 0);
  const inversionTotal = conRoi.reduce((s, it) => s + (it.inversionInicial ?? 0), 0);
  const utilidadParaRoi = conRoi.reduce((s, it) => s + (it.utilidadNeta ?? 0), 0);
  const roiConsolidadoPct = conRoi.length > 0 && inversionTotal > 0 ? round((utilidadParaRoi / inversionTotal) * 100) : null;

  const pctCostoVariable = costoTotal !== null && costoTotal > 0 && costoVariableTotal !== null ? round((costoVariableTotal / costoTotal) * 100) : null;
  const pctCostoFijo = costoTotal !== null && costoTotal > 0 && costoFijoTotal !== null ? round((costoFijoTotal / costoTotal) * 100) : null;

  const puntoEquilibrioConsolidadoValor = costoFijoTotal !== null && margenContribucionPromedioPct !== null && margenContribucionPromedioPct > 0 ? round(costoFijoTotal / (margenContribucionPromedioPct / 100)) : null;

  const resumen = {
    numProductos: items.length,
    ingresoTotal,
    costoVariableTotal,
    costoFijoTotal,
    costoTotal,
    margenContribucionTotal,
    margenContribucionPromedioPct,
    utilidadNetaTotal,
    numProductosEnPerdida,
    variacionPresupuestalPromedioPct,
    roiConsolidadoPct,
    pctCostoVariable,
    pctCostoFijo,
    puntoEquilibrioConsolidadoValor,
  };

  // ── Ranking de rentabilidad — usa la métrica con mayor cobertura de datos ──
  const coverageUtilidad = items.filter((it) => it.utilidadNeta !== null).length;
  const coverageMargen = items.filter((it) => it.margenContribucionPct !== null).length;

  let ranking: CostRanking | null = null;
  if (coverageUtilidad > 0 || coverageMargen > 0) {
    const metrica: CostRankingMetrica = coverageUtilidad >= coverageMargen ? 'utilidad_neta' : 'margen_contribucion_pct';
    const key = metrica === 'utilidad_neta' ? 'utilidadNeta' : 'margenContribucionPct';
    const rankedItems = items
      .filter((it) => it[key] !== null)
      .map((it) => ({ producto: it.producto, valor: it[key] as number, enPerdida: Boolean(it.enPerdida) }))
      .sort((a, b) => b.valor - a.valor);
    ranking = { metrica, items: rankedItems, mejor: rankedItems[0] ?? null, peor: rankedItems[rankedItems.length - 1] ?? null };
  }

  // ── Productos en pérdida — solo entre los efectivamente evaluables ──
  const productosEnPerdida: ProductoEnPerdida[] = itemsEvaluablesPerdida
    .filter((it) => it.enPerdida)
    .map((it) => ({
      producto: it.producto,
      utilidadNeta: it.utilidadNeta,
      margenContribucionPct: it.margenContribucionPct,
      diagnostico:
        it.utilidadNeta !== null
          ? `Utilidad neta negativa (${it.utilidadNeta.toFixed(0)}) tras costo fijo asignado${it.margenContribucionPct !== null ? `, margen de contribución de ${it.margenContribucionPct.toFixed(1)}%` : ''}.`
          : `Margen de contribución negativo (${(it.margenContribucionPct ?? 0).toFixed(1)}%) — el producto no cubre siquiera su costo variable.`,
    }))
    .sort((a, b) => (a.utilidadNeta ?? a.margenContribucionPct ?? 0) - (b.utilidadNeta ?? b.margenContribucionPct ?? 0));

  // ── Producto más rentable ──
  let productoMasRentable: CostAnalyticsResult['productoMasRentable'] = null;
  if (ranking && ranking.mejor) {
    const it = items.find((i) => i.producto === ranking!.mejor!.producto) ?? null;
    if (it) productoMasRentable = { producto: it.producto, utilidadNeta: it.utilidadNeta, margenContribucionPct: it.margenContribucionPct };
  }

  return { items, resumen, ranking, productosEnPerdida, productoMasRentable, warnings };
}

// ================================================================
// Comparativo automático contra el análisis publicado anterior —
// mismo patrón que sales-analytics.ts / operations-analytics.ts.
// ================================================================

function buildComparativoEntry(valorActual: unknown, valorAnterior: unknown): ComparativoIndicador | null {
  if (typeof valorActual !== 'number' || typeof valorAnterior !== 'number') return null;
  if (Number.isNaN(valorActual) || Number.isNaN(valorAnterior)) return null;

  const variacionAbsoluta = round(valorActual - valorAnterior);
  return {
    valor_actual: valorActual,
    valor_anterior: valorAnterior,
    variacion_absoluta: variacionAbsoluta,
    variacion_relativa_pct: valorAnterior === 0 ? null : round((variacionAbsoluta / Math.abs(valorAnterior)) * 100),
  };
}

export function computeCostProfitabilityComparativo(current: CostAnalyticsResult, previous: any, previousPeriodEnd: string): CostComparativo | null {
  if (!current.resumen || !previous?.resumen) return null;

  const indicadores: CostComparativo['indicadores'] = {};

  const map: [keyof CostComparativo['indicadores'], keyof NonNullable<CostAnalyticsResult['resumen']>][] = [
    ['ingreso_total', 'ingresoTotal'],
    ['costo_total', 'costoTotal'],
    ['margen_contribucion_promedio_pct', 'margenContribucionPromedioPct'],
    ['utilidad_neta_total', 'utilidadNetaTotal'],
    ['roi_consolidado_pct', 'roiConsolidadoPct'],
  ];

  for (const [comparativoKey, resumenKey] of map) {
    const entry = buildComparativoEntry(current.resumen[resumenKey], previous.resumen[resumenKey]);
    if (entry) indicadores[comparativoKey] = entry;
  }

  if (Object.keys(indicadores).length === 0) return null;

  return { period_end_base: previousPeriodEnd, indicadores };
}

// ================================================================
// Metadata de presentación — formato y semáforo, usados por dashboard y PDF.
// ================================================================

export type CostValueFormat = 'currency' | 'percent' | 'integer' | 'ratio';

export function formatCostValue(value: number | null | undefined, format: CostValueFormat): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  if (format === 'percent') return `${value.toFixed(1)}%`;
  if (format === 'currency') return `$${new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 }).format(value)}`;
  if (format === 'integer') return new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 }).format(value);
  return value.toFixed(2);
}

export type CostSemaphoreStatus = 'good' | 'warning' | 'critical' | 'unknown';

type SemaphoreRange = { good: number; warning: number; direction: 'higher-better' | 'lower-better' };

/** Umbrales genéricos de control de gestión — sin benchmark sectorial específico. */
const COST_SEMAPHORE_RANGES: Record<string, SemaphoreRange> = {
  margen_contribucion_promedio_pct: { good: 40, warning: 20, direction: 'higher-better' },
  variacion_presupuestal_promedio_pct: { good: 0, warning: -10, direction: 'higher-better' },
  roi_consolidado_pct: { good: 15, warning: 5, direction: 'higher-better' },
};

export function classifyCostIndicator(key: string, value: number | null | undefined): CostSemaphoreStatus {
  if (value === null || value === undefined || Number.isNaN(value)) return 'unknown';
  const range = COST_SEMAPHORE_RANGES[key];
  if (!range) return 'unknown';

  if (range.direction === 'higher-better') {
    if (value >= range.good) return 'good';
    if (value >= range.warning) return 'warning';
    return 'critical';
  }
  if (value <= range.good) return 'good';
  if (value <= range.warning) return 'warning';
  return 'critical';
}

export type CostRiskMapRow = { indicador: string; nivel: 'verde' | 'amarillo' | 'rojo'; señal: string };

const STATUS_TO_NIVEL: Record<CostSemaphoreStatus, 'verde' | 'amarillo' | 'rojo'> = {
  good: 'verde',
  warning: 'amarillo',
  critical: 'rojo',
  unknown: 'amarillo',
};

/**
 * Mapa de riesgos determinista (no depende de la narrativa IA). Cada fila
 * solo se incluye si el indicador subyacente fue efectivamente calculable
 * con los datos del archivo — nunca se muestra "Saludable" cuando en
 * realidad faltan las columnas necesarias (bug ya visto y corregido en el
 * módulo de nómina: un conteo que por defecto es 0 por falta de datos no es
 * lo mismo que un 0 real).
 */
export function buildCostRiskMap(results: CostAnalyticsResult): CostRiskMapRow[] {
  const rows: CostRiskMapRow[] = [];
  const r = results.resumen;
  if (!r) return rows;

  if (r.numProductosEnPerdida !== null) {
    const pctPerdida = r.numProductos > 0 ? round((r.numProductosEnPerdida / r.numProductos) * 100) : 0;
    const nivel: 'verde' | 'amarillo' | 'rojo' = r.numProductosEnPerdida === 0 ? 'verde' : r.numProductosEnPerdida === 1 ? 'amarillo' : 'rojo';
    rows.push({ indicador: 'Productos/Proyectos en Pérdida', nivel, señal: `${pctPerdida.toFixed(1)}% (${r.numProductosEnPerdida})` });
  }

  if (r.margenContribucionPromedioPct !== null) {
    const status = classifyCostIndicator('margen_contribucion_promedio_pct', r.margenContribucionPromedioPct);
    rows.push({ indicador: 'Margen de Contribución Promedio', nivel: STATUS_TO_NIVEL[status], señal: `${r.margenContribucionPromedioPct.toFixed(1)}%` });
  }

  if (r.variacionPresupuestalPromedioPct !== null) {
    const status = classifyCostIndicator('variacion_presupuestal_promedio_pct', r.variacionPresupuestalPromedioPct);
    rows.push({
      indicador: 'Variación Presupuestal',
      nivel: STATUS_TO_NIVEL[status],
      señal: `${r.variacionPresupuestalPromedioPct >= 0 ? '+' : ''}${r.variacionPresupuestalPromedioPct.toFixed(1)}%`,
    });
  }

  if (r.roiConsolidadoPct !== null) {
    const status = classifyCostIndicator('roi_consolidado_pct', r.roiConsolidadoPct);
    rows.push({ indicador: 'ROI Consolidado', nivel: STATUS_TO_NIVEL[status], señal: `${r.roiConsolidadoPct.toFixed(1)}%` });
  }

  return rows;
}
