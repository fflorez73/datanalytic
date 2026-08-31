import {
  INDICATOR_SECTIONS,
  KPI_HEADLINE_DEFS,
  classifyIndicator,
  formatIndicatorValue,
  type ComparativoPeriodoAnterior,
  type IndicatorFormat,
  type SemaphoreStatus,
} from '@/lib/financial-indicators';
import { STATUS_DOT_CLASS } from '@/lib/status-colors';
import type { FinancialNarrative } from '@/lib/generate-narrative';
import { IndicatorTargetChart } from '@/components/charts/indicator-target-chart';
import { IndicatorTrendChart } from '@/components/charts/indicator-trend-chart';
import { CicloEfectivoChart } from '@/components/charts/ciclo-efectivo-chart';
import { ComparativoChart } from '@/components/charts/comparativo-chart';
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

const TENDENCIA_ICON: Record<string, string> = {
  mejora: '↑ mejora',
  estable: '→ estable',
  deterioro: '↓ deterioro',
};

const CORE_SECTION_KEYS = ['liquidez', 'endeudamiento', 'rentabilidad', 'dupont'] as const;

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
  items,
  chart,
}: {
  title: string;
  items: IndicatorItem[];
  chart?: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="mb-4 text-base font-semibold text-slate-900">{title}</h2>
      {chart}
      <div className={chart ? 'mt-5' : undefined}>
        <IndicatorTable items={items} />
      </div>
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

  // ── KPIs destacados ──────────────────────────────────────────
  const kpiCards = KPI_HEADLINE_DEFS
    .map((def) => {
      const value = resultsObj[def.section]?.[def.key];
      if (value === null || value === undefined) return null;
      return {
        label: def.label,
        value: formatIndicatorValue(value, def.format),
        status: classifyIndicator(def.key, value) as SemaphoreStatus | 'neutral',
        delta: buildDeltaText(def.section, def.key, comparativo),
      };
    })
    .filter((k): k is NonNullable<typeof k> => k !== null);

  if (typeof cuentas.utilidad_neta === 'number') {
    kpiCards.push({
      label: 'Utilidad Neta',
      value: formatIndicatorValue(cuentas.utilidad_neta, 'currency'),
      status: 'neutral',
      delta: null,
    });
  }

  const coreSections = INDICATOR_SECTIONS.filter((s) => (CORE_SECTION_KEYS as readonly string[]).includes(s.key));
  const cicloSection = INDICATOR_SECTIONS.find((s) => s.key === 'ciclo_efectivo');

  return (
    <div className="space-y-6">
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

      {/* ── Indicadores por sección: gráfico de barras (valor vs. meta) + tabla con semáforo ── */}
      {hasIndicators ? (
        <>
          <div className="grid gap-6 lg:grid-cols-2">
            {coreSections.map((section) => {
              const items: IndicatorItem[] = section.items.map((item) => ({
                ...item,
                value: (resultsObj[section.key]?.[item.key] ?? null) as number | null,
              }));

              return (
                <SectionCard
                  key={section.key}
                  title={section.title}
                  items={items}
                  chart={section.key !== 'dupont' ? <IndicatorTargetChart items={items} /> : undefined}
                />
              );
            })}
          </div>

          {cicloSection && resultsObj.ciclo_efectivo && (
            <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="mb-4 text-base font-semibold text-slate-900">{cicloSection.title}</h2>
              <div className="grid gap-6 lg:grid-cols-2 lg:items-center">
                <CicloEfectivoChart ciclo={resultsObj.ciclo_efectivo} />
                <IndicatorTable
                  items={cicloSection.items.map((item) => ({
                    ...item,
                    value: (resultsObj.ciclo_efectivo?.[item.key] ?? null) as number | null,
                  }))}
                />
              </div>
            </section>
          )}
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
          <p className="mb-2 text-sm font-semibold text-amber-800">Cuentas no identificadas</p>
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

      {/* ── Riesgos ── */}
      {narrative && narrative.riesgos?.length > 0 && (
        <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="mb-3 text-base font-semibold text-slate-900">Riesgos</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {narrative.riesgos.map((r, i) => (
              <div key={i} className={`rounded-xl border p-4 ${RIESGO_NIVEL_CARD[r.nivel] || 'border-slate-200 bg-slate-50'}`}>
                <div className="flex items-center justify-between gap-2">
                  <span
                    className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                      RIESGO_NIVEL_BADGE[r.nivel] || 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    <span className={`h-2 w-2 rounded-full ${RIESGO_NIVEL_DOT[r.nivel] || 'bg-slate-300'}`} aria-hidden />
                    {RIESGO_NIVEL_LABEL[r.nivel] || r.nivel}
                  </span>
                  <span className="text-xs font-medium text-slate-400">{TENDENCIA_ICON[r.tendencia] || r.tendencia}</span>
                </div>
                <p className="mt-2.5 text-sm text-slate-700">{r.descripcion}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── Observaciones ── */}
      {narrative && narrative.observaciones?.length > 0 && (
        <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="mb-3 text-base font-semibold text-slate-900">Observaciones</h2>
          <ul className="list-disc space-y-1.5 pl-5 text-sm text-slate-700">
            {narrative.observaciones.map((o, i) => (
              <li key={i}>{o}</li>
            ))}
          </ul>
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
    </div>
  );
}
