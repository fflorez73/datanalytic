import 'server-only';
import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';
import {
  INDICATOR_SECTIONS,
  KPI_HEADLINE_DEFS,
  classifyIndicator,
  formatIndicatorValue,
  scoreVsIdeal,
  type ComparativoPeriodoAnterior,
  type IndicatorFormat,
} from '@/lib/financial-indicators';
import { STATUS_HEX } from '@/lib/status-colors';
import type { FinancialNarrative } from '@/lib/generate-narrative';

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

const CORE_SECTION_KEYS = ['liquidez', 'endeudamiento', 'rentabilidad'] as const;

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
  coverMetaRow: { flexDirection: 'row', marginTop: 24, gap: 24 },
  coverMetaLabel: { fontSize: 9, color: '#94a3b8', textTransform: 'uppercase' },
  coverMetaValue: { fontSize: 12, color: '#ffffff', marginTop: 3 },
  coverFooter: { fontSize: 9, color: '#94a3b8' },

  page: { padding: 40, paddingBottom: 56, fontFamily: 'Helvetica', fontSize: 10, color: '#1e293b' },
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

  riskCard: { borderRadius: 5, borderWidth: 1, padding: 8, marginBottom: 6 },
  riskBadge: { fontSize: 8, fontFamily: 'Helvetica-Bold', marginBottom: 3 },
  riskText: { fontSize: 9.5, color: '#334155', lineHeight: 1.35 },

  footer: {
    position: 'absolute',
    bottom: 24,
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
});

function PageFooter({ generatedAt }: { generatedAt: string }) {
  return (
    <View style={styles.footer} fixed>
      <Text>Confidencial — uso interno de junta directiva</Text>
      <Text>Generado el {generatedAt}</Text>
    </View>
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

export function AnalysisPdfDocument({
  companyName,
  title,
  analysisTypeName,
  periodStart,
  periodEnd,
  status,
  results,
  narrative,
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
  const resultsObj = results && typeof results === 'object' ? results : {};
  const comparativo: ComparativoPeriodoAnterior | null = resultsObj.comparativo_periodo_anterior ?? null;
  const cuentas = resultsObj.cuentas_detectadas ?? {};

  const kpiCards = KPI_HEADLINE_DEFS.map((def) => {
    const value = resultsObj[def.section]?.[def.key];
    if (value === null || value === undefined) return null;
    return { label: def.label, value: formatIndicatorValue(value, def.format) };
  }).filter((k): k is NonNullable<typeof k> => k !== null);

  if (typeof cuentas.utilidad_neta === 'number') {
    kpiCards.push({ label: 'Utilidad Neta', value: formatIndicatorValue(cuentas.utilidad_neta, 'currency') });
  }

  const coreSections = INDICATOR_SECTIONS.filter((s) => (CORE_SECTION_KEYS as readonly string[]).includes(s.key));
  const dupontSection = INDICATOR_SECTIONS.find((s) => s.key === 'dupont');
  const cicloSection = INDICATOR_SECTIONS.find((s) => s.key === 'ciclo_efectivo');

  return (
    <Document title={`${title} — ${companyName}`} author="Datanalytic">
      {/* ── Portada ── */}
      <Page size="A4" style={styles.cover}>
        <View>
          <Text style={styles.coverEyebrow}>Informe Ejecutivo · Junta Directiva</Text>
          <Text style={styles.coverCompany}>{companyName}</Text>
          <Text style={styles.coverTitle}>{title}</Text>

          <View style={styles.coverMetaRow}>
            <View>
              <Text style={styles.coverMetaLabel}>Período</Text>
              <Text style={styles.coverMetaValue}>
                {periodStart} — {periodEnd}
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
          <Text style={styles.coverFooter}>Confidencial — uso interno de junta directiva</Text>
          <Text style={[styles.coverFooter, { marginTop: 2 }]}>Generado el {generatedAt}</Text>
        </View>
      </Page>

      {/* ── Resumen ejecutivo, dictamen, KPIs ── */}
      <Page size="A4" style={styles.page}>
        <Text style={styles.h1}>Resumen Ejecutivo</Text>

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

        {narrative?.resumen_ejecutivo && <Text style={styles.paragraph}>{narrative.resumen_ejecutivo}</Text>}

        {narrative && narrative.hallazgos_clave?.length > 0 && (
          <View style={[styles.section, { marginTop: 16 }]}>
            <Text style={styles.h2}>Hallazgos Clave</Text>
            {narrative.hallazgos_clave.map((h, i) => (
              <View key={i} style={styles.listItem}>
                <Text style={styles.listBullet}>•</Text>
                <Text style={styles.listText}>{h}</Text>
              </View>
            ))}
          </View>
        )}

        {narrative && narrative.riesgos?.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.h2}>Riesgos</Text>
            {narrative.riesgos.map((r, i) => (
              <View key={i} style={[styles.riskCard, { borderColor: RIESGO_NIVEL_COLOR[r.nivel] || '#cbd5e1' }]}>
                <Text style={[styles.riskBadge, { color: RIESGO_NIVEL_COLOR[r.nivel] || '#334155' }]}>
                  {(RIESGO_NIVEL_LABEL[r.nivel] || r.nivel).toUpperCase()} · tendencia: {r.tendencia}
                </Text>
                <Text style={styles.riskText}>{r.descripcion}</Text>
              </View>
            ))}
          </View>
        )}

        <PageFooter generatedAt={generatedAt} />
      </Page>

      {/* ── Indicadores por sección ── */}
      <Page size="A4" style={styles.page}>
        <Text style={styles.h1}>Indicadores Financieros</Text>

        {coreSections.map((section) => {
          const items = section.items.map((item) => ({
            ...item,
            value: (resultsObj[section.key]?.[item.key] ?? null) as number | null,
          }));

          return (
            <View key={section.key} style={styles.section}>
              <Text style={styles.h2}>{section.title}</Text>
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
              <IndicatorPdfTable items={items} />
            </View>
          );
        })}

        {dupontSection && resultsObj.dupont && (
          <View style={styles.section}>
            <Text style={styles.h2}>{dupontSection.title}</Text>
            <IndicatorPdfTable
              items={dupontSection.items.map((item) => ({
                ...item,
                value: (resultsObj.dupont?.[item.key] ?? null) as number | null,
              }))}
            />
          </View>
        )}

        {cicloSection && resultsObj.ciclo_efectivo && (
          <View style={styles.section}>
            <Text style={styles.h2}>{cicloSection.title}</Text>
            {cicloSection.items.map((item) => {
              const value = resultsObj.ciclo_efectivo?.[item.key];
              if (typeof value !== 'number') return null;
              const allValues = cicloSection.items
                .map((it) => resultsObj.ciclo_efectivo?.[it.key])
                .filter((v): v is number => typeof v === 'number');
              const maxAbs = Math.max(1, ...allValues.map((v) => Math.abs(v)));
              return (
                <BarRow
                  key={item.key}
                  label={item.label}
                  valueLabel={formatIndicatorValue(value, item.format)}
                  pct={(Math.abs(value) / maxAbs) * 100}
                  color={STATUS_HEX[classifyIndicator(item.key, value)]}
                />
              );
            })}
            <IndicatorPdfTable
              items={cicloSection.items.map((item) => ({
                ...item,
                value: (resultsObj.ciclo_efectivo?.[item.key] ?? null) as number | null,
              }))}
            />
          </View>
        )}

        <PageFooter generatedAt={generatedAt} />
      </Page>

      {/* ── Comparativo, observaciones, recomendaciones, conclusión ── */}
      {(comparativo || (narrative && (narrative.observaciones?.length > 0 || narrative.recomendaciones?.length > 0 || narrative.conclusion))) && (
        <Page size="A4" style={styles.page}>
          {comparativo && (
            <View style={styles.section}>
              <Text style={styles.h1}>Comparativo vs. Período Anterior</Text>
              <Text style={[styles.muted, { marginBottom: 10 }]}>Contra el análisis cerrado en {comparativo.period_end_base}</Text>

              <View style={styles.tableHeaderRow}>
                <Text style={[styles.tableHeaderCell, { flex: 1 }]}>Indicador</Text>
                <Text style={[styles.tableHeaderCell, { width: 70, textAlign: 'right' }]}>Anterior</Text>
                <Text style={[styles.tableHeaderCell, { width: 70, textAlign: 'right' }]}>Actual</Text>
                <Text style={[styles.tableHeaderCell, { width: 70, textAlign: 'right' }]}>Variación</Text>
              </View>
              {INDICATOR_SECTIONS.flatMap((section) =>
                section.items.map((item) => {
                  const entry = (comparativo.indicadores as any)?.[section.key]?.[item.key];
                  if (!entry) return null;
                  const variacion =
                    entry.variacion_puntos_porcentuales !== null
                      ? `${entry.variacion_puntos_porcentuales >= 0 ? '+' : ''}${entry.variacion_puntos_porcentuales.toFixed(1)} pp`
                      : entry.variacion_relativa_pct !== null
                        ? `${entry.variacion_relativa_pct >= 0 ? '+' : ''}${entry.variacion_relativa_pct.toFixed(1)}%`
                        : `${entry.variacion_absoluta >= 0 ? '+' : ''}${entry.variacion_absoluta}`;
                  return (
                    <View key={`${section.key}.${item.key}`} style={styles.tableRow}>
                      <Text style={[styles.tableCell, { flex: 1 }]}>{item.label}</Text>
                      <Text style={[styles.tableCell, { width: 70, textAlign: 'right' }]}>
                        {formatIndicatorValue(entry.valor_anterior, item.format)}
                      </Text>
                      <Text style={[styles.tableCell, { width: 70, textAlign: 'right', fontFamily: 'Helvetica-Bold' }]}>
                        {formatIndicatorValue(entry.valor_actual, item.format)}
                      </Text>
                      <Text style={[styles.tableCell, { width: 70, textAlign: 'right' }]}>{variacion}</Text>
                    </View>
                  );
                })
              )}
            </View>
          )}

          {narrative && narrative.observaciones?.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.h2}>Observaciones</Text>
              {narrative.observaciones.map((o, i) => (
                <View key={i} style={styles.listItem}>
                  <Text style={styles.listBullet}>•</Text>
                  <Text style={styles.listText}>{o}</Text>
                </View>
              ))}
            </View>
          )}

          {narrative && narrative.recomendaciones?.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.h2}>Recomendaciones</Text>
              <View style={styles.tableHeaderRow}>
                <Text style={[styles.tableHeaderCell, { flex: 2 }]}>Acción</Text>
                <Text style={[styles.tableHeaderCell, { flex: 1 }]}>Responsable</Text>
                <Text style={[styles.tableHeaderCell, { flex: 1 }]}>Horizonte</Text>
              </View>
              {narrative.recomendaciones.map((r, i) => (
                <View key={i} style={styles.tableRow}>
                  <Text style={[styles.tableCell, { flex: 2 }]}>{r.accion}</Text>
                  <Text style={[styles.tableCell, { flex: 1 }]}>{r.responsable_sugerido}</Text>
                  <Text style={[styles.tableCell, { flex: 1 }]}>{r.horizonte}</Text>
                </View>
              ))}
            </View>
          )}

          {narrative?.conclusion && (
            <View style={[styles.section, { backgroundColor: '#0f172a', borderRadius: 6, padding: 12 }]}>
              <Text style={[styles.h2, { color: '#ffffff' }]}>Conclusión</Text>
              <Text style={[styles.paragraph, { color: '#e2e8f0' }]}>{narrative.conclusion}</Text>
            </View>
          )}

          <PageFooter generatedAt={generatedAt} />
        </Page>
      )}
    </Document>
  );
}
