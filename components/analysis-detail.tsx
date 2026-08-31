import {
  INDICATOR_SECTIONS,
  classifyIndicator,
  formatIndicatorValue,
  type SemaphoreStatus,
} from '@/lib/financial-indicators';
import type { FinancialNarrative } from '@/lib/generate-narrative';
import { IndicatorTargetChart } from '@/components/charts/indicator-target-chart';
import { IndicatorTrendChart } from '@/components/charts/indicator-trend-chart';

const TENDENCIA_STYLES: Record<string, string> = {
  positiva: 'bg-green-50 text-green-700 border-green-200',
  estable: 'bg-blue-50 text-blue-700 border-blue-200',
  negativa: 'bg-red-50 text-red-700 border-red-200',
  sin_datos_suficientes: 'bg-slate-100 text-slate-500 border-slate-200',
};

const TENDENCIA_LABEL: Record<string, string> = {
  positiva: 'Tendencia positiva',
  estable: 'Tendencia estable',
  negativa: 'Tendencia negativa',
  sin_datos_suficientes: 'Datos insuficientes',
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

function TendenciaBadge({ tendencia }: { tendencia: string }) {
  const style = TENDENCIA_STYLES[tendencia] || TENDENCIA_STYLES.sin_datos_suficientes;
  const label = TENDENCIA_LABEL[tendencia] || TENDENCIA_LABEL.sin_datos_suficientes;
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
  const hasIndicators = Boolean(resultsObj.liquidez || resultsObj.endeudamiento || resultsObj.rentabilidad);
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
              <TendenciaBadge tendencia={narrative.tendencia} />
            </div>
            <p className="mt-4 text-base leading-relaxed text-slate-700">{narrative.resumen_ejecutivo}</p>
          </section>

          {narrative.alertas.length > 0 && (
            <section className="rounded-xl border border-red-200 bg-red-50 p-6">
              <h2 className="mb-3 text-base font-semibold text-red-800">⚠ Alertas</h2>
              <ul className="list-disc space-y-1.5 pl-5 text-sm text-red-700">
                {narrative.alertas.map((a, i) => (
                  <li key={i}>{a}</li>
                ))}
              </ul>
            </section>
          )}

          {narrative.observaciones.length > 0 && (
            <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="mb-3 text-base font-semibold text-slate-900">Observaciones</h2>
              <ul className="list-disc space-y-1.5 pl-5 text-sm text-slate-700">
                {narrative.observaciones.map((o, i) => (
                  <li key={i}>{o}</li>
                ))}
              </ul>
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

      {/* ── Recomendación ── */}
      {narrative?.recomendacion && (
        <section className="rounded-xl border border-slate-900 bg-slate-900 p-6 text-white shadow-sm sm:p-8">
          <h2 className="mb-2 text-base font-semibold">Recomendación</h2>
          <p className="text-sm leading-relaxed text-slate-100">{narrative.recomendacion}</p>
        </section>
      )}
    </div>
  );
}
