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
  const entries = Object.entries(row);

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
  };
}
