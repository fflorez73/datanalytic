import {
  INDICATOR_SECTIONS,
  KPI_HEADLINE_DEFS,
  buildRiskMap,
  classifyIndicator,
  formatIndicatorValue,
  type ComparativoPeriodoAnterior,
  type IndicatorFormat,
  type SemaphoreStatus,
} from '@/lib/financial-indicators';
import { STATUS_DOT_CLASS } from '@/lib/status-colors';
import type { FinancialNarrative } from '@/lib/generate-narrative';
import { AiProviderNote } from '@/components/ai-provider-note';
import { IndicatorTargetChart } from '@/components/charts/indicator-target-chart';
import { IndicatorTrendChart } from '@/components/charts/indicator-trend-chart';
import { CicloEfectivoChart } from '@/components/charts/ciclo-efectivo-chart';
import { ComparativoChart } from '@/components/charts/comparativo-chart';
import { ComposicionPieChart } from '@/components/charts/composicion-pie-chart';
import { KpiCard } from '@/components/kpi-card';
import { DownloadPdfButton } from '@/components/download-pdf-button';

const DICTAMEN_BANNER_BG: Record<string, string> = {
  favorable: 'bg-emerald-600',
  favorable_con_observaciones: 'bg-blue-600',
  requiere_atencion: 'bg-amber-500',
  critico: 'bg-red-600',
};

const DICTAMEN_LABEL: Record<string, string> = {
  favorable: 'Dictamen favorable',
  favorable_con_observaciones: 'Favorable con observaciones',
  requiere_atencion: 'Requiere atención',
  critico: 'Crítico',
};

const DICTAMEN_DESCRIPTION: Record<string, string> = {
  favorable: 'Los indicadores de este período no muestran riesgos relevantes para la junta.',
  favorable_con_observaciones: 'Situación general saludable, con puntos específicos a vigilar.',
  requiere_atencion: 'Uno o más indicadores están en zona de alerta y requieren seguimiento cercano.',
  critico: 'Riesgo real para la continuidad del negocio — se requiere acción inmediata.',
};

const RIESGO_NIVEL_LABEL: Record<string, string> = {
  verde: 'Riesgo bajo',
  amarillo: 'Riesgo medio',
  rojo: 'Riesgo alto',
};

const RIESGO_NIVEL_CARD: Record<string, string> = {
  verde: 'border-green-200 bg-green-50',
  amarillo: 'border-amber-200 bg-amber-50',
  rojo: 'border-red-200 bg-red-50',
};

const RIESGO_NIVEL_BADGE: Record<string, string> = {
  verde: 'bg-green-100 text-green-700',
  amarillo: 'bg-amber-100 text-amber-700',
  rojo: 'bg-red-100 text-red-700',
};

const RIESGO_NIVEL_DOT: Record<string, string> = {
  verde: 'bg-green-500',
  amarillo: 'bg-amber-500',
  rojo: 'bg-red-500',
};

const PRIORIDAD_BADGE: Record<string, string> = {
  alta: 'bg-red-600 text-white',
  media: 'bg-amber-500 text-white',
  baja: 'bg-slate-400 text-white',
};

const PRIORIDAD_LABEL: Record<string, string> = { alta: 'Prioridad Alta', media: 'Prioridad Media', baja: 'Prioridad Baja' };
const PRIORIDAD_RANK: Record<string, number> = { alta: 0, media: 1, baja: 2 };

const TENDENCIA_ICON: Record<string, string> = {
  mejora: '↑ mejora',
  estable: '→ estable',
  deterioro: '↓ deterioro',
};

const NIVEL_ROW_BG: Record<string, string> = {
  verde: 'bg-green-50',
  amarillo: 'bg-amber-50',
  rojo: 'bg-red-50',
};

type IndicatorItem = { key: string; label: string; format: IndicatorFormat; value: number | null };

function DictamenBanner({ dictamen }: { dictamen: string }) {
  const bg = DICTAMEN_BANNER_BG[dictamen] || DICTAMEN_BANNER_BG.favorable_con_observaciones;
  const label = DICTAMEN_LABEL[dictamen] || dictamen;
  const description = DICTAMEN_DESCRIPTION[dictamen] || '';

  return (
    <div className={`rounded-2xl ${bg} px-6 py-5 text-white shadow-sm sm:px-8`}>
      <p className="text-xs font-semibold uppercase tracking-wide text-white/70">Dictamen de junta directiva</p>
      <p className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">{label}</p>
      {description && <p className="mt-1.5 text-sm text-white/85">{description}</p>}
    </div>
  );
}

function CoherenciaAlertBanner({ coherencia }: { coherencia: any }) {
  if (!coherencia?.inconsistente) return null;
  return (
    <div className="rounded-2xl border-2 border-red-600 bg-red-50 p-5 shadow-sm sm:p-6">
      <div className="flex items-start gap-3">
        <svg className="mt-0.5 h-6 w-6 shrink-0 text-red-600" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
          <path
            fillRule="evenodd"
            d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 6a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 6zm0 8a1 1 0 100-2 1 1 0 000 2z"
            clipRule="evenodd"
          />
        </svg>
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-red-700">
            Alerta de prioridad alta — Verificación de coherencia contable
          </p>
          <p className="mt-1.5 text-sm font-medium leading-relaxed text-red-800">{coherencia.mensaje}</p>
        </div>
      </div>
    </div>
  );
}

function IndicatorTable({ items }: { items: IndicatorItem[] }) {
  return (
    <table className="w-full text-left text-sm">
      <tbody className="divide-y divide-slate-100">
        {items.map((item) => {
          const status = classifyIndicator(item.key, item.value);
          return (
            <tr key={item.key}>
              <td className="py-2.5 pr-3 text-slate-600">{item.label}</td>
              <td className="py-2.5 pr-3 text-right font-semibold text-slate-900">
                {formatIndicatorValue(item.value, item.format)}
              </td>
              <td className="w-8 py-2.5 text-right">
                <span
                  className={`inline-block h-3 w-3 rounded-full ${STATUS_DOT_CLASS[status]}`}
                  role="img"
                  aria-label={status}
                  title={status}
                />
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function SectionCard({
  title,
  analisis,
  items,
  chart,
  extra,
}: {
  title: string;
  analisis?: string;
  items: IndicatorItem[];
  chart?: React.ReactNode;
  extra?: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="mb-3 text-base font-semibold text-slate-900">{title}</h2>
      {analisis && <p className="mb-4 text-sm leading-relaxed text-slate-600">{analisis}</p>}
      {chart}
      <div className={chart ? 'mt-5' : undefined}>
        <IndicatorTable items={items} />
      </div>
      {extra}
    </section>
  );
}

function HallazgoIcon() {
  return (
    <svg className="mt-0.5 h-4 w-4 shrink-0 text-blue-500" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
      <path
        fillRule="evenodd"
        d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function buildDeltaText(section: string, key: string, comparativo: ComparativoPeriodoAnterior | null): string | null {
  const entry = (comparativo?.indicadores as any)?.[section]?.[key];
  if (!entry) return null;

  if (entry.variacion_puntos_porcentuales !== null) {
    const v = entry.variacion_puntos_porcentuales as number;
    return `${v >= 0 ? '+' : ''}${v.toFixed(1)} pp vs período anterior`;
  }
  if (entry.variacion_relativa_pct !== null) {
    const v = entry.variacion_relativa_pct as number;
    return `${v >= 0 ? '+' : ''}${v.toFixed(1)}% vs período anterior`;
  }
  return null;
}

function findSeccion(narrative: FinancialNarrative | null | undefined, titulo: string): string | undefined {
  return narrative?.secciones?.find((s) => s.titulo === titulo)?.analisis;
}

export function AnalysisDetail({
  id,
  title,
  companyName,
  periodStart,
  periodEnd,
  analysisTypeName,
  status,
  results,
  narrative,
  history,
}: {
  id: string;
  title: string;
  companyName: string;
  periodStart: string;
  periodEnd: string;
  analysisTypeName: string;
  status: string;
  results: unknown;
  narrative?: FinancialNarrative | null;
  history?: { periodLabel: string; results: unknown }[];
}) {
  const resultsObj = (results && typeof results === 'object' ? results : {}) as Record<string, any>;
  const hasIndicators = Boolean(
    resultsObj.liquidez || resultsObj.endeudamiento || resultsObj.rentabilidad || resultsObj.dupont || resultsObj.ciclo_efectivo
  );
  const calcWarnings: string[] = Array.isArray(resultsObj.warnings) ? resultsObj.warnings : [];
  const comparativo: ComparativoPeriodoAnterior | null = resultsObj.comparativo_periodo_anterior ?? null;
  const cuentas = resultsObj.cuentas_detectadas ?? {};
  const coherencia = resultsObj.coherencia_contable ?? null;
  const riskMap = hasIndicators ? buildRiskMap(resultsObj) : [];

  // ── KPIs destacados ──────────────────────────────────────────
  const kpiCards = KPI_HEADLINE_DEFS.map((def) => {
    const value = resultsObj[def.section]?.[def.key];
    if (value === null || value === undefined) return null;
    return {
      label: def.label,
      value: formatIndicatorValue(value, def.format),
      status: classifyIndicator(def.key, value) as SemaphoreStatus | 'neutral',
      delta: buildDeltaText(def.section, def.key, comparativo),
    };
  }).filter((k): k is NonNullable<typeof k> => k !== null);

  if (typeof cuentas.utilidad_neta === 'number') {
    kpiCards.push({
      label: 'Utilidad Neta',
      value: formatIndicatorValue(cuentas.utilidad_neta, 'currency'),
      status: 'neutral',
      delta: null,
    });
  }

  const liquidezSection = INDICATOR_SECTIONS.find((s) => s.key === 'liquidez')!;
  const endeudamientoSection = INDICATOR_SECTIONS.find((s) => s.key === 'endeudamiento')!;
  const rentabilidadSection = INDICATOR_SECTIONS.find((s) => s.key === 'rentabilidad')!;
  const dupontSection = INDICATOR_SECTIONS.find((s) => s.key === 'dupont')!;
  const cicloSection = INDICATOR_SECTIONS.find((s) => s.key === 'ciclo_efectivo')!;

  function itemsFor(section: typeof liquidezSection): IndicatorItem[] {
    return section.items.map((item) => ({ ...item, value: (resultsObj[section.key]?.[item.key] ?? null) as number | null }));
  }

  const composicionActivos = resultsObj.composicion_activos;
  const composicionFinanciacion = resultsObj.composicion_financiacion;

  const activosPieData = composicionActivos
    ? [
        { label: 'Efectivo', value: composicionActivos.efectivo_pct, color: '#2a78d6' },
        { label: 'CxC', value: composicionActivos.cxc_pct, color: '#eb6834' },
        { label: 'Inventarios', value: composicionActivos.inventarios_pct, color: '#1baf7a' },
        { label: 'Otros AC', value: composicionActivos.otros_ac_pct, color: '#eda100' },
        { label: 'Activo NC', value: composicionActivos.activo_nc_pct, color: '#4a3aa7' },
      ]
    : [];

  const financiacionPieData = composicionFinanciacion
    ? [
        { label: 'Pasivo CP', value: composicionFinanciacion.pasivo_cp_pct, color: '#eb6834' },
        { label: 'Pasivo LP', value: composicionFinanciacion.pasivo_lp_pct, color: '#e34948' },
        { label: 'Patrimonio', value: composicionFinanciacion.patrimonio_pct, color: '#008300' },
      ]
    : [];

  const riesgosOrdenados = narrative?.riesgos
    ? [...narrative.riesgos].sort((a, b) => (PRIORIDAD_RANK[a.prioridad] ?? 1) - (PRIORIDAD_RANK[b.prioridad] ?? 1))
    : [];

  return (
    <div className="space-y-6">
      {/* ── Alerta de coherencia contable — antes que cualquier otra cosa ── */}
      <CoherenciaAlertBanner coherencia={coherencia} />

      {/* ── Encabezado ── */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{title}</h1>
          <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-4">
            <div>
              <dt className="text-xs uppercase tracking-wide text-slate-400">Empresa</dt>
              <dd className="mt-0.5 font-medium text-slate-700">{companyName}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-slate-400">Período</dt>
              <dd className="mt-0.5 font-medium text-slate-700">
                {periodStart} — {periodEnd}
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-slate-400">Tipo</dt>
              <dd className="mt-0.5 font-medium text-slate-700">{analysisTypeName}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-slate-400">Estado</dt>
              <dd className="mt-0.5">
                <span
                  className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                    status === 'published' ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700'
                  }`}
                >
                  {status === 'published' ? 'Publicado' : 'Borrador'}
                </span>
              </dd>
            </div>
          </dl>
        </div>
        <DownloadPdfButton analysisId={id} fileName={title} />
      </div>

      {/* ── Dictamen — banner grande, antes de los KPIs ── */}
      {narrative?.dictamen && <DictamenBanner dictamen={narrative.dictamen} />}

      {/* ── KPIs destacados ── */}
      {kpiCards.length > 0 && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          {kpiCards.map((k) => (
            <KpiCard key={k.label} label={k.label} value={k.value} status={k.status} delta={k.delta} />
          ))}
        </div>
      )}

      {/* ── Resumen ejecutivo ── */}
      {narrative?.resumen_ejecutivo && (
        <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <h2 className="text-lg font-semibold text-slate-900">Resumen Ejecutivo</h2>
          <p className="mt-4 text-base leading-relaxed text-slate-700">{narrative.resumen_ejecutivo}</p>
        </section>
      )}

      {!narrative && (
        <section className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center shadow-sm">
          <p className="text-sm text-slate-500">
            Este análisis no tiene narrativa ejecutiva generada. Puede deberse a que se creó antes de
            esta función, a que el tipo de análisis no es financiero, o a que no se pudo calcular
            ningún indicador a partir del archivo cargado.
          </p>
        </section>
      )}

      {/* ── Hallazgos clave ── */}
      {narrative && narrative.hallazgos_clave?.length > 0 && (
        <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="mb-3 text-base font-semibold text-slate-900">Hallazgos Clave</h2>
          <ul className="space-y-2">
            {narrative.hallazgos_clave.map((h, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-slate-700">
                <HallazgoIcon />
                <span>{h}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {hasIndicators ? (
        <>
          {/* ── 1. Diagnóstico de Rentabilidad ── */}
          <SectionCard
            title="Diagnóstico de Rentabilidad"
            analisis={findSeccion(narrative, 'Diagnóstico de Rentabilidad')}
            items={itemsFor(rentabilidadSection)}
            chart={<IndicatorTargetChart items={itemsFor(rentabilidadSection)} />}
          />

          {/* ── 2. ROE mediante DuPont ── */}
          <SectionCard
            title="ROE mediante DuPont"
            analisis={findSeccion(narrative, 'ROE mediante DuPont')}
            items={itemsFor(dupontSection)}
          />

          {/* ── 3. ROA y Creación de Valor — solo texto, sin tabla propia (igual que la referencia) ── */}
          {findSeccion(narrative, 'ROA y Creación de Valor') && (
            <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="mb-3 text-base font-semibold text-slate-900">ROA y Creación de Valor</h2>
              <p className="text-sm leading-relaxed text-slate-600">{findSeccion(narrative, 'ROA y Creación de Valor')}</p>
            </section>
          )}

          {/* ── 4. Estructura Financiera y Solvencia (+ composición de activos/financiación) ── */}
          <SectionCard
            title="Estructura Financiera y Solvencia"
            analisis={findSeccion(narrative, 'Estructura Financiera y Solvencia')}
            items={itemsFor(endeudamientoSection)}
            chart={<IndicatorTargetChart items={itemsFor(endeudamientoSection)} />}
            extra={
              (activosPieData.length > 0 || financiacionPieData.length > 0) && (
                <div className="mt-6 grid gap-4 border-t border-slate-100 pt-6 sm:grid-cols-2">
                  {activosPieData.length > 0 && <ComposicionPieChart title="Composición de Activos" data={activosPieData} />}
                  {financiacionPieData.length > 0 && (
                    <ComposicionPieChart title="Composición de Financiación" data={financiacionPieData} />
                  )}
                </div>
              )
            }
          />

          {/* ── 5. Liquidez y Capital de Trabajo ── */}
          <SectionCard
            title="Liquidez y Capital de Trabajo"
            analisis={findSeccion(narrative, 'Liquidez y Capital de Trabajo')}
            items={itemsFor(liquidezSection)}
            chart={<IndicatorTargetChart items={itemsFor(liquidezSection)} />}
          />

          {/* ── 6. Cartera, Inventarios y Ciclo de Caja ── */}
          <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="mb-3 text-base font-semibold text-slate-900">Cartera, Inventarios y Ciclo de Caja</h2>
            {findSeccion(narrative, 'Cartera, Inventarios y Ciclo de Caja') && (
              <p className="mb-4 text-sm leading-relaxed text-slate-600">
                {findSeccion(narrative, 'Cartera, Inventarios y Ciclo de Caja')}
              </p>
            )}
            {resultsObj.ciclo_efectivo && (
              <div className="grid gap-6 lg:grid-cols-2 lg:items-center">
                <CicloEfectivoChart ciclo={resultsObj.ciclo_efectivo} />
                <IndicatorTable items={itemsFor(cicloSection)} />
              </div>
            )}
          </section>
        </>
      ) : (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center shadow-sm">
          <p className="text-sm text-slate-500">Este análisis no tiene indicadores calculados.</p>
        </div>
      )}

      {/* ── Comparativo contra el período anterior ── */}
      {comparativo && (
        <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="mb-1 text-base font-semibold text-slate-900">Comparativo vs. Período Anterior</h2>
          <p className="mb-4 text-xs text-slate-400">
            Contra el análisis cerrado en {comparativo.period_end_base} — cada indicador normalizado a % de su meta.
          </p>
          <ComparativoChart comparativo={comparativo} />
        </section>
      )}

      {/* ── Cuentas no identificadas (advertencia del motor de cálculo) ── */}
      {calcWarnings.length > 0 && (
        <section className="rounded-lg border border-amber-200 bg-amber-50 p-4">
          <p className="mb-2 text-sm font-semibold text-amber-800">Advertencias del motor de cálculo</p>
          <ul className="list-disc space-y-1 pl-5 text-sm text-amber-700">
            {calcWarnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </section>
      )}

      {/* ── Tendencia histórica ── */}
      {history && history.length >= 2 && (
        <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="mb-1 text-base font-semibold text-slate-900">Tendencia Histórica</h2>
          <p className="mb-4 text-xs text-slate-400">
            Cada indicador normalizado a % de su meta — 100% significa que justo alcanza el umbral saludable.
          </p>
          <IndicatorTrendChart points={history.map((h) => ({ periodLabel: h.periodLabel, results: h.results }))} />
        </section>
      )}

      {/* ── Mapa de riesgos y semaforización (determinista) ── */}
      {riskMap.length > 0 && (
        <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-base font-semibold text-slate-900">Mapa de Riesgos y Semaforización</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-400">
                  <th className="pb-2 pr-4 font-medium">Indicador</th>
                  <th className="pb-2 pr-4 font-medium">Nivel</th>
                  <th className="pb-2 pr-4 font-medium">Tendencia</th>
                  <th className="pb-2 font-medium">Señal</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {riskMap.map((r, i) => (
                  <tr key={i} className={NIVEL_ROW_BG[r.nivel]}>
                    <td className="py-2.5 pr-4 text-slate-700">{r.indicador}</td>
                    <td className="py-2.5 pr-4">
                      <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${RIESGO_NIVEL_BADGE[r.nivel]}`}>
                        <span className={`h-2 w-2 rounded-full ${RIESGO_NIVEL_DOT[r.nivel]}`} aria-hidden />
                        {r.nivel.charAt(0).toUpperCase() + r.nivel.slice(1)}
                      </span>
                    </td>
                    <td className="py-2.5 pr-4 text-slate-600">{r.tendencia}</td>
                    <td className="py-2.5 font-medium text-slate-700">{r.señal}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* ── Riesgos priorizados (narrativa IA) ── */}
      {riesgosOrdenados.length > 0 && (
        <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="mb-3 text-base font-semibold text-slate-900">Riesgos Priorizados</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {riesgosOrdenados.map((r, i) => (
              <div key={i} className={`rounded-xl border p-4 ${RIESGO_NIVEL_CARD[r.nivel] || 'border-slate-200 bg-slate-50'}`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span
                    className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                      RIESGO_NIVEL_BADGE[r.nivel] || 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    <span className={`h-2 w-2 rounded-full ${RIESGO_NIVEL_DOT[r.nivel] || 'bg-slate-300'}`} aria-hidden />
                    {RIESGO_NIVEL_LABEL[r.nivel] || r.nivel}
                  </span>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${PRIORIDAD_BADGE[r.prioridad] || 'bg-slate-400 text-white'}`}>
                    {PRIORIDAD_LABEL[r.prioridad] || r.prioridad}
                  </span>
                </div>
                <p className="mt-2.5 text-sm text-slate-700">{r.descripcion}</p>
                <p className="mt-1.5 text-xs font-medium text-slate-400">{TENDENCIA_ICON[r.tendencia] || r.tendencia}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── Señales de alerta a vigilar ── */}
      {narrative && narrative.senales_alerta?.length > 0 && (
        <section className="rounded-xl border border-amber-200 bg-amber-50 p-6">
          <h2 className="mb-3 text-base font-semibold text-amber-900">Señales de Alerta a Vigilar</h2>
          <table className="w-full text-left text-sm">
            <tbody className="divide-y divide-amber-100">
              {narrative.senales_alerta.map((s, i) => (
                <tr key={i}>
                  <td className="py-2 pr-3 text-amber-600">▲</td>
                  <td className="py-2 text-amber-800">{s}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {/* ── Recomendaciones ── */}
      {narrative && narrative.recomendaciones?.length > 0 && (
        <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="mb-3 text-base font-semibold text-slate-900">Recomendaciones</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-400">
                  <th className="pb-2 pr-4 font-medium">Acción</th>
                  <th className="pb-2 pr-4 font-medium">Responsable</th>
                  <th className="pb-2 font-medium">Horizonte</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {narrative.recomendaciones.map((r, i) => (
                  <tr key={i}>
                    <td className="py-2.5 pr-4 text-slate-700">{r.accion}</td>
                    <td className="py-2.5 pr-4 text-slate-500">{r.responsable_sugerido}</td>
                    <td className="py-2.5 text-slate-500">{r.horizonte}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* ── Conclusión ── */}
      {narrative?.conclusion && (
        <section className="rounded-xl border border-slate-900 bg-slate-900 p-6 text-white shadow-sm sm:p-8">
          <h2 className="mb-2 text-base font-semibold">Conclusión</h2>
          <p className="text-sm leading-relaxed text-slate-100">{narrative.conclusion}</p>
        </section>
      )}

      <AiProviderNote provider={narrative?.ai_provider} />
    </div>
  );
}
