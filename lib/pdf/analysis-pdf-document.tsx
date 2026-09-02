import 'server-only';
import { Document, Page, Path, Svg, Text, View, StyleSheet } from '@react-pdf/renderer';
import {
  INDICATOR_SECTIONS,
  KPI_HEADLINE_DEFS,
  buildRiskMap,
  classifyIndicator,
  formatIndicatorValue,
  getLecturaCualitativa,
  getTendencia,
  scoreVsIdeal,
  type ComparativoPeriodoAnterior,
  type IndicatorFormat,
} from '@/lib/financial-indicators';
import { STATUS_HEX } from '@/lib/status-colors';
import type { FinancialNarrative } from '@/lib/generate-narrative';
import { AiProviderPdfNote } from '@/lib/pdf/ai-provider-note';

/**
 * Los 14 fonts estándar de PDF (Helvetica incluida) usan WinAnsiEncoding —
 * varios signos de puntuación Unicode que el modelo escribe con naturalidad
 * (raya —, en dash –, signo menos matemático −, comillas tipográficas) no
 * tienen métrica definida ahí y @react-pdf/renderer los descarta en
 * silencio (p.ej. "ROE−ROA" queda como "ROEROA"). Se sanea SOLO para el PDF;
 * la UI web no tiene esta limitación y conserva la tipografía original.
 */
function sanitizeForPdf(text: unknown): string {
  if (typeof text !== 'string') return '';
  return text
    .replace(/[–—−]/g, '-')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/…/g, '...');
}

/**
 * El esquema de `narrative` cambió varias veces a lo largo del proyecto
 * (la versión más antigua solo tenía resumen_ejecutivo/alertas/observaciones/
 * tendencia/recomendacion) y las filas JSONB ya guardadas en la base de datos
 * NUNCA se migran retroactivamente a la forma nueva. Un análisis viejo puede
 * llegar aquí con secciones/riesgos/senales_alerta/recomendaciones ausentes —
 * hacer .map() directo sobre esos campos (como se hacía antes) revienta con
 * "Cannot read properties of undefined (reading 'map')" en cuanto alguien
 * pide el PDF de un análisis creado antes de este esquema. Por eso cada
 * campo-array se normaliza con Array.isArray(...) ? ... : [] en vez de
 * asumir que siempre existe.
 */
function sanitizeNarrativeForPdf(n: FinancialNarrative | null): FinancialNarrative | null {
  if (!n) return null;
  return {
    resumen_ejecutivo: sanitizeForPdf(n.resumen_ejecutivo),
    dictamen: n.dictamen,
    hallazgos_clave: Array.isArray(n.hallazgos_clave) ? n.hallazgos_clave.map(sanitizeForPdf) : [],
    secciones: Array.isArray(n.secciones)
      ? n.secciones.map((s) => ({ titulo: sanitizeForPdf(s?.titulo), analisis: sanitizeForPdf(s?.analisis) }))
      : [],
    riesgos: Array.isArray(n.riesgos) ? n.riesgos.map((r) => ({ ...r, descripcion: sanitizeForPdf(r?.descripcion) })) : [],
    senales_alerta: Array.isArray(n.senales_alerta) ? n.senales_alerta.map(sanitizeForPdf) : [],
    recomendaciones: Array.isArray(n.recomendaciones)
      ? n.recomendaciones.map((r) => ({
          accion: sanitizeForPdf(r?.accion),
          responsable_sugerido: sanitizeForPdf(r?.responsable_sugerido),
          horizonte: sanitizeForPdf(r?.horizonte),
        }))
      : [],
    conclusion: sanitizeForPdf(n.conclusion),
    ai_provider: n.ai_provider,
  };
}

const DICTAMEN_COLOR: Record<string, string> = {
  favorable: '#059669',
  favorable_con_observaciones: '#2563eb',
  requiere_atencion: '#d97706',
  critico: '#dc2626',
};

const DICTAMEN_LABEL: Record<string, string> = {
  favorable: 'Dictamen favorable',
  favorable_con_observaciones: 'Favorable con observaciones',
  requiere_atencion: 'Requiere atención',
  critico: 'Crítico',
};

const RIESGO_NIVEL_LABEL: Record<string, string> = {
  verde: 'Riesgo bajo',
  amarillo: 'Riesgo medio',
  rojo: 'Riesgo alto',
};

const RIESGO_NIVEL_COLOR: Record<string, string> = {
  verde: '#16a34a',
  amarillo: '#d97706',
  rojo: '#dc2626',
};

const PRIORIDAD_LABEL: Record<string, string> = { alta: 'PRIORIDAD ALTA', media: 'PRIORIDAD MEDIA', baja: 'PRIORIDAD BAJA' };
const PRIORIDAD_RANK: Record<string, number> = { alta: 0, media: 1, baja: 2 };

const NIVEL_ROW_BG: Record<string, string> = { verde: '#f0fdf4', amarillo: '#fffbeb', rojo: '#fef2f2' };
const NIVEL_LABEL: Record<string, string> = { verde: 'Verde', amarillo: 'Amarillo', rojo: 'Rojo' };
const NIVEL_COLOR: Record<string, string> = { verde: '#16a34a', amarillo: '#d97706', rojo: '#dc2626' };

const RESUMEN_TABLA_DEFS: { section: string; key: string; label: string; format: IndicatorFormat }[] = [
  { section: 'cuentas', key: 'ventas', label: 'Ventas Netas', format: 'currency' },
  { section: 'cuentas', key: 'utilidad_neta', label: 'Utilidad Neta', format: 'currency' },
  { section: 'rentabilidad', key: 'margen_neto', label: 'Margen Neto', format: 'percent' },
  { section: 'rentabilidad', key: 'roe', label: 'ROE', format: 'percent' },
  { section: 'rentabilidad', key: 'roa', label: 'ROA', format: 'percent' },
  { section: 'liquidez', key: 'razon_corriente', label: 'Current Ratio', format: 'ratio' },
  { section: 'endeudamiento', key: 'deuda_patrimonio', label: 'Deuda / Patrimonio', format: 'ratio' },
  { section: 'ciclo_efectivo', key: 'ccc', label: 'CCC (días)', format: 'days' },
];

const FORMULAS: { indicador: string; formula: string }[] = [
  { indicador: 'Margen Bruto', formula: 'Utilidad Bruta / Ventas × 100' },
  { indicador: 'Margen Operacional (EBIT)', formula: 'EBIT / Ventas × 100' },
  { indicador: 'Margen Neto', formula: 'Utilidad Neta / Ventas × 100' },
  { indicador: 'ROA', formula: 'Utilidad Neta / Activo Total × 100' },
  { indicador: 'ROE', formula: 'Utilidad Neta / Patrimonio × 100' },
  { indicador: 'DuPont 3F', formula: 'ROE = (UN/Ventas) × (Ventas/Activo) × (Activo/Patrimonio)' },
  { indicador: 'Carga Financiera', formula: 'EBIT / Utilidad Antes de Impuestos (EBT)' },
  { indicador: 'Carga Fiscal Efectiva', formula: 'Impuesto de Renta / EBT' },
  { indicador: 'Current Ratio', formula: 'Activo Corriente / Pasivo Corriente' },
  { indicador: 'Quick Ratio (Prueba Ácida)', formula: '(Activo Corriente - Inventarios) / Pasivo Corriente' },
  { indicador: 'Cash Ratio', formula: 'Efectivo y Equivalentes / Pasivo Corriente' },
  { indicador: 'D/E (Deuda/Patrimonio)', formula: 'Pasivo Total / Patrimonio' },
  { indicador: 'Cobertura de Intereses', formula: 'EBIT / Gastos Financieros' },
  { indicador: 'DSO (Días de Cartera)', formula: 'Cuentas por Cobrar / (Ventas / días del período)' },
  { indicador: 'DIO (Días de Inventario)', formula: 'Inventarios / (Costo de Ventas / días del período)' },
  { indicador: 'DPO (Días de Proveedores)', formula: 'Cuentas por Pagar / (Costo de Ventas / días del período)' },
  { indicador: 'CCC (Ciclo de Conversión de Efectivo)', formula: 'DSO + DIO - DPO' },
];

const styles = StyleSheet.create({
  cover: {
    padding: 56,
    backgroundColor: '#0f172a',
    color: '#ffffff',
    height: '100%',
    justifyContent: 'space-between',
    fontFamily: 'Helvetica',
  },
  coverEyebrow: { fontSize: 11, color: '#93c5fd', textTransform: 'uppercase', letterSpacing: 1 },
  coverCompany: { fontSize: 26, fontFamily: 'Helvetica-Bold', marginTop: 10 },
  coverTitle: { fontSize: 15, color: '#cbd5e1', marginTop: 6 },
  coverConfidential: {
    fontSize: 11,
    fontFamily: 'Helvetica-Bold',
    color: '#fecaca',
    marginTop: 18,
    letterSpacing: 0.5,
  },
  coverMetaRow: { flexDirection: 'row', marginTop: 24, gap: 24 },
  coverMetaLabel: { fontSize: 9, color: '#94a3b8', textTransform: 'uppercase' },
  coverMetaValue: { fontSize: 12, color: '#ffffff', marginTop: 3 },
  coverFooter: { fontSize: 9, color: '#94a3b8' },

  page: { paddingTop: 44, paddingBottom: 40, paddingHorizontal: 40, fontFamily: 'Helvetica', fontSize: 10, color: '#1e293b' },
  pageHeader: {
    position: 'absolute',
    top: 16,
    left: 40,
    right: 40,
    flexDirection: 'row',
    justifyContent: 'space-between',
    fontSize: 8,
    color: '#94a3b8',
    borderBottomWidth: 0.5,
    borderBottomColor: '#e2e8f0',
    paddingBottom: 6,
  },
  footer: {
    position: 'absolute',
    bottom: 20,
    left: 40,
    right: 40,
    flexDirection: 'row',
    justifyContent: 'space-between',
    fontSize: 8,
    color: '#94a3b8',
    borderTopWidth: 0.5,
    borderTopColor: '#e2e8f0',
    paddingTop: 6,
  },

  h1: { fontSize: 16, fontFamily: 'Helvetica-Bold', color: '#0f172a', marginBottom: 12 },
  h2: { fontSize: 12, fontFamily: 'Helvetica-Bold', color: '#0f172a', marginBottom: 8, marginTop: 4 },
  muted: { fontSize: 9, color: '#64748b' },
  paragraph: { fontSize: 10.5, lineHeight: 1.5, color: '#334155' },

  alertBox: {
    borderWidth: 1.5,
    borderColor: '#dc2626',
    backgroundColor: '#fef2f2',
    borderRadius: 6,
    padding: 12,
    marginBottom: 16,
  },
  alertLabel: { fontSize: 8.5, fontFamily: 'Helvetica-Bold', color: '#b91c1c', textTransform: 'uppercase', marginBottom: 3 },
  alertText: { fontSize: 10, color: '#991b1b', lineHeight: 1.4 },

  dictamenBanner: { borderRadius: 6, padding: 14, marginBottom: 16 },
  dictamenBannerLabel: { fontSize: 8.5, color: '#ffffff', opacity: 0.85, textTransform: 'uppercase', marginBottom: 3 },
  dictamenBannerValue: { fontSize: 15, fontFamily: 'Helvetica-Bold', color: '#ffffff' },

  kpiRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  kpiCard: { flex: 1, borderRadius: 6, backgroundColor: '#eff6ff', padding: 10, borderWidth: 1, borderColor: '#dbeafe' },
  kpiValue: { fontSize: 15, fontFamily: 'Helvetica-Bold', color: '#0f172a' },
  kpiLabel: { fontSize: 8, color: '#64748b', marginTop: 2 },

  section: { marginBottom: 18 },
  barRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 6, gap: 8 },
  barLabelCol: { width: 130 },
  barLabel: { fontSize: 9, color: '#334155' },
  barTrackCol: { flex: 1, height: 8, borderRadius: 4, backgroundColor: '#e2e8f0' },
  barFill: { height: 8, borderRadius: 4 },
  barValueCol: { width: 60, textAlign: 'right' },
  barValue: { fontSize: 9, fontFamily: 'Helvetica-Bold', color: '#0f172a' },

  table: { marginTop: 4 },
  tableHeaderRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#cbd5e1', paddingBottom: 4, marginBottom: 4 },
  tableRow: { flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: '#e2e8f0', paddingVertical: 4 },
  tableHeaderCell: { fontSize: 8, color: '#64748b', textTransform: 'uppercase' },
  tableCell: { fontSize: 9.5, color: '#334155' },
  dot: { width: 7, height: 7, borderRadius: 3.5 },

  listItem: { flexDirection: 'row', gap: 6, marginBottom: 5 },
  listBullet: { fontSize: 9.5, color: '#2563eb' },
  listText: { fontSize: 9.5, color: '#334155', flex: 1, lineHeight: 1.4 },
  bulletLarge: { fontSize: 12.5, color: '#334155', flex: 1, lineHeight: 1.5, fontFamily: 'Helvetica-Bold' },

  riskCard: { borderRadius: 5, borderWidth: 1, padding: 8, marginBottom: 6 },
  riskBadge: { fontSize: 8, fontFamily: 'Helvetica-Bold', marginBottom: 3 },
  riskText: { fontSize: 9.5, color: '#334155', lineHeight: 1.35 },

  recCard: { marginBottom: 10, paddingBottom: 8, borderBottomWidth: 0.5, borderBottomColor: '#e2e8f0' },
  recTitle: { fontSize: 10.5, fontFamily: 'Helvetica-Bold', color: '#0f172a', marginBottom: 2 },
  recMeta: { fontSize: 8.5, color: '#64748b', fontFamily: 'Helvetica-Oblique' },
});

function PageChrome({ companyName, generatedAt }: { companyName: string; generatedAt: string }) {
  return (
    <>
      <View style={styles.pageHeader} fixed>
        <Text>Análisis Financiero Integral - {companyName}</Text>
        <Text>Uso exclusivo Junta Directiva</Text>
      </View>
      <View style={styles.footer} fixed>
        <Text render={({ pageNumber }) => `Página ${pageNumber - 1} | Confidencial - Junta Directiva`} />
        <Text>Generado el {generatedAt}</Text>
      </View>
    </>
  );
}

function BarRow({ label, valueLabel, pct, color }: { label: string; valueLabel: string; pct: number; color: string }) {
  const clamped = Math.max(2, Math.min(100, pct));
  return (
    <View style={styles.barRow}>
      <View style={styles.barLabelCol}>
        <Text style={styles.barLabel}>{label}</Text>
      </View>
      <View style={styles.barTrackCol}>
        <View style={[styles.barFill, { width: `${clamped}%`, backgroundColor: color }]} />
      </View>
      <View style={styles.barValueCol}>
        <Text style={styles.barValue}>{valueLabel}</Text>
      </View>
    </View>
  );
}

function SectionBars({ items }: { items: { key: string; label: string; format: IndicatorFormat; value: number | null }[] }) {
  return (
    <>
      {items.map((item) => {
        const score = scoreVsIdeal(item.key, item.value);
        if (score === null) return null;
        return (
          <BarRow
            key={item.key}
            label={item.label}
            valueLabel={formatIndicatorValue(item.value, item.format)}
            pct={score}
            color={STATUS_HEX[classifyIndicator(item.key, item.value)]}
          />
        );
      })}
    </>
  );
}

function IndicatorPdfTable({
  items,
}: {
  items: { key: string; label: string; format: IndicatorFormat; value: number | null }[];
}) {
  return (
    <View style={styles.table}>
      <View style={styles.tableHeaderRow}>
        <Text style={[styles.tableHeaderCell, { flex: 1 }]}>Indicador</Text>
        <Text style={[styles.tableHeaderCell, { width: 70, textAlign: 'right' }]}>Valor</Text>
        <Text style={[styles.tableHeaderCell, { width: 20, textAlign: 'right' }]}> </Text>
      </View>
      {items.map((item) => {
        const status = classifyIndicator(item.key, item.value);
        return (
          <View key={item.key} style={styles.tableRow}>
            <Text style={[styles.tableCell, { flex: 1 }]}>{item.label}</Text>
            <Text style={[styles.tableCell, { width: 70, textAlign: 'right', fontFamily: 'Helvetica-Bold' }]}>
              {formatIndicatorValue(item.value, item.format)}
            </Text>
            <View style={{ width: 20, alignItems: 'flex-end' }}>
              <View style={[styles.dot, { backgroundColor: STATUS_HEX[status] }]} />
            </View>
          </View>
        );
      })}
    </View>
  );
}

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const angleRad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(angleRad), y: cy + r * Math.sin(angleRad) };
}

function describeSlice(cx: number, cy: number, r: number, startAngle: number, endAngle: number): string {
  const start = polarToCartesian(cx, cy, r, endAngle);
  const end = polarToCartesian(cx, cy, r, startAngle);
  const largeArcFlag = endAngle - startAngle <= 180 ? '0' : '1';
  return `M ${cx} ${cy} L ${start.x} ${start.y} A ${r} ${r} 0 ${largeArcFlag} 0 ${end.x} ${end.y} Z`;
}

function PieChartPdf({ title, data }: { title: string; data: { label: string; value: number; color: string }[] }) {
  const items = data.filter((d) => typeof d.value === 'number' && d.value > 0);
  if (items.length === 0) return null;
  const total = items.reduce((sum, d) => sum + d.value, 0);

  let cumulative = 0;
  const slices = items.map((d) => {
    const startAngle = (cumulative / total) * 360;
    cumulative += d.value;
    const endAngle = (cumulative / total) * 360;
    return { ...d, path: describeSlice(55, 55, 50, startAngle, endAngle) };
  });

  return (
    <View style={{ flex: 1 }}>
      <Text style={{ fontSize: 9.5, fontFamily: 'Helvetica-Bold', color: '#334155', marginBottom: 6, textAlign: 'center' }}>
        {title}
      </Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Svg width={110} height={110} viewBox="0 0 110 110">
          {slices.map((s, i) => (
            <Path key={i} d={s.path} fill={s.color} />
          ))}
        </Svg>
        <View style={{ flex: 1 }}>
          {items.map((d, i) => (
            <View key={i} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4, gap: 5 }}>
              <View style={{ width: 7, height: 7, backgroundColor: d.color, borderRadius: 3.5 }} />
              <Text style={{ fontSize: 8.5, color: '#334155' }}>
                {d.label}: {(d.value * 100).toFixed(1)}%
              </Text>
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}

export function AnalysisPdfDocument({
  companyName,
  title,
  analysisTypeName,
  periodStart,
  periodEnd,
  status,
  results,
  narrative: narrativeInput,
  generatedAt,
}: {
  companyName: string;
  title: string;
  analysisTypeName: string;
  periodStart: string;
  periodEnd: string;
  status: string;
  results: any;
  narrative: FinancialNarrative | null;
  generatedAt: string;
}) {
  const narrative = sanitizeNarrativeForPdf(narrativeInput);
  const resultsObj = results && typeof results === 'object' ? results : {};
  const comparativo: ComparativoPeriodoAnterior | null = resultsObj.comparativo_periodo_anterior ?? null;
  const cuentas = resultsObj.cuentas_detectadas ?? {};
  const coherencia = resultsObj.coherencia_contable ?? null;
  const coherenciaMensaje = coherencia?.mensaje ? sanitizeForPdf(coherencia.mensaje) : null;
  const hasIndicators = Boolean(
    resultsObj.liquidez || resultsObj.endeudamiento || resultsObj.rentabilidad || resultsObj.dupont || resultsObj.ciclo_efectivo
  );

  const kpiCards = KPI_HEADLINE_DEFS.map((def) => {
    const value = resultsObj[def.section]?.[def.key];
    if (value === null || value === undefined) return null;
    return { label: def.label, value: formatIndicatorValue(value, def.format) };
  }).filter((k): k is NonNullable<typeof k> => k !== null);

  if (typeof cuentas.utilidad_neta === 'number') {
    kpiCards.push({ label: 'Utilidad Neta', value: formatIndicatorValue(cuentas.utilidad_neta, 'currency') });
  }

  const liquidezSection = INDICATOR_SECTIONS.find((s) => s.key === 'liquidez')!;
  const endeudamientoSection = INDICATOR_SECTIONS.find((s) => s.key === 'endeudamiento')!;
  const rentabilidadSection = INDICATOR_SECTIONS.find((s) => s.key === 'rentabilidad')!;
  const dupontSection = INDICATOR_SECTIONS.find((s) => s.key === 'dupont')!;
  const cicloSection = INDICATOR_SECTIONS.find((s) => s.key === 'ciclo_efectivo')!;

  function itemsFor(section: typeof liquidezSection) {
    return section.items.map((item) => ({ ...item, value: (resultsObj[section.key]?.[item.key] ?? null) as number | null }));
  }

  // Debe devolver undefined (no '') cuando no hay texto — "" && <Text>...</Text>
  // evalúa a "" (string vacío truthy-falsy ambiguo), y @react-pdf/renderer
  // exige que todo string hijo esté envuelto en <Text>: un "" suelto como
  // hijo directo de <View>/<Page> es "Invalid '' string child outside <Text>
  // component". Con undefined, `undefined && <Text>` es undefined y React
  // lo ignora limpiamente.
  function findSeccion(tituloBuscado: string): string | undefined {
    const analisis = narrative?.secciones?.find((s) => s.titulo === tituloBuscado)?.analisis;
    return analisis ? analisis : undefined;
  }

  const activosPieData = resultsObj.composicion_activos
    ? [
        { label: 'Efectivo', value: resultsObj.composicion_activos.efectivo_pct, color: '#2a78d6' },
        { label: 'CxC', value: resultsObj.composicion_activos.cxc_pct, color: '#eb6834' },
        { label: 'Inventarios', value: resultsObj.composicion_activos.inventarios_pct, color: '#1baf7a' },
        { label: 'Otros AC', value: resultsObj.composicion_activos.otros_ac_pct, color: '#eda100' },
        { label: 'Activo NC', value: resultsObj.composicion_activos.activo_nc_pct, color: '#4a3aa7' },
      ]
    : [];

  const financiacionPieData = resultsObj.composicion_financiacion
    ? [
        { label: 'Pasivo CP', value: resultsObj.composicion_financiacion.pasivo_cp_pct, color: '#eb6834' },
        { label: 'Pasivo LP', value: resultsObj.composicion_financiacion.pasivo_lp_pct, color: '#e34948' },
        { label: 'Patrimonio', value: resultsObj.composicion_financiacion.patrimonio_pct, color: '#008300' },
      ]
    : [];

  const riskMap = hasIndicators ? buildRiskMap(resultsObj) : [];
  const riesgosOrdenados = narrative?.riesgos
    ? [...narrative.riesgos].sort((a, b) => (PRIORIDAD_RANK[a.prioridad] ?? 1) - (PRIORIDAD_RANK[b.prioridad] ?? 1))
    : [];

  const chrome = <PageChrome companyName={companyName} generatedAt={generatedAt} />;

  return (
    <Document title={`${title} — ${companyName}`} author="Datanalytic">
      {/* ── Portada ── */}
      <Page size="A4" style={styles.cover}>
        <View>
          <Text style={styles.coverEyebrow}>Informe Ejecutivo · Diagnóstico Integral</Text>
          <Text style={styles.coverCompany}>{companyName}</Text>
          <Text style={styles.coverTitle}>{title}</Text>
          <Text style={styles.coverConfidential}>CONFIDENCIAL - USO EXCLUSIVO JUNTA DIRECTIVA</Text>

          <View style={styles.coverMetaRow}>
            <View>
              <Text style={styles.coverMetaLabel}>Período</Text>
              <Text style={styles.coverMetaValue}>
                {periodStart} - {periodEnd}
              </Text>
            </View>
            <View>
              <Text style={styles.coverMetaLabel}>Tipo de análisis</Text>
              <Text style={styles.coverMetaValue}>{analysisTypeName}</Text>
            </View>
            <View>
              <Text style={styles.coverMetaLabel}>Estado</Text>
              <Text style={styles.coverMetaValue}>{status === 'published' ? 'Publicado' : 'Borrador'}</Text>
            </View>
          </View>
        </View>

        <View>
          <Text style={styles.coverFooter}>Documento de uso exclusivo de la Junta Directiva</Text>
          <Text style={[styles.coverFooter, { marginTop: 2 }]}>Generado el {generatedAt}</Text>
        </View>
      </Page>

      {/* ── Hallazgos clave + tabla resumen ── */}
      <Page size="A4" style={styles.page}>
        {chrome}
        <Text style={styles.h1}>Hallazgos Clave</Text>

        {coherencia?.inconsistente && (
          <View style={styles.alertBox} wrap={false}>
            <Text style={styles.alertLabel}>Alerta de prioridad alta - Verificación de coherencia contable</Text>
            <Text style={styles.alertText}>{coherenciaMensaje}</Text>
          </View>
        )}

        {narrative?.dictamen && (
          <View style={[styles.dictamenBanner, { backgroundColor: DICTAMEN_COLOR[narrative.dictamen] || '#2563eb' }]}>
            <Text style={styles.dictamenBannerLabel}>Dictamen</Text>
            <Text style={styles.dictamenBannerValue}>{DICTAMEN_LABEL[narrative.dictamen] || narrative.dictamen}</Text>
          </View>
        )}

        {kpiCards.length > 0 && (
          <View style={styles.kpiRow}>
            {kpiCards.map((k) => (
              <View key={k.label} style={styles.kpiCard}>
                <Text style={styles.kpiValue}>{k.value}</Text>
                <Text style={styles.kpiLabel}>{k.label}</Text>
              </View>
            ))}
          </View>
        )}

        {narrative && narrative.resumen_ejecutivo.length > 0 && (
          <Text style={[styles.paragraph, { marginBottom: 14 }]}>{narrative.resumen_ejecutivo}</Text>
        )}

        {narrative && narrative.hallazgos_clave?.length > 0 && (
          <View style={[styles.section, { marginTop: 6 }]}>
            {narrative.hallazgos_clave.map((h, i) => (
              <View key={i} style={styles.listItem} wrap={false}>
                <Text style={styles.listBullet}>•</Text>
                <Text style={styles.bulletLarge}>{h}</Text>
              </View>
            ))}
          </View>
        )}

        {comparativo && (
          <View style={styles.section}>
            <Text style={styles.h2}>Tabla Resumen</Text>
            <View style={styles.tableHeaderRow}>
              <Text style={[styles.tableHeaderCell, { flex: 1.4 }]}>Indicador</Text>
              <Text style={[styles.tableHeaderCell, { flex: 1, textAlign: 'right' }]}>Anterior</Text>
              <Text style={[styles.tableHeaderCell, { flex: 1, textAlign: 'right' }]}>Actual</Text>
              <Text style={[styles.tableHeaderCell, { flex: 1, textAlign: 'right' }]}>Var.</Text>
              <Text style={[styles.tableHeaderCell, { flex: 1, textAlign: 'right' }]}>Lectura</Text>
            </View>
            {RESUMEN_TABLA_DEFS.map((def) => {
              const entry = (comparativo.indicadores as any)?.[def.section]?.[def.key];
              if (!entry) return null;
              const variacion =
                entry.variacion_puntos_porcentuales !== null
                  ? `${entry.variacion_puntos_porcentuales >= 0 ? '+' : ''}${entry.variacion_puntos_porcentuales.toFixed(1)} pp`
                  : entry.variacion_relativa_pct !== null
                    ? `${entry.variacion_relativa_pct >= 0 ? '+' : ''}${entry.variacion_relativa_pct.toFixed(1)}%`
                    : `${entry.variacion_absoluta >= 0 ? '+' : ''}${entry.variacion_absoluta}`;
              const status = classifyIndicator(def.key, entry.valor_actual);
              const tendencia = getTendencia(def.key, entry.variacion_absoluta);
              const lectura = getLecturaCualitativa(status, tendencia);
              return (
                <View key={`${def.section}.${def.key}`} style={styles.tableRow}>
                  <Text style={[styles.tableCell, { flex: 1.4 }]}>{def.label}</Text>
                  <Text style={[styles.tableCell, { flex: 1, textAlign: 'right' }]}>
                    {formatIndicatorValue(entry.valor_anterior, def.format)}
                  </Text>
                  <Text style={[styles.tableCell, { flex: 1, textAlign: 'right', fontFamily: 'Helvetica-Bold' }]}>
                    {formatIndicatorValue(entry.valor_actual, def.format)}
                  </Text>
                  <Text style={[styles.tableCell, { flex: 1, textAlign: 'right' }]}>{variacion}</Text>
                  <Text style={[styles.tableCell, { flex: 1, textAlign: 'right', color: STATUS_HEX[status], fontFamily: 'Helvetica-Bold' }]}>
                    {lectura}
                  </Text>
                </View>
              );
            })}
          </View>
        )}
      </Page>

      {/* ── Diagnóstico de Rentabilidad ── */}
      {hasIndicators && (
        <Page size="A4" style={styles.page}>
          {chrome}
          <Text style={styles.h1}>Diagnóstico de Rentabilidad</Text>
          {findSeccion('Diagnóstico de Rentabilidad') && (
            <Text style={[styles.paragraph, { marginBottom: 14 }]}>{findSeccion('Diagnóstico de Rentabilidad')}</Text>
          )}
          <SectionBars items={itemsFor(rentabilidadSection)} />
          <IndicatorPdfTable items={itemsFor(rentabilidadSection)} />
        </Page>
      )}

      {/* ── ROE mediante DuPont + ROA y Creación de Valor ── */}
      {hasIndicators && (
        <Page size="A4" style={styles.page}>
          {chrome}
          <Text style={styles.h1}>ROE mediante DuPont</Text>
          {findSeccion('ROE mediante DuPont') && (
            <Text style={[styles.paragraph, { marginBottom: 14 }]}>{findSeccion('ROE mediante DuPont')}</Text>
          )}
          <SectionBars items={itemsFor(dupontSection).filter((i) => scoreVsIdeal(i.key, i.value) !== null)} />
          <IndicatorPdfTable items={itemsFor(dupontSection)} />

          {findSeccion('ROA y Creación de Valor') && (
            <View style={[styles.section, { marginTop: 20 }]}>
              <Text style={styles.h2}>ROA y Creación de Valor</Text>
              <Text style={styles.paragraph}>{findSeccion('ROA y Creación de Valor')}</Text>
            </View>
          )}
        </Page>
      )}

      {/* ── Estructura Financiera y Solvencia + composición ── */}
      {hasIndicators && (
        <Page size="A4" style={styles.page}>
          {chrome}
          <Text style={styles.h1}>Estructura Financiera y Solvencia</Text>
          {findSeccion('Estructura Financiera y Solvencia') && (
            <Text style={[styles.paragraph, { marginBottom: 14 }]}>{findSeccion('Estructura Financiera y Solvencia')}</Text>
          )}

          {(activosPieData.length > 0 || financiacionPieData.length > 0) && (
            <View style={[styles.section, { flexDirection: 'row', gap: 16 }]}>
              <PieChartPdf title="Composición de Activos" data={activosPieData} />
              <PieChartPdf title="Composición de Financiación" data={financiacionPieData} />
            </View>
          )}

          <SectionBars items={itemsFor(endeudamientoSection)} />
          <IndicatorPdfTable items={itemsFor(endeudamientoSection)} />
        </Page>
      )}

      {/* ── Liquidez y Capital de Trabajo ── */}
      {hasIndicators && (
        <Page size="A4" style={styles.page}>
          {chrome}
          <Text style={styles.h1}>Liquidez y Capital de Trabajo</Text>
          {findSeccion('Liquidez y Capital de Trabajo') && (
            <Text style={[styles.paragraph, { marginBottom: 14 }]}>{findSeccion('Liquidez y Capital de Trabajo')}</Text>
          )}
          <SectionBars items={itemsFor(liquidezSection)} />
          <IndicatorPdfTable items={itemsFor(liquidezSection)} />
        </Page>
      )}

      {/* ── Cartera, Inventarios y Ciclo de Caja ── */}
      {hasIndicators && resultsObj.ciclo_efectivo && (
        <Page size="A4" style={styles.page}>
          {chrome}
          <Text style={styles.h1}>Cartera, Inventarios y Ciclo de Caja</Text>
          {findSeccion('Cartera, Inventarios y Ciclo de Caja') && (
            <Text style={[styles.paragraph, { marginBottom: 14 }]}>{findSeccion('Cartera, Inventarios y Ciclo de Caja')}</Text>
          )}
          <SectionBars items={itemsFor(cicloSection)} />
          <IndicatorPdfTable items={itemsFor(cicloSection)} />
        </Page>
      )}

      {/* ── Mapa de riesgos y semaforización ── */}
      {(riskMap.length > 0 || riesgosOrdenados.length > 0 || (narrative?.senales_alerta?.length ?? 0) > 0) && (
        <Page size="A4" style={styles.page}>
          {chrome}
          <Text style={styles.h1}>Riesgos Financieros y Señales de Alerta</Text>

          {riskMap.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.h2}>Mapa de Riesgos y Semaforización Gerencial</Text>
              <View style={styles.tableHeaderRow}>
                <Text style={[styles.tableHeaderCell, { flex: 1.6 }]}>Indicador</Text>
                <Text style={[styles.tableHeaderCell, { flex: 0.8 }]}>Nivel</Text>
                <Text style={[styles.tableHeaderCell, { flex: 0.8 }]}>Tendencia</Text>
                <Text style={[styles.tableHeaderCell, { flex: 1 }]}>Señal</Text>
              </View>
              {riskMap.map((r, i) => (
                <View key={i} style={[styles.tableRow, { backgroundColor: NIVEL_ROW_BG[r.nivel] }]}>
                  <Text style={[styles.tableCell, { flex: 1.6 }]}>{r.indicador}</Text>
                  <Text style={[styles.tableCell, { flex: 0.8, color: NIVEL_COLOR[r.nivel], fontFamily: 'Helvetica-Bold' }]}>
                    {NIVEL_LABEL[r.nivel]}
                  </Text>
                  <Text style={[styles.tableCell, { flex: 0.8 }]}>{r.tendencia.replace(/^[↑↓→]\s*/, '').replace(/—/g, '-')}</Text>
                  <Text style={[styles.tableCell, { flex: 1 }]}>{r.señal}</Text>
                </View>
              ))}
            </View>
          )}

          {riesgosOrdenados.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.h2}>Riesgos Priorizados</Text>
              {riesgosOrdenados.map((r, i) => (
                <View key={i} style={[styles.riskCard, { borderColor: RIESGO_NIVEL_COLOR[r.nivel] || '#cbd5e1' }]} wrap={false}>
                  <Text style={[styles.riskBadge, { color: RIESGO_NIVEL_COLOR[r.nivel] || '#334155' }]}>
                    {PRIORIDAD_LABEL[r.prioridad] || r.prioridad} · {(RIESGO_NIVEL_LABEL[r.nivel] || r.nivel).toUpperCase()} · tendencia: {r.tendencia}
                  </Text>
                  <Text style={styles.riskText}>{r.descripcion}</Text>
                </View>
              ))}
            </View>
          )}

          {narrative && narrative.senales_alerta?.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.h2}>Señales de Alerta a Vigilar</Text>
              {narrative.senales_alerta.map((s, i) => (
                <View key={i} style={styles.listItem} wrap={false}>
                  <Text style={[styles.listBullet, { color: '#d97706' }]}>!</Text>
                  <Text style={styles.listText}>{s}</Text>
                </View>
              ))}
            </View>
          )}
        </Page>
      )}

      {/* ── Recomendaciones ── */}
      {narrative && narrative.recomendaciones?.length > 0 && (
        <Page size="A4" style={styles.page}>
          {chrome}
          <Text style={styles.h1}>Recomendaciones Concretas y Exigibles para la Junta</Text>
          {narrative.recomendaciones.map((r, i) => (
            <View key={i} style={styles.recCard} wrap={false}>
              <Text style={styles.recTitle}>
                {i + 1}. {r.accion}
              </Text>
              <Text style={styles.recMeta}>
                Responsable: {r.responsable_sugerido} | Horizonte: {r.horizonte}
              </Text>
            </View>
          ))}
        </Page>
      )}

      {/* ── Conclusión y dictamen final ── */}
      {narrative && narrative.conclusion.length > 0 && (
        <Page size="A4" style={styles.page}>
          {chrome}
          <Text style={styles.h1}>Conclusión Ejecutiva y Dictamen Gerencial</Text>
          <Text style={[styles.paragraph, { marginBottom: 16 }]}>{narrative.conclusion}</Text>

          {narrative.dictamen && (
            <View style={[styles.dictamenBanner, { backgroundColor: DICTAMEN_COLOR[narrative.dictamen] || '#2563eb' }]}>
              <Text style={styles.dictamenBannerLabel}>Dictamen</Text>
              <Text style={styles.dictamenBannerValue}>{DICTAMEN_LABEL[narrative.dictamen] || narrative.dictamen}</Text>
            </View>
          )}

          <Text style={[styles.muted, { marginTop: 16, fontFamily: 'Helvetica-Oblique' }]}>
            Este informe se emite sobre la base de los estados financieros suministrados y de la narrativa generada
            automáticamente por el motor de análisis de Datanalytic. No constituye una auditoría ni un dictamen de
            revisoría fiscal.
          </Text>
          <AiProviderPdfNote provider={narrative.ai_provider} />
        </Page>
      )}

      {/* ── Anexo técnico: metodología y fórmulas (estático, no depende de IA) ── */}
      <Page size="A4" style={styles.page}>
        {chrome}
        <Text style={styles.h1}>Anexo Técnico: Metodología y Fórmulas</Text>

        <View style={styles.section}>
          <Text style={styles.h2}>A.1 Bases de Cálculo</Text>
          <View style={styles.listItem} wrap={false}>
            <Text style={styles.listBullet}>•</Text>
            <Text style={styles.listText}>
              Períodos: {periodStart} a {periodEnd}, comparado (cuando disponible) contra el análisis publicado anterior de
              la misma empresa.
            </Text>
          </View>
          <View style={styles.listItem} wrap={false}>
            <Text style={styles.listBullet}>•</Text>
            <Text style={styles.listText}>
              Utilidad Neta para ROE, ROA y márgenes: tomada del Estado de Resultados, no del Balance.
            </Text>
          </View>
          <View style={styles.listItem} wrap={false}>
            <Text style={styles.listBullet}>•</Text>
            <Text style={styles.listText}>Saldos de balance: saldos de cierre del período.</Text>
          </View>
          <View style={styles.listItem} wrap={false}>
            <Text style={styles.listBullet}>•</Text>
            <Text style={styles.listText}>
              Días para DSO/DIO/DPO: días efectivos entre period_start y period_end del análisis (no un valor fijo de 365),
              para soportar períodos de cualquier duración.
            </Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.h2}>A.2 Fórmulas Principales</Text>
          <View style={styles.tableHeaderRow}>
            <Text style={[styles.tableHeaderCell, { flex: 1 }]}>Indicador</Text>
            <Text style={[styles.tableHeaderCell, { flex: 1.6 }]}>Fórmula</Text>
          </View>
          {FORMULAS.map((f, i) => (
            <View key={i} style={styles.tableRow}>
              <Text style={[styles.tableCell, { flex: 1 }]}>{f.indicador}</Text>
              <Text style={[styles.tableCell, { flex: 1.6 }]}>{f.formula}</Text>
            </View>
          ))}
        </View>

        <View style={styles.section}>
          <Text style={styles.h2}>A.3 Limitaciones</Text>
          <View style={styles.listItem} wrap={false}>
            <Text style={styles.listBullet}>•</Text>
            <Text style={styles.listText}>
              Cuando la Utilidad del ejercicio del Balance y la Utilidad Neta del Estado de Resultados difieren en más de
              5%, este informe lo señala como inconsistencia de prioridad alta y usa la cifra del Estado de Resultados
              para todos los indicadores de rentabilidad.
            </Text>
          </View>
          <View style={styles.listItem} wrap={false}>
            <Text style={styles.listBullet}>•</Text>
            <Text style={styles.listText}>
              Este informe se genera automáticamente a partir del archivo suministrado. No constituye una auditoría ni un
              dictamen de revisoría fiscal.
            </Text>
          </View>
        </View>
      </Page>
    </Document>
  );
}
