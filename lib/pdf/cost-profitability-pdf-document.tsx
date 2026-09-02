import 'server-only';
import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';
import { formatCostValue, buildCostRiskMap, type CostAnalyticsResult } from '@/lib/cost-profitability-analytics';
import type { CostProfitabilityNarrative } from '@/lib/generate-cost-profitability-narrative';
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

function sanitizeNarrativeForPdf(n: CostProfitabilityNarrative | null): CostProfitabilityNarrative | null {
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
  kpiValue: { fontSize: 14, fontFamily: 'Helvetica-Bold', color: '#0f172a' },
  kpiLabel: { fontSize: 8, color: '#64748b', marginTop: 2 },

  section: { marginBottom: 18 },
  barRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 6, gap: 8 },
  barLabelCol: { width: 100 },
  barLabel: { fontSize: 8.5, color: '#334155' },
  barTrackCol: { flex: 1, height: 8, borderRadius: 4, backgroundColor: '#e2e8f0' },
  barFill: { height: 8, borderRadius: 4 },
  barValueCol: { width: 80, textAlign: 'right' },
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
});

function PageChrome({ companyName, generatedAt }: { companyName: string; generatedAt: string }) {
  return (
    <>
      <View style={styles.pageHeader} fixed>
        <Text>Análisis de Costos y Rentabilidad - {companyName}</Text>
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

export function CostProfitabilityPdfDocument({
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
  narrative: CostProfitabilityNarrative | null;
  generatedAt: string;
}) {
  const narrative = sanitizeNarrativeForPdf(narrativeInput);
  const r: Partial<CostAnalyticsResult> = results && typeof results === 'object' ? results : {};
  const resumen = r.resumen ?? null;
  const items = r.items ?? [];
  const ranking = r.ranking ?? null;
  const productosEnPerdida = r.productosEnPerdida ?? [];
  const productoMasRentable = r.productoMasRentable ?? null;
  const comparativo = r.comparativo_periodo_anterior ?? null;
  const hasData = resumen !== null;

  function findSeccion(tituloBuscado: string): string | undefined {
    const analisis = narrative?.secciones?.find((s) => s.titulo === tituloBuscado)?.analisis;
    return analisis ? analisis : undefined;
  }

  const kpiCards = hasData
    ? [
        ...(resumen!.utilidadNetaTotal !== null ? [{ label: 'Utilidad Total', value: formatCostValue(resumen!.utilidadNetaTotal, 'currency') }] : []),
        ...(resumen!.margenContribucionPromedioPct !== null ? [{ label: 'Margen Contrib. % Promedio', value: formatCostValue(resumen!.margenContribucionPromedioPct, 'percent') }] : []),
        ...(productoMasRentable !== null ? [{ label: 'Producto Más Rentable', value: productoMasRentable.producto }] : []),
        ...(resumen!.numProductosEnPerdida !== null && resumen!.numProductosEnPerdida > 0 && productosEnPerdida.length > 0
          ? [{ label: 'Producto con Pérdida', value: productosEnPerdida[0].producto }]
          : []),
      ]
    : [];

  const rankingMax = ranking && ranking.items.length > 0 ? Math.max(...ranking.items.map((it) => Math.abs(it.valor))) : 0;

  const riskMap = hasData ? buildCostRiskMap(r as CostAnalyticsResult) : [];
  const riesgosOrdenados = narrative?.riesgos
    ? [...narrative.riesgos].sort((a, b) => (PRIORIDAD_RANK[a.prioridad] ?? 1) - (PRIORIDAD_RANK[b.prioridad] ?? 1))
    : [];

  const itemsConVariacion = items.filter((it) => it.variacionPresupuestalPct !== null);
  const itemsConRoi = items.filter((it) => it.roiPct !== null);

  const chrome = <PageChrome companyName={companyName} generatedAt={generatedAt} />;

  return (
    <Document title={`${title} - ${companyName}`} author="Datanalytic">
      {/* ── Portada ── */}
      <Page size="A4" style={styles.cover}>
        <View>
          <Text style={styles.coverEyebrow}>Informe Ejecutivo · Costos y Rentabilidad por Producto/Proyecto</Text>
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

      {/* ── 1. Rentabilidad por Producto/Proyecto ── */}
      {hasData && (
        <Page size="A4" style={styles.page}>
          {chrome}
          <Text style={styles.h1}>Rentabilidad por Producto/Proyecto</Text>
          {findSeccion('Rentabilidad por Producto/Proyecto') && (
            <Text style={[styles.paragraph, { marginBottom: 14 }]}>{findSeccion('Rentabilidad por Producto/Proyecto')}</Text>
          )}

          {ranking && ranking.items.length > 0 ? (
            ranking.items.map((it) => (
              <BarRow
                key={it.producto}
                label={it.producto}
                valueLabel={ranking.metrica === 'utilidad_neta' ? formatCostValue(it.valor, 'currency') : `${it.valor.toFixed(1)}%`}
                pct={rankingMax > 0 ? (Math.abs(it.valor) / rankingMax) * 100 : 0}
                color={it.enPerdida ? '#e34948' : '#1baf7a'}
              />
            ))
          ) : (
            <Text style={styles.muted}>No se identificaron ingreso y/o costo variable — la rentabilidad por producto/proyecto quedó sin calcular.</Text>
          )}

          {productosEnPerdida.length > 0 && (
            <View style={[styles.section, { marginTop: 16 }]}>
              <Text style={styles.h2}>Productos/Proyectos en Pérdida</Text>
              <View style={styles.tableHeaderRow}>
                <Text style={[styles.tableHeaderCell, { flex: 1.4 }]}>Producto/Proyecto</Text>
                <Text style={[styles.tableHeaderCell, { flex: 1, textAlign: 'right' }]}>Utilidad Neta</Text>
                <Text style={[styles.tableHeaderCell, { flex: 0.9, textAlign: 'right' }]}>Margen %</Text>
              </View>
              {productosEnPerdida.map((p) => (
                <View key={p.producto} style={[styles.tableRow, { backgroundColor: '#fef2f2' }]}>
                  <Text style={[styles.tableCell, { flex: 1.4, fontFamily: 'Helvetica-Bold' }]}>{p.producto}</Text>
                  <Text style={[styles.tableCell, { flex: 1, textAlign: 'right', color: '#dc2626' }]}>{p.utilidadNeta !== null ? formatCostValue(p.utilidadNeta, 'currency') : '-'}</Text>
                  <Text style={[styles.tableCell, { flex: 0.9, textAlign: 'right' }]}>{p.margenContribucionPct !== null ? formatCostValue(p.margenContribucionPct, 'percent') : '-'}</Text>
                </View>
              ))}
            </View>
          )}
        </Page>
      )}

      {/* ── 2. Estructura de Costos y Punto de Equilibrio ── */}
      {hasData && (
        <Page size="A4" style={styles.page}>
          {chrome}
          <Text style={styles.h1}>Estructura de Costos y Punto de Equilibrio</Text>
          {findSeccion('Estructura de Costos y Punto de Equilibrio') && (
            <Text style={[styles.paragraph, { marginBottom: 14 }]}>{findSeccion('Estructura de Costos y Punto de Equilibrio')}</Text>
          )}

          {resumen!.costoVariableTotal !== null && resumen!.costoFijoTotal !== null ? (
            <>
              <BarRow
                label="Costo Variable"
                valueLabel={formatCostValue(resumen!.costoVariableTotal, 'currency')}
                pct={(resumen!.costoVariableTotal / (resumen!.costoVariableTotal + resumen!.costoFijoTotal)) * 100}
                color="#2a78d6"
              />
              <BarRow
                label="Costo Fijo"
                valueLabel={formatCostValue(resumen!.costoFijoTotal, 'currency')}
                pct={(resumen!.costoFijoTotal / (resumen!.costoVariableTotal + resumen!.costoFijoTotal)) * 100}
                color="#eda100"
              />
            </>
          ) : (
            <Text style={styles.muted}>No se identificaron el costo variable y el costo fijo simultáneamente — la estructura de costos quedó sin calcular.</Text>
          )}

          {resumen!.puntoEquilibrioConsolidadoValor !== null && (
            <View style={[styles.section, { marginTop: 16 }]}>
              <Text style={styles.h2}>Punto de Equilibrio Consolidado ($)</Text>
              <Text style={{ fontSize: 14, fontFamily: 'Helvetica-Bold', color: '#0f172a' }}>{formatCostValue(resumen!.puntoEquilibrioConsolidadoValor, 'currency')}</Text>
            </View>
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
                const format = key.includes('pct') ? 'percent' : 'currency';
                const label =
                  key === 'ingreso_total' ? 'Ingreso Total' :
                  key === 'costo_total' ? 'Costo Total' :
                  key === 'margen_contribucion_promedio_pct' ? 'Margen Contrib. %' :
                  key === 'utilidad_neta_total' ? 'Utilidad Neta' : 'ROI Consolidado';
                const variacion = entry.variacion_relativa_pct !== null ? `${entry.variacion_relativa_pct >= 0 ? '+' : ''}${entry.variacion_relativa_pct.toFixed(1)}%` : `${entry.variacion_absoluta}`;
                return (
                  <View key={key} style={styles.tableRow}>
                    <Text style={[styles.tableCell, { flex: 1.4 }]}>{label}</Text>
                    <Text style={[styles.tableCell, { flex: 1, textAlign: 'right' }]}>{formatCostValue(entry.valor_anterior, format as any)}</Text>
                    <Text style={[styles.tableCell, { flex: 1, textAlign: 'right', fontFamily: 'Helvetica-Bold' }]}>{formatCostValue(entry.valor_actual, format as any)}</Text>
                    <Text style={[styles.tableCell, { flex: 1, textAlign: 'right', color: (entry.variacion_relativa_pct ?? 0) >= 0 ? '#16a34a' : '#dc2626', fontFamily: 'Helvetica-Bold' }]}>{variacion}</Text>
                  </View>
                );
              })}
            </View>
          )}
        </Page>
      )}

      {/* ── 3. Variación Presupuestal ── */}
      {hasData && (
        <Page size="A4" style={styles.page}>
          {chrome}
          <Text style={styles.h1}>Variación Presupuestal</Text>
          {findSeccion('Variación Presupuestal') && (
            <Text style={[styles.paragraph, { marginBottom: 14 }]}>{findSeccion('Variación Presupuestal')}</Text>
          )}

          {resumen!.variacionPresupuestalPromedioPct !== null && (
            <View style={[styles.section, { marginBottom: 8 }]}>
              <Text style={styles.h2}>Variación Presupuestal Consolidada</Text>
              <Text style={{ fontSize: 14, fontFamily: 'Helvetica-Bold', color: resumen!.variacionPresupuestalPromedioPct >= 0 ? '#16a34a' : '#dc2626' }}>
                {resumen!.variacionPresupuestalPromedioPct >= 0 ? '+' : ''}
                {formatCostValue(resumen!.variacionPresupuestalPromedioPct, 'percent')}
              </Text>
            </View>
          )}

          {itemsConVariacion.length > 0 ? (
            <View style={styles.table}>
              <View style={styles.tableHeaderRow}>
                <Text style={[styles.tableHeaderCell, { flex: 1.3 }]}>Producto/Proyecto</Text>
                <Text style={[styles.tableHeaderCell, { flex: 1, textAlign: 'right' }]}>Ingreso Real</Text>
                <Text style={[styles.tableHeaderCell, { flex: 1, textAlign: 'right' }]}>Presupuesto</Text>
                <Text style={[styles.tableHeaderCell, { flex: 0.8, textAlign: 'right' }]}>Variación</Text>
              </View>
              {itemsConVariacion.map((it) => (
                <View key={it.producto} style={styles.tableRow}>
                  <Text style={[styles.tableCell, { flex: 1.3 }]}>{it.producto}</Text>
                  <Text style={[styles.tableCell, { flex: 1, textAlign: 'right' }]}>{formatCostValue(it.ingreso, 'currency')}</Text>
                  <Text style={[styles.tableCell, { flex: 1, textAlign: 'right' }]}>{formatCostValue(it.presupuestoIngreso, 'currency')}</Text>
                  <Text style={[styles.tableCell, { flex: 0.8, textAlign: 'right', fontFamily: 'Helvetica-Bold', color: (it.variacionPresupuestalPct ?? 0) >= 0 ? '#16a34a' : '#dc2626' }]}>
                    {(it.variacionPresupuestalPct ?? 0) >= 0 ? '+' : ''}
                    {formatCostValue(it.variacionPresupuestalPct, 'percent')}
                  </Text>
                </View>
              ))}
            </View>
          ) : (
            <Text style={styles.muted}>No se identificó la columna de presupuesto/meta de ingreso — la variación presupuestal quedó sin calcular.</Text>
          )}
        </Page>
      )}

      {/* ── 4. Retorno de Inversión y Recomendaciones de Portafolio ── */}
      {hasData && (
        <Page size="A4" style={styles.page}>
          {chrome}
          <Text style={styles.h1}>Retorno de Inversión y Recomendaciones de Portafolio</Text>
          {findSeccion('Retorno de Inversión y Recomendaciones de Portafolio') && (
            <Text style={[styles.paragraph, { marginBottom: 14 }]}>{findSeccion('Retorno de Inversión y Recomendaciones de Portafolio')}</Text>
          )}

          {resumen!.roiConsolidadoPct !== null && (
            <View style={[styles.section, { marginBottom: 8 }]}>
              <Text style={styles.h2}>ROI Consolidado</Text>
              <Text style={{ fontSize: 14, fontFamily: 'Helvetica-Bold', color: '#0f172a' }}>{formatCostValue(resumen!.roiConsolidadoPct, 'percent')}</Text>
            </View>
          )}

          {itemsConRoi.length > 0 ? (
            <View style={styles.table}>
              <View style={styles.tableHeaderRow}>
                <Text style={[styles.tableHeaderCell, { flex: 1.3 }]}>Proyecto</Text>
                <Text style={[styles.tableHeaderCell, { flex: 1, textAlign: 'right' }]}>Inversión Inicial</Text>
                <Text style={[styles.tableHeaderCell, { flex: 1, textAlign: 'right' }]}>Utilidad Neta</Text>
                <Text style={[styles.tableHeaderCell, { flex: 0.8, textAlign: 'right' }]}>ROI</Text>
              </View>
              {itemsConRoi.map((it) => (
                <View key={it.producto} style={styles.tableRow}>
                  <Text style={[styles.tableCell, { flex: 1.3 }]}>{it.producto}</Text>
                  <Text style={[styles.tableCell, { flex: 1, textAlign: 'right' }]}>{formatCostValue(it.inversionInicial, 'currency')}</Text>
                  <Text style={[styles.tableCell, { flex: 1, textAlign: 'right' }]}>{formatCostValue(it.utilidadNeta, 'currency')}</Text>
                  <Text style={[styles.tableCell, { flex: 0.8, textAlign: 'right', fontFamily: 'Helvetica-Bold', color: (it.roiPct ?? 0) >= 0 ? '#16a34a' : '#dc2626' }]}>{formatCostValue(it.roiPct, 'percent')}</Text>
                </View>
              ))}
            </View>
          ) : (
            <Text style={styles.muted}>No se identificó la columna de inversión inicial — el ROI quedó sin calcular.</Text>
          )}
        </Page>
      )}

      {/* ── Mapa de riesgos y señales de alerta ── */}
      {(riskMap.length > 0 || riesgosOrdenados.length > 0 || (narrative?.senales_alerta?.length ?? 0) > 0) && (
        <Page size="A4" style={styles.page}>
          {chrome}
          <Text style={styles.h1}>Riesgos de Rentabilidad y Señales de Alerta</Text>

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
            Este informe se emite sobre la base de la información de costos suministrada y de la narrativa generada
            automáticamente por el motor de análisis de Datanalytic. No constituye una auditoría contable formal.
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
            <Text style={styles.listText}>Margen de contribución = Ingreso - Costo Variable. Margen de contribución (%) = Margen de Contribución / Ingreso x 100.</Text>
          </View>
          <View style={styles.listItem} wrap={false}>
            <Text style={styles.listBullet}>•</Text>
            <Text style={styles.listText}>Utilidad neta = Margen de Contribución - Costo Fijo asignado.</Text>
          </View>
          <View style={styles.listItem} wrap={false}>
            <Text style={styles.listBullet}>•</Text>
            <Text style={styles.listText}>Punto de equilibrio ($) = Costo Fijo / (Margen de Contribución % / 100). Punto de equilibrio (unidades) = Punto de Equilibrio ($) / Precio Unitario, cuando hay unidades vendidas/producidas disponibles para estimar el precio unitario.</Text>
          </View>
          <View style={styles.listItem} wrap={false}>
            <Text style={styles.listBullet}>•</Text>
            <Text style={styles.listText}>Variación presupuestal (%) = (Ingreso Real - Presupuesto) / Presupuesto x 100.</Text>
          </View>
          <View style={styles.listItem} wrap={false}>
            <Text style={styles.listBullet}>•</Text>
            <Text style={styles.listText}>ROI (%) = Utilidad Neta / Inversión Inicial x 100 — solo se calcula para los productos/proyectos que traen columna de inversión inicial.</Text>
          </View>
          <View style={styles.listItem} wrap={false}>
            <Text style={styles.listBullet}>•</Text>
            <Text style={styles.listText}>Los indicadores consolidados (margen %, variación presupuestal, ROI) se calculan ponderados por ingreso/presupuesto/inversión totales, no como promedio simple de los ratios por producto, evitando que un producto pequeño distorsione el indicador de todo el portafolio.</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.h2}>A.2 Limitaciones</Text>
          <View style={styles.listItem} wrap={false}>
            <Text style={styles.listBullet}>•</Text>
            <Text style={styles.listText}>
              Este es un módulo flexible: cada indicador se calcula únicamente si el archivo trae las columnas
              necesarias. Un indicador o sección ausente refleja falta de datos, no un resultado real de cero — el
              mapa de riesgos nunca marca "Saludable" un indicador que no pudo calcularse.
            </Text>
          </View>
          <View style={styles.listItem} wrap={false}>
            <Text style={styles.listBullet}>•</Text>
            <Text style={styles.listText}>
              El costo fijo se asume ya asignado por producto/proyecto en el archivo entregado; este informe no
              audita ni recalcula el criterio de distribución/prorrateo usado por la empresa.
            </Text>
          </View>
          <View style={styles.listItem} wrap={false}>
            <Text style={styles.listBullet}>•</Text>
            <Text style={styles.listText}>
              Este informe se genera automáticamente a partir del archivo suministrado. No constituye una auditoría
              contable formal ni asesoría financiera.
            </Text>
          </View>
        </View>
      </Page>
    </Document>
  );
}
