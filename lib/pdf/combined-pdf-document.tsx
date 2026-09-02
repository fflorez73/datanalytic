import 'server-only';
import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';
import type { CombinedNarrative } from '@/lib/generate-combined-narrative';
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

function sanitizeNarrativeForPdf(n: CombinedNarrative | null): CombinedNarrative | null {
  if (!n) return null;
  return {
    resumen_ejecutivo: sanitizeForPdf(n.resumen_ejecutivo),
    dictamen: n.dictamen,
    fuentes_utilizadas: Array.isArray(n.fuentes_utilizadas)
      ? n.fuentes_utilizadas.map((f) => ({ tipo: sanitizeForPdf(f?.tipo), periodo: sanitizeForPdf(f?.periodo), titulo: sanitizeForPdf(f?.titulo) }))
      : [],
    hallazgos_clave: Array.isArray(n.hallazgos_clave) ? n.hallazgos_clave.map(sanitizeForPdf) : [],
    conexiones_identificadas: Array.isArray(n.conexiones_identificadas)
      ? n.conexiones_identificadas.map((c) => ({ descripcion: sanitizeForPdf(c?.descripcion), modulos_involucrados: Array.isArray(c?.modulos_involucrados) ? c.modulos_involucrados.map(sanitizeForPdf) : [] }))
      : [],
    riesgos: Array.isArray(n.riesgos) ? n.riesgos.map((r) => ({ ...r, descripcion: sanitizeForPdf(r?.descripcion) })) : [],
    recomendaciones: Array.isArray(n.recomendaciones)
      ? n.recomendaciones.map((r) => ({ accion: sanitizeForPdf(r?.accion), responsable_sugerido: sanitizeForPdf(r?.responsable_sugerido), horizonte: sanitizeForPdf(r?.horizonte) }))
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
const PRIORIDAD_LABEL: Record<string, string> = { alta: 'PRIORIDAD ALTA', media: 'PRIORIDAD MEDIA', baja: 'PRIORIDAD BAJA' };
const PRIORIDAD_RANK: Record<string, number> = { alta: 0, media: 1, baja: 2 };

const MODULE_COLOR: Record<string, string> = {
  financiero: '#2563eb',
  clientes: '#9333ea',
  ventas: '#c026d3',
  inventarios: '#ea580c',
  operativo: '#d97706',
  nomina_talento: '#0d9488',
  costos_rentabilidad: '#4f46e5',
};
const MODULE_LABEL: Record<string, string> = {
  financiero: 'Financiero',
  clientes: 'Clientes',
  ventas: 'Ventas',
  inventarios: 'Inventarios',
  operativo: 'Operativo',
  nomina_talento: 'Nómina y Talento',
  costos_rentabilidad: 'Costos y Rentabilidad',
};

const styles = StyleSheet.create({
  cover: { padding: 56, backgroundColor: '#1e1b4b', color: '#ffffff', height: '100%', justifyContent: 'space-between', fontFamily: 'Helvetica' },
  coverEyebrow: { fontSize: 11, color: '#c4b5fd', textTransform: 'uppercase', letterSpacing: 1 },
  coverSpecialBadge: { fontSize: 10, fontFamily: 'Helvetica-Bold', color: '#1e1b4b', backgroundColor: '#c4b5fd', alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 4, marginTop: 12, textTransform: 'uppercase', letterSpacing: 0.5 },
  coverCompany: { fontSize: 26, fontFamily: 'Helvetica-Bold', marginTop: 14 },
  coverTitle: { fontSize: 15, color: '#ddd6fe', marginTop: 6 },
  coverConfidential: { fontSize: 11, fontFamily: 'Helvetica-Bold', color: '#fecaca', marginTop: 18, letterSpacing: 0.5 },
  coverMetaRow: { flexDirection: 'row', marginTop: 24, gap: 24 },
  coverMetaLabel: { fontSize: 9, color: '#a5b4fc', textTransform: 'uppercase' },
  coverMetaValue: { fontSize: 12, color: '#ffffff', marginTop: 3 },
  coverFooter: { fontSize: 9, color: '#a5b4fc' },

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

  h1: { fontSize: 16, fontFamily: 'Helvetica-Bold', color: '#1e1b4b', marginBottom: 12 },
  h2: { fontSize: 12, fontFamily: 'Helvetica-Bold', color: '#1e1b4b', marginBottom: 8, marginTop: 4 },
  muted: { fontSize: 9, color: '#64748b' },
  paragraph: { fontSize: 10.5, lineHeight: 1.5, color: '#334155' },

  dictamenBanner: { borderRadius: 6, padding: 14, marginBottom: 16 },
  dictamenBannerLabel: { fontSize: 8.5, color: '#ffffff', opacity: 0.85, textTransform: 'uppercase', marginBottom: 3 },
  dictamenBannerValue: { fontSize: 15, fontFamily: 'Helvetica-Bold', color: '#ffffff' },

  table: { marginTop: 4 },
  tableHeaderRow: { flexDirection: 'row', gap: 6, borderBottomWidth: 1, borderBottomColor: '#cbd5e1', paddingBottom: 4, marginBottom: 4 },
  tableRow: { flexDirection: 'row', gap: 6, borderBottomWidth: 0.5, borderBottomColor: '#e2e8f0', paddingVertical: 4 },
  tableHeaderCell: { fontSize: 8, color: '#64748b', textTransform: 'uppercase' },
  tableCell: { fontSize: 9, color: '#334155' },

  listItem: { flexDirection: 'row', gap: 6, marginBottom: 5 },
  listBullet: { fontSize: 9.5, color: '#4f46e5' },
  listText: { fontSize: 9.5, color: '#334155', flex: 1, lineHeight: 1.4 },
  bulletLarge: { fontSize: 12.5, color: '#334155', flex: 1, lineHeight: 1.5, fontFamily: 'Helvetica-Bold' },

  connectionCard: { borderRadius: 6, borderWidth: 1.5, borderColor: '#c4b5fd', backgroundColor: '#f5f3ff', padding: 10, marginBottom: 10 },
  connectionModules: { flexDirection: 'row', gap: 5, marginBottom: 6, flexWrap: 'wrap' },
  connectionModuleTag: { fontSize: 7.5, fontFamily: 'Helvetica-Bold', color: '#ffffff', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 3 },
  connectionText: { fontSize: 10, color: '#312e81', lineHeight: 1.4 },

  riskCard: { borderRadius: 5, borderWidth: 1, padding: 8, marginBottom: 6 },
  riskBadge: { fontSize: 8, fontFamily: 'Helvetica-Bold', marginBottom: 3 },
  riskText: { fontSize: 9.5, color: '#334155', lineHeight: 1.35 },

  recCard: { marginBottom: 10, paddingBottom: 8, borderBottomWidth: 0.5, borderBottomColor: '#e2e8f0' },
  recTitle: { fontSize: 10.5, fontFamily: 'Helvetica-Bold', color: '#1e1b4b', marginBottom: 2 },
  recMeta: { fontSize: 8.5, color: '#64748b', fontFamily: 'Helvetica-Oblique' },
});

function PageChrome({ companyName, generatedAt }: { companyName: string; generatedAt: string }) {
  return (
    <>
      <View style={styles.pageHeader} fixed>
        <Text>Reporte Especial de Síntesis - {companyName}</Text>
        <Text>Uso exclusivo Junta Directiva</Text>
      </View>
      <View style={styles.footer} fixed>
        <Text render={({ pageNumber }) => `Página ${pageNumber - 1} | Confidencial - Junta Directiva`} />
        <Text>Generado el {generatedAt}</Text>
      </View>
    </>
  );
}

export function CombinedPdfDocument({
  companyName,
  title,
  status,
  narrative: narrativeInput,
  generatedAt,
}: {
  companyName: string;
  title: string;
  status: string;
  narrative: CombinedNarrative | null;
  generatedAt: string;
}) {
  const narrative = sanitizeNarrativeForPdf(narrativeInput);
  const chrome = <PageChrome companyName={companyName} generatedAt={generatedAt} />;

  const riesgosOrdenados = narrative?.riesgos ? [...narrative.riesgos].sort((a, b) => (PRIORIDAD_RANK[a.prioridad] ?? 1) - (PRIORIDAD_RANK[b.prioridad] ?? 1)) : [];

  return (
    <Document title={`${title} - ${companyName}`} author="Datanalytic">
      {/* ── Portada ── */}
      <Page size="A4" style={styles.cover}>
        <View>
          <Text style={styles.coverEyebrow}>Informe Ejecutivo · Síntesis Cruzada de Módulos</Text>
          <Text style={styles.coverSpecialBadge}>Reporte Especial · Análisis Combinado</Text>
          <Text style={styles.coverCompany}>{companyName}</Text>
          <Text style={styles.coverTitle}>{title}</Text>
          <Text style={styles.coverConfidential}>CONFIDENCIAL - USO EXCLUSIVO JUNTA DIRECTIVA</Text>

          <View style={styles.coverMetaRow}>
            <View>
              <Text style={styles.coverMetaLabel}>Fuentes utilizadas</Text>
              <Text style={styles.coverMetaValue}>{narrative?.fuentes_utilizadas.length ?? 0} análisis</Text>
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

      {/* ── Fuentes utilizadas ── */}
      <Page size="A4" style={styles.page}>
        {chrome}
        <Text style={styles.h1}>Fuentes Utilizadas</Text>
        <Text style={[styles.paragraph, { marginBottom: 14 }]}>
          Este reporte especial sintetiza los siguientes análisis, ya publicados individualmente, buscando conexiones entre ellos que no son visibles al leer cada uno por separado.
        </Text>

        {narrative && narrative.fuentes_utilizadas.length > 0 ? (
          <View style={styles.table}>
            <View style={styles.tableHeaderRow}>
              <Text style={[styles.tableHeaderCell, { flex: 1.4 }]}>Título</Text>
              <Text style={[styles.tableHeaderCell, { flex: 1 }]}>Tipo</Text>
              <Text style={[styles.tableHeaderCell, { flex: 1 }]}>Período</Text>
            </View>
            {narrative.fuentes_utilizadas.map((f, i) => (
              <View key={i} style={styles.tableRow}>
                <Text style={[styles.tableCell, { flex: 1.4, fontFamily: 'Helvetica-Bold' }]}>{f.titulo}</Text>
                <Text style={[styles.tableCell, { flex: 1 }]}>{f.tipo}</Text>
                <Text style={[styles.tableCell, { flex: 1 }]}>{f.periodo}</Text>
              </View>
            ))}
          </View>
        ) : (
          <Text style={styles.muted}>No hay información de fuentes disponible.</Text>
        )}
      </Page>

      {/* ── Hallazgos clave ── */}
      <Page size="A4" style={styles.page}>
        {chrome}
        <Text style={styles.h1}>Hallazgos Clave</Text>

        {narrative?.dictamen && (
          <View style={[styles.dictamenBanner, { backgroundColor: DICTAMEN_COLOR[narrative.dictamen] || '#4f46e5' }]}>
            <Text style={styles.dictamenBannerLabel}>Dictamen</Text>
            <Text style={styles.dictamenBannerValue}>{DICTAMEN_LABEL[narrative.dictamen] || narrative.dictamen}</Text>
          </View>
        )}

        {narrative && narrative.resumen_ejecutivo.length > 0 && <Text style={[styles.paragraph, { marginBottom: 14 }]}>{narrative.resumen_ejecutivo}</Text>}

        {narrative && narrative.hallazgos_clave.length > 0 && (
          <View style={{ marginTop: 6 }}>
            {narrative.hallazgos_clave.map((h, i) => (
              <View key={i} style={styles.listItem} wrap={false}>
                <Text style={styles.listBullet}>•</Text>
                <Text style={styles.bulletLarge}>{h}</Text>
              </View>
            ))}
          </View>
        )}
      </Page>

      {/* ── Conexiones identificadas (la sección estrella) ── */}
      <Page size="A4" style={styles.page}>
        {chrome}
        <Text style={styles.h1}>Conexiones Identificadas</Text>
        <Text style={[styles.paragraph, { marginBottom: 14 }]}>
          Insights que solo emergen al cruzar los módulos entre sí — no repiten lo ya reportado en cada análisis individual.
        </Text>

        {narrative && narrative.conexiones_identificadas.length > 0 ? (
          narrative.conexiones_identificadas.map((c, i) => (
            <View key={i} style={styles.connectionCard} wrap={false}>
              <View style={styles.connectionModules}>
                {c.modulos_involucrados.map((m, j) => (
                  <Text key={j} style={[styles.connectionModuleTag, { backgroundColor: MODULE_COLOR[m] || '#6366f1' }]}>
                    {MODULE_LABEL[m] || m}
                  </Text>
                ))}
              </View>
              <Text style={styles.connectionText}>{c.descripcion}</Text>
            </View>
          ))
        ) : (
          <Text style={styles.muted}>
            No se identificaron conexiones significativas entre los análisis seleccionados más allá de lo ya reportado individualmente en cada uno.
          </Text>
        )}
      </Page>

      {/* ── Riesgos ── */}
      {riesgosOrdenados.length > 0 && (
        <Page size="A4" style={styles.page}>
          {chrome}
          <Text style={styles.h1}>Riesgos Identificados por la Síntesis</Text>
          {riesgosOrdenados.map((r, i) => (
            <View key={i} style={[styles.riskCard, { borderColor: NIVEL_COLOR[r.nivel] || '#cbd5e1' }]} wrap={false}>
              <Text style={[styles.riskBadge, { color: NIVEL_COLOR[r.nivel] || '#334155' }]}>
                {PRIORIDAD_LABEL[r.prioridad] || r.prioridad} · {(NIVEL_LABEL[r.nivel] || r.nivel).toUpperCase()}
              </Text>
              <Text style={styles.riskText}>{r.descripcion}</Text>
            </View>
          ))}
        </Page>
      )}

      {/* ── Recomendaciones ── */}
      {narrative && narrative.recomendaciones.length > 0 && (
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

      {/* ── Conclusión ── */}
      {narrative && narrative.conclusion.length > 0 && (
        <Page size="A4" style={styles.page}>
          {chrome}
          <Text style={styles.h1}>Conclusión Ejecutiva y Dictamen Gerencial</Text>
          <Text style={[styles.paragraph, { marginBottom: 16 }]}>{narrative.conclusion}</Text>

          {narrative.dictamen && (
            <View style={[styles.dictamenBanner, { backgroundColor: DICTAMEN_COLOR[narrative.dictamen] || '#4f46e5' }]}>
              <Text style={styles.dictamenBannerLabel}>Dictamen</Text>
              <Text style={styles.dictamenBannerValue}>{DICTAMEN_LABEL[narrative.dictamen] || narrative.dictamen}</Text>
            </View>
          )}

          <Text style={[styles.muted, { marginTop: 16, fontFamily: 'Helvetica-Oblique' }]}>
            Este es un reporte especial de síntesis generado automáticamente a partir de análisis ya publicados. No
            reemplaza a los informes individuales ni constituye una auditoría formal.
          </Text>
          <AiProviderPdfNote provider={narrative.ai_provider} />
        </Page>
      )}

      {/* ── Anexo: qué es este reporte ── */}
      <Page size="A4" style={styles.page}>
        {chrome}
        <Text style={styles.h1}>Anexo: Sobre este Reporte</Text>
        <View style={styles.listItem} wrap={false}>
          <Text style={styles.listBullet}>•</Text>
          <Text style={styles.listText}>
            Un Análisis Combinado no ejecuta ningún cálculo nuevo: toma los indicadores y la narrativa ejecutiva ya
            producidos por 2 o más análisis publicados de esta misma empresa, y le pide a un modelo de lenguaje que
            busque conexiones entre ellos que no serían visibles leyendo cada informe por separado.
          </Text>
        </View>
        <View style={styles.listItem} wrap={false}>
          <Text style={styles.listBullet}>•</Text>
          <Text style={styles.listText}>
            Las "conexiones identificadas" son observaciones cualitativas de un modelo de IA sobre datos ya
            calculados de forma determinística en cada análisis fuente — no son en sí mismas un nuevo cálculo
            verificado, y deben leerse como hipótesis a validar por la junta, no como hechos auditados.
          </Text>
        </View>
        <View style={styles.listItem} wrap={false}>
          <Text style={styles.listBullet}>•</Text>
          <Text style={styles.listText}>
            Si los análisis fuente no comparten ninguna relación temática real, este reporte lo declara
            explícitamente en vez de forzar conexiones inexistentes.
          </Text>
        </View>
      </Page>
    </Document>
  );
}
