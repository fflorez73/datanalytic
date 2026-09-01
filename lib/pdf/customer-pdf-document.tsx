import 'server-only';
import { Document, Page, Path, Svg, Text, View, StyleSheet } from '@react-pdf/renderer';
import { formatCustomerValue, SEGMENT_COLOR, ACTIVO_RIESGO_COLOR, type CustomerAnalyticsResult, type CustomerRfmResult } from '@/lib/customer-analytics';
import type { CustomerNarrative } from '@/lib/generate-customer-narrative';

/** Ver nota equivalente en analysis-pdf-document.tsx — WinAnsiEncoding no soporta varios signos Unicode que el modelo escribe con naturalidad. */
function sanitizeForPdf(text: unknown): string {
  if (typeof text !== 'string') return '';
  return text
    .replace(/[–—−]/g, '-')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/…/g, '...');
}

function sanitizeNarrativeForPdf(n: CustomerNarrative | null): CustomerNarrative | null {
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
const RIESGO_NIVEL_LABEL: Record<string, string> = { verde: 'Riesgo bajo', amarillo: 'Riesgo medio', rojo: 'Riesgo alto' };
const RIESGO_NIVEL_COLOR: Record<string, string> = { verde: '#16a34a', amarillo: '#d97706', rojo: '#dc2626' };
const PRIORIDAD_LABEL: Record<string, string> = { alta: 'PRIORIDAD ALTA', media: 'PRIORIDAD MEDIA', baja: 'PRIORIDAD BAJA' };
const PRIORIDAD_RANK: Record<string, number> = { alta: 0, media: 1, baja: 2 };

const styles = StyleSheet.create({
  cover: { padding: 56, backgroundColor: '#0f172a', color: '#ffffff', height: '100%', justifyContent: 'space-between', fontFamily: 'Helvetica' },
  coverEyebrow: { fontSize: 11, color: '#93c5fd', textTransform: 'uppercase', letterSpacing: 1 },
  coverCompany: { fontSize: 26, fontFamily: 'Helvetica-Bold', marginTop: 10 },
  coverTitle: { fontSize: 15, color: '#cbd5e1', marginTop: 6 },
  coverConfidential: { fontSize: 11, fontFamily: 'Helvetica-Bold', color: '#fecaca', marginTop: 18, letterSpacing: 0.5 },
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

  dictamenBanner: { borderRadius: 6, padding: 14, marginBottom: 16 },
  dictamenBannerLabel: { fontSize: 8.5, color: '#ffffff', opacity: 0.85, textTransform: 'uppercase', marginBottom: 3 },
  dictamenBannerValue: { fontSize: 15, fontFamily: 'Helvetica-Bold', color: '#ffffff' },

  kpiRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  kpiCard: { flex: 1, borderRadius: 6, backgroundColor: '#eff6ff', padding: 10, borderWidth: 1, borderColor: '#dbeafe' },
  kpiValue: { fontSize: 15, fontFamily: 'Helvetica-Bold', color: '#0f172a' },
  kpiLabel: { fontSize: 8, color: '#64748b', marginTop: 2 },

  section: { marginBottom: 18 },
  barRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 6, gap: 8 },
  barLabelCol: { width: 70 },
  barLabel: { fontSize: 9, color: '#334155' },
  barTrackCol: { flex: 1, height: 8, borderRadius: 4, backgroundColor: '#e2e8f0' },
  barFill: { height: 8, borderRadius: 4 },
  barValueCol: { width: 70, textAlign: 'right' },
  barValue: { fontSize: 9, fontFamily: 'Helvetica-Bold', color: '#0f172a' },

  table: { marginTop: 4 },
  tableHeaderRow: { flexDirection: 'row', gap: 6, borderBottomWidth: 1, borderBottomColor: '#cbd5e1', paddingBottom: 4, marginBottom: 4 },
  tableRow: { flexDirection: 'row', gap: 6, borderBottomWidth: 0.5, borderBottomColor: '#e2e8f0', paddingVertical: 4 },
  tableHeaderCell: { fontSize: 8, color: '#64748b', textTransform: 'uppercase' },
  tableCell: { fontSize: 9, color: '#334155' },

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
        <Text>Análisis de Clientes y Mercadeo - {companyName}</Text>
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

function RevenueBars({ clientes }: { clientes: CustomerRfmResult[] }) {
  const sorted = [...clientes].sort((a, b) => b.monto - a.monto);
  const max = sorted.length > 0 ? sorted[0].monto : 0;
  if (max <= 0) return null;
  return (
    <>
      {sorted.map((c) => (
        <BarRow
          key={c.id}
          label={c.id}
          valueLabel={formatCustomerValue(c.monto, 'currency')}
          pct={(c.monto / max) * 100}
          color={c.segmento === 'En Riesgo' ? ACTIVO_RIESGO_COLOR.riesgo : ACTIVO_RIESGO_COLOR.activo}
        />
      ))}
    </>
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
      <Text style={{ fontSize: 9.5, fontFamily: 'Helvetica-Bold', color: '#334155', marginBottom: 6, textAlign: 'center' }}>{title}</Text>
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

export function CustomerPdfDocument({
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
  narrative: CustomerNarrative | null;
  generatedAt: string;
}) {
  const narrative = sanitizeNarrativeForPdf(narrativeInput);
  const r: Partial<CustomerAnalyticsResult> = results && typeof results === 'object' ? results : {};
  const clientes = r.clientes ?? [];
  const resumen = r.resumen ?? null;
  const concentracion = r.concentracion ?? null;
  const segmentos = r.segmentos ?? [];
  const valorEficiencia = r.valorEficiencia ?? null;
  const clientesRiesgo = r.clientesRiesgo ?? [];
  const upsell = r.upsell ?? [];
  const hasData = clientes.length > 0 && resumen !== null && concentracion !== null;

  function findSeccion(tituloBuscado: string): string | undefined {
    const analisis = narrative?.secciones?.find((s) => s.titulo === tituloBuscado)?.analisis;
    return analisis ? analisis : undefined;
  }

  const kpiCards = hasData
    ? [
        { label: 'Ingreso Total Cartera', value: formatCustomerValue(resumen!.ingresoTotal, 'currency') },
        { label: '% Ingreso en Riesgo', value: formatCustomerValue(resumen!.pctIngresoRiesgo, 'percent') },
        { label: 'Ticket Promedio', value: formatCustomerValue(resumen!.ticketPromedioPonderado, 'currency') },
        { label: 'Share Top-1', value: formatCustomerValue(concentracion!.shareTop1, 'percent') },
      ]
    : [];

  const segmentosClientesPie = segmentos.map((s) => ({ label: s.segmento, value: s.pctClientes, color: SEGMENT_COLOR[s.segmento] }));
  const segmentosIngresoPie = segmentos.map((s) => ({ label: s.segmento, value: s.pctIngreso, color: SEGMENT_COLOR[s.segmento] }));

  const riesgosOrdenados = narrative?.riesgos
    ? [...narrative.riesgos].sort((a, b) => (PRIORIDAD_RANK[a.prioridad] ?? 1) - (PRIORIDAD_RANK[b.prioridad] ?? 1))
    : [];

  const chrome = <PageChrome companyName={companyName} generatedAt={generatedAt} />;

  return (
    <Document title={`${title} - ${companyName}`} author="Datanalytic">
      {/* ── Portada ── */}
      <Page size="A4" style={styles.cover}>
        <View>
          <Text style={styles.coverEyebrow}>Informe Ejecutivo · Diagnóstico de Clientes y Mercadeo</Text>
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

      {/* ── Hallazgos clave + KPIs ── */}
      <Page size="A4" style={styles.page}>
        {chrome}
        <Text style={styles.h1}>Hallazgos Clave</Text>

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
      </Page>

      {/* ── 1. Perfil de la Cartera y Concentración ── */}
      {hasData && (
        <Page size="A4" style={styles.page}>
          {chrome}
          <Text style={styles.h1}>Perfil de la Cartera y Concentración de Ingresos</Text>
          {findSeccion('Perfil de la Cartera y Concentración') && (
            <Text style={[styles.paragraph, { marginBottom: 14 }]}>{findSeccion('Perfil de la Cartera y Concentración')}</Text>
          )}

          <RevenueBars clientes={clientes} />

          <View style={[styles.table, { marginTop: 12 }]}>
            <View style={styles.tableHeaderRow}>
              <Text style={[styles.tableHeaderCell, { flex: 1 }]}>Cliente</Text>
              <Text style={[styles.tableHeaderCell, { flex: 0.8 }]}>Segmento</Text>
              <Text style={[styles.tableHeaderCell, { flex: 0.9, textAlign: 'right' }]}>Monto</Text>
              <Text style={[styles.tableHeaderCell, { flex: 0.7, textAlign: 'right' }]}>% Rev</Text>
              <Text style={[styles.tableHeaderCell, { flex: 0.7, textAlign: 'right' }]}>Ticket</Text>
              <Text style={[styles.tableHeaderCell, { flex: 0.7, textAlign: 'right' }]}>Recencia</Text>
            </View>
            {clientes.map((c) => (
              <View key={c.id} style={styles.tableRow}>
                <Text style={[styles.tableCell, { flex: 1, fontFamily: 'Helvetica-Bold' }]}>{c.id}</Text>
                <Text style={[styles.tableCell, { flex: 0.8 }]}>{c.segmento}</Text>
                <Text style={[styles.tableCell, { flex: 0.9, textAlign: 'right' }]}>{formatCustomerValue(c.monto, 'currency')}</Text>
                <Text style={[styles.tableCell, { flex: 0.7, textAlign: 'right' }]}>{formatCustomerValue(c.pctIngreso, 'percent')}</Text>
                <Text style={[styles.tableCell, { flex: 0.7, textAlign: 'right' }]}>{formatCustomerValue(c.ticketPromedio, 'currency')}</Text>
                <Text style={[styles.tableCell, { flex: 0.7, textAlign: 'right' }]}>{c.recenciaDias !== null ? `${c.recenciaDias} d` : '-'}</Text>
              </View>
            ))}
          </View>

          {concentracion && (
            <View style={[styles.section, { marginTop: 16 }]}>
              <Text style={styles.h2}>Indicadores de Concentración</Text>
              <View style={styles.tableHeaderRow}>
                <Text style={[styles.tableHeaderCell, { flex: 1.4 }]}>Métrica</Text>
                <Text style={[styles.tableHeaderCell, { flex: 1, textAlign: 'right' }]}>Valor</Text>
              </View>
              <View style={styles.tableRow}>
                <Text style={[styles.tableCell, { flex: 1.4 }]}>Share Top-1</Text>
                <Text style={[styles.tableCell, { flex: 1, textAlign: 'right', fontFamily: 'Helvetica-Bold' }]}>{formatCustomerValue(concentracion.shareTop1, 'percent')}</Text>
              </View>
              <View style={styles.tableRow}>
                <Text style={[styles.tableCell, { flex: 1.4 }]}>Share Top-3</Text>
                <Text style={[styles.tableCell, { flex: 1, textAlign: 'right', fontFamily: 'Helvetica-Bold' }]}>{formatCustomerValue(concentracion.shareTop3, 'percent')}</Text>
              </View>
              <View style={styles.tableRow}>
                <Text style={[styles.tableCell, { flex: 1.4 }]}>Clientes que aportan 80% del ingreso</Text>
                <Text style={[styles.tableCell, { flex: 1, textAlign: 'right', fontFamily: 'Helvetica-Bold' }]}>
                  {concentracion.clientesPara80pct} de {concentracion.totalClientes}
                </Text>
              </View>
              <View style={styles.tableRow}>
                <Text style={[styles.tableCell, { flex: 1.4 }]}>Ingreso medio por cliente</Text>
                <Text style={[styles.tableCell, { flex: 1, textAlign: 'right', fontFamily: 'Helvetica-Bold' }]}>{formatCustomerValue(concentracion.ingresoMedioPorCliente, 'currency')}</Text>
              </View>
            </View>
          )}
        </Page>
      )}

      {/* ── 2. Segmentación RFM y Mapa de Valor ── */}
      {hasData && (
        <Page size="A4" style={styles.page}>
          {chrome}
          <Text style={styles.h1}>Segmentación RFM y Mapa de Valor del Cliente</Text>
          {findSeccion('Segmentación RFM y Mapa de Valor') && (
            <Text style={[styles.paragraph, { marginBottom: 14 }]}>{findSeccion('Segmentación RFM y Mapa de Valor')}</Text>
          )}

          <View style={styles.table}>
            <View style={styles.tableHeaderRow}>
              <Text style={[styles.tableHeaderCell, { flex: 1 }]}>Cliente</Text>
              <Text style={[styles.tableHeaderCell, { flex: 0.5, textAlign: 'right' }]}>R</Text>
              <Text style={[styles.tableHeaderCell, { flex: 0.5, textAlign: 'right' }]}>F</Text>
              <Text style={[styles.tableHeaderCell, { flex: 0.5, textAlign: 'right' }]}>M</Text>
              <Text style={[styles.tableHeaderCell, { flex: 0.5, textAlign: 'right' }]}>RFM</Text>
              <Text style={[styles.tableHeaderCell, { flex: 1.2 }]}>Segmento</Text>
              <Text style={[styles.tableHeaderCell, { flex: 0.9, textAlign: 'right' }]}>CLV Proxy</Text>
            </View>
            {clientes.map((c) => (
              <View key={c.id} style={styles.tableRow}>
                <Text style={[styles.tableCell, { flex: 1, fontFamily: 'Helvetica-Bold' }]}>{c.id}</Text>
                <Text style={[styles.tableCell, { flex: 0.5, textAlign: 'right' }]}>{c.scoreR}</Text>
                <Text style={[styles.tableCell, { flex: 0.5, textAlign: 'right' }]}>{c.scoreF}</Text>
                <Text style={[styles.tableCell, { flex: 0.5, textAlign: 'right' }]}>{c.scoreM}</Text>
                <Text style={[styles.tableCell, { flex: 0.5, textAlign: 'right', fontFamily: 'Helvetica-Bold' }]}>{c.rfmTotal}</Text>
                <Text style={[styles.tableCell, { flex: 1.2 }]}>{c.segmento}</Text>
                <Text style={[styles.tableCell, { flex: 0.9, textAlign: 'right' }]}>{formatCustomerValue(c.clvProxy, 'currency')}</Text>
              </View>
            ))}
          </View>

          {(segmentosClientesPie.length > 0 || segmentosIngresoPie.length > 0) && (
            <View style={[styles.section, { flexDirection: 'row', gap: 16, marginTop: 16 }]}>
              <PieChartPdf title="Clientes por Segmento" data={segmentosClientesPie} />
              <PieChartPdf title="Ingreso por Segmento" data={segmentosIngresoPie} />
            </View>
          )}
        </Page>
      )}

      {/* ── 3. Riesgo de Churn y Calidad de Relación ── */}
      {hasData && (
        <Page size="A4" style={styles.page}>
          {chrome}
          <Text style={styles.h1}>Riesgo de Churn, Calidad de Relación y Carga de Soporte</Text>
          {findSeccion('Riesgo de Churn y Calidad de Relación') && (
            <Text style={[styles.paragraph, { marginBottom: 14 }]}>{findSeccion('Riesgo de Churn y Calidad de Relación')}</Text>
          )}

          {clientesRiesgo.length > 0 ? (
            <View style={styles.table}>
              <View style={styles.tableHeaderRow}>
                <Text style={[styles.tableHeaderCell, { flex: 1 }]}>Cliente</Text>
                <Text style={[styles.tableHeaderCell, { flex: 1 }]}>Última compra</Text>
                <Text style={[styles.tableHeaderCell, { flex: 0.8, textAlign: 'right' }]}>Recencia</Text>
                <Text style={[styles.tableHeaderCell, { flex: 0.6, textAlign: 'right' }]}>Freq</Text>
                <Text style={[styles.tableHeaderCell, { flex: 0.9, textAlign: 'right' }]}>Monto</Text>
                <Text style={[styles.tableHeaderCell, { flex: 0.7, textAlign: 'right' }]}>Soporte</Text>
                <Text style={[styles.tableHeaderCell, { flex: 1.4 }]}>Diagnóstico</Text>
              </View>
              {clientesRiesgo.map((c) => (
                <View key={c.id} style={[styles.tableRow, { backgroundColor: '#fef2f2' }]}>
                  <Text style={[styles.tableCell, { flex: 1, fontFamily: 'Helvetica-Bold' }]}>{c.id}</Text>
                  <Text style={[styles.tableCell, { flex: 1 }]}>{c.fechaUltimaCompra ?? '-'}</Text>
                  <Text style={[styles.tableCell, { flex: 0.8, textAlign: 'right' }]}>{c.recenciaDias !== null ? `${c.recenciaDias} d` : '-'}</Text>
                  <Text style={[styles.tableCell, { flex: 0.6, textAlign: 'right' }]}>{c.frecuencia}</Text>
                  <Text style={[styles.tableCell, { flex: 0.9, textAlign: 'right' }]}>{formatCustomerValue(c.monto, 'currency')}</Text>
                  <Text style={[styles.tableCell, { flex: 0.7, textAlign: 'right' }]}>{c.ticketsSoporte}</Text>
                  <Text style={[styles.tableCell, { flex: 1.4, color: '#b91c1c', fontFamily: 'Helvetica-Bold' }]}>{c.diagnostico}</Text>
                </View>
              ))}
            </View>
          ) : (
            <Text style={styles.muted}>No se identificaron clientes en el segmento En Riesgo.</Text>
          )}
        </Page>
      )}

      {/* ── 4. Creación de Valor Comercial y Eficiencia ── */}
      {hasData && valorEficiencia && (
        <Page size="A4" style={styles.page}>
          {chrome}
          <Text style={styles.h1}>Creación de Valor Comercial y Eficiencia de la Base</Text>
          {findSeccion('Creación de Valor Comercial y Eficiencia') && (
            <Text style={[styles.paragraph, { marginBottom: 14 }]}>{findSeccion('Creación de Valor Comercial y Eficiencia')}</Text>
          )}

          <View style={styles.table}>
            <View style={styles.tableHeaderRow}>
              <Text style={[styles.tableHeaderCell, { flex: 1.4 }]}>Indicador</Text>
              <Text style={[styles.tableHeaderCell, { flex: 1, textAlign: 'right' }]}>Activos</Text>
              <Text style={[styles.tableHeaderCell, { flex: 1, textAlign: 'right' }]}>En Riesgo</Text>
              <Text style={[styles.tableHeaderCell, { flex: 1, textAlign: 'right' }]}>Cartera Total</Text>
            </View>
            {[
              { label: 'Ingreso (USD)', fmt: 'currency' as const, k: 'ingreso' as const },
              { label: '% del ingreso', fmt: 'percent' as const, k: 'pctIngreso' as const },
              { label: 'Tickets soporte', fmt: 'integer' as const, k: 'ticketsSoporte' as const },
              { label: 'Ticket promedio', fmt: 'currency' as const, k: 'ticketPromedio' as const },
            ].map((row) => (
              <View key={row.k} style={styles.tableRow}>
                <Text style={[styles.tableCell, { flex: 1.4 }]}>{row.label}</Text>
                <Text style={[styles.tableCell, { flex: 1, textAlign: 'right', fontFamily: 'Helvetica-Bold' }]}>
                  {formatCustomerValue(valorEficiencia.activos[row.k], row.fmt)}
                </Text>
                <Text style={[styles.tableCell, { flex: 1, textAlign: 'right', fontFamily: 'Helvetica-Bold' }]}>
                  {formatCustomerValue(valorEficiencia.riesgo[row.k], row.fmt)}
                </Text>
                <Text style={[styles.tableCell, { flex: 1, textAlign: 'right', fontFamily: 'Helvetica-Bold' }]}>
                  {formatCustomerValue(valorEficiencia.total[row.k], row.fmt)}
                </Text>
              </View>
            ))}
            <View style={styles.tableRow}>
              <Text style={[styles.tableCell, { flex: 1.4 }]}>Soporte / $1.000 ingreso</Text>
              <Text style={[styles.tableCell, { flex: 1, textAlign: 'right', fontFamily: 'Helvetica-Bold' }]}>{valorEficiencia.activos.soportePorMil.toFixed(2)}</Text>
              <Text style={[styles.tableCell, { flex: 1, textAlign: 'right', fontFamily: 'Helvetica-Bold' }]}>{valorEficiencia.riesgo.soportePorMil.toFixed(2)}</Text>
              <Text style={[styles.tableCell, { flex: 1, textAlign: 'right', fontFamily: 'Helvetica-Bold' }]}>{valorEficiencia.total.soportePorMil.toFixed(2)}</Text>
            </View>
            <View style={styles.tableRow}>
              <Text style={[styles.tableCell, { flex: 1.4 }]}>Recencia media (días)</Text>
              <Text style={[styles.tableCell, { flex: 1, textAlign: 'right', fontFamily: 'Helvetica-Bold' }]}>{valorEficiencia.activos.recenciaMedia ?? '-'}</Text>
              <Text style={[styles.tableCell, { flex: 1, textAlign: 'right', fontFamily: 'Helvetica-Bold' }]}>{valorEficiencia.riesgo.recenciaMedia ?? '-'}</Text>
              <Text style={[styles.tableCell, { flex: 1, textAlign: 'right', fontFamily: 'Helvetica-Bold' }]}>{valorEficiencia.total.recenciaMedia ?? '-'}</Text>
            </View>
          </View>

          {upsell.length > 0 && (
            <View style={[styles.section, { marginTop: 16 }]}>
              <Text style={styles.h2}>Oportunidades de Crecimiento (Upsell / Cross-sell)</Text>
              {upsell.map((u) => (
                <View key={u.id} style={styles.recCard} wrap={false}>
                  <Text style={styles.recTitle}>
                    {u.id} ({u.segmento}) - {formatCustomerValue(u.monto, 'currency')}
                  </Text>
                  <Text style={styles.riskText}>{u.rationale}</Text>
                </View>
              ))}
            </View>
          )}
        </Page>
      )}

      {/* ── Mapa de riesgos comerciales y señales de alerta ── */}
      {(riesgosOrdenados.length > 0 || (narrative?.senales_alerta?.length ?? 0) > 0) && (
        <Page size="A4" style={styles.page}>
          {chrome}
          <Text style={styles.h1}>Mapa de Riesgos Comerciales y Señales de Alerta</Text>

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
            Este informe se emite sobre la base de la base de datos de clientes suministrada y de la narrativa
            generada automáticamente por el motor de análisis de Datanalytic. No sustituye un análisis de
            satisfacción (NPS) ni una auditoría de contratos.
          </Text>
        </Page>
      )}

      {/* ── Anexo técnico: metodología y definiciones ── */}
      <Page size="A4" style={styles.page}>
        {chrome}
        <Text style={styles.h1}>Anexo Técnico: Metodología y Definiciones</Text>

        <View style={styles.section}>
          <Text style={styles.h2}>A.1 Modelo RFM</Text>
          <View style={styles.listItem} wrap={false}>
            <Text style={styles.listBullet}>•</Text>
            <Text style={styles.listText}>
              Recency (R): días desde la última compra hasta la fecha de referencia (fin del período). Score 5 = menor o igual a 15 días; 4 = menor o igual a 45; 3 = menor o igual a 90; 2 = menor o igual a 150; 1 = mayor a 150.
            </Text>
          </View>
          <View style={styles.listItem} wrap={false}>
            <Text style={styles.listBullet}>•</Text>
            <Text style={styles.listText}>
              Frequency (F): compras anuales. Score 5 = mayor o igual a 24; 4 = mayor o igual a 15; 3 = mayor o igual a 10; 2 = mayor o igual a 4; 1 = menor a 4.
            </Text>
          </View>
          <View style={styles.listItem} wrap={false}>
            <Text style={styles.listBullet}>•</Text>
            <Text style={styles.listText}>
              Monetary (M): monto total facturado. Score 5 = mayor o igual a $20.000; 4 = mayor o igual a $10.000; 3 = mayor o igual a $5.000; 2 = mayor o igual a $1.500; 1 = menor a $1.500.
            </Text>
          </View>
          <View style={styles.listItem} wrap={false}>
            <Text style={styles.listBullet}>•</Text>
            <Text style={styles.listText}>
              Segmentos: Champions (RFM mayor o igual a 13 y Activo); Leales/Alto Valor (RFM mayor o igual a 10); Potenciales (RFM mayor o igual a 7); En Riesgo (estado declarado o RFM bajo + recencia alta); Bajo Engagement (resto).
            </Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.h2}>A.2 CLV Proxy</Text>
          <View style={styles.listItem} wrap={false}>
            <Text style={styles.listBullet}>•</Text>
            <Text style={styles.listText}>
              CLV Proxy = Ticket Promedio x Frecuencia Anual x 1,5. Horizonte conservador, sin descuento ni ajuste de margen. Sirve para ranking relativo, no para valoración contable.
            </Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.h2}>A.3 Limitaciones</Text>
          <View style={styles.listItem} wrap={false}>
            <Text style={styles.listBullet}>•</Text>
            <Text style={styles.listText}>
              No se dispone de margen por cliente, costo de adquisición, NPS ni historial de reclamaciones detallado. El análisis de soporte se basa en el conteo de tickets del archivo cargado.
            </Text>
          </View>
          <View style={styles.listItem} wrap={false}>
            <Text style={styles.listBullet}>•</Text>
            <Text style={styles.listText}>
              Este informe se genera automáticamente a partir del archivo suministrado. No constituye una auditoría ni un análisis de satisfacción formal.
            </Text>
          </View>
        </View>
      </Page>
    </Document>
  );
}
