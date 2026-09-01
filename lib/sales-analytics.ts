export const SALES_ANALYSIS_TYPE_CODES = ['ventas'] as const;

// ================================================================
// Parseo de celdas — mismo criterio que financial-indicators.ts /
// customer-analytics.ts (formato latino "1.234,56" y negativos entre
// paréntesis).
// ================================================================

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

function parseNumericCell(raw: unknown): number | null {
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  if (typeof raw !== 'string') return null;

  const trimmed = raw.trim();
  if (!trimmed) return null;

  const isNegativeParens = /^\(.*\)$/.test(trimmed);
  let cleaned = trimmed.replace(/[()]/g, '').replace(/[$\s]/g, '');

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

const MONTH_NAMES_ES: Record<string, number> = {
  enero: 0, ene: 0, febrero: 1, feb: 1, marzo: 2, mar: 2, abril: 3, abr: 3,
  mayo: 4, may: 4, junio: 5, jun: 5, julio: 6, jul: 6, agosto: 7, ago: 7,
  septiembre: 8, setiembre: 8, sep: 8, sept: 8, octubre: 9, oct: 9,
  noviembre: 10, nov: 10, diciembre: 11, dic: 11,
};

/**
 * Parsea fecha o período textual: ISO/fecha estándar, "dd/mm/yyyy", o
 * "Enero 2026" / "2026-01" / "Q1 2026" — este último se resuelve al primer
 * mes del trimestre. Devuelve el primer día del mes correspondiente (la
 * evolución temporal siempre se agrupa a nivel mensual).
 */
function parsePeriodCell(raw: unknown): Date | null {
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) {
    return new Date(Date.UTC(raw.getUTCFullYear(), raw.getUTCMonth(), 1));
  }
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed) return null;

    const isoLike = new Date(trimmed);
    if (!Number.isNaN(isoLike.getTime()) && /\d{4}/.test(trimmed)) {
      return new Date(Date.UTC(isoLike.getUTCFullYear(), isoLike.getUTCMonth(), 1));
    }

    const dmy = trimmed.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
    if (dmy) {
      const month = Number(dmy[2]);
      const year = Number(dmy[3].length === 2 ? `20${dmy[3]}` : dmy[3]);
      if (month >= 1 && month <= 12) return new Date(Date.UTC(year, month - 1, 1));
    }

    const quarter = trimmed.match(/^q([1-4])\s*[-/]?\s*(\d{4})$/i);
    if (quarter) {
      const month = (Number(quarter[1]) - 1) * 3;
      return new Date(Date.UTC(Number(quarter[2]), month, 1));
    }

    const monthYear = trimmed.toLowerCase().match(/([a-zé]+)\.?\s*[-/de]*\s*(\d{4})/i);
    if (monthYear) {
      const monthKey = monthYear[1].normalize('NFD').replace(/[̀-ͯ]/g, '');
      const monthIdx = MONTH_NAMES_ES[monthKey];
      if (monthIdx !== undefined) return new Date(Date.UTC(Number(monthYear[2]), monthIdx, 1));
    }
  }
  if (typeof raw === 'number' && raw > 1900 && raw < 2200) {
    // año suelto, sin mes — no es un período mensual válido
    return null;
  }
  return null;
}

function periodLabel(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

// ================================================================
// Normalización de filas crudas → registros por transacción — mismo
// mecanismo de detección de encabezado real (título/subtítulo antes de
// la tabla) que customer-analytics.ts.
// ================================================================

function isPositionalKey(key: string): boolean {
  return /^col_\d+$/.test(key);
}

type SalesColumnKey = 'fecha' | 'producto' | 'cliente' | 'canal' | 'costo' | 'cantidad' | 'monto';

const SALES_COLUMN_RULES: { key: SalesColumnKey; test: (l: string) => boolean }[] = [
  { key: 'fecha', test: (l) => l.includes('fecha') || l.includes('periodo') || l.includes('período') || l.includes('mes') || l.includes('date') },
  { key: 'canal', test: (l) => l.includes('canal') || l.includes('channel') },
  { key: 'cliente', test: (l) => l.includes('cliente') || l.includes('customer') },
  { key: 'producto', test: (l) => l.includes('producto') || l.includes('categoria') || l.includes('categoría') || l.includes('linea') || l.includes('línea') || l.includes('item') || l.includes('sku') },
  { key: 'costo', test: (l) => l.includes('costo') || l.includes('cost') },
  { key: 'cantidad', test: (l) => l.includes('cantidad') || l.includes('unidades') || l.includes('qty') || l.includes('unit') },
  { key: 'monto', test: (l) => l.includes('monto') || l.includes('venta') || l.includes('ingreso') || l.includes('total') || l.includes('valor') || l.includes('facturado') },
];

function countHeaderMatches(row: Record<string, unknown>): number {
  let matches = 0;
  for (const [key, value] of Object.entries(row)) {
    if (key === 'sheet') continue;
    if (typeof value !== 'string') continue;
    const label = value.toLowerCase().trim();
    if (!label) continue;
    if (SALES_COLUMN_RULES.some((rule) => rule.test(label))) matches++;
  }
  return matches;
}

function normalizeSalesRows(rows: Record<string, unknown>[]): { records: Record<string, unknown>[]; warnings: string[] } {
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

type SalesTransaction = {
  fecha: Date | null;
  producto: string | null;
  cliente: string | null;
  canal: string | null;
  monto: number;
  cantidad: number | null;
  costo: number | null;
};

function extractSalesTransactions(records: Record<string, unknown>[]): { transacciones: SalesTransaction[]; warnings: string[] } {
  const transacciones: SalesTransaction[] = [];
  const warnings: string[] = [];

  let skippedNoMonto = 0;
  let missingFecha = 0;
  let missingProducto = 0;
  let missingCanal = 0;
  let missingCosto = 0;

  for (const record of records) {
    const fields: Partial<Record<SalesColumnKey, unknown>> = {};
    for (const [rawKey, value] of Object.entries(record)) {
      const label = rawKey.toLowerCase().trim();
      if (!label) continue;
      for (const rule of SALES_COLUMN_RULES) {
        if (!rule.test(label)) continue;
        if (fields[rule.key] === undefined) fields[rule.key] = value;
        break;
      }
    }

    const monto = parseNumericCell(fields.monto);
    if (monto === null) {
      skippedNoMonto++;
      continue;
    }

    const fecha = parsePeriodCell(fields.fecha);
    if (!fecha) missingFecha++;

    const producto = typeof fields.producto === 'string' && fields.producto.trim() ? fields.producto.trim() : null;
    if (!producto) missingProducto++;

    const cliente = typeof fields.cliente === 'string' && fields.cliente.trim() ? fields.cliente.trim() : null;

    const canal = typeof fields.canal === 'string' && fields.canal.trim() ? fields.canal.trim() : null;
    if (!canal) missingCanal++;

    const costo = parseNumericCell(fields.costo);
    if (costo === null) missingCosto++;

    const cantidad = parseNumericCell(fields.cantidad);

    transacciones.push({ fecha, producto, cliente, canal, monto: round(monto), cantidad, costo: costo !== null ? round(costo) : null });
  }

  const n = transacciones.length;
  if (skippedNoMonto > 0) warnings.push(`${skippedNoMonto} fila(s) del archivo se descartaron por no tener un monto de venta identificable.`);
  if (n > 0 && missingFecha === n) {
    warnings.push('No se identificó la columna de fecha/período en ninguna fila — la evolución temporal, la estacionalidad y el comparativo de crecimiento quedaron sin calcular.');
  } else if (missingFecha > 0) {
    warnings.push(`${missingFecha} fila(s) sin fecha/período identificable — se excluyeron de la evolución temporal y la estacionalidad.`);
  }
  if (n > 0 && missingProducto === n) {
    warnings.push('No se identificó la columna de producto/categoría — el análisis Pareto y la concentración se calcularon a nivel de cliente cuando fue posible, o quedaron sin calcular.');
  }
  if (n > 0 && missingCanal === n) {
    warnings.push('No se identificó la columna de canal de venta — el desempeño por canal quedó sin calcular.');
  }
  if (n > 0 && missingCosto === n) {
    warnings.push('No se identificó la columna de costo de venta — el margen bruto quedó sin calcular.');
  }

  return { transacciones, warnings };
}

// ================================================================
// Cálculo de indicadores
// ================================================================

export type EvolucionPunto = { periodo: string; monto: number; cantidad: number | null };

export type ParetoItem = { nombre: string; monto: number; pctTotal: number; pctAcumulado: number };
export type ParetoResult = {
  dimension: 'producto' | 'cliente';
  items: ParetoItem[];
  itemsPara80pct: number;
  totalItems: number;
};

export type ConcentracionItem = { nombre: string; monto: number; pctTotal: number };

export type Estacionalidad = {
  mesPico: { periodo: string; monto: number } | null;
  mesValle: { periodo: string; monto: number } | null;
  coeficienteVariacion: number | null;
};

export type MargenItem = { nombre: string; monto: number; costo: number; margenPct: number };

export type CanalItem = { nombre: string; monto: number; pctTotal: number; numTransacciones: number };

export type ComparativoIndicador = {
  valor_actual: number;
  valor_anterior: number;
  variacion_absoluta: number;
  variacion_relativa_pct: number | null;
};

export type SalesComparativo = {
  period_end_base: string;
  indicadores: Partial<Record<'ventas_totales' | 'ticket_promedio' | 'margen_bruto_pct' | 'num_transacciones', ComparativoIndicador>>;
};

export type SalesAnalyticsResult = {
  resumen: {
    ventasTotales: number;
    numTransacciones: number;
    ticketPromedio: number;
    unidadesTotales: number | null;
    margenBrutoPct: number | null;
    margenBrutoTotal: number | null;
  } | null;
  evolucionTemporal: EvolucionPunto[];
  pareto: ParetoResult | null;
  concentracionTop5: ConcentracionItem[];
  estacionalidad: Estacionalidad | null;
  margenPorProducto: MargenItem[] | null;
  canal: CanalItem[] | null;
  comparativo_periodo_anterior?: SalesComparativo | null;
  warnings: string[];
};

function groupBy(transacciones: SalesTransaction[], dimension: 'producto' | 'cliente'): Map<string, number> {
  const map = new Map<string, number>();
  for (const t of transacciones) {
    const key = dimension === 'producto' ? t.producto : t.cliente;
    if (!key) continue;
    map.set(key, (map.get(key) ?? 0) + t.monto);
  }
  return map;
}

function computePareto(transacciones: SalesTransaction[], totalVentas: number, warnings: string[]): ParetoResult | null {
  let dimension: 'producto' | 'cliente' = 'producto';
  let groups = groupBy(transacciones, 'producto');

  if (groups.size === 0) {
    dimension = 'cliente';
    groups = groupBy(transacciones, 'cliente');
  }

  if (groups.size === 0) {
    warnings.push('No hay columna de producto ni de cliente disponible — el análisis Pareto 80/20 no se pudo calcular.');
    return null;
  }

  const sorted = Array.from(groups.entries()).sort((a, b) => b[1] - a[1]);
  let cumulative = 0;
  let itemsPara80pct = 0;
  let reached80 = false;

  const items: ParetoItem[] = sorted.map(([nombre, monto]) => {
    cumulative += monto;
    const pctAcumulado = totalVentas > 0 ? round((cumulative / totalVentas) * 100) : 0;
    if (!reached80) {
      itemsPara80pct++;
      if (pctAcumulado >= 80) reached80 = true;
    }
    return {
      nombre,
      monto: round(monto),
      pctTotal: totalVentas > 0 ? round((monto / totalVentas) * 100) : 0,
      pctAcumulado,
    };
  });

  return { dimension, items, itemsPara80pct, totalItems: sorted.length };
}

function computeConcentracionTop5(pareto: ParetoResult | null): ConcentracionItem[] {
  if (!pareto) return [];
  return pareto.items.slice(0, 5).map((i) => ({ nombre: i.nombre, monto: i.monto, pctTotal: i.pctTotal }));
}

function computeEvolucionTemporal(transacciones: SalesTransaction[]): EvolucionPunto[] {
  const map = new Map<string, { monto: number; cantidad: number | null; hasCantidad: boolean }>();
  for (const t of transacciones) {
    if (!t.fecha) continue;
    const label = periodLabel(t.fecha);
    const entry = map.get(label) ?? { monto: 0, cantidad: 0, hasCantidad: false };
    entry.monto += t.monto;
    if (t.cantidad !== null) {
      entry.cantidad = (entry.cantidad ?? 0) + t.cantidad;
      entry.hasCantidad = true;
    }
    map.set(label, entry);
  }

  return Array.from(map.entries())
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([periodo, v]) => ({ periodo, monto: round(v.monto), cantidad: v.hasCantidad ? round(v.cantidad ?? 0) : null }));
}

function computeEstacionalidad(evolucion: EvolucionPunto[], warnings: string[]): Estacionalidad | null {
  if (evolucion.length < 3) {
    warnings.push('Se necesitan al menos 3 meses distintos con fecha identificable para evaluar estacionalidad — quedó sin calcular.');
    return null;
  }

  const montos = evolucion.map((e) => e.monto);
  const pico = evolucion.reduce((max, e) => (e.monto > max.monto ? e : max), evolucion[0]);
  const valle = evolucion.reduce((min, e) => (e.monto < min.monto ? e : min), evolucion[0]);

  const media = montos.reduce((s, v) => s + v, 0) / montos.length;
  const varianza = montos.reduce((s, v) => s + (v - media) ** 2, 0) / montos.length;
  const desviacion = Math.sqrt(varianza);
  const coeficienteVariacion = media > 0 ? round(desviacion / media) : null;

  return {
    mesPico: { periodo: pico.periodo, monto: pico.monto },
    mesValle: { periodo: valle.periodo, monto: valle.monto },
    coeficienteVariacion,
  };
}

function computeMargenPorProducto(transacciones: SalesTransaction[], warnings: string[]): MargenItem[] | null {
  const conCosto = transacciones.filter((t) => t.costo !== null);
  if (conCosto.length === 0) return null;

  const map = new Map<string, { monto: number; costo: number }>();
  for (const t of conCosto) {
    const key = t.producto ?? '(sin producto)';
    const entry = map.get(key) ?? { monto: 0, costo: 0 };
    entry.monto += t.monto;
    entry.costo += t.costo!;
    map.set(key, entry);
  }

  return Array.from(map.entries())
    .map(([nombre, v]) => ({
      nombre,
      monto: round(v.monto),
      costo: round(v.costo),
      margenPct: v.monto > 0 ? round(((v.monto - v.costo) / v.monto) * 100) : 0,
    }))
    .sort((a, b) => b.margenPct - a.margenPct);
}

function computeCanal(transacciones: SalesTransaction[], totalVentas: number): CanalItem[] | null {
  const conCanal = transacciones.filter((t) => t.canal !== null);
  if (conCanal.length === 0) return null;

  const map = new Map<string, { monto: number; count: number }>();
  for (const t of conCanal) {
    const entry = map.get(t.canal!) ?? { monto: 0, count: 0 };
    entry.monto += t.monto;
    entry.count += 1;
    map.set(t.canal!, entry);
  }

  return Array.from(map.entries())
    .map(([nombre, v]) => ({
      nombre,
      monto: round(v.monto),
      pctTotal: totalVentas > 0 ? round((v.monto / totalVentas) * 100) : 0,
      numTransacciones: v.count,
    }))
    .sort((a, b) => b.monto - a.monto);
}

export function computeSalesResults(
  rows: Record<string, unknown>[],
  _period?: { periodStart?: string; periodEnd?: string }
): SalesAnalyticsResult {
  const { records, warnings: normWarnings } = normalizeSalesRows(rows);
  const { transacciones, warnings: extractWarnings } = extractSalesTransactions(records);

  const warnings = [...normWarnings, ...extractWarnings];

  if (transacciones.length === 0) {
    warnings.push('No se pudo identificar ninguna venta válida (falta el monto) en el archivo cargado.');
    return {
      resumen: null,
      evolucionTemporal: [],
      pareto: null,
      concentracionTop5: [],
      estacionalidad: null,
      margenPorProducto: null,
      canal: null,
      warnings,
    };
  }

  const ventasTotales = transacciones.reduce((s, t) => s + t.monto, 0);
  const numTransacciones = transacciones.length;
  const ticketPromedio = round(ventasTotales / numTransacciones);

  const conCantidad = transacciones.filter((t) => t.cantidad !== null);
  const unidadesTotales = conCantidad.length > 0 ? round(conCantidad.reduce((s, t) => s + (t.cantidad ?? 0), 0)) : null;

  const conCosto = transacciones.filter((t) => t.costo !== null);
  const costoTotal = conCosto.length > 0 ? conCosto.reduce((s, t) => s + (t.costo ?? 0), 0) : null;
  const ventasConCosto = conCosto.length > 0 ? conCosto.reduce((s, t) => s + t.monto, 0) : null;
  const margenBrutoTotal = costoTotal !== null && ventasConCosto !== null ? round(ventasConCosto - costoTotal) : null;
  const margenBrutoPct = costoTotal !== null && ventasConCosto !== null && ventasConCosto > 0
    ? round(((ventasConCosto - costoTotal) / ventasConCosto) * 100)
    : null;

  const pareto = computePareto(transacciones, ventasTotales, warnings);
  const concentracionTop5 = computeConcentracionTop5(pareto);
  const evolucionTemporal = computeEvolucionTemporal(transacciones);
  const estacionalidad = computeEstacionalidad(evolucionTemporal, warnings);
  const margenPorProducto = computeMargenPorProducto(transacciones, warnings);
  const canal = computeCanal(transacciones, ventasTotales);

  return {
    resumen: {
      ventasTotales: round(ventasTotales),
      numTransacciones,
      ticketPromedio,
      unidadesTotales,
      margenBrutoPct,
      margenBrutoTotal,
    },
    evolucionTemporal,
    pareto,
    concentracionTop5,
    estacionalidad,
    margenPorProducto,
    canal,
    warnings,
  };
}

// ================================================================
// Comparativo automático contra el análisis publicado anterior — mismo
// patrón conceptual que financial-indicators.ts, con un set curado de
// KPIs de ventas (independiente del motor financiero).
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

export function computeSalesComparativo(
  current: SalesAnalyticsResult,
  previous: any,
  previousPeriodEnd: string
): SalesComparativo | null {
  if (!current.resumen || !previous?.resumen) return null;

  const indicadores: SalesComparativo['indicadores'] = {};

  const ventasEntry = buildComparativoEntry(current.resumen.ventasTotales, previous.resumen.ventasTotales);
  if (ventasEntry) indicadores.ventas_totales = ventasEntry;

  const ticketEntry = buildComparativoEntry(current.resumen.ticketPromedio, previous.resumen.ticketPromedio);
  if (ticketEntry) indicadores.ticket_promedio = ticketEntry;

  const margenEntry = buildComparativoEntry(current.resumen.margenBrutoPct, previous.resumen.margenBrutoPct);
  if (margenEntry) indicadores.margen_bruto_pct = margenEntry;

  const numEntry = buildComparativoEntry(current.resumen.numTransacciones, previous.resumen.numTransacciones);
  if (numEntry) indicadores.num_transacciones = numEntry;

  if (Object.keys(indicadores).length === 0) return null;

  return { period_end_base: previousPeriodEnd, indicadores };
}

// ================================================================
// Metadata de presentación — formato y semáforo, usados por dashboard y PDF.
// ================================================================

export type SalesValueFormat = 'currency' | 'percent' | 'integer' | 'ratio';

export function formatSalesValue(value: number | null | undefined, format: SalesValueFormat): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  if (format === 'percent') return `${value.toFixed(1)}%`;
  if (format === 'currency') return `$${new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 }).format(value)}`;
  if (format === 'integer') return new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 }).format(value);
  return value.toFixed(2);
}

export type SalesSemaphoreStatus = 'good' | 'warning' | 'critical' | 'unknown';

type SemaphoreRange = { good: number; warning: number; direction: 'higher-better' | 'lower-better' };

/** Umbrales de referencia genéricos de comercio/retail — sin benchmark sectorial específico. */
const SALES_SEMAPHORE_RANGES: Record<string, SemaphoreRange> = {
  crecimiento_ventas_pct: { good: 5, warning: 0, direction: 'higher-better' },
  margen_bruto_pct: { good: 35, warning: 15, direction: 'higher-better' },
  concentracion_top5_pct: { good: 50, warning: 70, direction: 'lower-better' },
  coeficiente_variacion: { good: 0.15, warning: 0.3, direction: 'lower-better' },
};

export function classifySalesIndicator(key: string, value: number | null | undefined): SalesSemaphoreStatus {
  if (value === null || value === undefined || Number.isNaN(value)) return 'unknown';
  const range = SALES_SEMAPHORE_RANGES[key];
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

export type SalesRiskMapRow = { indicador: string; nivel: 'verde' | 'amarillo' | 'rojo'; señal: string };

const STATUS_TO_NIVEL: Record<SalesSemaphoreStatus, 'verde' | 'amarillo' | 'rojo'> = {
  good: 'verde',
  warning: 'amarillo',
  critical: 'rojo',
  unknown: 'amarillo',
};

/** A diferencia de un simple label de estado (que duplicaría la lectura ya visible en el badge de "Nivel"), "señal" lleva la cifra concreta que sustenta la clasificación. */
export function buildSalesRiskMap(results: SalesAnalyticsResult): SalesRiskMapRow[] {
  const rows: SalesRiskMapRow[] = [];

  const crecimiento = results.comparativo_periodo_anterior?.indicadores?.ventas_totales?.variacion_relativa_pct;
  if (crecimiento !== null && crecimiento !== undefined) {
    const status = classifySalesIndicator('crecimiento_ventas_pct', crecimiento);
    rows.push({
      indicador: 'Crecimiento de Ventas vs. Período Anterior',
      nivel: STATUS_TO_NIVEL[status],
      señal: `${crecimiento >= 0 ? '+' : ''}${crecimiento.toFixed(1)}%`,
    });
  }

  if (results.resumen?.margenBrutoPct !== null && results.resumen?.margenBrutoPct !== undefined) {
    const status = classifySalesIndicator('margen_bruto_pct', results.resumen.margenBrutoPct);
    rows.push({ indicador: 'Margen Bruto', nivel: STATUS_TO_NIVEL[status], señal: `${results.resumen.margenBrutoPct.toFixed(1)}%` });
  }

  // "Top-5 = X%" solo es una señal de concentración significativa cuando el
  // catálogo tiene más de 5 elementos — con 5 o menos, Top-5 es trivialmente
  // el 100% del catálogo y no refleja concentración real.
  if (results.pareto && results.resumen && results.pareto.totalItems > 5) {
    const top5Pct = results.concentracionTop5.reduce((s, i) => s + i.pctTotal, 0);
    const status = classifySalesIndicator('concentracion_top5_pct', top5Pct);
    const dimensionLabel = results.pareto.dimension === 'producto' ? 'Productos' : 'Clientes';
    rows.push({ indicador: `Concentración Top-5 ${dimensionLabel}`, nivel: STATUS_TO_NIVEL[status], señal: `${top5Pct.toFixed(1)}% del total` });
  }

  if (results.estacionalidad?.coeficienteVariacion !== null && results.estacionalidad?.coeficienteVariacion !== undefined) {
    const status = classifySalesIndicator('coeficiente_variacion', results.estacionalidad.coeficienteVariacion);
    rows.push({
      indicador: 'Volatilidad Estacional (Coef. Variación)',
      nivel: STATUS_TO_NIVEL[status],
      señal: results.estacionalidad.coeficienteVariacion.toFixed(2),
    });
  }

  return rows;
}
