import {
  INDICATOR_SECTIONS,
  classifyIndicator,
  formatIndicatorValue,
  type SemaphoreStatus,
} from '@/lib/financial-indicators';
import type { FinancialNarrative } from '@/lib/generate-narrative';
import { IndicatorTargetChart } from '@/components/charts/indicator-target-chart';
import { IndicatorTrendChart } from '@/components/charts/indicator-trend-chart';

const DICTAMEN_STYLES: Record<string, string> = {
  favorable: 'bg-green-50 text-green-700 border-green-200',
  favorable_con_observaciones: 'bg-blue-50 text-blue-700 border-blue-200',
  requiere_atencion: 'bg-amber-50 text-amber-700 border-amber-200',
  critico: 'bg-red-50 text-red-700 border-red-200',
};

const DICTAMEN_LABEL: Record<string, string> = {
  favorable: 'Dictamen favorable',
  favorable_con_observaciones: 'Favorable con observaciones',
  requiere_atencion: 'Requiere atención',
  critico: 'Crítico',
};

const SEMAPHORE_DOT: Record<SemaphoreStatus, string> = {
  good: 'bg-green-500',
  warning: 'bg-amber-500',
  critical: 'bg-red-500',
  unknown: 'bg-slate-300',
};

const SEMAPHORE_BADGE: Record<SemaphoreStatus, string> = {
  good: 'bg-green-50 text-green-700',
  warning: 'bg-amber-50 text-amber-700',
  critical: 'bg-red-50 text-red-700',
  unknown: 'bg-slate-100 text-slate-400',
};

const RIESGO_NIVEL_DOT: Record<string, string> = {
  verde: 'bg-green-500',
  amarillo: 'bg-amber-500',
  rojo: 'bg-red-500',
};

const RIESGO_NIVEL_BORDER: Record<string, string> = {
  verde: 'border-green-200 bg-green-50',
  amarillo: 'border-amber-200 bg-amber-50',
  rojo: 'border-red-200 bg-red-50',
};

const TENDENCIA_ICON: Record<string, string> = {
  mejora: '↑ mejora',
  estable: '→ estable',
  deterioro: '↓ deterioro',
};

function DictamenBadge({ dictamen }: { dictamen: string }) {
  const style = DICTAMEN_STYLES[dictamen] || DICTAMEN_STYLES.favorable_con_observaciones;
  const label = DICTAMEN_LABEL[dictamen] || dictamen;
  return (
    <span className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${style}`}>
      {label}
    </span>
  );
}

export function AnalysisDetail({
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

  return (
    <div className="space-y-6">
      {/* ── Encabezado ── */}
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

      {/* ── Narrativa ejecutiva ── */}
      {narrative ? (
        <>
          <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <h2 className="text-lg font-semibold text-slate-900">Resumen Ejecutivo</h2>
              <DictamenBadge dictamen={narrative.dictamen} />
            </div>
            <p className="mt-4 text-base leading-relaxed text-slate-700">{narrative.resumen_ejecutivo}</p>
          </section>

          {narrative.hallazgos_clave?.length > 0 && (
            <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="mb-3 text-base font-semibold text-slate-900">Hallazgos Clave</h2>
              <ul className="list-disc space-y-1.5 pl-5 text-sm text-slate-700">
                {narrative.hallazgos_clave.map((h, i) => (
                  <li key={i}>{h}</li>
                ))}
              </ul>
            </section>
          )}

          {narrative.riesgos?.length > 0 && (
            <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="mb-3 text-base font-semibold text-slate-900">Riesgos</h2>
              <ul className="space-y-2">
                {narrative.riesgos.map((r, i) => (
                  <li
                    key={i}
                    className={`flex items-start gap-3 rounded-lg border px-4 py-2.5 text-sm ${RIESGO_NIVEL_BORDER[r.nivel] || 'border-slate-200 bg-slate-50'}`}
                  >
                    <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${RIESGO_NIVEL_DOT[r.nivel] || 'bg-slate-300'}`} aria-hidden />
                    <span className="flex-1 text-slate-700">{r.descripcion}</span>
                    <span className="shrink-0 text-xs font-medium text-slate-400">{TENDENCIA_ICON[r.tendencia] || r.tendencia}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {narrative.observaciones?.length > 0 && (
            <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="mb-3 text-base font-semibold text-slate-900">Observaciones</h2>
              <ul className="list-disc space-y-1.5 pl-5 text-sm text-slate-700">
                {narrative.observaciones.map((o, i) => (
                  <li key={i}>{o}</li>
                ))}
              </ul>
            </section>
          )}

          {narrative.recomendaciones?.length > 0 && (
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
        </>
      ) : (
        <section className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center shadow-sm">
          <p className="text-sm text-slate-500">
            Este análisis no tiene narrativa ejecutiva generada. Puede deberse a que se creó antes de
            esta función, a que el tipo de análisis no es financiero, o a que no se pudo calcular
            ningún indicador a partir del archivo cargado.
          </p>
        </section>
      )}

      {/* ── Indicadores por sección, con semáforo y meta ── */}
      {hasIndicators ? (
        <div className="grid gap-6 lg:grid-cols-3">
          {INDICATOR_SECTIONS.map((section) => {
            const items = section.items.map((item) => ({
              ...item,
              value: (resultsObj[section.key]?.[item.key] ?? null) as number | null,
            }));

            return (
              <section key={section.key} className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
                <h2 className="mb-4 text-base font-semibold text-slate-900">{section.title}</h2>

                <dl className="mb-5 space-y-2.5">
                  {items.map((item) => {
                    const statusKey = classifyIndicator(item.key, item.value);
                    return (
                      <div key={item.key} className="flex items-center justify-between gap-3 text-sm">
                        <dt className="flex items-center gap-2 text-slate-600">
                          <span
                            className={`h-2 w-2 shrink-0 rounded-full ${SEMAPHORE_DOT[statusKey]}`}
                            aria-hidden
                          />
                          {item.label}
                        </dt>
                        <dd
                          className={`rounded-md px-2 py-0.5 text-xs font-semibold ${SEMAPHORE_BADGE[statusKey]}`}
                        >
                          {formatIndicatorValue(item.value, item.format)}
                        </dd>
                      </div>
                    );
                  })}
                </dl>

                <IndicatorTargetChart items={items} />
              </section>
            );
          })}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center shadow-sm">
          <p className="text-sm text-slate-500">Este análisis no tiene indicadores calculados.</p>
        </div>
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
