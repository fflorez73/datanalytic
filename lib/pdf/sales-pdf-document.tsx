import 'server-only';
import { Document, Page, Path, Svg, Text, View, StyleSheet } from '@react-pdf/renderer';
import { formatSalesValue, buildSalesRiskMap, type SalesAnalyticsResult } from '@/lib/sales-analytics';
import type { SalesNarrative } from '@/lib/generate-sales-narrative';
import { AiProviderPdfNote } from '@/lib/pdf/ai-provider-note';

function sanitizeForPdf(text: unknown): string {
  if (typeof text !== 'string') return '';
  return text
    .replace(/[–—−]/g, '-')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/…/g, '...')
    .replace(/≈/g, '~')
    .replace(/[×✕]/g, 'x')
    .replace(/÷/g, '/')
    .replace(/±/g, '+/-');
}

function sanitizeNarrativeForPdf(n: SalesNarrative | null): SalesNarrative | null {
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
const NIVEL_LABEL: Record<string, string> = { verde: 'Saludable', amarillo: 'Vigilar', rojo: 'Crítico' };
const NIVEL_COLOR: Record<string, string> = { verde: '#16a34a', amarillo: '#d97706', rojo: '#dc2626' };
const NIVEL_ROW_BG: Record<string, string> = { verde: '#f0fdf4', amarillo: '#fffbeb', rojo: '#fef2f2' };
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
  barLabelCol: { width: 90 },
  barLabel: { fontSize: 8.5, color: '#334155' },
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

  statCard: { flex: 1, borderRadius: 6, padding: 10, borderWidth: 1 },
  statLabel: { fontSize: 8, textTransform: 'uppercase', marginBottom: 3 },
  statValue: { fontSize: 12, fontFamily: 'Helvetica-Bold' },
  statSub: { fontSize: 8.5, marginTop: 2 },
});

function PageChrome({ companyName, generatedAt }: { companyName: string; generatedAt: string }) {
  return (
    <>
      <View style={styles.pageHeader} fixed>
        <Text>Análisis de Ventas - {companyName}</Text>
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

const CANAL_COLORS = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#4a3aa7', '#e34948'];

export function SalesPdfDocument({
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
  narrative: SalesNarrative | null;
  generatedAt: string;
}) {
  const narrative = sanitizeNarrativeForPdf(narrativeInput);
  const r: Partial<SalesAnalyticsResult> = results && typeof results === 'object' ? results : {};
  const resumen = r.resumen ?? null;
  const evolucion = r.evolucionTemporal ?? [];
  const pareto = r.pareto ?? null;
  const top5 = r.concentracionTop5 ?? [];
  const estacionalidad = r.estacionalidad ?? null;
  const margenPorProducto = r.margenPorProducto ?? null;
  const canal = r.canal ?? null;
  const comparativo = r.comparativo_periodo_anterior ?? null;
  const hasData = resumen !== null;

  function findSeccion(tituloBuscado: string): string | undefined {
    const analisis = narrative?.secciones?.find((s) => s.titulo === tituloBuscado)?.analisis;
    return analisis ? analisis : undefined;
  }

  const crecimientoPct = comparativo?.indicadores?.ventas_totales?.variacion_relativa_pct ?? null;

  const kpiCards = hasData
    ? [
        { label: 'Ventas Totales', value: formatSalesValue(resumen!.ventasTotales, 'currency') },
        { label: 'Ticket Promedio', value: formatSalesValue(resumen!.ticketPromedio, 'currency') },
        ...(crecimientoPct !== null ? [{ label: 'Crecimiento vs. Anterior', value: `${crecimientoPct >= 0 ? '+' : ''}${crecimientoPct.toFixed(1)}%` }] : []),
        ...(resumen!.margenBrutoPct !== null ? [{ label: 'Margen Bruto', value: formatSalesValue(resumen!.margenBrutoPct, 'percent') }] : []),
      ]
    : [];

  const evolucionMax = evolucion.length > 0 ? Math.max(...evolucion.map((e) => e.monto)) : 0;
  const top5Max = top5.length > 0 ? Math.max(...top5.map((t) => t.monto)) : 0;

  const canalPieData = canal ? canal.map((c, i) => ({ label: c.nombre, value: c.pctTotal / 100, color: CANAL_COLORS[i % CANAL_COLORS.length] })) : [];
  const riskMap = hasData ? buildSalesRiskMap(r as SalesAnalyticsResult) : [];
  const riesgosOrdenados = narrative?.riesgos
    ? [...narrative.riesgos].sort((a, b) => (PRIORIDAD_RANK[a.prioridad] ?? 1) - (PRIORIDAD_RANK[b.prioridad] ?? 1))
    : [];
  const hasRentabilidadSeccion = Boolean((margenPorProducto && margenPorProducto.length > 0) || (canal && canal.length > 0));
  const dimensionLabel = pareto?.dimension === 'cliente' ? 'clientes' : 'productos';

  const chrome = <PageChrome companyName={companyName} generatedAt={generatedAt} />;

  return (
    <Document title={`${title} - ${companyName}`} author="Datanalytic">
      {/* ── Portada ── */}
      <Page size="A4" style={styles.cover}>
        <View>
          <Text style={styles.coverEyebrow}>Informe Ejecutivo · Diagnóstico de Ventas</Text>
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

      {/* ── 1. Evolución y Desempeño de Ventas ── */}
      {hasData && (
        <Page size="A4" style={styles.page}>
          {chrome}
          <Text style={styles.h1}>Evolución y Desempeño de Ventas</Text>
          {findSeccion('Evolución y Desempeño de Ventas') && (
            <Text style={[styles.paragraph, { marginBottom: 14 }]}>{findSeccion('Evolución y Desempeño de Ventas')}</Text>
          )}

          {evolucion.length > 0 ? (
            evolucion.map((e) => (
              <BarRow key={e.periodo} label={e.periodo} valueLabel={formatSalesValue(e.monto, 'currency')} pct={evolucionMax > 0 ? (e.monto / evolucionMax) * 100 : 0} color="#2a78d6" />
            ))
          ) : (
            <Text style={styles.muted}>No hay suficientes fechas identificables para construir la evolución temporal.</Text>
          )}

          {comparativo && (
            <View style={[styles.section, { marginTop: 16 }]}>
              <Text style={styles.h2}>Comparativo vs. Período Anterior</Text>
              <View style={styles.tableHeaderRow}>
                <Text style={[styles.tableHeaderCell, { flex: 1.4 }]}>Indicador</Text>
                <Text style={[styles.tableHeaderCell, { flex: 1, textAlign: 'right' }]}>Anterior</Text>
                <Text style={[styles.tableHeaderCell, { flex: 1, textAlign: 'right' }]}>Actual</Text>
                <Text style={[styles.tableHeaderCell, { flex: 1, textAlign: 'right' }]}>Var.</Text>
              </View>
              {Object.entries(comparativo.indicadores).map(([key, entry]) => {
                if (!entry) return null;
                const format = key === 'margen_bruto_pct' ? 'percent' : key === 'num_transacciones' ? 'integer' : 'currency';
                const label = key === 'ventas_totales' ? 'Ventas Totales' : key === 'ticket_promedio' ? 'Ticket Promedio' : key === 'margen_bruto_pct' ? 'Margen Bruto' : 'Transacciones';
                const variacion = entry.variacion_relativa_pct !== null ? `${entry.variacion_relativa_pct >= 0 ? '+' : ''}${entry.variacion_relativa_pct.toFixed(1)}%` : `${entry.variacion_absoluta}`;
                return (
                  <View key={key} style={styles.tableRow}>
                    <Text style={[styles.tableCell, { flex: 1.4 }]}>{label}</Text>
                    <Text style={[styles.tableCell, { flex: 1, textAlign: 'right' }]}>{formatSalesValue(entry.valor_anterior, format as any)}</Text>
                    <Text style={[styles.tableCell, { flex: 1, textAlign: 'right', fontFamily: 'Helvetica-Bold' }]}>{formatSalesValue(entry.valor_actual, format as any)}</Text>
                    <Text style={[styles.tableCell, { flex: 1, textAlign: 'right', color: (entry.variacion_relativa_pct ?? 0) >= 0 ? '#16a34a' : '#dc2626', fontFamily: 'Helvetica-Bold' }]}>{variacion}</Text>
                  </View>
                );
              })}
            </View>
          )}
        </Page>
      )}

      {/* ── 2. Análisis Pareto y Concentración de Producto ── */}
      {hasData && (
        <Page size="A4" style={styles.page}>
          {chrome}
          <Text style={styles.h1}>Análisis Pareto y Concentración de {pareto?.dimension === 'cliente' ? 'Clientes' : 'Producto'}</Text>
          {findSeccion('Análisis Pareto y Concentración de Producto') && (
            <Text style={[styles.paragraph, { marginBottom: 14 }]}>{findSeccion('Análisis Pareto y Concentración de Producto')}</Text>
          )}

          {pareto ? (
            <>
              <Text style={[styles.paragraph, { marginBottom: 10 }]}>
                {pareto.itemsPara80pct} de {pareto.totalItems} {dimensionLabel} generan el 80% de las ventas.
              </Text>
              <View style={styles.table}>
                <View style={styles.tableHeaderRow}>
                  <Text style={[styles.tableHeaderCell, { flex: 1.4 }]}>{pareto.dimension === 'cliente' ? 'Cliente' : 'Producto/Categoría'}</Text>
                  <Text style={[styles.tableHeaderCell, { flex: 1, textAlign: 'right' }]}>Ventas</Text>
                  <Text style={[styles.tableHeaderCell, { flex: 0.8, textAlign: 'right' }]}>% Total</Text>
                  <Text style={[styles.tableHeaderCell, { flex: 0.8, textAlign: 'right' }]}>Acumulado</Text>
                </View>
                {pareto.items.slice(0, 15).map((it) => (
                  <View key={it.nombre} style={styles.tableRow}>
                    <Text style={[styles.tableCell, { flex: 1.4 }]}>{it.nombre}</Text>
                    <Text style={[styles.tableCell, { flex: 1, textAlign: 'right' }]}>{formatSalesValue(it.monto, 'currency')}</Text>
                    <Text style={[styles.tableCell, { flex: 0.8, textAlign: 'right' }]}>{it.pctTotal.toFixed(1)}%</Text>
                    <Text style={[styles.tableCell, { flex: 0.8, textAlign: 'right', fontFamily: it.pctAcumulado <= 80 ? 'Helvetica-Bold' : 'Helvetica' }]}>{it.pctAcumulado.toFixed(1)}%</Text>
                  </View>
                ))}
              </View>

              {top5.length > 0 && (
                <View style={[styles.section, { marginTop: 16 }]}>
                  <Text style={styles.h2}>Top-5 {dimensionLabel} por Venta</Text>
                  {top5.map((t) => (
                    <BarRow key={t.nombre} label={t.nombre} valueLabel={formatSalesValue(t.monto, 'currency')} pct={top5Max > 0 ? (t.monto / top5Max) * 100 : 0} color="#1baf7a" />
                  ))}
                </View>
              )}
            </>
          ) : (
            <Text style={styles.muted}>No hay columna de producto ni de cliente disponible para calcular el análisis Pareto.</Text>
          )}
        </Page>
      )}

      {/* ── 3. Estacionalidad y Tendencia ── */}
      {hasData && (
        <Page size="A4" style={styles.page}>
          {chrome}
          <Text style={styles.h1}>Estacionalidad y Tendencia</Text>
          {findSeccion('Estacionalidad y Tendencia') && (
            <Text style={[styles.paragraph, { marginBottom: 14 }]}>{findSeccion('Estacionalidad y Tendencia')}</Text>
          )}

          {estacionalidad ? (
            <View style={{ flexDirection: 'row', gap: 10 }}>
              {estacionalidad.mesPico && (
                <View style={[styles.statCard, { backgroundColor: '#f0fdf4', borderColor: '#bbf7d0' }]}>
                  <Text style={[styles.statLabel, { color: '#15803d' }]}>Mes Pico</Text>
                  <Text style={[styles.statValue, { color: '#14532d' }]}>{estacionalidad.mesPico.periodo}</Text>
                  <Text style={[styles.statSub, { color: '#15803d' }]}>{formatSalesValue(estacionalidad.mesPico.monto, 'currency')}</Text>
                </View>
              )}
              {estacionalidad.mesValle && (
                <View style={[styles.statCard, { backgroundColor: '#fffbeb', borderColor: '#fde68a' }]}>
                  <Text style={[styles.statLabel, { color: '#b45309' }]}>Mes Valle</Text>
                  <Text style={[styles.statValue, { color: '#78350f' }]}>{estacionalidad.mesValle.periodo}</Text>
                  <Text style={[styles.statSub, { color: '#b45309' }]}>{formatSalesValue(estacionalidad.mesValle.monto, 'currency')}</Text>
                </View>
              )}
              {estacionalidad.coeficienteVariacion !== null && (
                <View style={[styles.statCard, { backgroundColor: '#f8fafc', borderColor: '#e2e8f0' }]}>
                  <Text style={[styles.statLabel, { color: '#475569' }]}>Coef. Variación Mensual</Text>
                  <Text style={[styles.statValue, { color: '#0f172a' }]}>{estacionalidad.coeficienteVariacion.toFixed(2)}</Text>
                  <Text style={[styles.statSub, { color: '#64748b' }]}>Más alto = más volátil</Text>
                </View>
              )}
            </View>
          ) : (
            <Text style={styles.muted}>Se necesitan al menos 3 meses distintos con fecha identificable para evaluar estacionalidad.</Text>
          )}
        </Page>
      )}

      {/* ── 4. Rentabilidad por Línea/Canal (condicional) ── */}
      {hasData && hasRentabilidadSeccion && (
        <Page size="A4" style={styles.page}>
          {chrome}
          <Text style={styles.h1}>Rentabilidad por Línea/Canal</Text>
          {findSeccion('Rentabilidad por Línea/Canal') && (
            <Text style={[styles.paragraph, { marginBottom: 14 }]}>{findSeccion('Rentabilidad por Línea/Canal')}</Text>
          )}

          {margenPorProducto && margenPorProducto.length > 0 && (
            <View style={styles.table}>
              <View style={styles.tableHeaderRow}>
                <Text style={[styles.tableHeaderCell, { flex: 1.4 }]}>Producto/Categoría</Text>
                <Text style={[styles.tableHeaderCell, { flex: 1, textAlign: 'right' }]}>Ventas</Text>
                <Text style={[styles.tableHeaderCell, { flex: 1, textAlign: 'right' }]}>Costo</Text>
                <Text style={[styles.tableHeaderCell, { flex: 0.8, textAlign: 'right' }]}>Margen</Text>
              </View>
              {margenPorProducto.map((m) => (
                <View key={m.nombre} style={styles.tableRow}>
                  <Text style={[styles.tableCell, { flex: 1.4 }]}>{m.nombre}</Text>
                  <Text style={[styles.tableCell, { flex: 1, textAlign: 'right' }]}>{formatSalesValue(m.monto, 'currency')}</Text>
                  <Text style={[styles.tableCell, { flex: 1, textAlign: 'right' }]}>{formatSalesValue(m.costo, 'currency')}</Text>
                  <Text style={[styles.tableCell, { flex: 0.8, textAlign: 'right', fontFamily: 'Helvetica-Bold', color: m.margenPct >= 30 ? '#16a34a' : m.margenPct >= 10 ? '#d97706' : '#dc2626' }]}>{m.margenPct.toFixed(1)}%</Text>
                </View>
              ))}
            </View>
          )}

          {canal && canal.length > 0 && (
            <View style={[styles.section, { flexDirection: 'row', gap: 16, marginTop: 16 }]}>
              <PieChartPdf title="Ventas por Canal" data={canalPieData} />
              <View style={{ flex: 1 }}>
                {canal.map((c) => (
                  <BarRow key={c.nombre} label={c.nombre} valueLabel={formatSalesValue(c.monto, 'currency')} pct={c.pctTotal} color="#eb6834" />
                ))}
              </View>
            </View>
          )}
        </Page>
      )}

      {/* ── Mapa de riesgos y señales de alerta ── */}
      {(riskMap.length > 0 || riesgosOrdenados.length > 0 || (narrative?.senales_alerta?.length ?? 0) > 0) && (
        <Page size="A4" style={styles.page}>
          {chrome}
          <Text style={styles.h1}>Riesgos Comerciales y Señales de Alerta</Text>

          {riskMap.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.h2}>Mapa de Riesgos y Semaforización</Text>
              <View style={styles.tableHeaderRow}>
                <Text style={[styles.tableHeaderCell, { flex: 1.6 }]}>Indicador</Text>
                <Text style={[styles.tableHeaderCell, { flex: 0.8 }]}>Nivel</Text>
                <Text style={[styles.tableHeaderCell, { flex: 1, textAlign: 'right' }]}>Valor</Text>
              </View>
              {riskMap.map((r, i) => (
                <View key={i} style={[styles.tableRow, { backgroundColor: NIVEL_ROW_BG[r.nivel] }]}>
                  <Text style={[styles.tableCell, { flex: 1.6 }]}>{r.indicador}</Text>
                  <Text style={[styles.tableCell, { flex: 0.8, color: NIVEL_COLOR[r.nivel], fontFamily: 'Helvetica-Bold' }]}>{NIVEL_LABEL[r.nivel]}</Text>
                  <Text style={[styles.tableCell, { flex: 1, textAlign: 'right', fontFamily: 'Helvetica-Bold' }]}>{r.señal}</Text>
                </View>
              ))}
            </View>
          )}

          {riesgosOrdenados.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.h2}>Riesgos Priorizados</Text>
              {riesgosOrdenados.map((r, i) => (
                <View key={i} style={[styles.riskCard, { borderColor: NIVEL_COLOR[r.nivel] || '#cbd5e1' }]} wrap={false}>
                  <Text style={[styles.riskBadge, { color: NIVEL_COLOR[r.nivel] || '#334155' }]}>
                    {PRIORIDAD_LABEL[r.prioridad] || r.prioridad} · {(NIVEL_LABEL[r.nivel] || r.nivel).toUpperCase()} · tendencia: {r.tendencia}
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
            Este informe se emite sobre la base de la base de datos de ventas suministrada y de la narrativa
            generada automáticamente por el motor de análisis de Datanalytic. No constituye una auditoría de
            estados financieros.
          </Text>
          <AiProviderPdfNote provider={narrative.ai_provider} />
        </Page>
      )}

      {/* ── Anexo técnico: metodología y definiciones ── */}
      <Page size="A4" style={styles.page}>
        {chrome}
        <Text style={styles.h1}>Anexo Técnico: Metodología y Definiciones</Text>

        <View style={styles.section}>
          <Text style={styles.h2}>A.1 Indicadores</Text>
          <View style={styles.listItem} wrap={false}>
            <Text style={styles.listBullet}>•</Text>
            <Text style={styles.listText}>Ticket promedio = Ventas totales / número de transacciones.</Text>
          </View>
          <View style={styles.listItem} wrap={false}>
            <Text style={styles.listBullet}>•</Text>
            <Text style={styles.listText}>Margen bruto = (Ventas - Costo) / Ventas, sobre las filas que traen costo identificable.</Text>
          </View>
          <View style={styles.listItem} wrap={false}>
            <Text style={styles.listBullet}>•</Text>
            <Text style={styles.listText}>
              Análisis Pareto 80/20: agrupado por producto/categoría cuando esa columna está disponible; si no, por
              cliente. Identifica el número mínimo de elementos, ordenados de mayor a menor venta, cuya suma
              acumulada alcanza el 80% del total.
            </Text>
          </View>
          <View style={styles.listItem} wrap={false}>
            <Text style={styles.listBullet}>•</Text>
            <Text style={styles.listText}>
              Coeficiente de variación estacional = desviación estándar de las ventas mensuales / promedio mensual.
              Más alto indica mayor volatilidad mes a mes.
            </Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.h2}>A.2 Limitaciones</Text>
          <View style={styles.listItem} wrap={false}>
            <Text style={styles.listBullet}>•</Text>
            <Text style={styles.listText}>
              La evolución temporal, la estacionalidad y el comparativo de crecimiento requieren una columna de
              fecha/período identificable; sin ella, esas secciones quedan sin calcular.
            </Text>
          </View>
          <View style={styles.listItem} wrap={false}>
            <Text style={styles.listBullet}>•</Text>
            <Text style={styles.listText}>
              Este informe se genera automáticamente a partir del archivo suministrado. No constituye una auditoría
              ni un dictamen de revisoría fiscal.
            </Text>
          </View>
        </View>
      </Page>
    </Document>
  );
}
