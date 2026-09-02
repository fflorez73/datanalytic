import 'server-only';
import { Document, Page, Path, Svg, Text, View, StyleSheet } from '@react-pdf/renderer';
import { formatOperationsValue, buildOperationsRiskMap, type OperationsAnalyticsResult } from '@/lib/operations-analytics';
import type { OperationsNarrative } from '@/lib/generate-operations-narrative';
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

function sanitizeNarrativeForPdf(n: OperationsNarrative | null): OperationsNarrative | null {
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
});

function PageChrome({ companyName, generatedAt }: { companyName: string; generatedAt: string }) {
  return (
    <>
      <View style={styles.pageHeader} fixed>
        <Text>Análisis Operativo - {companyName}</Text>
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

const PIE_COLORS = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#4a3aa7', '#e34948'];

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

export function OperationsPdfDocument({
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
  narrative: OperationsNarrative | null;
  generatedAt: string;
}) {
  const narrative = sanitizeNarrativeForPdf(narrativeInput);
  const r: Partial<OperationsAnalyticsResult> = results && typeof results === 'object' ? results : {};
  const items = r.items ?? [];
  const resumen = r.resumen ?? null;
  const ranking = r.ranking ?? null;
  const tiempoCiclo = r.tiempoCiclo ?? null;
  const correlacion = r.correlacionAusentismoProductividad ?? null;
  const comparativo = r.comparativo_periodo_anterior ?? null;
  const hasData = resumen !== null;

  function findSeccion(tituloBuscado: string): string | undefined {
    const analisis = narrative?.secciones?.find((s) => s.titulo === tituloBuscado)?.analisis;
    return analisis ? analisis : undefined;
  }

  const kpiCards = hasData
    ? [
        ...(resumen!.utilizacionCapacidadPromedio !== null ? [{ label: 'Utilización de Capacidad', value: formatOperationsValue(resumen!.utilizacionCapacidadPromedio, 'percent') }] : []),
        ...(resumen!.cumplimientoMetaPromedio !== null ? [{ label: 'Cumplimiento de Meta', value: formatOperationsValue(resumen!.cumplimientoMetaPromedio, 'percent') }] : []),
        ...(resumen!.tasaDefectosPromedio !== null ? [{ label: 'Tasa de Defectos', value: formatOperationsValue(resumen!.tasaDefectosPromedio, 'percent') }] : []),
        ...(resumen!.costoPorUnidadPromedio !== null ? [{ label: 'Costo por Unidad', value: formatOperationsValue(resumen!.costoPorUnidadPromedio, 'currency') }] : []),
      ]
    : [];

  const rankingMax = ranking && ranking.items.length > 0 ? Math.max(...ranking.items.map((i) => i.valor)) : 0;

  const costoPorAreaData = items.filter((it) => it.costoOperativo !== null && it.costoOperativo > 0);
  const costoTotalParaPie = costoPorAreaData.reduce((s, it) => s + (it.costoOperativo ?? 0), 0);
  const costoPieData = costoPorAreaData.map((it, i) => ({
    label: it.area,
    value: costoTotalParaPie > 0 ? (it.costoOperativo as number) / costoTotalParaPie : 0,
    color: PIE_COLORS[i % PIE_COLORS.length],
  }));

  const riskMap = hasData ? buildOperationsRiskMap(r as OperationsAnalyticsResult) : [];
  const riesgosOrdenados = narrative?.riesgos
    ? [...narrative.riesgos].sort((a, b) => (PRIORIDAD_RANK[a.prioridad] ?? 1) - (PRIORIDAD_RANK[b.prioridad] ?? 1))
    : [];

  const chrome = <PageChrome companyName={companyName} generatedAt={generatedAt} />;

  return (
    <Document title={`${title} - ${companyName}`} author="Datanalytic">
      {/* ── Portada ── */}
      <Page size="A4" style={styles.cover}>
        <View>
          <Text style={styles.coverEyebrow}>Informe Ejecutivo · Diagnóstico Operativo</Text>
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

      {/* ── 1. Productividad y Utilización de Capacidad ── */}
      {hasData && (
        <Page size="A4" style={styles.page}>
          {chrome}
          <Text style={styles.h1}>Productividad y Utilización de Capacidad</Text>
          {findSeccion('Productividad y Utilización de Capacidad') && (
            <Text style={[styles.paragraph, { marginBottom: 14 }]}>{findSeccion('Productividad y Utilización de Capacidad')}</Text>
          )}

          <View style={styles.table}>
            <View style={styles.tableHeaderRow}>
              <Text style={[styles.tableHeaderCell, { flex: 1.2 }]}>Área/Proceso</Text>
              <Text style={[styles.tableHeaderCell, { flex: 0.9, textAlign: 'right' }]}>Producción</Text>
              <Text style={[styles.tableHeaderCell, { flex: 0.9, textAlign: 'right' }]}>Productividad</Text>
              <Text style={[styles.tableHeaderCell, { flex: 0.9, textAlign: 'right' }]}>Utilización</Text>
            </View>
            {items.map((it) => (
              <View key={it.area} style={styles.tableRow}>
                <Text style={[styles.tableCell, { flex: 1.2, fontFamily: 'Helvetica-Bold' }]}>{it.area}</Text>
                <Text style={[styles.tableCell, { flex: 0.9, textAlign: 'right' }]}>{it.unidadesProducidas !== null ? formatOperationsValue(it.unidadesProducidas, 'integer') : '-'}</Text>
                <Text style={[styles.tableCell, { flex: 0.9, textAlign: 'right' }]}>{it.productividad !== null ? it.productividad.toFixed(2) : '-'}</Text>
                <Text style={[styles.tableCell, { flex: 0.9, textAlign: 'right' }]}>{it.utilizacionCapacidadPct !== null ? formatOperationsValue(it.utilizacionCapacidadPct, 'percent') : '-'}</Text>
              </View>
            ))}
          </View>

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
                const format = key.includes('utilizacion') || key.includes('cumplimiento') || key.includes('defectos') ? 'percent' : key.includes('costo') ? 'currency' : 'ratio';
                const label =
                  key === 'productividad_promedio' ? 'Productividad' :
                  key === 'utilizacion_capacidad_promedio' ? 'Utilización' :
                  key === 'cumplimiento_meta_promedio' ? 'Cumplimiento' :
                  key === 'tasa_defectos_promedio' ? '% Defectos' : 'Costo/Unidad';
                const variacion = entry.variacion_relativa_pct !== null ? `${entry.variacion_relativa_pct >= 0 ? '+' : ''}${entry.variacion_relativa_pct.toFixed(1)}%` : `${entry.variacion_absoluta}`;
                return (
                  <View key={key} style={styles.tableRow}>
                    <Text style={[styles.tableCell, { flex: 1.4 }]}>{label}</Text>
                    <Text style={[styles.tableCell, { flex: 1, textAlign: 'right' }]}>{formatOperationsValue(entry.valor_anterior, format as any)}</Text>
                    <Text style={[styles.tableCell, { flex: 1, textAlign: 'right', fontFamily: 'Helvetica-Bold' }]}>{formatOperationsValue(entry.valor_actual, format as any)}</Text>
                    <Text style={[styles.tableCell, { flex: 1, textAlign: 'right', color: (entry.variacion_relativa_pct ?? 0) >= 0 ? '#16a34a' : '#dc2626', fontFamily: 'Helvetica-Bold' }]}>{variacion}</Text>
                  </View>
                );
              })}
            </View>
          )}
        </Page>
      )}

      {/* ── 2. Cumplimiento de Metas y Desempeño Comparativo ── */}
      {hasData && (
        <Page size="A4" style={styles.page}>
          {chrome}
          <Text style={styles.h1}>Cumplimiento de Metas y Desempeño Comparativo</Text>
          {findSeccion('Cumplimiento de Metas y Desempeño Comparativo') && (
            <Text style={[styles.paragraph, { marginBottom: 14 }]}>{findSeccion('Cumplimiento de Metas y Desempeño Comparativo')}</Text>
          )}

          {ranking ? (
            <>
              <Text style={[styles.muted, { marginBottom: 8 }]}>Ranking por {ranking.metrica === 'cumplimiento' ? 'Cumplimiento de Meta' : ranking.metrica === 'utilizacion' ? 'Utilización de Capacidad' : 'Productividad'}</Text>
              {ranking.items.map((it) => (
                <BarRow key={it.area} label={it.area} valueLabel={it.valor.toFixed(2)} pct={rankingMax > 0 ? (it.valor / rankingMax) * 100 : 0} color="#2a78d6" />
              ))}
              {ranking.mejor && ranking.peor && (
                <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
                  <View style={[styles.statCard, { backgroundColor: '#f0fdf4', borderColor: '#bbf7d0' }]}>
                    <Text style={[styles.statLabel, { color: '#15803d' }]}>Mejor Desempeño</Text>
                    <Text style={[styles.statValue, { color: '#14532d' }]}>{ranking.mejor.area}</Text>
                  </View>
                  <View style={[styles.statCard, { backgroundColor: '#fef2f2', borderColor: '#fecaca' }]}>
                    <Text style={[styles.statLabel, { color: '#b91c1c' }]}>Peor Desempeño</Text>
                    <Text style={[styles.statValue, { color: '#7f1d1d' }]}>{ranking.peor.area}</Text>
                  </View>
                </View>
              )}
            </>
          ) : (
            <Text style={styles.muted}>No hay suficientes datos de cumplimiento, utilización o productividad para construir un ranking comparativo.</Text>
          )}
        </Page>
      )}

      {/* ── 3. Calidad: Tiempos de Ciclo y Tasa de Defectos ── */}
      {hasData && (
        <Page size="A4" style={styles.page}>
          {chrome}
          <Text style={styles.h1}>Calidad: Tiempos de Ciclo y Tasa de Defectos</Text>
          {findSeccion('Calidad: Tiempos de Ciclo y Tasa de Defectos') && (
            <Text style={[styles.paragraph, { marginBottom: 14 }]}>{findSeccion('Calidad: Tiempos de Ciclo y Tasa de Defectos')}</Text>
          )}

          {tiempoCiclo ? (
            <View style={{ flexDirection: 'row', gap: 10, marginBottom: 16 }}>
              <View style={[styles.statCard, { backgroundColor: '#f8fafc', borderColor: '#e2e8f0' }]}>
                <Text style={[styles.statLabel, { color: '#475569' }]}>Tiempo de Ciclo Promedio</Text>
                <Text style={[styles.statValue, { color: '#0f172a' }]}>{tiempoCiclo.promedio.toFixed(2)}</Text>
              </View>
              <View style={[styles.statCard, { backgroundColor: '#f8fafc', borderColor: '#e2e8f0' }]}>
                <Text style={[styles.statLabel, { color: '#475569' }]}>Desviación Estándar</Text>
                <Text style={[styles.statValue, { color: '#0f172a' }]}>{tiempoCiclo.desviacionEstandar.toFixed(2)}</Text>
              </View>
              <View style={[styles.statCard, { backgroundColor: '#f8fafc', borderColor: '#e2e8f0' }]}>
                <Text style={[styles.statLabel, { color: '#475569' }]}>Coef. de Variación</Text>
                <Text style={[styles.statValue, { color: '#0f172a' }]}>{tiempoCiclo.coeficienteVariacion.toFixed(2)}</Text>
              </View>
            </View>
          ) : (
            <Text style={[styles.muted, { marginBottom: 12 }]}>No se identificó la columna de tiempo de ciclo — quedó sin calcular.</Text>
          )}

          <View style={styles.table}>
            <View style={styles.tableHeaderRow}>
              <Text style={[styles.tableHeaderCell, { flex: 1.2 }]}>Área/Proceso</Text>
              <Text style={[styles.tableHeaderCell, { flex: 0.9, textAlign: 'right' }]}>Tiempo de Ciclo</Text>
              <Text style={[styles.tableHeaderCell, { flex: 0.9, textAlign: 'right' }]}>Tasa de Defectos</Text>
            </View>
            {items.map((it) => (
              <View key={it.area} style={styles.tableRow}>
                <Text style={[styles.tableCell, { flex: 1.2, fontFamily: 'Helvetica-Bold' }]}>{it.area}</Text>
                <Text style={[styles.tableCell, { flex: 0.9, textAlign: 'right' }]}>{it.tiempoCiclo !== null ? it.tiempoCiclo.toFixed(2) : '-'}</Text>
                <Text style={[styles.tableCell, { flex: 0.9, textAlign: 'right' }]}>{it.tasaDefectosPct !== null ? formatOperationsValue(it.tasaDefectosPct, 'percent') : '-'}</Text>
              </View>
            ))}
          </View>

          {correlacion && (
            <View style={[styles.section, { marginTop: 16 }]}>
              <Text style={styles.h2}>Correlación Aparente Ausentismo vs. Productividad</Text>
              <Text style={styles.paragraph}>
                Coeficiente: {correlacion.coeficiente.toFixed(2)} ({correlacion.lectura}), calculado sobre {correlacion.numAreas} área(s) con ambos datos disponibles.
                Correlación observacional, no un análisis causal.
              </Text>
            </View>
          )}
        </Page>
      )}

      {/* ── 4. Eficiencia de Costo Operativo ── */}
      {hasData && (
        <Page size="A4" style={styles.page}>
          {chrome}
          <Text style={styles.h1}>Eficiencia de Costo Operativo</Text>
          {findSeccion('Eficiencia de Costo Operativo') && (
            <Text style={[styles.paragraph, { marginBottom: 14 }]}>{findSeccion('Eficiencia de Costo Operativo')}</Text>
          )}

          {resumen!.costoOperativoTotal !== null && (
            <View style={{ flexDirection: 'row', gap: 10, marginBottom: 16 }}>
              <View style={[styles.statCard, { backgroundColor: '#eff6ff', borderColor: '#dbeafe' }]}>
                <Text style={[styles.statLabel, { color: '#1d4ed8' }]}>Costo Operativo Total</Text>
                <Text style={[styles.statValue, { color: '#0f172a' }]}>{formatOperationsValue(resumen!.costoOperativoTotal, 'currency')}</Text>
              </View>
              {resumen!.costoPorUnidadPromedio !== null && (
                <View style={[styles.statCard, { backgroundColor: '#eff6ff', borderColor: '#dbeafe' }]}>
                  <Text style={[styles.statLabel, { color: '#1d4ed8' }]}>Costo Promedio por Unidad</Text>
                  <Text style={[styles.statValue, { color: '#0f172a' }]}>{formatOperationsValue(resumen!.costoPorUnidadPromedio, 'currency')}</Text>
                </View>
              )}
            </View>
          )}

          {costoPieData.length > 0 ? (
            <View style={{ flexDirection: 'row', gap: 16 }}>
              <PieChartPdf title="Distribución de Costo por Área" data={costoPieData} />
            </View>
          ) : (
            <Text style={styles.muted}>No se identificó la columna de costo operativo — el costo por unidad y su distribución quedaron sin calcular.</Text>
          )}
        </Page>
      )}

      {/* ── Mapa de riesgos y señales de alerta ── */}
      {(riskMap.length > 0 || riesgosOrdenados.length > 0 || (narrative?.senales_alerta?.length ?? 0) > 0) && (
        <Page size="A4" style={styles.page}>
          {chrome}
          <Text style={styles.h1}>Riesgos Operativos y Señales de Alerta</Text>

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
            Este informe se emite sobre la base de la información operativa suministrada y de la narrativa
            generada automáticamente por el motor de análisis de Datanalytic. No constituye una auditoría
            operativa formal.
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
            <Text style={styles.listText}>Productividad = Unidades producidas / Horas-hombre (o personal asignado).</Text>
          </View>
          <View style={styles.listItem} wrap={false}>
            <Text style={styles.listBullet}>•</Text>
            <Text style={styles.listText}>Utilización de capacidad = Producción real / Capacidad instalada x 100.</Text>
          </View>
          <View style={styles.listItem} wrap={false}>
            <Text style={styles.listBullet}>•</Text>
            <Text style={styles.listText}>Cumplimiento de meta = Producción real / Meta x 100 (o el % de cumplimiento ya calculado si viene directo en el archivo).</Text>
          </View>
          <View style={styles.listItem} wrap={false}>
            <Text style={styles.listBullet}>•</Text>
            <Text style={styles.listText}>Tasa de defectos/reprocesos = Defectos / Producción total x 100 (o la tasa ya calculada si viene directo en el archivo).</Text>
          </View>
          <View style={styles.listItem} wrap={false}>
            <Text style={styles.listBullet}>•</Text>
            <Text style={styles.listText}>Costo operativo por unidad = Costo total del área/proceso / Unidades producidas.</Text>
          </View>
          <View style={styles.listItem} wrap={false}>
            <Text style={styles.listBullet}>•</Text>
            <Text style={styles.listText}>
              Los indicadores consolidados se calculan sobre totales agregados (no como promedio simple de los
              ratios por área), evitando que un área pequeña distorsione el indicador de toda la operación.
            </Text>
          </View>
          <View style={styles.listItem} wrap={false}>
            <Text style={styles.listBullet}>•</Text>
            <Text style={styles.listText}>
              El ranking comparativo usa la métrica (cumplimiento de meta, utilización o productividad) con mayor
              cobertura de datos entre las áreas analizadas.
            </Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.h2}>A.2 Limitaciones</Text>
          <View style={styles.listItem} wrap={false}>
            <Text style={styles.listBullet}>•</Text>
            <Text style={styles.listText}>
              Este es un módulo flexible: cada indicador se calcula únicamente si el archivo trae las columnas
              necesarias. Un indicador o sección ausente refleja falta de datos, no un resultado de cero o nulo
              en la operación real.
            </Text>
          </View>
          <View style={styles.listItem} wrap={false}>
            <Text style={styles.listBullet}>•</Text>
            <Text style={styles.listText}>
              La correlación entre ausentismo y productividad, cuando se reporta, es observacional y simple
              (coeficiente de Pearson) — no implica causalidad ni controla por otras variables.
            </Text>
          </View>
          <View style={styles.listItem} wrap={false}>
            <Text style={styles.listBullet}>•</Text>
            <Text style={styles.listText}>
              Este informe se genera automáticamente a partir del archivo suministrado. No constituye una
              auditoría operativa formal.
            </Text>
          </View>
        </View>
      </Page>
    </Document>
  );
}
