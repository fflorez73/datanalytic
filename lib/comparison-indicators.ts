import { classifyIndicator } from './financial-indicators';
import { classifySalesIndicator } from './sales-analytics';
import { classifyInventoryIndicator } from './inventory-analytics';
import { classifyOperationsIndicator } from './operations-analytics';
import { classifyHrIndicator } from './hr-analytics';
import { classifyCostIndicator } from './cost-profitability-analytics';

/**
 * Generaliza la lógica de "Tendencia Histórica" (antes solo financiera, ver
 * IndicatorTrendChart) para cualquiera de los 7 tipos de análisis del
 * catálogo. Cada código define sus 2-3 indicadores principales, tomados
 * directamente de `resumen` (o de las secciones anidadas, en el caso
 * financiero) — el mismo dato ya usado en el dashboard/PDF de cada módulo.
 *
 * Los indicadores sin un umbral de semáforo establecido en su motor (p.ej.
 * totales en moneda, o indicadores del módulo de clientes que no tiene
 * clasificador propio) usan status "unknown" — nunca se inventa un umbral
 * que no exista ya en el motor correspondiente.
 */

export type ComparisonFormat = 'percent' | 'currency' | 'integer' | 'ratio';
export type ComparisonStatus = 'good' | 'warning' | 'critical' | 'unknown';

export type ComparisonIndicator = {
  key: string;
  label: string;
  format: ComparisonFormat;
  value: number | null;
  status: ComparisonStatus;
};

export type ComparisonIndicatorDef = { key: string; label: string; format: ComparisonFormat };

const FINANCIAL_CODES = ['financiero_general', 'flujo_caja', 'cartera_clientes'];

export const COMPARISON_SUPPORTED_CODES = [
  ...FINANCIAL_CODES,
  'clientes',
  'ventas',
  'inventarios',
  'operativo_general',
  'nomina_talento',
  'costos_rentabilidad',
];

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function getComparisonIndicators(code: string, results: unknown): ComparisonIndicator[] {
  const r = results && typeof results === 'object' ? (results as any) : {};

  if (FINANCIAL_CODES.includes(code)) {
    const razonCorriente = asNumber(r.liquidez?.razon_corriente);
    const nivelEndeudamientoRaw = asNumber(r.endeudamiento?.nivel_endeudamiento);
    const margenNetoRaw = asNumber(r.rentabilidad?.margen_neto);
    return [
      { key: 'razon_corriente', label: 'Razón Corriente', format: 'ratio', value: razonCorriente, status: classifyIndicator('razon_corriente', razonCorriente) },
      {
        key: 'nivel_endeudamiento',
        label: 'Nivel de Endeudamiento',
        format: 'percent',
        value: nivelEndeudamientoRaw !== null ? nivelEndeudamientoRaw * 100 : null,
        status: classifyIndicator('nivel_endeudamiento', nivelEndeudamientoRaw),
      },
      {
        key: 'margen_neto',
        label: 'Margen Neto',
        format: 'percent',
        value: margenNetoRaw !== null ? margenNetoRaw * 100 : null,
        status: classifyIndicator('margen_neto', margenNetoRaw),
      },
    ];
  }

  if (code === 'clientes') {
    const resumen = r.resumen ?? null;
    return [
      { key: 'ingreso_total', label: 'Ingreso Total', format: 'currency', value: asNumber(resumen?.ingresoTotal), status: 'unknown' },
      { key: 'pct_ingreso_riesgo', label: '% Ingreso en Riesgo', format: 'percent', value: asNumber(resumen?.pctIngresoRiesgo), status: 'unknown' },
      { key: 'ticket_promedio', label: 'Ticket Promedio Ponderado', format: 'currency', value: asNumber(resumen?.ticketPromedioPonderado), status: 'unknown' },
    ];
  }

  if (code === 'ventas') {
    const resumen = r.resumen ?? null;
    const margenBrutoPct = asNumber(resumen?.margenBrutoPct);
    return [
      { key: 'ventas_totales', label: 'Ventas Totales', format: 'currency', value: asNumber(resumen?.ventasTotales), status: 'unknown' },
      { key: 'margen_bruto_pct', label: 'Margen Bruto', format: 'percent', value: margenBrutoPct, status: classifySalesIndicator('margen_bruto_pct', margenBrutoPct) },
      { key: 'ticket_promedio', label: 'Ticket Promedio', format: 'currency', value: asNumber(resumen?.ticketPromedio), status: 'unknown' },
    ];
  }

  if (code === 'inventarios') {
    const resumen = r.resumen ?? null;
    const rotacionAnualizada = asNumber(resumen?.rotacionAnualizada);
    const coberturaDiasPromedio = asNumber(resumen?.coberturaDiasPromedio);
    const pctValorRiesgoQuiebre = asNumber(resumen?.pctValorRiesgoQuiebre);
    return [
      { key: 'rotacion_anualizada', label: 'Rotación Anualizada', format: 'ratio', value: rotacionAnualizada, status: classifyInventoryIndicator('rotacion_anualizada', rotacionAnualizada) },
      { key: 'cobertura_dias_promedio', label: 'Cobertura Promedio', format: 'integer', value: coberturaDiasPromedio, status: classifyInventoryIndicator('cobertura_dias_promedio', coberturaDiasPromedio) },
      {
        key: 'pct_valor_riesgo_quiebre',
        label: '% Valor en Riesgo de Quiebre',
        format: 'percent',
        value: pctValorRiesgoQuiebre,
        status: classifyInventoryIndicator('pct_valor_riesgo_quiebre', pctValorRiesgoQuiebre),
      },
    ];
  }

  if (code === 'operativo_general') {
    const resumen = r.resumen ?? null;
    const utilizacion = asNumber(resumen?.utilizacionCapacidadPromedio);
    const cumplimiento = asNumber(resumen?.cumplimientoMetaPromedio);
    const tasaDefectos = asNumber(resumen?.tasaDefectosPromedio);
    return [
      { key: 'utilizacion_capacidad_promedio', label: 'Utilización de Capacidad', format: 'percent', value: utilizacion, status: classifyOperationsIndicator('utilizacion_capacidad_promedio', utilizacion) },
      { key: 'cumplimiento_meta_promedio', label: 'Cumplimiento de Meta', format: 'percent', value: cumplimiento, status: classifyOperationsIndicator('cumplimiento_meta_promedio', cumplimiento) },
      { key: 'tasa_defectos_promedio', label: 'Tasa de Defectos', format: 'percent', value: tasaDefectos, status: classifyOperationsIndicator('tasa_defectos_promedio', tasaDefectos) },
    ];
  }

  if (code === 'nomina_talento') {
    const resumen = r.resumen ?? null;
    const tasaRotacion = asNumber(resumen?.tasaRotacionPct);
    const ausentismo = asNumber(resumen?.ausentismoPromedioPct);
    return [
      { key: 'costo_nomina_total', label: 'Costo Total Nómina', format: 'currency', value: asNumber(resumen?.costoNominaTotal), status: 'unknown' },
      { key: 'tasa_rotacion', label: 'Tasa de Rotación', format: 'percent', value: tasaRotacion, status: classifyHrIndicator('tasa_rotacion', tasaRotacion) },
      { key: 'ausentismo_promedio', label: 'Ausentismo Promedio', format: 'percent', value: ausentismo, status: classifyHrIndicator('ausentismo_promedio', ausentismo) },
    ];
  }

  if (code === 'costos_rentabilidad') {
    const resumen = r.resumen ?? null;
    const margenContribucion = asNumber(resumen?.margenContribucionPromedioPct);
    const roi = asNumber(resumen?.roiConsolidadoPct);
    return [
      { key: 'utilidad_neta_total', label: 'Utilidad Neta Total', format: 'currency', value: asNumber(resumen?.utilidadNetaTotal), status: 'unknown' },
      {
        key: 'margen_contribucion_promedio_pct',
        label: 'Margen de Contribución',
        format: 'percent',
        value: margenContribucion,
        status: classifyCostIndicator('margen_contribucion_promedio_pct', margenContribucion),
      },
      { key: 'roi_consolidado_pct', label: 'ROI Consolidado', format: 'percent', value: roi, status: classifyCostIndicator('roi_consolidado_pct', roi) },
    ];
  }

  return [];
}

/** Solo key/label/format — estables independientemente de los datos de un período concreto. */
export function getComparisonIndicatorDefs(code: string): ComparisonIndicatorDef[] {
  return getComparisonIndicators(code, {}).map(({ key, label, format }) => ({ key, label, format }));
}

export function formatComparisonValue(value: number | null | undefined, format: ComparisonFormat): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  if (format === 'percent') return `${value.toFixed(1)}%`;
  if (format === 'currency') return `$${new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 }).format(value)}`;
  if (format === 'integer') return new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 }).format(value);
  return value.toFixed(2);
}
