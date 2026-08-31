export const FINANCIAL_ANALYSIS_TYPE_CODES = ['financiero_general', 'flujo_caja', 'cartera_clientes'] as const;

type AccountKey =
  | 'activo_corriente'
  | 'pasivo_corriente'
  | 'inventarios'
  | 'total_activo'
  | 'total_pasivo'
  | 'total_patrimonio'
  | 'obligaciones_financieras'
  | 'utilidad_operacional'
  | 'gastos_financieros'
  | 'utilidad_bruta'
  | 'utilidad_neta'
  | 'ventas'
  | 'cuentas_por_cobrar'
  | 'cuentas_por_pagar'
  | 'costo_ventas'
  | 'efectivo_y_equivalentes'
  | 'utilidad_antes_impuestos'
  | 'impuesto_renta'
  | 'utilidad_ejercicio_balance';

const ACCOUNT_LABELS: Record<AccountKey, string> = {
  activo_corriente: 'Activo Corriente',
  pasivo_corriente: 'Pasivo Corriente',
  inventarios: 'Inventarios',
  total_activo: 'Total Activo',
  total_pasivo: 'Total Pasivo',
  total_patrimonio: 'Total Patrimonio',
  obligaciones_financieras: 'Obligaciones Financieras',
  utilidad_operacional: 'Utilidad Operacional',
  gastos_financieros: 'Gastos Financieros',
  utilidad_bruta: 'Utilidad Bruta',
  utilidad_neta: 'Utilidad Neta',
  ventas: 'Ventas',
  cuentas_por_cobrar: 'Cuentas por Cobrar',
  cuentas_por_pagar: 'Cuentas por Pagar',
  costo_ventas: 'Costo de Ventas',
  efectivo_y_equivalentes: 'Efectivo y Equivalentes',
  utilidad_antes_impuestos: 'Utilidad Antes de Impuestos',
  impuesto_renta: 'Impuesto de Renta',
  utilidad_ejercicio_balance: 'Utilidad del Ejercicio (Balance)',
};

/**
 * Cuentas cuya ausencia SÍ genera warning ("no se identificó..."): son la base
 * de los indicadores principales y prácticamente todo balance/P&G las trae.
 * Las tres cuentas nuevas (EBT, impuesto de renta, utilidad del ejercicio del
 * balance) son soporte de DuPont ampliado y de la verificación de coherencia —
 * muchos archivos simples no las reportan como línea separada, así que avisar
 * de su ausencia sería ruido, no una alerta útil.
 */
const CORE_ACCOUNT_KEYS: AccountKey[] = (Object.keys(ACCOUNT_LABELS) as AccountKey[]).filter(
  (key) => key !== 'utilidad_antes_impuestos' && key !== 'impuesto_renta' && key !== 'utilidad_ejercicio_balance'
);

/**
 * Reglas de matching por palabras clave sobre el label de cada fila (en minúsculas).
 * Orden importa: las más específicas ("total X") van antes que las genéricas
 * ("X corriente") para no confundir "Total Activo" con "Activo Corriente".
 */
const ACCOUNT_RULES: { key: AccountKey; test: (label: string) => boolean; sum?: boolean; abs?: boolean }[] = [
  { key: 'total_patrimonio', test: (l) => l.includes('patrimonio') },
  {
    // Excluye "corriente" para no capturar "Total Activo Corriente" /
    // "Total Activo No Corriente" en vez del gran total ("TOTAL ACTIVO").
    key: 'total_activo',
    test: (l) => l.includes('total') && l.includes('activo') && !l.includes('pasivo') && !l.includes('corriente'),
  },
  {
    key: 'total_pasivo',
    test: (l) => l.includes('total') && l.includes('pasivo') && !l.includes('activo') && !l.includes('corriente'),
  },
  { key: 'inventarios', test: (l) => l.includes('inventario') },
  {
    key: 'cuentas_por_cobrar',
    test: (l) => (l.includes('cuentas') && l.includes('cobrar')) || l.includes('cartera') || l.includes('deudores'),
  },
  {
    key: 'cuentas_por_pagar',
    test: (l) => (l.includes('cuentas') && l.includes('pagar')) || l.includes('proveedores'),
  },
  { key: 'efectivo_y_equivalentes', test: (l) => l.includes('efectivo') },
  {
    key: 'activo_corriente',
    test: (l) =>
      l.includes('activo') && l.includes('corriente') && !l.includes('no corriente') && !l.includes('pasivo'),
  },
  {
    key: 'pasivo_corriente',
    test: (l) =>
      l.includes('pasivo') && l.includes('corriente') && !l.includes('no corriente') && !l.includes('activo'),
  },
  { key: 'obligaciones_financieras', test: (l) => l.includes('obligacion') && l.includes('financ'), sum: true },
  { key: 'utilidad_bruta', test: (l) => l.includes('utilidad') && l.includes('bruta') },
  {
    key: 'utilidad_operacional',
    test: (l) => l.includes('utilidad') && (l.includes('operacional') || l.includes('operativa')),
  },
  {
    // "Utilidad Antes de Impuestos" (EBT) — específico, antes de utilidad_neta
    // para no colisionar si algún archivo la nombra distinto.
    key: 'utilidad_antes_impuestos',
    test: (l) => l.includes('utilidad') && l.includes('antes') && l.includes('impuesto'),
  },
  {
    // "Utilidad del ejercicio" en el Balance (patrimonio) — distinta de la
    // "Utilidad Neta" del Estado de Resultados; ambas se comparan en la
    // verificación de coherencia contable.
    key: 'utilidad_ejercicio_balance',
    test: (l) => l.includes('utilidad') && l.includes('ejercicio'),
  },
  { key: 'utilidad_neta', test: (l) => l.includes('utilidad') && l.includes('neta') },
  {
    key: 'impuesto_renta',
    test: (l) => l.includes('impuesto') && l.includes('renta'),
    abs: true,
  },
  {
    key: 'gastos_financieros',
    test: (l) => (l.includes('gasto') || l.includes('costo')) && l.includes('financ'),
    abs: true,
  },
  {
    key: 'costo_ventas',
    test: (l) => l.includes('costo') && (l.includes('venta') || l.includes('mercanc') || l.includes('producto vendido')),
    abs: true,
  },
  { key: 'ventas', test: (l) => l.includes('ventas') || (l.includes('ingresos') && l.includes('operacional')) },
];

function parseNumericCell(raw: unknown): number | null {
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  if (typeof raw !== 'string') return null;

  const trimmed = raw.trim();
  if (!trimmed) return null;

  const isNegativeParens = /^\(.*\)$/.test(trimmed);
  let cleaned = trimmed.replace(/[()]/g, '').replace(/[$\s]/g, '');

  // Formato latino ("1.234.567,89"): puntos de miles + coma decimal.
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

/** Convierte una fila cruda { columna: valor } en { label, value } — sin asumir nombres de columna fijos. */
function normalizeRow(row: Record<string, unknown>): { label: string; value: number | null } {
  // "sheet" es metadata (de qué hoja vino la fila), no una cuenta ni un valor —
  // se excluye para que no contamine el label ni se confunda con una celda numérica.
  const entries = Object.entries(row).filter(([key]) => key !== 'sheet');

  let value: number | null = null;
  let valueKey: string | null = null;

  // 1. Preferir la primera celda que ya sea de tipo number (caso normal de Excel).
  for (const [key, raw] of entries) {
    if (typeof raw === 'number' && Number.isFinite(raw)) {
      value = raw;
      valueKey = key;
      break;
    }
  }
  // 2. Si no hay número nativo, buscar un string parseable como número.
  if (value === null) {
    for (const [key, raw] of entries) {
      const parsed = parseNumericCell(raw);
      if (parsed !== null) {
        value = parsed;
        valueKey = key;
        break;
      }
    }
  }

  const label = entries
    .filter(([key, raw]) => key !== valueKey && typeof raw === 'string' && raw.trim().length > 0)
    .map(([, raw]) => String(raw))
    .join(' ')
    .toLowerCase()
    .trim();

  return { label, value };
}

function extractAccounts(rows: Record<string, unknown>[]): Partial<Record<AccountKey, number>> {
  const accounts: Partial<Record<AccountKey, number>> = {};

  for (const rawRow of rows) {
    const { label, value } = normalizeRow(rawRow);
    if (!label || value === null) continue;

    for (const rule of ACCOUNT_RULES) {
      if (!rule.test(label)) continue;

      // Los estados de resultados suelen registrar costos/gastos como negativos
      // (líneas de deducción en un P&G corrido). Los indicadores que dividen por
      // estas cuentas (cobertura_intereses, DIO, DPO, CCC) esperan la magnitud,
      // no el signo contable — abs normaliza esto en el punto de extracción.
      const normalizedValue = rule.abs ? Math.abs(value) : value;

      if (rule.sum) {
        accounts[rule.key] = (accounts[rule.key] ?? 0) + normalizedValue;
      } else if (accounts[rule.key] === undefined) {
        accounts[rule.key] = normalizedValue;
      }
      break; // primera regla que matchea gana — no seguir evaluando otras para esta fila
    }
  }

  return accounts;
}

function round(n: number): number {
  return Math.round(n * 10000) / 10000;
}

function safeDiv(a: number | undefined, b: number | undefined): number | null {
  if (a === undefined || b === undefined || b === 0) return null;
  return round(a / b);
}

function safeSub(a: number | undefined, b: number | undefined): number | null {
  if (a === undefined || b === undefined) return null;
  return round(a - b);
}

/** Cuenta "a / (total / días)" — la forma estándar de DSO/DIO/DPO. null si falta algún dato o no hay días válidos. */
function safeDivPerDay(a: number | undefined, total: number | undefined, days: number | null): number | null {
  if (a === undefined || total === undefined || total === 0 || days === null || days <= 0) return null;
  return round(a / (total / days));
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

export function computeFinancialResults(
  rows: Record<string, unknown>[],
  period?: { periodStart?: string; periodEnd?: string }
) {
  const accounts = extractAccounts(rows);
  const {
    activo_corriente,
    pasivo_corriente,
    inventarios,
    total_activo,
    total_pasivo,
    total_patrimonio,
    obligaciones_financieras,
    utilidad_operacional,
    gastos_financieros,
    utilidad_bruta,
    utilidad_neta,
    ventas,
    cuentas_por_cobrar,
    cuentas_por_pagar,
    costo_ventas,
    efectivo_y_equivalentes,
    utilidad_antes_impuestos,
    impuesto_renta,
    utilidad_ejercicio_balance,
  } = accounts;

  const activoCorrienteMenosInventarios =
    activo_corriente !== undefined && inventarios !== undefined ? activo_corriente - inventarios : undefined;

  const pasivoNoCorriente =
    total_pasivo !== undefined && pasivo_corriente !== undefined ? total_pasivo - pasivo_corriente : undefined;
  const activoNoCorriente =
    total_activo !== undefined && activo_corriente !== undefined ? total_activo - activo_corriente : undefined;
  const otrosActivoCorriente =
    activo_corriente !== undefined &&
    efectivo_y_equivalentes !== undefined &&
    cuentas_por_cobrar !== undefined &&
    inventarios !== undefined
      ? activo_corriente - efectivo_y_equivalentes - cuentas_por_cobrar - inventarios
      : undefined;

  const periodDays = computePeriodDays(period?.periodStart, period?.periodEnd);

  const warnings: string[] = CORE_ACCOUNT_KEYS.filter((key) => accounts[key] === undefined).map(
    (key) => `No se identificó la cuenta "${ACCOUNT_LABELS[key]}" en el archivo — los indicadores que la requieren quedaron sin calcular.`
  );

  if (periodDays === null) {
    warnings.push(
      'No se pudo calcular la duración del período (period_start/period_end inválidos) — el ciclo de conversión de efectivo quedó sin calcular.'
    );
  }

  const dso = safeDivPerDay(cuentas_por_cobrar, ventas, periodDays);
  const dio = safeDivPerDay(inventarios, costo_ventas, periodDays);
  const dpo = safeDivPerDay(cuentas_por_pagar, costo_ventas, periodDays);
  const ccc = dso !== null && dio !== null && dpo !== null ? round(dso + dio - dpo) : null;

  const npm = safeDiv(utilidad_neta, ventas);
  const ato = safeDiv(ventas, total_activo);
  const em = safeDiv(total_activo, total_patrimonio);
  const roeVerificado = npm !== null && ato !== null && em !== null ? round(npm * ato * em) : null;
  const cargaFinanciera = safeDiv(utilidad_operacional, utilidad_antes_impuestos);
  const cargaFiscalEfectiva = safeDiv(impuesto_renta, utilidad_antes_impuestos);

  // Verificación de coherencia: la "Utilidad del ejercicio" del Balance (patrimonio)
  // y la "Utilidad Neta" del Estado de Resultados deberían coincidir — si difieren
  // en más de 5%, es una señal de alerta alta (requiere reconciliación contable)
  // antes de confiar en los indicadores derivados de cualquiera de las dos cifras.
  let coherenciaContable: {
    utilidad_balance: number;
    utilidad_neta_pl: number;
    diferencia_absoluta: number;
    diferencia_pct: number;
    inconsistente: boolean;
    mensaje: string | null;
  } | null = null;

  if (utilidad_ejercicio_balance !== undefined && utilidad_neta !== undefined) {
    const diferenciaAbsoluta = round(utilidad_ejercicio_balance - utilidad_neta);
    const base = Math.abs(utilidad_neta) > 0.0001 ? Math.abs(utilidad_neta) : Math.abs(utilidad_ejercicio_balance);
    const diferenciaPct = base > 0 ? round(Math.abs(diferenciaAbsoluta) / base) : 0;
    const inconsistente = diferenciaPct > 0.05;
    const mensaje = inconsistente
      ? `Inconsistencia entre Utilidad del Balance ($${formatIndicatorValue(utilidad_ejercicio_balance, 'currency')}) y Utilidad Neta del Estado de Resultados ($${formatIndicatorValue(utilidad_neta, 'currency')}) — requiere reconciliación contable antes de uso externo.`
      : null;

    coherenciaContable = {
      utilidad_balance: utilidad_ejercicio_balance,
      utilidad_neta_pl: utilidad_neta,
      diferencia_absoluta: diferenciaAbsoluta,
      diferencia_pct: diferenciaPct,
      inconsistente,
      mensaje,
    };

    if (mensaje) warnings.unshift(mensaje);
  }

  return {
    liquidez: {
      razon_corriente: safeDiv(activo_corriente, pasivo_corriente),
      prueba_acida: safeDiv(activoCorrienteMenosInventarios, pasivo_corriente),
      cash_ratio: safeDiv(efectivo_y_equivalentes, pasivo_corriente),
      capital_trabajo: safeSub(activo_corriente, pasivo_corriente),
    },
    endeudamiento: {
      nivel_endeudamiento: safeDiv(total_pasivo, total_activo),
      endeudamiento_financiero: safeDiv(obligaciones_financieras, total_activo),
      cobertura_intereses: safeDiv(utilidad_operacional, gastos_financieros),
      deuda_patrimonio: safeDiv(total_pasivo, total_patrimonio),
      equity_ratio: safeDiv(total_patrimonio, total_activo),
      deuda_lp_patrimonio: safeDiv(pasivoNoCorriente, total_patrimonio),
    },
    rentabilidad: {
      margen_bruto: safeDiv(utilidad_bruta, ventas),
      margen_operacional: safeDiv(utilidad_operacional, ventas),
      margen_neto: safeDiv(utilidad_neta, ventas),
      roa: safeDiv(utilidad_neta, total_activo),
      roe: safeDiv(utilidad_neta, total_patrimonio),
    },
    dupont: {
      npm,
      ato,
      em,
      roe_verificado: roeVerificado,
      carga_financiera: cargaFinanciera,
      carga_fiscal_efectiva: cargaFiscalEfectiva,
    },
    ciclo_efectivo: {
      dso,
      dio,
      dpo,
      ccc,
    },
    composicion_activos: {
      efectivo_pct: safeDiv(efectivo_y_equivalentes, total_activo),
      cxc_pct: safeDiv(cuentas_por_cobrar, total_activo),
      inventarios_pct: safeDiv(inventarios, total_activo),
      otros_ac_pct: safeDiv(otrosActivoCorriente, total_activo),
      activo_nc_pct: safeDiv(activoNoCorriente, total_activo),
    },
    composicion_financiacion: {
      pasivo_cp_pct: safeDiv(pasivo_corriente, total_activo),
      pasivo_lp_pct: safeDiv(pasivoNoCorriente, total_activo),
      patrimonio_pct: safeDiv(total_patrimonio, total_activo),
    },
    coherencia_contable: coherenciaContable,
    cuentas_detectadas: accounts,
    warnings,
  };
}

// ================================================================
// Metadata de presentación — usada por la vista de detalle
// (super admin y cliente) para renderizar/formatear los indicadores.
// ================================================================

export type IndicatorFormat = 'ratio' | 'percent' | 'currency' | 'days';

export const INDICATOR_SECTIONS: {
  key: 'liquidez' | 'endeudamiento' | 'rentabilidad' | 'dupont' | 'ciclo_efectivo';
  title: string;
  items: { key: string; label: string; format: IndicatorFormat }[];
}[] = [
  {
    key: 'liquidez',
    title: 'Liquidez',
    items: [
      { key: 'razon_corriente', label: 'Razón Corriente', format: 'ratio' },
      { key: 'prueba_acida', label: 'Prueba Ácida', format: 'ratio' },
      { key: 'cash_ratio', label: 'Cash Ratio', format: 'ratio' },
      { key: 'capital_trabajo', label: 'Capital de Trabajo', format: 'currency' },
    ],
  },
  {
    key: 'endeudamiento',
    title: 'Endeudamiento',
    items: [
      { key: 'nivel_endeudamiento', label: 'Nivel de Endeudamiento', format: 'percent' },
      { key: 'endeudamiento_financiero', label: 'Endeudamiento Financiero', format: 'percent' },
      { key: 'cobertura_intereses', label: 'Cobertura de Intereses', format: 'ratio' },
      { key: 'deuda_patrimonio', label: 'Deuda / Patrimonio (D/E)', format: 'ratio' },
      { key: 'equity_ratio', label: 'Patrimonio / Activo (Equity Ratio)', format: 'percent' },
      { key: 'deuda_lp_patrimonio', label: 'Deuda LP / Patrimonio', format: 'ratio' },
    ],
  },
  {
    key: 'rentabilidad',
    title: 'Rentabilidad',
    items: [
      { key: 'margen_bruto', label: 'Margen Bruto', format: 'percent' },
      { key: 'margen_operacional', label: 'Margen Operacional', format: 'percent' },
      { key: 'margen_neto', label: 'Margen Neto', format: 'percent' },
      { key: 'roa', label: 'ROA', format: 'percent' },
      { key: 'roe', label: 'ROE', format: 'percent' },
    ],
  },
  {
    key: 'dupont',
    title: 'DuPont (Descomposición del ROE)',
    items: [
      { key: 'npm', label: 'Margen Neto (NPM)', format: 'percent' },
      { key: 'ato', label: 'Rotación de Activos (ATO)', format: 'ratio' },
      { key: 'em', label: 'Multiplicador de Equity (EM)', format: 'ratio' },
      { key: 'roe_verificado', label: 'ROE Verificado (NPM × ATO × EM)', format: 'percent' },
      { key: 'carga_financiera', label: 'Carga Financiera (EBIT / EBT)', format: 'ratio' },
      { key: 'carga_fiscal_efectiva', label: 'Carga Fiscal Efectiva', format: 'percent' },
    ],
  },
  {
    key: 'ciclo_efectivo',
    title: 'Ciclo de Conversión de Efectivo',
    items: [
      { key: 'dso', label: 'Días de Cartera (DSO)', format: 'days' },
      { key: 'dio', label: 'Días de Inventario (DIO)', format: 'days' },
      { key: 'dpo', label: 'Días de Proveedores (DPO)', format: 'days' },
      { key: 'ccc', label: 'Ciclo de Conversión de Efectivo (CCC)', format: 'days' },
    ],
  },
];

/** Indicadores destacados para las tarjetas KPI — usado por la vista de detalle y el PDF exportado. */
export const KPI_HEADLINE_DEFS: { section: string; key: string; label: string; format: IndicatorFormat }[] = [
  { section: 'liquidez', key: 'razon_corriente', label: 'Razón Corriente', format: 'ratio' },
  { section: 'rentabilidad', key: 'roe', label: 'ROE', format: 'percent' },
  { section: 'endeudamiento', key: 'nivel_endeudamiento', label: 'Nivel de Endeudamiento', format: 'percent' },
  { section: 'rentabilidad', key: 'margen_neto', label: 'Margen Neto', format: 'percent' },
];

export function formatIndicatorValue(value: number | null | undefined, format: IndicatorFormat): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  if (format === 'percent') return `${(value * 100).toFixed(2)}%`;
  if (format === 'currency') return new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 }).format(value);
  if (format === 'days') return `${value.toFixed(1)} días`;
  return value.toFixed(2);
}

// ================================================================
// Semáforos — rangos estándar de análisis financiero.
// Los valores están en las mismas unidades que `results` (fracción
// para porcentajes: 0.4344 = 43.44%; número plano para ratios).
// ================================================================

export type SemaphoreStatus = 'good' | 'warning' | 'critical' | 'unknown';

type SemaphoreRange = { good: number; warning: number; direction: 'higher-better' | 'lower-better' };

/**
 * good/warning son los umbrales que separan verde↔amarillo y amarillo↔rojo.
 * direction indica si "más alto es mejor" (liquidez, cobertura, rentabilidad)
 * o "más bajo es mejor" (endeudamiento). capital_trabajo se maneja aparte
 * (no es un ratio ni un %, solo importa si es positivo o negativo).
 */
const SEMAPHORE_RANGES: Partial<Record<string, SemaphoreRange>> = {
  razon_corriente: { good: 1.5, warning: 1, direction: 'higher-better' },
  prueba_acida: { good: 1, warning: 0.7, direction: 'higher-better' },
  nivel_endeudamiento: { good: 0.4, warning: 0.6, direction: 'lower-better' },
  endeudamiento_financiero: { good: 0.3, warning: 0.5, direction: 'lower-better' },
  cobertura_intereses: { good: 3, warning: 1.5, direction: 'higher-better' },
  margen_bruto: { good: 0.4, warning: 0.2, direction: 'higher-better' },
  margen_operacional: { good: 0.15, warning: 0.05, direction: 'higher-better' },
  margen_neto: { good: 0.1, warning: 0.05, direction: 'higher-better' },
  roa: { good: 0.08, warning: 0.03, direction: 'higher-better' },
  roe: { good: 0.15, warning: 0.08, direction: 'higher-better' },
  cash_ratio: { good: 0.2, warning: 0.1, direction: 'higher-better' },
  roe_verificado: { good: 0.15, warning: 0.08, direction: 'higher-better' },
  dso: { good: 30, warning: 60, direction: 'lower-better' },
  dio: { good: 45, warning: 90, direction: 'lower-better' },
  dpo: { good: 45, warning: 30, direction: 'higher-better' },
  ccc: { good: 30, warning: 60, direction: 'lower-better' },
  deuda_patrimonio: { good: 1, warning: 1.5, direction: 'lower-better' },
  equity_ratio: { good: 0.5, warning: 0.3, direction: 'higher-better' },
  deuda_lp_patrimonio: { good: 0.5, warning: 0.8, direction: 'lower-better' },
  carga_financiera: { good: 1.3, warning: 1.6, direction: 'lower-better' },
};

export function classifyIndicator(key: string, value: number | null | undefined): SemaphoreStatus {
  if (value === null || value === undefined || Number.isNaN(value)) return 'unknown';
  if (key === 'capital_trabajo') return value >= 0 ? 'good' : 'critical';

  const range = SEMAPHORE_RANGES[key];
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

/**
 * Normaliza un indicador a "% de la meta alcanzado" (100 = justo en el
 * umbral "good") para poder comparar ratios y porcentajes de distinta
 * unidad en un mismo eje de gráfico. null para indicadores sin rango
 * definido (p.ej. capital_trabajo, que es un monto, no un ratio).
 */
export function scoreVsIdeal(key: string, value: number | null | undefined): number | null {
  if (value === null || value === undefined || Number.isNaN(value)) return null;
  const range = SEMAPHORE_RANGES[key];
  if (!range) return null;

  if (range.direction === 'higher-better') {
    return round((value / range.good) * 100);
  }
  return round((range.good / Math.max(value, 0.0001)) * 100);
}

// ================================================================
// Comparativo automático contra el período anterior — un análisis
// publicado de la misma empresa y mismo tipo, con period_end previo.
// ================================================================

export type ComparativoIndicador = {
  valor_actual: number;
  valor_anterior: number;
  variacion_absoluta: number;
  /** % de cambio relativo al valor anterior — null si el valor anterior es 0 o el formato es 'percent' (ver variacion_puntos_porcentuales). */
  variacion_relativa_pct: number | null;
  /** Solo para indicadores de formato 'percent': la variación expresada en puntos porcentuales (p.ej. margen neto de 8% a 10% = +2 puntos). */
  variacion_puntos_porcentuales: number | null;
};

export type ComparativoPeriodoAnterior = {
  period_end_base: string;
  indicadores: Partial<Record<string, Partial<Record<string, ComparativoIndicador>>>>;
};

/**
 * Cuentas crudas (no ratios) que también se comparan período a período —
 * para la "tabla resumen" tipo informe de junta (Ventas Netas, Utilidad Neta,
 * EBIT) que mezcla montos absolutos con indicadores porcentuales/ratio.
 */
export const COMPARATIVO_CUENTAS_DEFS: { key: string; label: string; format: IndicatorFormat }[] = [
  { key: 'ventas', label: 'Ventas Netas', format: 'currency' },
  { key: 'utilidad_neta', label: 'Utilidad Neta', format: 'currency' },
  { key: 'utilidad_operacional', label: 'EBIT', format: 'currency' },
];

function buildComparativoEntry(
  valorActual: unknown,
  valorAnterior: unknown,
  format: IndicatorFormat
): ComparativoIndicador | null {
  if (typeof valorActual !== 'number' || typeof valorAnterior !== 'number') return null;
  if (Number.isNaN(valorActual) || Number.isNaN(valorAnterior)) return null;

  const variacionAbsoluta = round(valorActual - valorAnterior);
  const esPercent = format === 'percent';

  return {
    valor_actual: valorActual,
    valor_anterior: valorAnterior,
    variacion_absoluta: variacionAbsoluta,
    variacion_relativa_pct: esPercent || valorAnterior === 0 ? null : round((variacionAbsoluta / Math.abs(valorAnterior)) * 100),
    variacion_puntos_porcentuales: esPercent ? round(variacionAbsoluta * 100) : null,
  };
}

/**
 * Calcula la variación de cada indicador de `current` contra `previous`
 * (otro `results` ya calculado, típicamente el análisis publicado más
 * reciente con period_end anterior al del análisis actual). Solo incluye
 * indicadores donde ambos valores están disponibles y son numéricos.
 * También compara un set curado de cuentas crudas (ventas, utilidad neta,
 * EBIT) bajo la sección sintética "cuentas", para la tabla resumen tipo
 * informe de junta.
 */
export function computeComparativoPeriodoAnterior(
  current: any,
  previous: any,
  previousPeriodEnd: string
): ComparativoPeriodoAnterior {
  const indicadores: ComparativoPeriodoAnterior['indicadores'] = {};

  for (const section of INDICATOR_SECTIONS) {
    const sectionEntries: Record<string, ComparativoIndicador> = {};

    for (const item of section.items) {
      const entry = buildComparativoEntry(current?.[section.key]?.[item.key], previous?.[section.key]?.[item.key], item.format);
      if (entry) sectionEntries[item.key] = entry;
    }

    if (Object.keys(sectionEntries).length > 0) {
      indicadores[section.key] = sectionEntries;
    }
  }

  const cuentaEntries: Record<string, ComparativoIndicador> = {};
  for (const def of COMPARATIVO_CUENTAS_DEFS) {
    const entry = buildComparativoEntry(
      current?.cuentas_detectadas?.[def.key],
      previous?.cuentas_detectadas?.[def.key],
      def.format
    );
    if (entry) cuentaEntries[def.key] = entry;
  }
  if (Object.keys(cuentaEntries).length > 0) {
    indicadores.cuentas = cuentaEntries;
  }

  return { period_end_base: previousPeriodEnd, indicadores };
}

// ================================================================
// Tendencia / lectura cualitativa — deterministas (no dependen de IA),
// usadas para la "tabla resumen" y el "mapa de riesgos" de la vista de
// detalle y del PDF exportado.
// ================================================================

export type Tendencia = 'mejora' | 'estable' | 'deterioro';

/** Dirección de la variación de un indicador según si "más alto es mejor" o "más bajo es mejor". */
export function getTendencia(key: string, variacionAbsoluta: number | null | undefined): Tendencia {
  if (variacionAbsoluta === null || variacionAbsoluta === undefined || variacionAbsoluta === 0) return 'estable';
  const range = SEMAPHORE_RANGES[key];
  if (!range) return variacionAbsoluta > 0 ? 'mejora' : 'deterioro';
  const isImproving = range.direction === 'higher-better' ? variacionAbsoluta > 0 : variacionAbsoluta < 0;
  return isImproving ? 'mejora' : 'deterioro';
}

/** Lectura corta (una palabra/frase) combinando semáforo + tendencia — para columnas "Lectura"/"Señal". */
export function getLecturaCualitativa(status: SemaphoreStatus, tendencia: Tendencia): string {
  if (status === 'unknown') return 'N/D';
  if (status === 'critical') return 'Crítico';
  if (status === 'good') {
    if (tendencia === 'deterioro') return 'Atención';
    if (tendencia === 'mejora') return 'Excelente';
    return 'Sólido';
  }
  // warning
  if (tendencia === 'mejora') return 'Mejorando';
  if (tendencia === 'deterioro') return 'Deterioro';
  return 'Vigilar';
}

export type RiskMapRow = { indicador: string; nivel: 'verde' | 'amarillo' | 'rojo'; tendencia: string; señal: string };

const STATUS_TO_NIVEL: Record<SemaphoreStatus, 'verde' | 'amarillo' | 'rojo'> = {
  good: 'verde',
  warning: 'amarillo',
  critical: 'rojo',
  unknown: 'amarillo',
};

/**
 * Mapa de riesgos determinista (no depende de la narrativa IA) — mismas
 * filas que un "Mapa de Riesgos y Semaforización Gerencial" de un informe
 * de junta: liquidez, solvencia, márgenes, ROE/ROA, cobertura, inventarios
 * y consistencia contable Balance vs Estado de Resultados.
 */
export function buildRiskMap(results: any): RiskMapRow[] {
  const comparativo: ComparativoPeriodoAnterior | null = results?.comparativo_periodo_anterior ?? null;

  function tendenciaTexto(section: string, key: string): string {
    const entry = (comparativo?.indicadores as any)?.[section]?.[key];
    if (!entry) return '—';
    const t = getTendencia(key, entry.variacion_absoluta);
    return t === 'mejora' ? '↑ Mejora' : t === 'deterioro' ? '↓ Deterioro' : '→ Estable';
  }

  function row(indicador: string, section: string, key: string): RiskMapRow {
    const value = results?.[section]?.[key];
    const status = classifyIndicator(key, value);
    const entry = (comparativo?.indicadores as any)?.[section]?.[key];
    const tendencia = entry ? getTendencia(key, entry.variacion_absoluta) : 'estable';
    return {
      indicador,
      nivel: STATUS_TO_NIVEL[status],
      tendencia: tendenciaTexto(section, key),
      señal: getLecturaCualitativa(status, tendencia),
    };
  }

  const rows: RiskMapRow[] = [
    row('Liquidez (Razón Corriente)', 'liquidez', 'razon_corriente'),
    row('Solvencia (Deuda/Patrimonio)', 'endeudamiento', 'deuda_patrimonio'),
    row('Margen Neto', 'rentabilidad', 'margen_neto'),
    row('ROE', 'rentabilidad', 'roe'),
    row('Cobertura de Intereses', 'endeudamiento', 'cobertura_intereses'),
    row('Ciclo de Inventario (DIO)', 'ciclo_efectivo', 'dio'),
  ];

  const coherencia = results?.coherencia_contable;
  if (coherencia) {
    rows.push({
      indicador: 'Consistencia Utilidad Balance vs Estado de Resultados',
      nivel: coherencia.inconsistente ? 'amarillo' : 'verde',
      tendencia: '—',
      señal: coherencia.inconsistente ? 'Revisar' : 'Consistente',
    });
  }

  return rows;
}
