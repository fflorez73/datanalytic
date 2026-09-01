export const CUSTOMER_ANALYSIS_TYPE_CODES = ['clientes'] as const;

export type CustomerSegment = 'Champions' | 'Leales / Alto Valor' | 'Potenciales' | 'En Riesgo' | 'Bajo Engagement';

export type EstadoDeclarado = 'activo' | 'riesgo' | null;

type RawCustomer = {
  id: string;
  monto: number;
  frecuencia: number;
  fechaUltimaCompra: string | null;
  recenciaDias: number | null;
  ticketPromedio: number;
  antiguedadMeses: number | null;
  ticketsSoporte: number;
  estadoDeclarado: EstadoDeclarado;
};

export type CustomerRfmResult = RawCustomer & {
  scoreR: number;
  scoreF: number;
  scoreM: number;
  rfmTotal: number;
  segmento: CustomerSegment;
  clvProxy: number;
  pctIngreso: number;
};

export type CustomerSegmentStats = {
  segmento: CustomerSegment;
  clientes: number;
  pctClientes: number;
  ingreso: number;
  pctIngreso: number;
  ticketsSoporte: number;
  soportePorMil: number;
  ticketPromedio: number;
  recenciaMedia: number | null;
};

export type CustomerBucketStats = {
  clientes: number;
  ingreso: number;
  pctIngreso: number;
  ticketsSoporte: number;
  soportePorMil: number;
  ticketPromedio: number;
  recenciaMedia: number | null;
};

export type CustomerUpsellCandidate = {
  id: string;
  segmento: CustomerSegment;
  monto: number;
  ticketPromedio: number;
  antiguedadMeses: number | null;
  rationale: string;
};

export type CustomerRiskDiagnostic = {
  id: string;
  fechaUltimaCompra: string | null;
  recenciaDias: number | null;
  frecuencia: number;
  monto: number;
  ticketsSoporte: number;
  diagnostico: string;
};

export type CustomerAnalyticsResult = {
  clientes: CustomerRfmResult[];
  resumen: {
    ingresoTotal: number;
    numClientes: number;
    ticketPromedioPonderado: number;
    ticketsSoporteTotales: number;
    antiguedadMedia: number | null;
    clientesActivos: number;
    clientesRiesgo: number;
    pctIngresoActivos: number;
    pctIngresoRiesgo: number;
  } | null;
  concentracion: {
    shareTop1: number;
    shareTop3: number;
    clientesPara80pct: number;
    totalClientes: number;
    ingresoMedioPorCliente: number;
  } | null;
  segmentos: CustomerSegmentStats[];
  valorEficiencia: { activos: CustomerBucketStats; riesgo: CustomerBucketStats; total: CustomerBucketStats } | null;
  clientesRiesgo: CustomerRiskDiagnostic[];
  upsell: CustomerUpsellCandidate[];
  fechaReferencia: string | null;
  warnings: string[];
};

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

// ================================================================
// Parseo de celdas — mismo criterio que financial-indicators.ts
// (formato latino "1.234,56" y negativos entre paréntesis).
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

/**
 * ExcelJS ya normaliza celdas de fecha a ISO string antes de llegar aquí
 * (excelCellToPlain en actions.ts). Este parser también acepta formatos
 * latinos comunes (dd/mm/yyyy) por si el archivo trae la fecha como texto.
 */
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

// ================================================================
// Normalización de filas crudas → registros por cliente (header → valor).
//
// El parser de spreadsheets (actions.ts) preserva el nombre real de
// columna en CSV, pero en Excel usa claves posicionales genéricas
// (col_1, col_2, ...) porque no asume que la fila 1 sea encabezado
// (necesario para el motor financiero, que lee cuentas verticales).
// El roster de clientes SÍ es una tabla ancha con encabezado real, así
// que aquí reconstruimos ese encabezado desde la primera fila de cada
// hoja cuando las claves son posicionales.
// ================================================================

function isPositionalKey(key: string): boolean {
  return /^col_\d+$/.test(key);
}

function normalizeCustomerRows(rows: Record<string, unknown>[]): { records: Record<string, unknown>[]; warnings: string[] } {
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

    // Reportes reales suelen traer título/subtítulo antes de la tabla
    // (p.ej. "MINDAXIS - Cartera de Clientes" en la fila 1, fecha de
    // referencia en la fila 2, encabezado real recién en la fila 3) —
    // no se puede asumir que la fila 1 sea el encabezado. Se escanean las
    // primeras filas y se elige la que más coincide con los nombres de
    // columna esperados (ver CUSTOMER_COLUMN_RULES).
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
// Matching flexible de columnas por nombre — orden importa: reglas
// específicas ("soporte") antes que genéricas ("ticket").
// ================================================================

type CustomerColumnKey =
  | 'id'
  | 'monto'
  | 'frecuencia'
  | 'fecha_ultima_compra'
  | 'ticket_promedio'
  | 'antiguedad_meses'
  | 'tickets_soporte'
  | 'estado';

const CUSTOMER_COLUMN_RULES: { key: CustomerColumnKey; test: (l: string) => boolean }[] = [
  { key: 'tickets_soporte', test: (l) => l.includes('soporte') || (l.includes('ticket') && l.includes('support')) },
  {
    // No exige la palabra "fecha" — reportes reales suelen titular la
    // columna solo "Última Compra" sin el prefijo "Fecha".
    key: 'fecha_ultima_compra',
    test: (l) =>
      (l.includes('ultima') || l.includes('última')) && l.includes('compra') ||
      (l.includes('fecha') && l.includes('compra')),
  },
  { key: 'ticket_promedio', test: (l) => l.includes('ticket') },
  { key: 'antiguedad_meses', test: (l) => l.includes('antig') || (l.includes('meses') && !l.includes('recenc')) },
  { key: 'frecuencia', test: (l) => l.includes('frecuencia') || l.includes('freq') || l.includes('compras') },
  { key: 'monto', test: (l) => (l.includes('monto') || l.includes('facturado') || l.includes('ingreso') || l.includes('venta')) && !l.includes('ticket') },
  { key: 'estado', test: (l) => l.includes('estado') || l.includes('status') },
  { key: 'id', test: (l) => l.includes('id') || l.includes('cliente') || l.includes('nombre') || l.includes('codigo') || l.includes('código') },
];

/** Cuenta cuántas celdas de texto de una fila coinciden con algún nombre de columna esperado — usado para detectar la fila de encabezado real entre título/subtítulo/notas. */
function countHeaderMatches(row: Record<string, unknown>): number {
  let matches = 0;
  for (const [key, value] of Object.entries(row)) {
    if (key === 'sheet') continue;
    if (typeof value !== 'string') continue;
    const label = value.toLowerCase().trim();
    if (!label) continue;
    if (CUSTOMER_COLUMN_RULES.some((rule) => rule.test(label))) matches++;
  }
  return matches;
}

function extractCustomerRecords(
  records: Record<string, unknown>[],
  referenceDate: Date
): { customers: RawCustomer[]; warnings: string[] } {
  const customers: RawCustomer[] = [];
  const warnings: string[] = [];

  let skippedNoId = 0;
  let skippedNoMonto = 0;
  let missingFecha = 0;
  let missingFrecuencia = 0;
  let missingAntiguedad = 0;
  let missingSoporte = 0;
  let missingEstado = 0;
  let derivedTicket = 0;

  for (const record of records) {
    const fields: Partial<Record<CustomerColumnKey, unknown>> = {};
    for (const [rawKey, value] of Object.entries(record)) {
      const label = rawKey.toLowerCase().trim();
      if (!label) continue;
      for (const rule of CUSTOMER_COLUMN_RULES) {
        if (!rule.test(label)) continue;
        if (fields[rule.key] === undefined) fields[rule.key] = value;
        break;
      }
    }

    const idRaw = fields.id;
    const id = typeof idRaw === 'string' ? idRaw.trim() : typeof idRaw === 'number' ? String(idRaw) : '';
    const monto = parseNumericCell(fields.monto);

    if (!id) {
      skippedNoId++;
      continue;
    }
    if (monto === null) {
      skippedNoMonto++;
      continue;
    }

    let frecuencia = parseNumericCell(fields.frecuencia);
    if (frecuencia === null) {
      missingFrecuencia++;
      frecuencia = 0;
    }

    let ticketPromedio = parseNumericCell(fields.ticket_promedio);
    if (ticketPromedio === null) {
      ticketPromedio = frecuencia > 0 ? round(monto / frecuencia) : monto;
      derivedTicket++;
    }

    const fecha = parseDateCell(fields.fecha_ultima_compra);
    let recenciaDias: number | null = null;
    if (fecha) {
      recenciaDias = Math.max(0, Math.round((referenceDate.getTime() - fecha.getTime()) / 86_400_000));
    } else {
      missingFecha++;
    }

    const antiguedadMeses = parseNumericCell(fields.antiguedad_meses);
    if (antiguedadMeses === null) missingAntiguedad++;

    const ticketsSoporteRaw = parseNumericCell(fields.tickets_soporte);
    if (ticketsSoporteRaw === null) missingSoporte++;

    const estadoRaw = typeof fields.estado === 'string' ? fields.estado.toLowerCase() : null;
    let estadoDeclarado: EstadoDeclarado = null;
    if (estadoRaw) {
      if (estadoRaw.includes('riesgo') || estadoRaw.includes('inactiv') || estadoRaw.includes('churn')) {
        estadoDeclarado = 'riesgo';
      } else if (estadoRaw.includes('activ')) {
        estadoDeclarado = 'activo';
      }
    }
    if (estadoDeclarado === null) missingEstado++;

    customers.push({
      id,
      monto: round(monto),
      frecuencia,
      fechaUltimaCompra: fecha ? fecha.toISOString().slice(0, 10) : null,
      recenciaDias,
      ticketPromedio: round(ticketPromedio),
      antiguedadMeses,
      ticketsSoporte: ticketsSoporteRaw ?? 0,
      estadoDeclarado,
    });
  }

  const n = customers.length;
  if (skippedNoId > 0) warnings.push(`${skippedNoId} fila(s) del archivo se descartaron por no tener un ID/nombre de cliente identificable.`);
  if (skippedNoMonto > 0) warnings.push(`${skippedNoMonto} fila(s) del archivo se descartaron por no tener un monto facturado identificable.`);
  if (n > 0 && missingFecha === n) {
    warnings.push('No se identificó la columna de fecha de última compra — la Recencia (R) del modelo RFM no se pudo calcular para ningún cliente.');
  } else if (missingFecha > 0) {
    warnings.push(`${missingFecha} cliente(s) sin fecha de última compra identificable — su Recencia se asumió en un score neutral.`);
  }
  if (n > 0 && missingFrecuencia === n) {
    warnings.push('No se identificó la columna de frecuencia de compra — Frequency (F) quedó en el score mínimo para todos los clientes.');
  }
  if (derivedTicket > 0) {
    warnings.push(`Ticket promedio calculado como Monto / Frecuencia para ${derivedTicket} cliente(s) por no venir explícito en el archivo.`);
  }
  if (n > 0 && missingAntiguedad === n) {
    warnings.push('No se identificó la columna de antigüedad del cliente (meses) — ese dato quedó sin calcular.');
  }
  if (n > 0 && missingSoporte === n) {
    warnings.push('No se identificó la columna de tickets de soporte — se asumió 0 para todos los clientes.');
  }
  if (n > 0 && missingEstado === n) {
    warnings.push('No se identificó la columna de estado declarado (activo/riesgo) — el segmento se infirió únicamente a partir del modelo RFM.');
  }

  return { customers, warnings };
}

// ================================================================
// Modelo RFM — umbrales idénticos al Anexo A.1 del informe de
// referencia (fecha de referencia = fin del período del análisis).
// ================================================================

function scoreRecency(dias: number | null): number {
  if (dias === null) return 3; // score neutral — evita sesgar el segmento cuando falta la columna
  if (dias <= 15) return 5;
  if (dias <= 45) return 4;
  if (dias <= 90) return 3;
  if (dias <= 150) return 2;
  return 1;
}

function scoreFrequency(freq: number): number {
  if (freq >= 24) return 5;
  if (freq >= 15) return 4;
  if (freq >= 10) return 3;
  if (freq >= 4) return 2;
  return 1;
}

function scoreMonetary(monto: number): number {
  if (monto >= 20_000) return 5;
  if (monto >= 10_000) return 4;
  if (monto >= 5_000) return 3;
  if (monto >= 1_500) return 2;
  return 1;
}

/** Champions (RFM≥13 y Activo); Leales/Alto Valor (RFM≥10); Potenciales (RFM≥7); En Riesgo (estado declarado o RFM bajo + recencia alta); Bajo Engagement (resto). */
function classifySegment(rfmTotal: number, scoreR: number, estadoDeclarado: EstadoDeclarado): CustomerSegment {
  if (rfmTotal >= 13 && estadoDeclarado !== 'riesgo') return 'Champions';
  if (rfmTotal >= 10) return 'Leales / Alto Valor';
  if (rfmTotal >= 7) return 'Potenciales';
  if (estadoDeclarado === 'riesgo' || scoreR <= 2) return 'En Riesgo';
  return 'Bajo Engagement';
}

function diagnosticoRiesgo(c: CustomerRfmResult): string {
  if (c.recenciaDias !== null && c.recenciaDias > 150) return 'Churn avanzado';
  if (c.recenciaDias !== null && c.recenciaDias > 90) return 'Deterioro activo';
  if (c.ticketsSoporte >= 5) return 'Alta carga de soporte sin señal de reactivación';
  return 'Requiere seguimiento — señales mixtas';
}

function buildUpsellRationale(c: CustomerRfmResult): string {
  if (c.segmento === 'Leales / Alto Valor') {
    return `Cliente activo con frecuencia y ticket sólidos (RFM ${c.rfmTotal}/15); candidato natural a programa de frecuencia y aumento de ticket hacia el perfil de los Champions.`;
  }
  return `Cliente con recencia y monto en desarrollo (RFM ${c.rfmTotal}/15); explorar cross-sell para consolidar frecuencia antes de que se enfríe la relación.`;
}

function average(values: number[]): number | null {
  const clean = values.filter((v) => typeof v === 'number' && !Number.isNaN(v));
  if (clean.length === 0) return null;
  return round(clean.reduce((s, v) => s + v, 0) / clean.length);
}

function bucketStats(list: CustomerRfmResult[], totalIngreso: number): CustomerBucketStats {
  const ingreso = round(list.reduce((s, c) => s + c.monto, 0));
  const ticketsSoporte = list.reduce((s, c) => s + c.ticketsSoporte, 0);
  return {
    clientes: list.length,
    ingreso,
    pctIngreso: totalIngreso > 0 ? round(ingreso / totalIngreso) : 0,
    ticketsSoporte,
    soportePorMil: ingreso > 0 ? round((ticketsSoporte / ingreso) * 1000) : 0,
    ticketPromedio: list.length > 0 ? round(list.reduce((s, c) => s + c.ticketPromedio, 0) / list.length) : 0,
    recenciaMedia: average(list.map((c) => c.recenciaDias).filter((v): v is number => v !== null)),
  };
}

export function computeCustomerResults(
  rows: Record<string, unknown>[],
  period?: { periodStart?: string; periodEnd?: string }
): CustomerAnalyticsResult {
  const referenceDate = period?.periodEnd ? new Date(period.periodEnd) : new Date();
  const referenceDateValid = !Number.isNaN(referenceDate.getTime());

  const { records, warnings: normWarnings } = normalizeCustomerRows(rows);
  const { customers, warnings: extractWarnings } = extractCustomerRecords(records, referenceDateValid ? referenceDate : new Date());

  const warnings = [...normWarnings, ...extractWarnings];
  if (!referenceDateValid) {
    warnings.push('No se pudo determinar la fecha de fin de período — se usó la fecha actual como referencia para el modelo RFM.');
  }

  if (customers.length === 0) {
    warnings.push('No se pudo identificar ningún cliente válido (falta ID y/o Monto) en el archivo cargado.');
    return {
      clientes: [],
      resumen: null,
      concentracion: null,
      segmentos: [],
      valorEficiencia: null,
      clientesRiesgo: [],
      upsell: [],
      fechaReferencia: period?.periodEnd ?? null,
      warnings,
    };
  }

  const totalIngreso = customers.reduce((s, c) => s + c.monto, 0);

  const clientes: CustomerRfmResult[] = customers
    .map((c) => {
      const scoreR = scoreRecency(c.recenciaDias);
      const scoreF = scoreFrequency(c.frecuencia);
      const scoreM = scoreMonetary(c.monto);
      const rfmTotal = scoreR + scoreF + scoreM;
      const segmento = classifySegment(rfmTotal, scoreR, c.estadoDeclarado);
      const clvProxy = round(c.ticketPromedio * c.frecuencia * 1.5);
      const pctIngreso = totalIngreso > 0 ? round(c.monto / totalIngreso) : 0;
      return { ...c, scoreR, scoreF, scoreM, rfmTotal, segmento, clvProxy, pctIngreso };
    })
    .sort((a, b) => b.monto - a.monto);

  // ── Concentración ──
  const top1Share = totalIngreso > 0 ? round(clientes[0].monto / totalIngreso) : 0;
  const top3Share = totalIngreso > 0 ? round(clientes.slice(0, 3).reduce((s, c) => s + c.monto, 0) / totalIngreso) : 0;

  let cumulative = 0;
  let clientesPara80pct = 0;
  for (const c of clientes) {
    cumulative += c.monto;
    clientesPara80pct++;
    if (totalIngreso > 0 && cumulative / totalIngreso >= 0.8) break;
  }

  const concentracion = {
    shareTop1: top1Share,
    shareTop3: top3Share,
    clientesPara80pct,
    totalClientes: clientes.length,
    ingresoMedioPorCliente: round(totalIngreso / clientes.length),
  };

  // ── Segmentos ──
  const segmentOrder: CustomerSegment[] = ['Champions', 'Leales / Alto Valor', 'Potenciales', 'En Riesgo', 'Bajo Engagement'];
  const segmentos: CustomerSegmentStats[] = segmentOrder
    .map((seg) => {
      const miembros = clientes.filter((c) => c.segmento === seg);
      if (miembros.length === 0) return null;
      const stats = bucketStats(miembros, totalIngreso);
      return {
        segmento: seg,
        clientes: miembros.length,
        pctClientes: round(miembros.length / clientes.length),
        ingreso: stats.ingreso,
        pctIngreso: stats.pctIngreso,
        ticketsSoporte: stats.ticketsSoporte,
        soportePorMil: stats.soportePorMil,
        ticketPromedio: stats.ticketPromedio,
        recenciaMedia: stats.recenciaMedia,
      };
    })
    .filter((s): s is CustomerSegmentStats => s !== null);

  // ── Activos vs. En Riesgo (agregado tipo referencia) ──
  const activos = clientes.filter((c) => c.segmento !== 'En Riesgo');
  const riesgo = clientes.filter((c) => c.segmento === 'En Riesgo');

  const valorEficiencia = {
    activos: bucketStats(activos, totalIngreso),
    riesgo: bucketStats(riesgo, totalIngreso),
    total: bucketStats(clientes, totalIngreso),
  };

  const frecuenciaTotal = clientes.reduce((s, c) => s + c.frecuencia, 0);

  const resumen = {
    ingresoTotal: round(totalIngreso),
    numClientes: clientes.length,
    ticketPromedioPonderado: frecuenciaTotal > 0 ? round(totalIngreso / frecuenciaTotal) : round(totalIngreso / clientes.length),
    ticketsSoporteTotales: clientes.reduce((s, c) => s + c.ticketsSoporte, 0),
    antiguedadMedia: average(clientes.map((c) => c.antiguedadMeses).filter((v): v is number => v !== null)),
    clientesActivos: activos.length,
    clientesRiesgo: riesgo.length,
    pctIngresoActivos: valorEficiencia.activos.pctIngreso,
    pctIngresoRiesgo: valorEficiencia.riesgo.pctIngreso,
  };

  // ── Clientes en riesgo — diagnóstico individual ──
  const clientesRiesgo: CustomerRiskDiagnostic[] = riesgo
    .sort((a, b) => (b.recenciaDias ?? 0) - (a.recenciaDias ?? 0))
    .map((c) => ({
      id: c.id,
      fechaUltimaCompra: c.fechaUltimaCompra,
      recenciaDias: c.recenciaDias,
      frecuencia: c.frecuencia,
      monto: c.monto,
      ticketsSoporte: c.ticketsSoporte,
      diagnostico: diagnosticoRiesgo(c),
    }));

  // ── Upsell / cross-sell: activos con RFM medio-alto y potencial de crecer ──
  const upsell: CustomerUpsellCandidate[] = clientes
    .filter((c) => c.segmento === 'Leales / Alto Valor' || c.segmento === 'Potenciales')
    .sort((a, b) => b.monto - a.monto)
    .slice(0, 5)
    .map((c) => ({
      id: c.id,
      segmento: c.segmento,
      monto: c.monto,
      ticketPromedio: c.ticketPromedio,
      antiguedadMeses: c.antiguedadMeses,
      rationale: buildUpsellRationale(c),
    }));

  return {
    clientes,
    resumen,
    concentracion,
    segmentos,
    valorEficiencia,
    clientesRiesgo,
    upsell,
    fechaReferencia: period?.periodEnd ?? null,
    warnings,
  };
}

// ================================================================
// Metadata de presentación — formato, colores y semáforo por
// segmento, usados por el dashboard y el PDF exportado.
// ================================================================

export type CustomerValueFormat = 'currency' | 'percent' | 'days' | 'ratio' | 'integer';

export function formatCustomerValue(value: number | null | undefined, format: CustomerValueFormat): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  if (format === 'percent') return `${(value * 100).toFixed(1)}%`;
  if (format === 'currency') return `$${new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 }).format(value)}`;
  if (format === 'days') return `${value.toFixed(0)} d`;
  if (format === 'integer') return new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 }).format(value);
  return value.toFixed(2);
}

export const SEGMENT_COLOR: Record<CustomerSegment, string> = {
  Champions: '#16a34a',
  'Leales / Alto Valor': '#22c55e',
  Potenciales: '#eda100',
  'En Riesgo': '#eb6834',
  'Bajo Engagement': '#94a3b8',
};

export const SEGMENT_STATUS: Record<CustomerSegment, 'good' | 'warning' | 'critical'> = {
  Champions: 'good',
  'Leales / Alto Valor': 'good',
  Potenciales: 'warning',
  'En Riesgo': 'critical',
  'Bajo Engagement': 'warning',
};

export const ACTIVO_RIESGO_COLOR = { activo: '#1baf7a', riesgo: '#eb6834' } as const;
