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
  | 'ventas';

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
};

/**
 * Reglas de matching por palabras clave sobre el label de cada fila (en minúsculas).
 * Orden importa: las más específicas ("total X") van antes que las genéricas
 * ("X corriente") para no confundir "Total Activo" con "Activo Corriente".
 */
const ACCOUNT_RULES: { key: AccountKey; test: (label: string) => boolean; sum?: boolean }[] = [
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
  { key: 'utilidad_neta', test: (l) => l.includes('utilidad') && l.includes('neta') },
  { key: 'gastos_financieros', test: (l) => (l.includes('gasto') || l.includes('costo')) && l.includes('financ') },
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

      if (rule.sum) {
        accounts[rule.key] = (accounts[rule.key] ?? 0) + value;
      } else if (accounts[rule.key] === undefined) {
        accounts[rule.key] = value;
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

export function computeFinancialResults(rows: Record<string, unknown>[]) {
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
  } = accounts;

  const activoCorrienteMenosInventarios =
    activo_corriente !== undefined && inventarios !== undefined ? activo_corriente - inventarios : undefined;

  const warnings: string[] = (Object.keys(ACCOUNT_LABELS) as AccountKey[])
    .filter((key) => accounts[key] === undefined)
    .map((key) => `No se identificó la cuenta "${ACCOUNT_LABELS[key]}" en el archivo — los indicadores que la requieren quedaron sin calcular.`);

  return {
    liquidez: {
      razon_corriente: safeDiv(activo_corriente, pasivo_corriente),
      prueba_acida: safeDiv(activoCorrienteMenosInventarios, pasivo_corriente),
      capital_trabajo: safeSub(activo_corriente, pasivo_corriente),
    },
    endeudamiento: {
      nivel_endeudamiento: safeDiv(total_pasivo, total_activo),
      endeudamiento_financiero: safeDiv(obligaciones_financieras, total_activo),
      cobertura_intereses: safeDiv(utilidad_operacional, gastos_financieros),
    },
    rentabilidad: {
      margen_bruto: safeDiv(utilidad_bruta, ventas),
      margen_operacional: safeDiv(utilidad_operacional, ventas),
      margen_neto: safeDiv(utilidad_neta, ventas),
      roa: safeDiv(utilidad_neta, total_activo),
      roe: safeDiv(utilidad_neta, total_patrimonio),
    },
    cuentas_detectadas: accounts,
    warnings,
  };
}

// ================================================================
// Metadata de presentación — usada por la vista de detalle
// (super admin y cliente) para renderizar/formatear los indicadores.
// ================================================================

export type IndicatorFormat = 'ratio' | 'percent' | 'currency';

export const INDICATOR_SECTIONS: {
  key: 'liquidez' | 'endeudamiento' | 'rentabilidad';
  title: string;
  items: { key: string; label: string; format: IndicatorFormat }[];
}[] = [
  {
    key: 'liquidez',
    title: 'Liquidez',
    items: [
      { key: 'razon_corriente', label: 'Razón Corriente', format: 'ratio' },
      { key: 'prueba_acida', label: 'Prueba Ácida', format: 'ratio' },
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
];

export function formatIndicatorValue(value: number | null | undefined, format: IndicatorFormat): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  if (format === 'percent') return `${(value * 100).toFixed(2)}%`;
  if (format === 'currency') return new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 }).format(value);
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
