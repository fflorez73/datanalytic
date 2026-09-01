export const HR_ANALYSIS_TYPE_CODES = ['nomina_talento'] as const;

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

const DESEMPENO_KEYWORD_SCALE: Record<string, number> = {
  excelente: 5,
  sobresaliente: 5,
  alto: 4,
  bueno: 4,
  'medio alto': 3.5,
  medio: 3,
  regular: 2.5,
  aceptable: 2.5,
  bajo: 2,
  deficiente: 1,
  malo: 1,
  insuficiente: 1,
};

/** Acepta desempeño numérico (cualquier escala) o categórico común en español, normalizado a un valor comparable. */
function parseDesempenoCell(raw: unknown): number | null {
  const numeric = parseNumericCell(raw);
  if (numeric !== null) return numeric;
  if (typeof raw !== 'string') return null;
  const label = raw.toLowerCase().trim();
  for (const [keyword, value] of Object.entries(DESEMPENO_KEYWORD_SCALE)) {
    if (label.includes(keyword)) return value;
  }
  return null;
}

function computePeriodDays(periodStart: string | undefined, periodEnd: string | undefined): number | null {
  if (!periodStart || !periodEnd) return null;
  const start = new Date(periodStart);
  const end = new Date(periodEnd);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
  const days = Math.round((end.getTime() - start.getTime()) / 86_400_000);
  return days > 0 ? days : null;
}

function average(values: number[]): number | null {
  const clean = values.filter((v) => typeof v === 'number' && !Number.isNaN(v));
  if (clean.length === 0) return null;
  return round(clean.reduce((s, v) => s + v, 0) / clean.length);
}

function median(values: number[]): number | null {
  const clean = [...values].filter((v) => typeof v === 'number' && !Number.isNaN(v)).sort((a, b) => a - b);
  if (clean.length === 0) return null;
  const mid = Math.floor(clean.length / 2);
  return clean.length % 2 === 0 ? round((clean[mid - 1] + clean[mid]) / 2) : round(clean[mid]);
}

function percentile(values: number[], p: number): number | null {
  const clean = [...values].filter((v) => typeof v === 'number' && !Number.isNaN(v)).sort((a, b) => a - b);
  if (clean.length === 0) return null;
  const idx = (p / 100) * (clean.length - 1);
  const lower = Math.floor(idx);
  const upper = Math.ceil(idx);
  if (lower === upper) return clean[lower];
  return clean[lower] + (clean[upper] - clean[lower]) * (idx - lower);
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

// ================================================================
// Normalización de filas crudas → registros por empleado — misma
// detección de fila de encabezado real (título/subtítulo antes de la
// tabla) que los demás motores del proyecto.
// ================================================================

function isPositionalKey(key: string): boolean {
  return /^col_\d+$/.test(key);
}

type HrColumnKey =
  | 'empleado'
  | 'area'
  | 'cargo'
  | 'salario'
  | 'fecha_ingreso'
  | 'fecha_salida'
  | 'tipo_salida'
  | 'horas_extra_costo'
  | 'horas_extra_cantidad'
  | 'dias_ausencia'
  | 'desempeno';

// Orden: reglas específicas ("costo horas extra", "tipo de salida") antes
// que las genéricas ("horas extra", "salida") para no confundir una
// columna de costo ya calculado con la cantidad cruda de horas.
const HR_COLUMN_RULES: { key: HrColumnKey; test: (l: string) => boolean }[] = [
  { key: 'tipo_salida', test: (l) => (l.includes('tipo') || l.includes('motivo')) && (l.includes('salida') || l.includes('retiro')) || l.includes('voluntari') },
  { key: 'horas_extra_costo', test: (l) => l.includes('extra') && (l.includes('costo') || l.includes('valor')) },
  { key: 'horas_extra_cantidad', test: (l) => l.includes('extra') },
  { key: 'fecha_salida', test: (l) => l.includes('salida') || l.includes('retiro') || l.includes('egreso') || l.includes('terminacion') || l.includes('terminación') || l.includes('desvinculacion') || l.includes('desvinculación') },
  { key: 'fecha_ingreso', test: (l) => l.includes('ingreso') || l.includes('contratacion') || l.includes('contratación') || l.includes('vinculacion') || l.includes('vinculación') },
  { key: 'dias_ausencia', test: (l) => l.includes('ausencia') || l.includes('ausentismo') || l.includes('falta') },
  { key: 'desempeno', test: (l) => l.includes('desempeño') || l.includes('desempeno') || l.includes('evaluacion') || l.includes('evaluación') || l.includes('rendimiento') || l.includes('calificacion') || l.includes('calificación') },
  { key: 'salario', test: (l) => l.includes('salario') || l.includes('sueldo') || l.includes('remuneracion') || l.includes('remuneración') },
  { key: 'cargo', test: (l) => l.includes('cargo') || l.includes('puesto') || l.includes('nivel') || l.includes('posicion') || l.includes('posición') },
  { key: 'area', test: (l) => l.includes('area') || l.includes('área') || l.includes('departamento') || l.includes('depto') },
  { key: 'empleado', test: (l) => l.includes('empleado') || l.includes('nombre') || l.includes('cedula') || l.includes('cédula') || l.includes('documento') || l.includes('codigo') || l.includes('código') || l.includes('id') },
];

function countHeaderMatches(row: Record<string, unknown>): number {
  let matches = 0;
  for (const [key, value] of Object.entries(row)) {
    if (key === 'sheet') continue;
    if (typeof value !== 'string') continue;
    const label = value.toLowerCase().trim();
    if (!label) continue;
    if (HR_COLUMN_RULES.some((rule) => rule.test(label))) matches++;
  }
  return matches;
}

function normalizeHrRows(rows: Record<string, unknown>[]): { records: Record<string, unknown>[]; warnings: string[] } {
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
// Extracción de registros por empleado
// ================================================================

type TipoSalida = 'voluntaria' | 'involuntaria' | null;

type RawHrRecord = {
  empleado: string;
  area: string | null;
  cargo: string | null;
  salario: number | null;
  fechaIngreso: string | null;
  fechaSalida: string | null;
  tipoSalida: TipoSalida;
  horasExtraCantidad: number | null;
  horasExtraCostoDirecto: number | null;
  diasAusencia: number | null;
  desempeno: number | null;
};

function extractHrRecords(records: Record<string, unknown>[]): { rows: RawHrRecord[]; warnings: string[] } {
  const rows: RawHrRecord[] = [];
  const warnings: string[] = [];

  let skippedNoEmpleado = 0;
  let missingArea = 0;
  let missingSalario = 0;
  let missingFechaIngreso = 0;
  let missingFechaSalida = 0;
  let missingHorasExtra = 0;
  let missingAusencia = 0;
  let missingDesempeno = 0;

  for (const record of records) {
    const fields: Partial<Record<HrColumnKey, unknown>> = {};
    for (const [rawKey, value] of Object.entries(record)) {
      const label = rawKey.toLowerCase().trim();
      if (!label) continue;
      for (const rule of HR_COLUMN_RULES) {
        if (!rule.test(label)) continue;
        if (fields[rule.key] === undefined) fields[rule.key] = value;
        break;
      }
    }

    const empleadoRaw = fields.empleado;
    const empleado = typeof empleadoRaw === 'string' ? empleadoRaw.trim() : typeof empleadoRaw === 'number' ? String(empleadoRaw) : '';
    if (!empleado) {
      skippedNoEmpleado++;
      continue;
    }

    const area = typeof fields.area === 'string' && fields.area.trim() ? fields.area.trim() : null;
    if (!area) missingArea++;

    const cargo = typeof fields.cargo === 'string' && fields.cargo.trim() ? fields.cargo.trim() : null;

    const salario = parseNumericCell(fields.salario);
    if (salario === null) missingSalario++;

    const fechaIngresoDate = parseDateCell(fields.fecha_ingreso);
    if (!fechaIngresoDate) missingFechaIngreso++;

    const fechaSalidaDate = parseDateCell(fields.fecha_salida);
    if (!fechaSalidaDate) missingFechaSalida++;

    const tipoSalidaRaw = typeof fields.tipo_salida === 'string' ? fields.tipo_salida.toLowerCase() : null;
    let tipoSalida: TipoSalida = null;
    if (tipoSalidaRaw) {
      if (tipoSalidaRaw.includes('involuntari') || tipoSalidaRaw.includes('despido')) tipoSalida = 'involuntaria';
      else if (tipoSalidaRaw.includes('voluntari') || tipoSalidaRaw.includes('renuncia')) tipoSalida = 'voluntaria';
    }

    const horasExtraCostoDirecto = parseNumericCell(fields.horas_extra_costo);
    const horasExtraCantidad = parseNumericCell(fields.horas_extra_cantidad);
    if (horasExtraCostoDirecto === null && horasExtraCantidad === null) missingHorasExtra++;

    const diasAusencia = parseNumericCell(fields.dias_ausencia);
    if (diasAusencia === null) missingAusencia++;

    const desempeno = parseDesempenoCell(fields.desempeno);
    if (desempeno === null) missingDesempeno++;

    rows.push({
      empleado,
      area,
      cargo,
      salario,
      fechaIngreso: fechaIngresoDate ? fechaIngresoDate.toISOString().slice(0, 10) : null,
      fechaSalida: fechaSalidaDate ? fechaSalidaDate.toISOString().slice(0, 10) : null,
      tipoSalida,
      horasExtraCantidad,
      horasExtraCostoDirecto,
      diasAusencia,
      desempeno,
    });
  }

  const n = rows.length;
  if (skippedNoEmpleado > 0) warnings.push(`${skippedNoEmpleado} fila(s) del archivo se descartaron por no tener un empleado identificable.`);
  if (n > 0 && missingArea === n) warnings.push('No se identificó la columna de área/departamento — los indicadores por área quedaron sin calcular.');
  if (n > 0 && missingSalario === n) warnings.push('No se identificó la columna de salario — el costo de nómina, la estructura salarial y el costo de horas extra estimado quedaron sin calcular.');
  if (n > 0 && missingFechaIngreso === n) warnings.push('No se identificó la columna de fecha de ingreso — la antigüedad y el riesgo de fuga quedaron sin calcular.');
  if (n > 0 && missingFechaSalida === n) warnings.push('No se identificó la columna de fecha de salida — la rotación de personal quedó sin calcular (se asume que ningún empleado registró salida en el archivo).');
  if (n > 0 && missingHorasExtra === n) warnings.push('No se identificó la columna de horas extra — quedó sin calcular.');
  if (n > 0 && missingAusencia === n) warnings.push('No se identificó la columna de días de ausencia — el ausentismo quedó sin calcular.');
  if (n > 0 && missingDesempeno === n) warnings.push('No se identificó la columna de evaluación de desempeño — el riesgo de fuga y las correlaciones con desempeño quedaron sin calcular.');

  return { rows, warnings };
}

// ================================================================
// Cálculo de indicadores
// ================================================================

export type HrEmployeeComputed = RawHrRecord & {
  antiguedadMeses: number | null;
  activoFinPeriodo: boolean;
  salioEnPeriodo: boolean;
  ingresoEnPeriodo: boolean;
  horasExtraCosto: number | null;
  horasExtraCostoEsEstimado: boolean;
  tasaAusentismoPct: number | null;
  riesgoFuga: boolean;
};

export type CostoPorArea = { area: string; costoTotal: number; costoPromedio: number; numEmpleados: number; pctTotal: number };
export type RotacionPorArea = { area: string; salidas: number; headcountPromedio: number; tasaPct: number };
export type AusentismoPorArea = { area: string; diasAusenciaPromedio: number; tasaPct: number; numEmpleados: number };
export type HorasExtraPorArea = { area: string; costo: number; pctSobreNominaArea: number | null };
export type EstructuraSalarialArea = {
  area: string;
  numEmpleados: number;
  min: number;
  max: number;
  mediana: number;
  promedio: number;
  desviacionEstandar: number;
};
export type AntiguedadRango = { rango: string; count: number };
export type RiesgoFugaEmpleado = { empleado: string; area: string | null; cargo: string | null; antiguedadMeses: number; desempeno: number; diagnostico: string };
export type Correlacion = { coeficiente: number; lectura: 'positiva' | 'negativa' | 'nula'; numEmpleados: number };

export type ComparativoIndicador = {
  valor_actual: number;
  valor_anterior: number;
  variacion_absoluta: number;
  variacion_relativa_pct: number | null;
};

export type HrComparativo = {
  period_end_base: string;
  indicadores: Partial<
    Record<
      'costo_nomina_total' | 'tasa_rotacion' | 'ausentismo_promedio' | 'pct_horas_extra_sobre_nomina' | 'antiguedad_promedio_meses',
      ComparativoIndicador
    >
  >;
};

export type HrAnalyticsResult = {
  items: HrEmployeeComputed[];
  resumen: {
    numEmpleados: number;
    costoNominaTotal: number | null;
    costoPromedioPorEmpleado: number | null;
    tasaRotacionPct: number | null;
    tasaRotacionVoluntariaPct: number | null;
    tasaRotacionInvoluntariaPct: number | null;
    numSalidasPeriodo: number;
    antiguedadPromedioMeses: number | null;
    ausentismoPromedioPct: number | null;
    costoHorasExtraTotal: number | null;
    pctHorasExtraSobreNomina: number | null;
    numRiesgoFuga: number;
  } | null;
  costoPorArea: CostoPorArea[];
  rotacionPorArea: RotacionPorArea[];
  ausentismoPorArea: AusentismoPorArea[];
  horasExtraPorArea: HorasExtraPorArea[];
  estructuraSalarial: EstructuraSalarialArea[];
  antiguedadDistribucion: AntiguedadRango[];
  riesgoFugaEmpleados: RiesgoFugaEmpleado[];
  correlacionDesempenoRotacion: Correlacion | null;
  correlacionDesempenoAusentismo: Correlacion | null;
  comparativo_periodo_anterior?: HrComparativo | null;
  periodDays: number | null;
  warnings: string[];
};

const ANTIGUEDAD_RIESGO_FUGA_MESES = 12;
const HORAS_MES_APROX = 240;
const FACTOR_RECARGO_EXTRA = 1.5;

export function computeHrResults(
  rows: Record<string, unknown>[],
  period?: { periodStart?: string; periodEnd?: string }
): HrAnalyticsResult {
  const referenceDate = period?.periodEnd ? new Date(period.periodEnd) : new Date();
  const referenceDateValid = !Number.isNaN(referenceDate.getTime());
  const periodDays = computePeriodDays(period?.periodStart, period?.periodEnd);
  const periodStartDate = period?.periodStart ? new Date(period.periodStart) : null;
  const periodEndDate = period?.periodEnd ? new Date(period.periodEnd) : null;

  const { records, warnings: normWarnings } = normalizeHrRows(rows);
  const { rows: rawRows, warnings: extractWarnings } = extractHrRecords(records);

  const warnings = [...normWarnings, ...extractWarnings];
  if (!referenceDateValid) {
    warnings.push('No se pudo determinar la fecha de fin de período — se usó la fecha actual como referencia para la antigüedad.');
  }
  if (periodDays === null) {
    warnings.push('No se pudo calcular la duración del período — el ausentismo (%) quedó sin calcular.');
  }

  if (rawRows.length === 0) {
    warnings.push('No se pudo identificar ningún empleado válido en el archivo cargado.');
    return {
      items: [],
      resumen: null,
      costoPorArea: [],
      rotacionPorArea: [],
      ausentismoPorArea: [],
      horasExtraPorArea: [],
      estructuraSalarial: [],
      antiguedadDistribucion: [],
      riesgoFugaEmpleados: [],
      correlacionDesempenoRotacion: null,
      correlacionDesempenoAusentismo: null,
      periodDays,
      warnings,
    };
  }

  // ── Cálculo por empleado ──
  const items: HrEmployeeComputed[] = rawRows.map((r) => {
    const fechaIngresoDate = r.fechaIngreso ? new Date(r.fechaIngreso) : null;
    const fechaSalidaDate = r.fechaSalida ? new Date(r.fechaSalida) : null;
    const refDate = referenceDateValid ? referenceDate : new Date();

    const antiguedadMeses =
      fechaIngresoDate && !Number.isNaN(fechaIngresoDate.getTime())
        ? round((refDate.getTime() - fechaIngresoDate.getTime()) / (30.44 * 86_400_000))
        : null;

    const activoFinPeriodo = fechaSalidaDate === null || (periodEndDate !== null && fechaSalidaDate.getTime() > periodEndDate.getTime());

    const salioEnPeriodo =
      fechaSalidaDate !== null &&
      periodStartDate !== null &&
      periodEndDate !== null &&
      fechaSalidaDate.getTime() >= periodStartDate.getTime() &&
      fechaSalidaDate.getTime() <= periodEndDate.getTime();

    const ingresoEnPeriodo =
      fechaIngresoDate !== null &&
      periodStartDate !== null &&
      periodEndDate !== null &&
      fechaIngresoDate.getTime() >= periodStartDate.getTime() &&
      fechaIngresoDate.getTime() <= periodEndDate.getTime();

    let horasExtraCosto: number | null = r.horasExtraCostoDirecto;
    let horasExtraCostoEsEstimado = false;
    if (horasExtraCosto === null && r.horasExtraCantidad !== null && r.salario !== null) {
      const tarifaHora = r.salario / HORAS_MES_APROX;
      horasExtraCosto = round(r.horasExtraCantidad * tarifaHora * FACTOR_RECARGO_EXTRA);
      horasExtraCostoEsEstimado = true;
    }

    const tasaAusentismoPct =
      r.diasAusencia !== null && periodDays !== null && periodDays > 0
        ? round((r.diasAusencia / (periodDays * (5 / 7))) * 100)
        : null;

    return {
      ...r,
      antiguedadMeses,
      activoFinPeriodo,
      salioEnPeriodo,
      ingresoEnPeriodo,
      horasExtraCosto,
      horasExtraCostoEsEstimado,
      tasaAusentismoPct,
      riesgoFuga: false, // se recalcula abajo con el percentil real del dataset
    };
  });

  // ── Riesgo de fuga: antigüedad baja + desempeño en el cuartil superior del dataset ──
  const desempenoValues = items.filter((it) => it.desempeno !== null).map((it) => it.desempeno as number);
  const p75Desempeno = percentile(desempenoValues, 75);
  for (const it of items) {
    if (p75Desempeno !== null && it.desempeno !== null && it.antiguedadMeses !== null) {
      it.riesgoFuga = it.desempeno >= p75Desempeno && it.antiguedadMeses < ANTIGUEDAD_RIESGO_FUGA_MESES && it.activoFinPeriodo;
    }
  }

  // ── Resumen agregado ──
  const conSalario = items.filter((it) => it.salario !== null);
  const costoNominaTotal = conSalario.length > 0 ? round(conSalario.reduce((s, it) => s + (it.salario ?? 0), 0)) : null;
  const costoPromedioPorEmpleado = costoNominaTotal !== null && conSalario.length > 0 ? round(costoNominaTotal / conSalario.length) : null;

  const salidas = items.filter((it) => it.salioEnPeriodo);
  const ingresos = items.filter((it) => it.ingresoEnPeriodo);
  const activosFin = items.filter((it) => it.activoFinPeriodo);
  const hayFechaSalida = items.some((it) => it.fechaSalida !== null);

  let tasaRotacionPct: number | null = null;
  let tasaRotacionVoluntariaPct: number | null = null;
  let tasaRotacionInvoluntariaPct: number | null = null;
  if (hayFechaSalida) {
    const headcountFin = activosFin.length;
    const headcountInicio = Math.max(0, headcountFin + salidas.length - ingresos.length);
    const headcountPromedio = (headcountInicio + headcountFin) / 2;
    if (headcountPromedio > 0) {
      tasaRotacionPct = round((salidas.length / headcountPromedio) * 100);
      const voluntarias = salidas.filter((it) => it.tipoSalida === 'voluntaria').length;
      const involuntarias = salidas.filter((it) => it.tipoSalida === 'involuntaria').length;
      if (voluntarias + involuntarias > 0) {
        tasaRotacionVoluntariaPct = round((voluntarias / headcountPromedio) * 100);
        tasaRotacionInvoluntariaPct = round((involuntarias / headcountPromedio) * 100);
      }
    }
  }

  const antiguedadValues = items.filter((it) => it.antiguedadMeses !== null).map((it) => it.antiguedadMeses as number);
  const antiguedadPromedioMeses = average(antiguedadValues);

  const ausentismoValues = items.filter((it) => it.tasaAusentismoPct !== null).map((it) => it.tasaAusentismoPct as number);
  const ausentismoPromedioPct = average(ausentismoValues);

  const conHorasExtra = items.filter((it) => it.horasExtraCosto !== null);
  const costoHorasExtraTotal = conHorasExtra.length > 0 ? round(conHorasExtra.reduce((s, it) => s + (it.horasExtraCosto ?? 0), 0)) : null;
  const pctHorasExtraSobreNomina = costoHorasExtraTotal !== null && costoNominaTotal !== null && costoNominaTotal > 0 ? round((costoHorasExtraTotal / costoNominaTotal) * 100) : null;

  const numRiesgoFuga = items.filter((it) => it.riesgoFuga).length;

  const resumen = {
    numEmpleados: items.length,
    costoNominaTotal,
    costoPromedioPorEmpleado,
    tasaRotacionPct,
    tasaRotacionVoluntariaPct,
    tasaRotacionInvoluntariaPct,
    numSalidasPeriodo: salidas.length,
    antiguedadPromedioMeses,
    ausentismoPromedioPct,
    costoHorasExtraTotal,
    pctHorasExtraSobreNomina,
    numRiesgoFuga,
  };

  // ── Costo por área ──
  const areaMap = new Map<string, { costo: number; count: number }>();
  for (const it of conSalario) {
    const key = it.area ?? '(sin área)';
    const entry = areaMap.get(key) ?? { costo: 0, count: 0 };
    entry.costo += it.salario ?? 0;
    entry.count += 1;
    areaMap.set(key, entry);
  }
  const costoPorArea: CostoPorArea[] = Array.from(areaMap.entries())
    .map(([area, v]) => ({
      area,
      costoTotal: round(v.costo),
      costoPromedio: round(v.costo / v.count),
      numEmpleados: v.count,
      pctTotal: costoNominaTotal !== null && costoNominaTotal > 0 ? round((v.costo / costoNominaTotal) * 100) : 0,
    }))
    .sort((a, b) => b.costoTotal - a.costoTotal);

  // ── Rotación por área ──
  let rotacionPorArea: RotacionPorArea[] = [];
  if (hayFechaSalida) {
    const areasConDatos = new Set(items.filter((it) => it.area !== null).map((it) => it.area as string));
    rotacionPorArea = Array.from(areasConDatos)
      .map((area) => {
        const enArea = items.filter((it) => it.area === area);
        const salidasArea = enArea.filter((it) => it.salioEnPeriodo).length;
        const ingresosArea = enArea.filter((it) => it.ingresoEnPeriodo).length;
        const finArea = enArea.filter((it) => it.activoFinPeriodo).length;
        const inicioArea = Math.max(0, finArea + salidasArea - ingresosArea);
        const headcountPromedio = (inicioArea + finArea) / 2;
        if (headcountPromedio <= 0) return null;
        return {
          area,
          salidas: salidasArea,
          headcountPromedio: round(headcountPromedio),
          tasaPct: round((salidasArea / headcountPromedio) * 100),
        };
      })
      .filter((r): r is RotacionPorArea => r !== null)
      .sort((a, b) => b.tasaPct - a.tasaPct);
  }

  // ── Ausentismo por área ──
  const ausentismoAreaMap = new Map<string, number[]>();
  const diasAusenciaAreaMap = new Map<string, number[]>();
  for (const it of items) {
    if (it.area === null) continue;
    if (it.tasaAusentismoPct !== null) {
      if (!ausentismoAreaMap.has(it.area)) ausentismoAreaMap.set(it.area, []);
      ausentismoAreaMap.get(it.area)!.push(it.tasaAusentismoPct);
    }
    if (it.diasAusencia !== null) {
      if (!diasAusenciaAreaMap.has(it.area)) diasAusenciaAreaMap.set(it.area, []);
      diasAusenciaAreaMap.get(it.area)!.push(it.diasAusencia);
    }
  }
  const ausentismoPorArea: AusentismoPorArea[] = Array.from(ausentismoAreaMap.entries())
    .map(([area, tasas]) => ({
      area,
      diasAusenciaPromedio: average(diasAusenciaAreaMap.get(area) ?? []) ?? 0,
      tasaPct: average(tasas) ?? 0,
      numEmpleados: tasas.length,
    }))
    .sort((a, b) => b.tasaPct - a.tasaPct);

  // ── Horas extra por área ──
  const horasExtraAreaMap = new Map<string, { costo: number; costoNomina: number }>();
  for (const it of items) {
    if (it.area === null || it.horasExtraCosto === null) continue;
    const entry = horasExtraAreaMap.get(it.area) ?? { costo: 0, costoNomina: 0 };
    entry.costo += it.horasExtraCosto;
    entry.costoNomina += it.salario ?? 0;
    horasExtraAreaMap.set(it.area, entry);
  }
  const horasExtraPorArea: HorasExtraPorArea[] = Array.from(horasExtraAreaMap.entries())
    .map(([area, v]) => ({
      area,
      costo: round(v.costo),
      pctSobreNominaArea: v.costoNomina > 0 ? round((v.costo / v.costoNomina) * 100) : null,
    }))
    .sort((a, b) => b.costo - a.costo);

  // ── Estructura salarial por área ──
  const salarioAreaMap = new Map<string, number[]>();
  for (const it of conSalario) {
    const key = it.area ?? '(sin área)';
    if (!salarioAreaMap.has(key)) salarioAreaMap.set(key, []);
    salarioAreaMap.get(key)!.push(it.salario as number);
  }
  const estructuraSalarial: EstructuraSalarialArea[] = Array.from(salarioAreaMap.entries())
    .map(([area, salarios]) => {
      const prom = salarios.reduce((s, v) => s + v, 0) / salarios.length;
      const varianza = salarios.reduce((s, v) => s + (v - prom) ** 2, 0) / salarios.length;
      return {
        area,
        numEmpleados: salarios.length,
        min: round(Math.min(...salarios)),
        max: round(Math.max(...salarios)),
        mediana: median(salarios) ?? 0,
        promedio: round(prom),
        desviacionEstandar: round(Math.sqrt(varianza)),
      };
    })
    .sort((a, b) => b.promedio - a.promedio);

  // ── Distribución de antigüedad ──
  const rangos: { rango: string; test: (m: number) => boolean }[] = [
    { rango: '< 6 meses', test: (m) => m < 6 },
    { rango: '6-12 meses', test: (m) => m >= 6 && m < 12 },
    { rango: '1-3 años', test: (m) => m >= 12 && m < 36 },
    { rango: '3-5 años', test: (m) => m >= 36 && m < 60 },
    { rango: '5+ años', test: (m) => m >= 60 },
  ];
  const antiguedadDistribucion: AntiguedadRango[] = rangos
    .map((r) => ({ rango: r.rango, count: antiguedadValues.filter(r.test).length }))
    .filter((r) => r.count > 0);

  // ── Riesgo de fuga — listado individual ──
  const riesgoFugaEmpleados: RiesgoFugaEmpleado[] = items
    .filter((it) => it.riesgoFuga)
    .map((it) => ({
      empleado: it.empleado,
      area: it.area,
      cargo: it.cargo,
      antiguedadMeses: it.antiguedadMeses as number,
      desempeno: it.desempeno as number,
      diagnostico: `Alto desempeño (percentil 75+) con solo ${(it.antiguedadMeses as number).toFixed(1)} meses de antigüedad — perfil de riesgo de fuga temprana.`,
    }))
    .sort((a, b) => a.antiguedadMeses - b.antiguedadMeses);

  // ── Correlaciones desempeño vs. rotación/ausentismo ──
  const conDesempenoYRotacion = items.filter((it) => it.desempeno !== null && hayFechaSalida);
  let correlacionDesempenoRotacion: Correlacion | null = null;
  if (conDesempenoYRotacion.length >= 3) {
    const coef = pearsonCorrelation(
      conDesempenoYRotacion.map((it) => it.desempeno as number),
      conDesempenoYRotacion.map((it) => (it.salioEnPeriodo ? 1 : 0))
    );
    if (coef !== null) {
      correlacionDesempenoRotacion = { coeficiente: round(coef), lectura: coef > 0.3 ? 'positiva' : coef < -0.3 ? 'negativa' : 'nula', numEmpleados: conDesempenoYRotacion.length };
    }
  }

  const conDesempenoYAusentismo = items.filter((it) => it.desempeno !== null && it.tasaAusentismoPct !== null);
  let correlacionDesempenoAusentismo: Correlacion | null = null;
  if (conDesempenoYAusentismo.length >= 3) {
    const coef = pearsonCorrelation(
      conDesempenoYAusentismo.map((it) => it.desempeno as number),
      conDesempenoYAusentismo.map((it) => it.tasaAusentismoPct as number)
    );
    if (coef !== null) {
      correlacionDesempenoAusentismo = { coeficiente: round(coef), lectura: coef > 0.3 ? 'positiva' : coef < -0.3 ? 'negativa' : 'nula', numEmpleados: conDesempenoYAusentismo.length };
    }
  }

  return {
    items,
    resumen,
    costoPorArea,
    rotacionPorArea,
    ausentismoPorArea,
    horasExtraPorArea,
    estructuraSalarial,
    antiguedadDistribucion,
    riesgoFugaEmpleados,
    correlacionDesempenoRotacion,
    correlacionDesempenoAusentismo,
    periodDays,
    warnings,
  };
}

// ================================================================
// Comparativo automático contra el análisis publicado anterior —
// mismo patrón que los demás motores del proyecto.
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

export function computeHrComparativo(current: HrAnalyticsResult, previous: any, previousPeriodEnd: string): HrComparativo | null {
  if (!current.resumen || !previous?.resumen) return null;

  const indicadores: HrComparativo['indicadores'] = {};

  const map: [keyof HrComparativo['indicadores'], keyof NonNullable<HrAnalyticsResult['resumen']>][] = [
    ['costo_nomina_total', 'costoNominaTotal'],
    ['tasa_rotacion', 'tasaRotacionPct'],
    ['ausentismo_promedio', 'ausentismoPromedioPct'],
    ['pct_horas_extra_sobre_nomina', 'pctHorasExtraSobreNomina'],
    ['antiguedad_promedio_meses', 'antiguedadPromedioMeses'],
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

export type HrValueFormat = 'currency' | 'percent' | 'integer' | 'ratio' | 'months';

export function formatHrValue(value: number | null | undefined, format: HrValueFormat): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  if (format === 'percent') return `${value.toFixed(1)}%`;
  if (format === 'currency') return `$${new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 }).format(value)}`;
  if (format === 'integer') return new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 }).format(value);
  if (format === 'months') return `${value.toFixed(1)} m`;
  return value.toFixed(2);
}

export type HrSemaphoreStatus = 'good' | 'warning' | 'critical' | 'unknown';

type SemaphoreRange = { good: number; warning: number; direction: 'higher-better' | 'lower-better' };

/** Umbrales genéricos de people analytics — sin benchmark sectorial específico; la tasa de rotación es "por período", no anualizada. */
const HR_SEMAPHORE_RANGES: Record<string, SemaphoreRange> = {
  tasa_rotacion: { good: 5, warning: 10, direction: 'lower-better' },
  ausentismo_promedio: { good: 3, warning: 6, direction: 'lower-better' },
  pct_horas_extra_sobre_nomina: { good: 5, warning: 10, direction: 'lower-better' },
  pct_riesgo_fuga: { good: 5, warning: 15, direction: 'lower-better' },
};

export function classifyHrIndicator(key: string, value: number | null | undefined): HrSemaphoreStatus {
  if (value === null || value === undefined || Number.isNaN(value)) return 'unknown';
  const range = HR_SEMAPHORE_RANGES[key];
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

export type HrRiskMapRow = { indicador: string; nivel: 'verde' | 'amarillo' | 'rojo'; señal: string };

const STATUS_TO_NIVEL: Record<HrSemaphoreStatus, 'verde' | 'amarillo' | 'rojo'> = {
  good: 'verde',
  warning: 'amarillo',
  critical: 'rojo',
  unknown: 'amarillo',
};

/** Mapa de riesgos determinista (no depende de la narrativa IA) — mismo patrón que los demás motores. Solo incluye filas de indicadores efectivamente calculados. */
export function buildHrRiskMap(results: HrAnalyticsResult): HrRiskMapRow[] {
  const rows: HrRiskMapRow[] = [];
  const r = results.resumen;
  if (!r) return rows;

  if (r.tasaRotacionPct !== null) {
    const status = classifyHrIndicator('tasa_rotacion', r.tasaRotacionPct);
    rows.push({ indicador: 'Tasa de Rotación', nivel: STATUS_TO_NIVEL[status], señal: `${r.tasaRotacionPct.toFixed(1)}%` });
  }

  if (r.ausentismoPromedioPct !== null) {
    const status = classifyHrIndicator('ausentismo_promedio', r.ausentismoPromedioPct);
    rows.push({ indicador: 'Ausentismo Promedio', nivel: STATUS_TO_NIVEL[status], señal: `${r.ausentismoPromedioPct.toFixed(1)}%` });
  }

  if (r.pctHorasExtraSobreNomina !== null) {
    const status = classifyHrIndicator('pct_horas_extra_sobre_nomina', r.pctHorasExtraSobreNomina);
    rows.push({ indicador: 'Horas Extra sobre Nómina', nivel: STATUS_TO_NIVEL[status], señal: `${r.pctHorasExtraSobreNomina.toFixed(1)}%` });
  }

  // Solo se reporta si el archivo realmente trae desempeño y fecha de ingreso
  // — de lo contrario numRiesgoFuga es 0 por falta de datos, no por ausencia
  // real de riesgo, y mostrarlo como "Saludable" sería un falso positivo.
  const hayDesempeno = results.items.some((it) => it.desempeno !== null);
  if (r.numEmpleados > 0 && hayDesempeno && r.antiguedadPromedioMeses !== null) {
    const pctRiesgoFuga = round((r.numRiesgoFuga / r.numEmpleados) * 100);
    const status = classifyHrIndicator('pct_riesgo_fuga', pctRiesgoFuga);
    rows.push({ indicador: 'Personal en Riesgo de Fuga', nivel: STATUS_TO_NIVEL[status], señal: `${pctRiesgoFuga.toFixed(1)}% (${r.numRiesgoFuga})` });
  }

  return rows;
}
