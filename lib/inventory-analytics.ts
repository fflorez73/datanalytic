export const INVENTORY_ANALYSIS_TYPE_CODES = ['inventarios'] as const;

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

function parseDateCell(raw: unknown): Date | null {
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) return raw;
  if (typeof raw !== 'string') return null;

  const trimmed = raw.trim();
  if (!trimmed) return null;

  const isoLike = new Date(trimmed);
  if (!Number.isNaN(isoLike.getTime())) return isoLike;

  const dmy = trimmed.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (dmy) {
    const day = Number(dmy[1]);
    const month = Number(dmy[2]);
    const year = Number(dmy[3].length === 2 ? `20${dmy[3]}` : dmy[3]);
    const d = new Date(Date.UTC(year, month - 1, day));
    if (!Number.isNaN(d.getTime())) return d;
  }

  return null;
}

/** Días entre period_start y period_end (inclusive del día de cierre). null si las fechas no son parseables. */
function computePeriodDays(periodStart: string | undefined, periodEnd: string | undefined): number | null {
  if (!periodStart || !periodEnd) return null;
  const start = new Date(periodStart);
  const end = new Date(periodEnd);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
  const days = Math.round((end.getTime() - start.getTime()) / 86_400_000);
  return days > 0 ? days : null;
}

// ================================================================
// Normalización de filas crudas → registros por SKU — misma detección
// de fila de encabezado real (título/subtítulo antes de la tabla) que
// customer-analytics.ts / sales-analytics.ts.
// ================================================================

function isPositionalKey(key: string): boolean {
  return /^col_\d+$/.test(key);
}

type InventoryColumnKey =
  | 'sku'
  | 'categoria'
  | 'stock'
  | 'costo_unitario'
  | 'unidades_vendidas'
  | 'proveedor'
  | 'lead_time'
  | 'fecha_movimiento'
  | 'estado';

const INVENTORY_COLUMN_RULES: { key: InventoryColumnKey; test: (l: string) => boolean }[] = [
  { key: 'unidades_vendidas', test: (l) => l.includes('vendid') || l.includes('demanda') },
  { key: 'lead_time', test: (l) => l.includes('lead') || l.includes('reposicion') || l.includes('reposición') },
  {
    key: 'fecha_movimiento',
    test: (l) =>
      l.includes('movimiento') ||
      (l.includes('fecha') && (l.includes('ultim') || l.includes('últim') || l.includes('entrada'))),
  },
  { key: 'estado', test: (l) => l.includes('estado') || l.includes('condicion') || l.includes('condición') },
  { key: 'proveedor', test: (l) => l.includes('proveedor') || l.includes('supplier') },
  { key: 'costo_unitario', test: (l) => l.includes('costo') || l.includes('precio') || (l.includes('valor') && l.includes('unit')) },
  { key: 'stock', test: (l) => l.includes('stock') || l.includes('existencia') || l.includes('inventario') || l.includes('cantidad') },
  { key: 'categoria', test: (l) => l.includes('categoria') || l.includes('categoría') || l.includes('linea') || l.includes('línea') },
  { key: 'sku', test: (l) => l.includes('sku') || l.includes('producto') || l.includes('item') || l.includes('codigo') || l.includes('código') || l.includes('referencia') || l.includes('nombre') },
];

function countHeaderMatches(row: Record<string, unknown>): number {
  let matches = 0;
  for (const [key, value] of Object.entries(row)) {
    if (key === 'sheet') continue;
    if (typeof value !== 'string') continue;
    const label = value.toLowerCase().trim();
    if (!label) continue;
    if (INVENTORY_COLUMN_RULES.some((rule) => rule.test(label))) matches++;
  }
  return matches;
}

function normalizeInventoryRows(rows: Record<string, unknown>[]): { records: Record<string, unknown>[]; warnings: string[] } {
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
// Extracción de ítems de inventario
// ================================================================

type EstadoStock = 'bueno' | 'dañado' | 'vencido' | null;

type RawInventoryItem = {
  sku: string;
  categoria: string | null;
  stock: number;
  costoUnitario: number;
  unidadesVendidas: number | null;
  proveedor: string | null;
  leadTimeDias: number | null;
  fechaUltimoMovimiento: string | null;
  diasSinMovimiento: number | null;
  estado: EstadoStock;
};

function extractInventoryItems(
  records: Record<string, unknown>[],
  referenceDate: Date
): { items: RawInventoryItem[]; warnings: string[] } {
  const items: RawInventoryItem[] = [];
  const warnings: string[] = [];

  let skippedNoSku = 0;
  let skippedNoStockOrCosto = 0;
  let missingCategoria = 0;
  let missingVendidas = 0;
  let missingProveedor = 0;
  let missingLeadTime = 0;
  let missingFecha = 0;
  let missingEstado = 0;

  for (const record of records) {
    const fields: Partial<Record<InventoryColumnKey, unknown>> = {};
    for (const [rawKey, value] of Object.entries(record)) {
      const label = rawKey.toLowerCase().trim();
      if (!label) continue;
      for (const rule of INVENTORY_COLUMN_RULES) {
        if (!rule.test(label)) continue;
        if (fields[rule.key] === undefined) fields[rule.key] = value;
        break;
      }
    }

    const skuRaw = fields.sku;
    const sku = typeof skuRaw === 'string' ? skuRaw.trim() : typeof skuRaw === 'number' ? String(skuRaw) : '';
    const stock = parseNumericCell(fields.stock);
    const costoUnitario = parseNumericCell(fields.costo_unitario);

    if (!sku) {
      skippedNoSku++;
      continue;
    }
    if (stock === null || costoUnitario === null) {
      skippedNoStockOrCosto++;
      continue;
    }

    const categoria = typeof fields.categoria === 'string' && fields.categoria.trim() ? fields.categoria.trim() : null;
    if (!categoria) missingCategoria++;

    const unidadesVendidas = parseNumericCell(fields.unidades_vendidas);
    if (unidadesVendidas === null) missingVendidas++;

    const proveedor = typeof fields.proveedor === 'string' && fields.proveedor.trim() ? fields.proveedor.trim() : null;
    if (!proveedor) missingProveedor++;

    const leadTimeDias = parseNumericCell(fields.lead_time);
    if (leadTimeDias === null) missingLeadTime++;

    const fecha = parseDateCell(fields.fecha_movimiento);
    let diasSinMovimiento: number | null = null;
    if (fecha) {
      diasSinMovimiento = Math.max(0, Math.round((referenceDate.getTime() - fecha.getTime()) / 86_400_000));
    } else {
      missingFecha++;
    }

    const estadoRaw = typeof fields.estado === 'string' ? fields.estado.toLowerCase() : null;
    let estado: EstadoStock = null;
    if (estadoRaw) {
      if (estadoRaw.includes('venc')) estado = 'vencido';
      else if (estadoRaw.includes('dañ') || estadoRaw.includes('dan') || estadoRaw.includes('avería') || estadoRaw.includes('averi')) estado = 'dañado';
      else if (estadoRaw.includes('buen') || estadoRaw.includes('activ') || estadoRaw.includes('disponible')) estado = 'bueno';
    }
    if (estado === null) missingEstado++;

    items.push({
      sku,
      categoria,
      stock: round(stock),
      costoUnitario: round(costoUnitario),
      unidadesVendidas,
      proveedor,
      leadTimeDias,
      fechaUltimoMovimiento: fecha ? fecha.toISOString().slice(0, 10) : null,
      diasSinMovimiento,
      estado,
    });
  }

  const n = items.length;
  if (skippedNoSku > 0) warnings.push(`${skippedNoSku} fila(s) del archivo se descartaron por no tener un SKU/producto identificable.`);
  if (skippedNoStockOrCosto > 0) warnings.push(`${skippedNoStockOrCosto} fila(s) del archivo se descartaron por no tener cantidad en stock y/o costo unitario identificables.`);
  if (n > 0 && missingCategoria === n) warnings.push('No se identificó la columna de categoría — la valorización por categoría quedó sin calcular.');
  if (n > 0 && missingVendidas === n) warnings.push('No se identificó la columna de unidades vendidas — la rotación, la cobertura en días y el riesgo de quiebre quedaron sin calcular.');
  else if (missingVendidas > 0) warnings.push(`${missingVendidas} SKU(s) sin unidades vendidas identificables — su rotación y cobertura quedaron sin calcular.`);
  if (n > 0 && missingProveedor === n) warnings.push('No se identificó la columna de proveedor — la concentración por proveedor quedó sin calcular.');
  if (n > 0 && missingLeadTime === n) warnings.push('No se identificó la columna de tiempo de reposición (lead time) — el punto de reorden y el riesgo de quiebre usaron un umbral genérico de 7 días.');
  if (n > 0 && missingFecha === n) warnings.push('No se identificó la columna de fecha de último movimiento — la obsolescencia se infirió únicamente de la rotación (SKUs sin ventas en el período).');
  if (n > 0 && missingEstado === n) warnings.push('No se identificó la columna de estado (bueno/dañado/vencido) — el control de estado quedó sin calcular.');

  return { items, warnings };
}

// ================================================================
// Cálculo de indicadores
// ================================================================

export type InventoryItemComputed = RawInventoryItem & {
  valorInventario: number;
  pctValorTotal: number;
  rotacionPeriodo: number | null;
  ventasDiariasPromedio: number | null;
  coberturaDias: number | null;
  puntoReorden: number | null;
  enRiesgoQuiebre: boolean;
  enSobrestock: boolean;
  esObsoleto: boolean;
  claseAbc: 'A' | 'B' | 'C';
};

export type ValorPorCategoria = { categoria: string; valor: number; pctTotal: number; numSkus: number };

export type AbcResumenClase = { clase: 'A' | 'B' | 'C'; numSkus: number; pctSkus: number; valor: number; pctValor: number };

export type RiesgoQuiebreItem = {
  sku: string;
  categoria: string | null;
  stock: number;
  ventasDiariasPromedio: number | null;
  coberturaDias: number | null;
  leadTimeDias: number | null;
  puntoReorden: number | null;
  diagnostico: string;
};

export type SobrestockItem = {
  sku: string;
  categoria: string | null;
  stock: number;
  valorInventario: number;
  coberturaDias: number | null;
  diagnostico: string;
};

export type ObsolescenciaItem = {
  sku: string;
  categoria: string | null;
  valorInventario: number;
  diasSinMovimiento: number | null;
  diagnostico: string;
};

export type EstadoResumen = { estado: string; numSkus: number; valor: number; pctValor: number };

export type ProveedorResumen = { proveedor: string; valor: number; pctTotal: number; numSkus: number };

export type ComparativoIndicador = {
  valor_actual: number;
  valor_anterior: number;
  variacion_absoluta: number;
  variacion_relativa_pct: number | null;
};

export type InventoryComparativo = {
  period_end_base: string;
  indicadores: Partial<Record<'valor_total_inventario' | 'rotacion_anualizada' | 'cobertura_dias_promedio' | 'pct_valor_riesgo_quiebre', ComparativoIndicador>>;
};

export type InventoryAnalyticsResult = {
  items: InventoryItemComputed[];
  resumen: {
    valorTotalInventario: number;
    numSkus: number;
    rotacionPeriodo: number | null;
    rotacionAnualizada: number | null;
    coberturaDiasPromedio: number | null;
    pctValorRiesgoQuiebre: number;
    pctSkusRiesgoQuiebre: number;
    pctValorSobrestock: number;
    pctValorObsoleto: number;
  } | null;
  valorizacionPorCategoria: ValorPorCategoria[];
  abcResumenPorClase: AbcResumenClase[];
  riesgoQuiebre: RiesgoQuiebreItem[];
  sobrestock: SobrestockItem[];
  obsolescencia: ObsolescenciaItem[];
  controlEstado: EstadoResumen[] | null;
  proveedores: ProveedorResumen[] | null;
  comparativo_periodo_anterior?: InventoryComparativo | null;
  periodDays: number | null;
  fechaReferencia: string | null;
  warnings: string[];
};

const LEAD_TIME_DEFAULT_DIAS = 7;
const OBSOLESCENCIA_DIAS_UMBRAL = 90;
const SOBRESTOCK_COBERTURA_DIAS_UMBRAL = 180;

function diagnosticoQuiebre(item: RawInventoryItem, coberturaDias: number | null, leadTime: number): string {
  if (item.stock === 0 && (item.unidadesVendidas ?? 0) > 0) return 'Quiebre de stock activo — demanda sin inventario disponible';
  if (coberturaDias !== null && coberturaDias < leadTime * 0.5) return 'Riesgo crítico — cobertura menor a la mitad del lead time';
  if (coberturaDias !== null && coberturaDias < leadTime) return 'Riesgo de quiebre — cobertura por debajo del lead time de reposición';
  return 'Cobertura ajustada — vigilar';
}

function diagnosticoObsolescencia(item: RawInventoryItem): string {
  if (item.diasSinMovimiento !== null && item.diasSinMovimiento > 180) return 'Dead stock — sin movimiento hace más de 180 días';
  if (item.diasSinMovimiento !== null) return `Sin movimiento hace ${item.diasSinMovimiento} días`;
  return 'Sin ventas registradas en el período — rotación cero';
}

export function computeInventoryResults(
  rows: Record<string, unknown>[],
  period?: { periodStart?: string; periodEnd?: string }
): InventoryAnalyticsResult {
  const referenceDate = period?.periodEnd ? new Date(period.periodEnd) : new Date();
  const referenceDateValid = !Number.isNaN(referenceDate.getTime());
  const periodDays = computePeriodDays(period?.periodStart, period?.periodEnd);

  const { records, warnings: normWarnings } = normalizeInventoryRows(rows);
  const { items: rawItems, warnings: extractWarnings } = extractInventoryItems(records, referenceDateValid ? referenceDate : new Date());

  const warnings = [...normWarnings, ...extractWarnings];
  if (!referenceDateValid) {
    warnings.push('No se pudo determinar la fecha de fin de período — se usó la fecha actual como referencia para la obsolescencia.');
  }
  if (periodDays === null) {
    warnings.push('No se pudo calcular la duración del período — la cobertura en días y las ventas diarias promedio quedaron sin calcular.');
  }

  if (rawItems.length === 0) {
    warnings.push('No se pudo identificar ningún SKU válido (falta producto, stock y/o costo unitario) en el archivo cargado.');
    return {
      items: [],
      resumen: null,
      valorizacionPorCategoria: [],
      abcResumenPorClase: [],
      riesgoQuiebre: [],
      sobrestock: [],
      obsolescencia: [],
      controlEstado: null,
      proveedores: null,
      periodDays,
      fechaReferencia: period?.periodEnd ?? null,
      warnings,
    };
  }

  const valorTotalInventario = rawItems.reduce((s, it) => s + it.stock * it.costoUnitario, 0);

  // ── Clasificación ABC (ordenado por valor desc, cortes en 80%/95% acumulado) ──
  const sortedByValor = [...rawItems].sort((a, b) => b.stock * b.costoUnitario - a.stock * a.costoUnitario);
  let cumulative = 0;
  const claseBySku = new Map<string, 'A' | 'B' | 'C'>();
  for (const it of sortedByValor) {
    const valor = it.stock * it.costoUnitario;
    cumulative += valor;
    const pctAcumulado = valorTotalInventario > 0 ? (cumulative / valorTotalInventario) * 100 : 100;
    const clase: 'A' | 'B' | 'C' = pctAcumulado <= 80 ? 'A' : pctAcumulado <= 95 ? 'B' : 'C';
    claseBySku.set(it.sku, clase);
  }

  const items: InventoryItemComputed[] = sortedByValor.map((it) => {
    const valorInventario = round(it.stock * it.costoUnitario);
    const pctValorTotal = valorTotalInventario > 0 ? round((valorInventario / valorTotalInventario) * 100) : 0;

    const rotacionPeriodo = it.unidadesVendidas !== null && it.stock > 0 ? round(it.unidadesVendidas / it.stock) : it.unidadesVendidas !== null && it.stock === 0 ? null : null;
    const ventasDiariasPromedio = it.unidadesVendidas !== null && periodDays !== null ? round(it.unidadesVendidas / periodDays) : null;
    const coberturaDias = ventasDiariasPromedio !== null && ventasDiariasPromedio > 0 ? round(it.stock / ventasDiariasPromedio) : null;

    const leadTimeEfectivo = it.leadTimeDias ?? LEAD_TIME_DEFAULT_DIAS;
    const puntoReorden =
      ventasDiariasPromedio !== null
        ? round(ventasDiariasPromedio * leadTimeEfectivo + ventasDiariasPromedio * leadTimeEfectivo * 0.5)
        : null;

    const tieneDemandaActiva = (it.unidadesVendidas ?? 0) > 0;
    const enRiesgoQuiebre =
      (it.stock === 0 && tieneDemandaActiva) ||
      (coberturaDias !== null && coberturaDias < leadTimeEfectivo);

    const enSobrestock =
      !enRiesgoQuiebre &&
      valorInventario > 0 &&
      ((coberturaDias !== null && coberturaDias > SOBRESTOCK_COBERTURA_DIAS_UMBRAL) ||
        (rotacionPeriodo !== null && rotacionPeriodo < 0.1 && it.stock > 0));

    const esObsoleto =
      valorInventario > 0 &&
      ((it.diasSinMovimiento !== null && it.diasSinMovimiento > OBSOLESCENCIA_DIAS_UMBRAL) ||
        (it.diasSinMovimiento === null && it.unidadesVendidas === 0));

    return {
      ...it,
      valorInventario,
      pctValorTotal,
      rotacionPeriodo,
      ventasDiariasPromedio,
      coberturaDias,
      puntoReorden,
      enRiesgoQuiebre,
      enSobrestock,
      esObsoleto,
      claseAbc: claseBySku.get(it.sku) ?? 'C',
    };
  });

  // ── Resumen agregado ──
  const conVentas = items.filter((it) => it.unidadesVendidas !== null);
  const costoVentasTotal = conVentas.reduce((s, it) => s + (it.unidadesVendidas ?? 0) * it.costoUnitario, 0);
  const rotacionPeriodo = conVentas.length > 0 && valorTotalInventario > 0 ? round(costoVentasTotal / valorTotalInventario) : null;
  const rotacionAnualizada = rotacionPeriodo !== null && periodDays !== null ? round(rotacionPeriodo * (365 / periodDays)) : null;

  // Promedio ponderado por valor (no aritmético simple): unos pocos SKUs de
  // bajo valor con cobertura extrema (sobrestock severo) distorsionarían un
  // promedio simple muy por encima de lo que representa el capital real
  // inmovilizado — el peso por valor es la práctica estándar para este KPI.
  const conCobertura = items.filter((it) => it.coberturaDias !== null && it.valorInventario > 0);
  const valorConCobertura = conCobertura.reduce((s, it) => s + it.valorInventario, 0);
  const coberturaDiasPromedio =
    valorConCobertura > 0
      ? round(conCobertura.reduce((s, it) => s + (it.coberturaDias ?? 0) * it.valorInventario, 0) / valorConCobertura)
      : null;

  const enRiesgo = items.filter((it) => it.enRiesgoQuiebre);
  const enSobrestockItems = items.filter((it) => it.enSobrestock);
  const obsoletos = items.filter((it) => it.esObsoleto);

  const pctValorRiesgoQuiebre = valorTotalInventario > 0 ? round((enRiesgo.reduce((s, it) => s + it.valorInventario, 0) / valorTotalInventario) * 100) : 0;
  const pctSkusRiesgoQuiebre = round((enRiesgo.length / items.length) * 100);
  const pctValorSobrestock = valorTotalInventario > 0 ? round((enSobrestockItems.reduce((s, it) => s + it.valorInventario, 0) / valorTotalInventario) * 100) : 0;
  const pctValorObsoleto = valorTotalInventario > 0 ? round((obsoletos.reduce((s, it) => s + it.valorInventario, 0) / valorTotalInventario) * 100) : 0;

  const resumen = {
    valorTotalInventario: round(valorTotalInventario),
    numSkus: items.length,
    rotacionPeriodo,
    rotacionAnualizada,
    coberturaDiasPromedio,
    pctValorRiesgoQuiebre,
    pctSkusRiesgoQuiebre,
    pctValorSobrestock,
    pctValorObsoleto,
  };

  // ── Valorización por categoría ──
  const categoriaMap = new Map<string, { valor: number; count: number }>();
  for (const it of items) {
    const key = it.categoria ?? '(sin categoría)';
    const entry = categoriaMap.get(key) ?? { valor: 0, count: 0 };
    entry.valor += it.valorInventario;
    entry.count += 1;
    categoriaMap.set(key, entry);
  }
  const valorizacionPorCategoria: ValorPorCategoria[] = Array.from(categoriaMap.entries())
    .map(([categoria, v]) => ({
      categoria,
      valor: round(v.valor),
      pctTotal: valorTotalInventario > 0 ? round((v.valor / valorTotalInventario) * 100) : 0,
      numSkus: v.count,
    }))
    .sort((a, b) => b.valor - a.valor);

  // ── Resumen ABC por clase ──
  const abcResumenPorClase: AbcResumenClase[] = (['A', 'B', 'C'] as const)
    .map((clase) => {
      const miembros = items.filter((it) => it.claseAbc === clase);
      if (miembros.length === 0) return null;
      const valor = miembros.reduce((s, it) => s + it.valorInventario, 0);
      return {
        clase,
        numSkus: miembros.length,
        pctSkus: round((miembros.length / items.length) * 100),
        valor: round(valor),
        pctValor: valorTotalInventario > 0 ? round((valor / valorTotalInventario) * 100) : 0,
      };
    })
    .filter((r): r is AbcResumenClase => r !== null);

  // ── Riesgo de quiebre — diagnóstico individual ──
  const riesgoQuiebre: RiesgoQuiebreItem[] = enRiesgo
    .sort((a, b) => (a.coberturaDias ?? 0) - (b.coberturaDias ?? 0))
    .map((it) => ({
      sku: it.sku,
      categoria: it.categoria,
      stock: it.stock,
      ventasDiariasPromedio: it.ventasDiariasPromedio,
      coberturaDias: it.coberturaDias,
      leadTimeDias: it.leadTimeDias,
      puntoReorden: it.puntoReorden,
      diagnostico: diagnosticoQuiebre(it, it.coberturaDias, it.leadTimeDias ?? LEAD_TIME_DEFAULT_DIAS),
    }));

  // ── Sobrestock ──
  const sobrestock: SobrestockItem[] = enSobrestockItems
    .sort((a, b) => b.valorInventario - a.valorInventario)
    .map((it) => ({
      sku: it.sku,
      categoria: it.categoria,
      stock: it.stock,
      valorInventario: it.valorInventario,
      coberturaDias: it.coberturaDias,
      diagnostico:
        it.coberturaDias !== null
          ? `Cobertura de ${it.coberturaDias.toFixed(0)} días — muy por encima de la rotación esperada`
          : 'Sin rotación en el período con stock valorizado activo',
    }));

  // ── Obsolescencia / dead stock ──
  const obsolescencia: ObsolescenciaItem[] = obsoletos
    .sort((a, b) => b.valorInventario - a.valorInventario)
    .map((it) => ({
      sku: it.sku,
      categoria: it.categoria,
      valorInventario: it.valorInventario,
      diasSinMovimiento: it.diasSinMovimiento,
      diagnostico: diagnosticoObsolescencia(it),
    }));

  // ── Control de estado ──
  const conEstado = items.filter((it) => it.estado !== null);
  let controlEstado: EstadoResumen[] | null = null;
  if (conEstado.length > 0) {
    const estadoMap = new Map<string, { valor: number; count: number }>();
    for (const it of conEstado) {
      const key = it.estado as string;
      const entry = estadoMap.get(key) ?? { valor: 0, count: 0 };
      entry.valor += it.valorInventario;
      entry.count += 1;
      estadoMap.set(key, entry);
    }
    controlEstado = Array.from(estadoMap.entries())
      .map(([estado, v]) => ({
        estado,
        numSkus: v.count,
        valor: round(v.valor),
        pctValor: valorTotalInventario > 0 ? round((v.valor / valorTotalInventario) * 100) : 0,
      }))
      .sort((a, b) => b.valor - a.valor);
  }

  // ── Concentración por proveedor ──
  const conProveedor = items.filter((it) => it.proveedor !== null);
  let proveedores: ProveedorResumen[] | null = null;
  if (conProveedor.length > 0) {
    const provMap = new Map<string, { valor: number; count: number }>();
    for (const it of conProveedor) {
      const key = it.proveedor as string;
      const entry = provMap.get(key) ?? { valor: 0, count: 0 };
      entry.valor += it.valorInventario;
      entry.count += 1;
      provMap.set(key, entry);
    }
    proveedores = Array.from(provMap.entries())
      .map(([proveedor, v]) => ({
        proveedor,
        valor: round(v.valor),
        pctTotal: valorTotalInventario > 0 ? round((v.valor / valorTotalInventario) * 100) : 0,
        numSkus: v.count,
      }))
      .sort((a, b) => b.valor - a.valor);
  }

  return {
    items,
    resumen,
    valorizacionPorCategoria,
    abcResumenPorClase,
    riesgoQuiebre,
    sobrestock,
    obsolescencia,
    controlEstado,
    proveedores,
    periodDays,
    fechaReferencia: period?.periodEnd ?? null,
    warnings,
  };
}

// ================================================================
// Comparativo automático contra el análisis publicado anterior — mismo
// patrón que sales-analytics.ts, con un set curado de KPIs de inventario.
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

export function computeInventoryComparativo(
  current: InventoryAnalyticsResult,
  previous: any,
  previousPeriodEnd: string
): InventoryComparativo | null {
  if (!current.resumen || !previous?.resumen) return null;

  const indicadores: InventoryComparativo['indicadores'] = {};

  const valorEntry = buildComparativoEntry(current.resumen.valorTotalInventario, previous.resumen.valorTotalInventario);
  if (valorEntry) indicadores.valor_total_inventario = valorEntry;

  const rotacionEntry = buildComparativoEntry(current.resumen.rotacionAnualizada, previous.resumen.rotacionAnualizada);
  if (rotacionEntry) indicadores.rotacion_anualizada = rotacionEntry;

  const coberturaEntry = buildComparativoEntry(current.resumen.coberturaDiasPromedio, previous.resumen.coberturaDiasPromedio);
  if (coberturaEntry) indicadores.cobertura_dias_promedio = coberturaEntry;

  const riesgoEntry = buildComparativoEntry(current.resumen.pctValorRiesgoQuiebre, previous.resumen.pctValorRiesgoQuiebre);
  if (riesgoEntry) indicadores.pct_valor_riesgo_quiebre = riesgoEntry;

  if (Object.keys(indicadores).length === 0) return null;

  return { period_end_base: previousPeriodEnd, indicadores };
}

// ================================================================
// Metadata de presentación — formato y semáforo, usados por dashboard y PDF.
// ================================================================

export type InventoryValueFormat = 'currency' | 'percent' | 'integer' | 'ratio' | 'days';

export function formatInventoryValue(value: number | null | undefined, format: InventoryValueFormat): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  if (format === 'percent') return `${value.toFixed(1)}%`;
  if (format === 'currency') return `$${new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 }).format(value)}`;
  if (format === 'integer') return new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 }).format(value);
  if (format === 'days') return `${value.toFixed(0)} d`;
  return value.toFixed(2);
}

export type InventorySemaphoreStatus = 'good' | 'warning' | 'critical' | 'unknown';

type SemaphoreRange = { good: number; warning: number; direction: 'higher-better' | 'lower-better' };

/** Umbrales genéricos de gestión de inventario/retail — sin benchmark sectorial específico. */
const INVENTORY_SEMAPHORE_RANGES: Record<string, SemaphoreRange> = {
  rotacion_anualizada: { good: 6, warning: 3, direction: 'higher-better' },
  cobertura_dias_promedio: { good: 30, warning: 60, direction: 'lower-better' },
  pct_valor_riesgo_quiebre: { good: 5, warning: 15, direction: 'lower-better' },
  pct_valor_sobrestock: { good: 10, warning: 25, direction: 'lower-better' },
  pct_valor_obsoleto: { good: 5, warning: 15, direction: 'lower-better' },
};

export function classifyInventoryIndicator(key: string, value: number | null | undefined): InventorySemaphoreStatus {
  if (value === null || value === undefined || Number.isNaN(value)) return 'unknown';
  const range = INVENTORY_SEMAPHORE_RANGES[key];
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

export const ABC_CLASS_COLOR: Record<'A' | 'B' | 'C', string> = {
  A: '#16a34a',
  B: '#eda100',
  C: '#94a3b8',
};

export type InventoryRiskMapRow = { indicador: string; nivel: 'verde' | 'amarillo' | 'rojo'; señal: string };

const STATUS_TO_NIVEL: Record<InventorySemaphoreStatus, 'verde' | 'amarillo' | 'rojo'> = {
  good: 'verde',
  warning: 'amarillo',
  critical: 'rojo',
  unknown: 'amarillo',
};

/** Mapa de riesgos determinista (no depende de la narrativa IA) — mismo patrón que sales-analytics.ts / financial-indicators.ts. */
export function buildInventoryRiskMap(results: InventoryAnalyticsResult): InventoryRiskMapRow[] {
  const rows: InventoryRiskMapRow[] = [];
  const r = results.resumen;
  if (!r) return rows;

  if (r.rotacionAnualizada !== null) {
    const status = classifyInventoryIndicator('rotacion_anualizada', r.rotacionAnualizada);
    rows.push({ indicador: 'Rotación Anualizada', nivel: STATUS_TO_NIVEL[status], señal: `${r.rotacionAnualizada.toFixed(1)}x/año` });
  }

  if (r.coberturaDiasPromedio !== null) {
    const status = classifyInventoryIndicator('cobertura_dias_promedio', r.coberturaDiasPromedio);
    rows.push({ indicador: 'Cobertura Promedio de Inventario', nivel: STATUS_TO_NIVEL[status], señal: `${r.coberturaDiasPromedio.toFixed(0)} días` });
  }

  const statusRiesgo = classifyInventoryIndicator('pct_valor_riesgo_quiebre', r.pctValorRiesgoQuiebre);
  rows.push({ indicador: 'Valor en Riesgo de Quiebre', nivel: STATUS_TO_NIVEL[statusRiesgo], señal: `${r.pctValorRiesgoQuiebre.toFixed(1)}%` });

  const statusSobrestock = classifyInventoryIndicator('pct_valor_sobrestock', r.pctValorSobrestock);
  rows.push({ indicador: 'Valor en Sobrestock', nivel: STATUS_TO_NIVEL[statusSobrestock], señal: `${r.pctValorSobrestock.toFixed(1)}%` });

  const statusObsoleto = classifyInventoryIndicator('pct_valor_obsoleto', r.pctValorObsoleto);
  rows.push({ indicador: 'Valor Obsoleto / Dead Stock', nivel: STATUS_TO_NIVEL[statusObsoleto], señal: `${r.pctValorObsoleto.toFixed(1)}%` });

  return rows;
}
