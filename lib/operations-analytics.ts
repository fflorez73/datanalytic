export const OPERATIONS_ANALYSIS_TYPE_CODES = ['operativo_general'] as const;

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
// Normalización de filas crudas → registros por área/proceso — misma
// detección de fila de encabezado real (título/subtítulo antes de la
// tabla) que los demás motores del proyecto.
// ================================================================

function isPositionalKey(key: string): boolean {
  return /^col_\d+$/.test(key);
}

type OperationsColumnKey =
  | 'area'
  | 'periodo'
  | 'unidades_producidas'
  | 'horas_hombre'
  | 'capacidad'
  | 'meta'
  | 'cumplimiento_pct'
  | 'tiempo_ciclo'
  | 'defectos_cantidad'
  | 'tasa_defectos_pct'
  | 'costo_operativo'
  | 'ausentismo_pct';

// Orden: reglas específicas ("% cumplimiento", "% defectos") antes que las
// genéricas ("meta", "defecto") — un archivo puede traer la cifra ya como
// porcentaje calculado en vez de como cantidad/objetivo crudo, y hay que
// distinguirlas para no dividir dos veces.
const OPERATIONS_COLUMN_RULES: { key: OperationsColumnKey; test: (l: string) => boolean }[] = [
  { key: 'cumplimiento_pct', test: (l) => l.includes('cumplim') && (l.includes('%') || l.includes('porcentaje') || l.includes('meta')) },
  {
    key: 'tasa_defectos_pct',
    test: (l) =>
      (l.includes('tasa') || l.includes('%') || l.includes('porcentaje')) &&
      (l.includes('defect') || l.includes('error') || l.includes('reproceso') || l.includes('rechazo')),
  },
  { key: 'defectos_cantidad', test: (l) => l.includes('defecto') || l.includes('error') || l.includes('reproceso') || l.includes('rechazo') },
  { key: 'tiempo_ciclo', test: (l) => l.includes('ciclo') },
  { key: 'ausentismo_pct', test: (l) => l.includes('ausent') || l.includes('disponibilidad') },
  { key: 'costo_operativo', test: (l) => l.includes('costo') },
  { key: 'capacidad', test: (l) => l.includes('capacidad') },
  { key: 'meta', test: (l) => l.includes('meta') || l.includes('objetivo') },
  { key: 'horas_hombre', test: (l) => l.includes('horas') || l.includes('personal') || l.includes('empleados') || l.includes('dotacion') || l.includes('dotación') },
  { key: 'periodo', test: (l) => l.includes('fecha') || l.includes('periodo') || l.includes('período') || l.includes('mes') },
  {
    key: 'unidades_producidas',
    test: (l) => l.includes('producid') || l.includes('unidades') || l.includes('produccion') || l.includes('producción') || l.includes('servicios') || l.includes('volumen'),
  },
  {
    key: 'area',
    test: (l) => l.includes('area') || l.includes('área') || l.includes('proceso') || l.includes('planta') || l.includes('turno') || l.includes('linea') || l.includes('línea') || l.includes('nombre'),
  },
];

function countHeaderMatches(row: Record<string, unknown>): number {
  let matches = 0;
  for (const [key, value] of Object.entries(row)) {
    if (key === 'sheet') continue;
    if (typeof value !== 'string') continue;
    const label = value.toLowerCase().trim();
    if (!label) continue;
    if (OPERATIONS_COLUMN_RULES.some((rule) => rule.test(label))) matches++;
  }
  return matches;
}

function normalizeOperationsRows(rows: Record<string, unknown>[]): { records: Record<string, unknown>[]; warnings: string[] } {
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
// Extracción de registros por área/proceso
// ================================================================

type RawOperationsRecord = {
  area: string;
  periodo: string | null;
  unidadesProducidas: number | null;
  horasHombre: number | null;
  capacidad: number | null;
  meta: number | null;
  cumplimientoPctDirecto: number | null;
  tiempoCiclo: number | null;
  defectosCantidad: number | null;
  tasaDefectosPctDirecta: number | null;
  costoOperativo: number | null;
  ausentismoPct: number | null;
};

function extractOperationsRecords(records: Record<string, unknown>[]): { rows: RawOperationsRecord[]; warnings: string[] } {
  const rows: RawOperationsRecord[] = [];
  const warnings: string[] = [];

  let skippedNoArea = 0;
  let missingUnidades = 0;
  let missingHoras = 0;
  let missingCapacidad = 0;
  let missingMeta = 0;
  let missingCiclo = 0;
  let missingDefectos = 0;
  let missingCosto = 0;
  let missingAusentismo = 0;

  for (const record of records) {
    const fields: Partial<Record<OperationsColumnKey, unknown>> = {};
    for (const [rawKey, value] of Object.entries(record)) {
      const label = rawKey.toLowerCase().trim();
      if (!label) continue;
      for (const rule of OPERATIONS_COLUMN_RULES) {
        if (!rule.test(label)) continue;
        if (fields[rule.key] === undefined) fields[rule.key] = value;
        break;
      }
    }

    const areaRaw = fields.area;
    const area = typeof areaRaw === 'string' ? areaRaw.trim() : typeof areaRaw === 'number' ? String(areaRaw) : '';
    if (!area) {
      skippedNoArea++;
      continue;
    }

    const periodo = typeof fields.periodo === 'string' && fields.periodo.trim() ? fields.periodo.trim() : null;

    const unidadesProducidas = parseNumericCell(fields.unidades_producidas);
    if (unidadesProducidas === null) missingUnidades++;

    const horasHombre = parseNumericCell(fields.horas_hombre);
    if (horasHombre === null) missingHoras++;

    const capacidad = parseNumericCell(fields.capacidad);
    if (capacidad === null) missingCapacidad++;

    const meta = parseNumericCell(fields.meta);
    const cumplimientoPctDirecto = parseNumericCell(fields.cumplimiento_pct);
    if (meta === null && cumplimientoPctDirecto === null) missingMeta++;

    const tiempoCiclo = parseNumericCell(fields.tiempo_ciclo);
    if (tiempoCiclo === null) missingCiclo++;

    const defectosCantidad = parseNumericCell(fields.defectos_cantidad);
    const tasaDefectosPctDirecta = parseNumericCell(fields.tasa_defectos_pct);
    if (defectosCantidad === null && tasaDefectosPctDirecta === null) missingDefectos++;

    const costoOperativo = parseNumericCell(fields.costo_operativo);
    if (costoOperativo === null) missingCosto++;

    const ausentismoPct = parseNumericCell(fields.ausentismo_pct);
    if (ausentismoPct === null) missingAusentismo++;

    rows.push({
      area,
      periodo,
      unidadesProducidas,
      horasHombre,
      capacidad,
      meta,
      cumplimientoPctDirecto,
      tiempoCiclo,
      defectosCantidad,
      tasaDefectosPctDirecta,
      costoOperativo,
      ausentismoPct,
    });
  }

  const n = rows.length;
  if (skippedNoArea > 0) warnings.push(`${skippedNoArea} fila(s) del archivo se descartaron por no tener un área/proceso identificable.`);
  if (n > 0 && missingUnidades === n) warnings.push('No se identificó la columna de unidades producidas/servicios prestados — productividad, utilización, cumplimiento, tasa de defectos y costo por unidad quedaron sin calcular.');
  if (n > 0 && missingHoras === n) warnings.push('No se identificó la columna de horas-hombre/personal — la productividad quedó sin calcular.');
  if (n > 0 && missingCapacidad === n) warnings.push('No se identificó la columna de capacidad instalada — la utilización de capacidad quedó sin calcular.');
  if (n > 0 && missingMeta === n) warnings.push('No se identificó la columna de meta/objetivo (ni un % de cumplimiento ya calculado) — el cumplimiento de meta quedó sin calcular.');
  if (n > 0 && missingCiclo === n) warnings.push('No se identificó la columna de tiempo de ciclo — quedó sin calcular.');
  if (n > 0 && missingDefectos === n) warnings.push('No se identificó la columna de defectos/errores/reprocesos — la tasa de defectos quedó sin calcular.');
  if (n > 0 && missingCosto === n) warnings.push('No se identificó la columna de costo operativo — el costo por unidad quedó sin calcular.');
  if (n > 0 && missingAusentismo === n) warnings.push('No se identificó la columna de ausentismo/disponibilidad de personal — quedó sin calcular.');

  return { rows, warnings };
}

// ================================================================
// Cálculo de indicadores — cada uno independiente y null-safe; ningún
// indicador depende de que otro esté disponible.
// ================================================================

export type OperationsItemComputed = RawOperationsRecord & {
  productividad: number | null;
  utilizacionCapacidadPct: number | null;
  cumplimientoMetaPct: number | null;
  tasaDefectosPct: number | null;
  costoPorUnidad: number | null;
};

export type RankingMetrica = 'cumplimiento' | 'utilizacion' | 'productividad';

export type OperationsRanking = {
  metrica: RankingMetrica;
  items: { area: string; valor: number }[];
  mejor: { area: string; valor: number } | null;
  peor: { area: string; valor: number } | null;
};

export type TiempoCicloResumen = {
  promedio: number;
  desviacionEstandar: number;
  coeficienteVariacion: number;
  porArea: { area: string; tiempoCiclo: number }[];
};

export type CorrelacionAusentismo = {
  coeficiente: number;
  lectura: 'positiva' | 'negativa' | 'nula';
  numAreas: number;
};

export type ComparativoIndicador = {
  valor_actual: number;
  valor_anterior: number;
  variacion_absoluta: number;
  variacion_relativa_pct: number | null;
};

export type OperationsComparativo = {
  period_end_base: string;
  indicadores: Partial<
    Record<
      'productividad_promedio' | 'utilizacion_capacidad_promedio' | 'cumplimiento_meta_promedio' | 'tasa_defectos_promedio' | 'costo_por_unidad_promedio',
      ComparativoIndicador
    >
  >;
};

export type OperationsAnalyticsResult = {
  items: OperationsItemComputed[];
  resumen: {
    numAreas: number;
    unidadesProducidasTotal: number | null;
    costoOperativoTotal: number | null;
    productividadPromedio: number | null;
    utilizacionCapacidadPromedio: number | null;
    cumplimientoMetaPromedio: number | null;
    tasaDefectosPromedio: number | null;
    costoPorUnidadPromedio: number | null;
    ausentismoPromedio: number | null;
  } | null;
  ranking: OperationsRanking | null;
  tiempoCiclo: TiempoCicloResumen | null;
  correlacionAusentismoProductividad: CorrelacionAusentismo | null;
  comparativo_periodo_anterior?: OperationsComparativo | null;
  warnings: string[];
};

function average(values: number[]): number | null {
  const clean = values.filter((v) => typeof v === 'number' && !Number.isNaN(v));
  if (clean.length === 0) return null;
  return round(clean.reduce((s, v) => s + v, 0) / clean.length);
}

function pearsonCorrelation(xs: number[], ys: number[]): number | null {
  const n = xs.length;
  if (n < 3 || ys.length !== n) return null;
  const meanX = xs.reduce((s, v) => s + v, 0) / n;
  const meanY = ys.reduce((s, v) => s + v, 0) / n;
  let num = 0;
  let denX = 0;
  let denY = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - meanX;
    const dy = ys[i] - meanY;
    num += dx * dy;
    denX += dx * dx;
    denY += dy * dy;
  }
  if (denX === 0 || denY === 0) return null;
  return num / Math.sqrt(denX * denY);
}

export function computeOperationsResults(
  rows: Record<string, unknown>[],
  _period?: { periodStart?: string; periodEnd?: string }
): OperationsAnalyticsResult {
  const { records, warnings: normWarnings } = normalizeOperationsRows(rows);
  const { rows: rawRows, warnings: extractWarnings } = extractOperationsRecords(records);

  const warnings = [...normWarnings, ...extractWarnings];

  if (rawRows.length === 0) {
    warnings.push('No se pudo identificar ningún área/proceso válido en el archivo cargado.');
    return {
      items: [],
      resumen: null,
      ranking: null,
      tiempoCiclo: null,
      correlacionAusentismoProductividad: null,
      warnings,
    };
  }

  const items: OperationsItemComputed[] = rawRows.map((r) => {
    const productividad = r.unidadesProducidas !== null && r.horasHombre !== null && r.horasHombre > 0 ? round(r.unidadesProducidas / r.horasHombre) : null;

    const utilizacionCapacidadPct =
      r.unidadesProducidas !== null && r.capacidad !== null && r.capacidad > 0 ? round((r.unidadesProducidas / r.capacidad) * 100) : null;

    const cumplimientoMetaPct =
      r.cumplimientoPctDirecto !== null
        ? round(r.cumplimientoPctDirecto)
        : r.unidadesProducidas !== null && r.meta !== null && r.meta > 0
          ? round((r.unidadesProducidas / r.meta) * 100)
          : null;

    const tasaDefectosPct =
      r.tasaDefectosPctDirecta !== null
        ? round(r.tasaDefectosPctDirecta)
        : r.defectosCantidad !== null && r.unidadesProducidas !== null && r.unidadesProducidas > 0
          ? round((r.defectosCantidad / r.unidadesProducidas) * 100)
          : null;

    const costoPorUnidad = r.costoOperativo !== null && r.unidadesProducidas !== null && r.unidadesProducidas > 0 ? round(r.costoOperativo / r.unidadesProducidas) : null;

    return { ...r, productividad, utilizacionCapacidadPct, cumplimientoMetaPct, tasaDefectosPct, costoPorUnidad };
  });

  // ── Resumen — totales agregados (no promedio simple de ratios, evita
  // que áreas pequeñas distorsionen el indicador consolidado) ──
  const conUnidades = items.filter((it) => it.unidadesProducidas !== null);
  const unidadesProducidasTotal = conUnidades.length > 0 ? round(conUnidades.reduce((s, it) => s + (it.unidadesProducidas ?? 0), 0)) : null;

  const conCosto = items.filter((it) => it.costoOperativo !== null);
  const costoOperativoTotal = conCosto.length > 0 ? round(conCosto.reduce((s, it) => s + (it.costoOperativo ?? 0), 0)) : null;

  const conProductividad = items.filter((it) => it.unidadesProducidas !== null && it.horasHombre !== null && it.horasHombre > 0);
  const horasHombreTotal = conProductividad.reduce((s, it) => s + (it.horasHombre ?? 0), 0);
  const unidadesParaProductividad = conProductividad.reduce((s, it) => s + (it.unidadesProducidas ?? 0), 0);
  const productividadPromedio = conProductividad.length > 0 && horasHombreTotal > 0 ? round(unidadesParaProductividad / horasHombreTotal) : null;

  const conCapacidad = items.filter((it) => it.unidadesProducidas !== null && it.capacidad !== null && it.capacidad > 0);
  const capacidadTotal = conCapacidad.reduce((s, it) => s + (it.capacidad ?? 0), 0);
  const unidadesParaUtilizacion = conCapacidad.reduce((s, it) => s + (it.unidadesProducidas ?? 0), 0);
  const utilizacionCapacidadPromedio = conCapacidad.length > 0 && capacidadTotal > 0 ? round((unidadesParaUtilizacion / capacidadTotal) * 100) : null;

  const conMeta = items.filter((it) => it.meta !== null && it.meta > 0 && it.unidadesProducidas !== null);
  const metaTotal = conMeta.reduce((s, it) => s + (it.meta ?? 0), 0);
  const unidadesParaMeta = conMeta.reduce((s, it) => s + (it.unidadesProducidas ?? 0), 0);
  const cumplimientoDirectoValues = items.filter((it) => it.cumplimientoPctDirecto !== null).map((it) => it.cumplimientoPctDirecto as number);
  const cumplimientoMetaPromedio =
    conMeta.length > 0 && metaTotal > 0
      ? round((unidadesParaMeta / metaTotal) * 100)
      : cumplimientoDirectoValues.length > 0
        ? average(cumplimientoDirectoValues)
        : null;

  const conDefectosCantidad = items.filter((it) => it.defectosCantidad !== null && it.unidadesProducidas !== null);
  const defectosTotal = conDefectosCantidad.reduce((s, it) => s + (it.defectosCantidad ?? 0), 0);
  const unidadesParaDefectos = conDefectosCantidad.reduce((s, it) => s + (it.unidadesProducidas ?? 0), 0);
  const tasaDefectosDirectaValues = items.filter((it) => it.tasaDefectosPctDirecta !== null).map((it) => it.tasaDefectosPctDirecta as number);
  const tasaDefectosPromedio =
    conDefectosCantidad.length > 0 && unidadesParaDefectos > 0
      ? round((defectosTotal / unidadesParaDefectos) * 100)
      : tasaDefectosDirectaValues.length > 0
        ? average(tasaDefectosDirectaValues)
        : null;

  const costoPorUnidadPromedio = unidadesProducidasTotal !== null && unidadesProducidasTotal > 0 && costoOperativoTotal !== null ? round(costoOperativoTotal / unidadesProducidasTotal) : null;

  const ausentismoValues = items.filter((it) => it.ausentismoPct !== null).map((it) => it.ausentismoPct as number);
  const ausentismoPromedio = average(ausentismoValues);

  const resumen = {
    numAreas: items.length,
    unidadesProducidasTotal,
    costoOperativoTotal,
    productividadPromedio,
    utilizacionCapacidadPromedio,
    cumplimientoMetaPromedio,
    tasaDefectosPromedio,
    costoPorUnidadPromedio,
    ausentismoPromedio,
  };

  // ── Ranking comparativo — usa la métrica con mayor cobertura de datos ──
  const coverage: Record<RankingMetrica, number> = {
    cumplimiento: items.filter((it) => it.cumplimientoMetaPct !== null).length,
    utilizacion: items.filter((it) => it.utilizacionCapacidadPct !== null).length,
    productividad: items.filter((it) => it.productividad !== null).length,
  };
  const bestMetric = (Object.entries(coverage) as [RankingMetrica, number][]).sort((a, b) => b[1] - a[1])[0];

  let ranking: OperationsRanking | null = null;
  if (bestMetric && bestMetric[1] > 0) {
    const metrica = bestMetric[0];
    const key = metrica === 'cumplimiento' ? 'cumplimientoMetaPct' : metrica === 'utilizacion' ? 'utilizacionCapacidadPct' : 'productividad';
    const rankedItems = items
      .filter((it) => it[key] !== null)
      .map((it) => ({ area: it.area, valor: it[key] as number }))
      .sort((a, b) => b.valor - a.valor);
    ranking = {
      metrica,
      items: rankedItems,
      mejor: rankedItems[0] ?? null,
      peor: rankedItems[rankedItems.length - 1] ?? null,
    };
  }

  // ── Tiempo de ciclo: promedio y variabilidad ──
  const conCiclo = items.filter((it) => it.tiempoCiclo !== null);
  let tiempoCiclo: TiempoCicloResumen | null = null;
  if (conCiclo.length > 0) {
    const valores = conCiclo.map((it) => it.tiempoCiclo as number);
    const promedio = valores.reduce((s, v) => s + v, 0) / valores.length;
    const varianza = valores.reduce((s, v) => s + (v - promedio) ** 2, 0) / valores.length;
    const desviacionEstandar = Math.sqrt(varianza);
    tiempoCiclo = {
      promedio: round(promedio),
      desviacionEstandar: round(desviacionEstandar),
      coeficienteVariacion: promedio > 0 ? round(desviacionEstandar / promedio) : 0,
      porArea: conCiclo.map((it) => ({ area: it.area, tiempoCiclo: it.tiempoCiclo as number })).sort((a, b) => a.tiempoCiclo - b.tiempoCiclo),
    };
  }

  // ── Correlación aparente ausentismo vs. productividad ──
  const conAmbos = items.filter((it) => it.ausentismoPct !== null && it.productividad !== null);
  let correlacionAusentismoProductividad: CorrelacionAusentismo | null = null;
  if (conAmbos.length >= 3) {
    const coef = pearsonCorrelation(
      conAmbos.map((it) => it.ausentismoPct as number),
      conAmbos.map((it) => it.productividad as number)
    );
    if (coef !== null) {
      correlacionAusentismoProductividad = {
        coeficiente: round(coef),
        lectura: coef > 0.3 ? 'positiva' : coef < -0.3 ? 'negativa' : 'nula',
        numAreas: conAmbos.length,
      };
    }
  }

  return {
    items,
    resumen,
    ranking,
    tiempoCiclo,
    correlacionAusentismoProductividad,
    warnings,
  };
}

// ================================================================
// Comparativo automático contra el análisis publicado anterior —
// mismo patrón que sales-analytics.ts / inventory-analytics.ts.
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

export function computeOperationsComparativo(
  current: OperationsAnalyticsResult,
  previous: any,
  previousPeriodEnd: string
): OperationsComparativo | null {
  if (!current.resumen || !previous?.resumen) return null;

  const indicadores: OperationsComparativo['indicadores'] = {};

  const map: [keyof OperationsComparativo['indicadores'], keyof NonNullable<OperationsAnalyticsResult['resumen']>][] = [
    ['productividad_promedio', 'productividadPromedio'],
    ['utilizacion_capacidad_promedio', 'utilizacionCapacidadPromedio'],
    ['cumplimiento_meta_promedio', 'cumplimientoMetaPromedio'],
    ['tasa_defectos_promedio', 'tasaDefectosPromedio'],
    ['costo_por_unidad_promedio', 'costoPorUnidadPromedio'],
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

export type OperationsValueFormat = 'currency' | 'percent' | 'integer' | 'ratio' | 'time';

export function formatOperationsValue(value: number | null | undefined, format: OperationsValueFormat): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  if (format === 'percent') return `${value.toFixed(1)}%`;
  if (format === 'currency') return `$${new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 }).format(value)}`;
  if (format === 'integer') return new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 }).format(value);
  if (format === 'time') return value.toFixed(1);
  return value.toFixed(2);
}

export type OperationsSemaphoreStatus = 'good' | 'warning' | 'critical' | 'unknown';

type SemaphoreRange = { good: number; warning: number; direction: 'higher-better' | 'lower-better' };

/** Umbrales genéricos de gestión de operaciones — sin benchmark sectorial específico. */
const OPERATIONS_SEMAPHORE_RANGES: Record<string, SemaphoreRange> = {
  utilizacion_capacidad_promedio: { good: 85, warning: 70, direction: 'higher-better' },
  cumplimiento_meta_promedio: { good: 95, warning: 80, direction: 'higher-better' },
  tasa_defectos_promedio: { good: 2, warning: 5, direction: 'lower-better' },
  ausentismo_promedio: { good: 3, warning: 6, direction: 'lower-better' },
};

export function classifyOperationsIndicator(key: string, value: number | null | undefined): OperationsSemaphoreStatus {
  if (value === null || value === undefined || Number.isNaN(value)) return 'unknown';
  const range = OPERATIONS_SEMAPHORE_RANGES[key];
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

export type OperationsRiskMapRow = { indicador: string; nivel: 'verde' | 'amarillo' | 'rojo'; señal: string };

const STATUS_TO_NIVEL: Record<OperationsSemaphoreStatus, 'verde' | 'amarillo' | 'rojo'> = {
  good: 'verde',
  warning: 'amarillo',
  critical: 'rojo',
  unknown: 'amarillo',
};

/** Mapa de riesgos determinista (no depende de la narrativa IA) — mismo patrón que los demás motores. Solo incluye filas de indicadores efectivamente calculados. */
export function buildOperationsRiskMap(results: OperationsAnalyticsResult): OperationsRiskMapRow[] {
  const rows: OperationsRiskMapRow[] = [];
  const r = results.resumen;
  if (!r) return rows;

  if (r.utilizacionCapacidadPromedio !== null) {
    const status = classifyOperationsIndicator('utilizacion_capacidad_promedio', r.utilizacionCapacidadPromedio);
    rows.push({ indicador: 'Utilización de Capacidad', nivel: STATUS_TO_NIVEL[status], señal: `${r.utilizacionCapacidadPromedio.toFixed(1)}%` });
  }

  if (r.cumplimientoMetaPromedio !== null) {
    const status = classifyOperationsIndicator('cumplimiento_meta_promedio', r.cumplimientoMetaPromedio);
    rows.push({ indicador: 'Cumplimiento de Meta', nivel: STATUS_TO_NIVEL[status], señal: `${r.cumplimientoMetaPromedio.toFixed(1)}%` });
  }

  if (r.tasaDefectosPromedio !== null) {
    const status = classifyOperationsIndicator('tasa_defectos_promedio', r.tasaDefectosPromedio);
    rows.push({ indicador: 'Tasa de Defectos/Reprocesos', nivel: STATUS_TO_NIVEL[status], señal: `${r.tasaDefectosPromedio.toFixed(1)}%` });
  }

  if (r.ausentismoPromedio !== null) {
    const status = classifyOperationsIndicator('ausentismo_promedio', r.ausentismoPromedio);
    rows.push({ indicador: 'Ausentismo', nivel: STATUS_TO_NIVEL[status], señal: `${r.ausentismoPromedio.toFixed(1)}%` });
  }

  return rows;
}
