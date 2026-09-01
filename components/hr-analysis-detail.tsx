import { buildHrRiskMap, classifyHrIndicator, formatHrValue, type HrAnalyticsResult } from '@/lib/hr-analytics';
import type { HrNarrative } from '@/lib/generate-hr-narrative';
import { HrCostByAreaChart } from '@/components/charts/hr-cost-by-area-chart';
import { HrRankingBarChart } from '@/components/charts/hr-ranking-bar-chart';
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
  favorable: 'La gestión de nómina y talento no muestra riesgos relevantes para la junta.',
  favorable_con_observaciones: 'Situación general sana, con puntos específicos a vigilar.',
  requiere_atencion: 'Rotación, ausentismo o riesgo de fuga en zona de alerta — requiere seguimiento cercano.',
  critico: 'Problema de retención o costo laboral severo y generalizado — se requiere acción inmediata.',
};

const NIVEL_LABEL: Record<string, string> = { verde: 'Saludable', amarillo: 'Vigilar', rojo: 'Crítico' };
const NIVEL_BADGE: Record<string, string> = {
  verde: 'bg-green-100 text-green-700',
  amarillo: 'bg-amber-100 text-amber-700',
  rojo: 'bg-red-100 text-red-700',
};
const NIVEL_DOT: Record<string, string> = { verde: 'bg-green-500', amarillo: 'bg-amber-500', rojo: 'bg-red-500' };
const NIVEL_ROW_BG: Record<string, string> = { verde: 'bg-green-50', amarillo: 'bg-amber-50', rojo: 'bg-red-50' };
const NIVEL_CARD: Record<string, string> = {
  verde: 'border-green-200 bg-green-50',
  amarillo: 'border-amber-200 bg-amber-50',
  rojo: 'border-red-200 bg-red-50',
};
const PRIORIDAD_BADGE: Record<string, string> = { alta: 'bg-red-600 text-white', media: 'bg-amber-500 text-white', baja: 'bg-slate-400 text-white' };
const PRIORIDAD_LABEL: Record<string, string> = { alta: 'Prioridad Alta', media: 'Prioridad Media', baja: 'Prioridad Baja' };
const PRIORIDAD_RANK: Record<string, number> = { alta: 0, media: 1, baja: 2 };
const TENDENCIA_ICON: Record<string, string> = { mejora: '↑ mejora', estable: '→ estable', deterioro: '↓ deterioro' };

const COST_COLORS = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#4a3aa7', '#e34948'];

function DictamenBanner({ dictamen }: { dictamen: string }) {
  const bg = DICTAMEN_BANNER_BG[dictamen] || DICTAMEN_BANNER_BG.favorable_con_observaciones;
  return (
    <div className={`rounded-2xl ${bg} px-6 py-5 text-white shadow-sm sm:px-8`}>
      <p className="text-xs font-semibold uppercase tracking-wide text-white/70">Dictamen de junta directiva</p>
      <p className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">{DICTAMEN_LABEL[dictamen] || dictamen}</p>
      {DICTAMEN_DESCRIPTION[dictamen] && <p className="mt-1.5 text-sm text-white/85">{DICTAMEN_DESCRIPTION[dictamen]}</p>}
    </div>
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

function findSeccion(narrative: HrNarrative | null | undefined, titulo: string): string | undefined {
  return narrative?.secciones?.find((s) => s.titulo === titulo)?.analisis;
}

export function HrAnalysisDetail({
  id,
  title,
  companyName,
  periodStart,
  periodEnd,
  analysisTypeName,
  status,
  results,
  narrative,
}: {
  id: string;
  title: string;
  companyName: string;
  periodStart: string;
  periodEnd: string;
  analysisTypeName: string;
  status: string;
  results: unknown;
  narrative?: HrNarrative | null;
}) {
  const r = (results && typeof results === 'object' ? results : {}) as Partial<HrAnalyticsResult>;
  const resumen = r.resumen ?? null;
  const costoPorArea = r.costoPorArea ?? [];
  const rotacionPorArea = r.rotacionPorArea ?? [];
  const ausentismoPorArea = r.ausentismoPorArea ?? [];
  const horasExtraPorArea = r.horasExtraPorArea ?? [];
  const estructuraSalarial = r.estructuraSalarial ?? [];
  const antiguedadDistribucion = r.antiguedadDistribucion ?? [];
  const riesgoFugaEmpleados = r.riesgoFugaEmpleados ?? [];
  const correlacionRotacion = r.correlacionDesempenoRotacion ?? null;
  const correlacionAusentismo = r.correlacionDesempenoAusentismo ?? null;
  const comparativo = r.comparativo_periodo_anterior ?? null;
  const warnings = r.warnings ?? [];
  const hasData = resumen !== null;

  const kpiCards = hasData
    ? [
        resumen!.costoNominaTotal !== null ? { label: 'Costo Total Nómina', value: formatHrValue(resumen!.costoNominaTotal, 'currency'), status: 'neutral' as const } : null,
        resumen!.tasaRotacionPct !== null ? { label: 'Tasa de Rotación', value: formatHrValue(resumen!.tasaRotacionPct, 'percent'), status: classifyHrIndicator('tasa_rotacion', resumen!.tasaRotacionPct) } : null,
        resumen!.ausentismoPromedioPct !== null ? { label: 'Ausentismo Promedio', value: formatHrValue(resumen!.ausentismoPromedioPct, 'percent'), status: classifyHrIndicator('ausentismo_promedio', resumen!.ausentismoPromedioPct) } : null,
        resumen!.antiguedadPromedioMeses !== null ? { label: 'Antigüedad Promedio', value: formatHrValue(resumen!.antiguedadPromedioMeses, 'months'), status: 'neutral' as const } : null,
      ].filter((k): k is NonNullable<typeof k> => k !== null)
    : [];

  const riskMap = hasData ? buildHrRiskMap(r as HrAnalyticsResult) : [];

  const costoPieData = costoPorArea.map((c, i) => ({ label: c.area, value: c.pctTotal / 100, color: COST_COLORS[i % COST_COLORS.length] }));

  const rotacionRankingItems = rotacionPorArea.map((r) => ({ area: r.area, valor: r.tasaPct }));
  const ausentismoRankingItems = ausentismoPorArea.map((a) => ({ area: a.area, valor: a.tasaPct }));

  const riesgosOrdenados = narrative?.riesgos
    ? [...narrative.riesgos].sort((a, b) => (PRIORIDAD_RANK[a.prioridad] ?? 1) - (PRIORIDAD_RANK[b.prioridad] ?? 1))
    : [];

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

      {narrative?.dictamen && <DictamenBanner dictamen={narrative.dictamen} />}

      {kpiCards.length > 0 && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {kpiCards.map((k) => (
            <KpiCard key={k.label} label={k.label} value={k.value} status={k.status} />
          ))}
        </div>
      )}

      {narrative?.resumen_ejecutivo && (
        <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <h2 className="text-lg font-semibold text-slate-900">Resumen Ejecutivo</h2>
          <p className="mt-4 text-base leading-relaxed text-slate-700">{narrative.resumen_ejecutivo}</p>
        </section>
      )}

      {!narrative && (
        <section className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center shadow-sm">
          <p className="text-sm text-slate-500">
            Este análisis no tiene narrativa ejecutiva generada. Puede deberse a que no se pudo calcular ningún
            indicador de nómina/talento a partir del archivo cargado, o a que la generación con IA falló.
          </p>
        </section>
      )}

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

      {hasData ? (
        <>
          {/* ── 1. Costo y Estructura de Nómina ── */}
          <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="mb-3 text-base font-semibold text-slate-900">Costo y Estructura de Nómina</h2>
            {findSeccion(narrative, 'Costo y Estructura de Nómina') && (
              <p className="mb-4 text-sm leading-relaxed text-slate-600">{findSeccion(narrative, 'Costo y Estructura de Nómina')}</p>
            )}

            {costoPorArea.length > 0 ? (
              <>
                <HrCostByAreaChart items={costoPorArea} />
                <div className="mt-6 grid gap-4 border-t border-slate-100 pt-6 lg:grid-cols-2">
                  <ComposicionPieChart title="Distribución de Costo por Área" data={costoPieData} />
                  {estructuraSalarial.length > 0 && (
                    <div>
                      <p className="mb-2 text-center text-sm font-semibold text-slate-700">Estructura Salarial por Área</p>
                      <table className="w-full text-left text-sm">
                        <thead>
                          <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-400">
                            <th className="py-2 pr-4 font-medium">Área</th>
                            <th className="py-2 pr-4 text-right font-medium">Mediana</th>
                            <th className="py-2 text-right font-medium">Rango</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {estructuraSalarial.map((e) => (
                            <tr key={e.area}>
                              <td className="py-2 pr-4 font-medium text-slate-800">{e.area}</td>
                              <td className="py-2 pr-4 text-right text-slate-600">{formatHrValue(e.mediana, 'currency')}</td>
                              <td className="py-2 text-right text-slate-500">
                                {formatHrValue(e.min, 'currency')}–{formatHrValue(e.max, 'currency')}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <p className="text-sm text-slate-400">No se identificó la columna de salario y/o área — el costo de nómina y la estructura salarial quedaron sin calcular.</p>
            )}

            {comparativo && (
              <div className="mt-6 grid grid-cols-2 gap-4 border-t border-slate-100 pt-6 sm:grid-cols-4">
                {Object.entries(comparativo.indicadores).map(([key, entry]) => {
                  if (!entry) return null;
                  const format = key.includes('rotacion') || key.includes('ausentismo') || key.includes('pct') ? 'percent' : key.includes('costo') ? 'currency' : key.includes('antiguedad') ? 'months' : 'ratio';
                  const label =
                    key === 'costo_nomina_total' ? 'Costo Nómina' :
                    key === 'tasa_rotacion' ? 'Rotación' :
                    key === 'ausentismo_promedio' ? 'Ausentismo' :
                    key === 'pct_horas_extra_sobre_nomina' ? '% Horas Extra' : 'Antigüedad';
                  return (
                    <div key={key}>
                      <p className="text-xs uppercase tracking-wide text-slate-400">{label}</p>
                      <p className="mt-1 text-lg font-semibold text-slate-900">{formatHrValue(entry.valor_actual, format as any)}</p>
                      <p className="text-xs text-slate-500">
                        vs {formatHrValue(entry.valor_anterior, format as any)}
                        {entry.variacion_relativa_pct !== null && (
                          <span className={entry.variacion_relativa_pct >= 0 ? ' text-green-600' : ' text-red-600'}>
                            {' '}
                            ({entry.variacion_relativa_pct >= 0 ? '+' : ''}
                            {entry.variacion_relativa_pct.toFixed(1)}%)
                          </span>
                        )}
                      </p>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* ── 2. Rotación y Estabilidad del Talento ── */}
          <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="mb-3 text-base font-semibold text-slate-900">Rotación y Estabilidad del Talento</h2>
            {findSeccion(narrative, 'Rotación y Estabilidad del Talento') && (
              <p className="mb-4 text-sm leading-relaxed text-slate-600">{findSeccion(narrative, 'Rotación y Estabilidad del Talento')}</p>
            )}

            {resumen!.tasaRotacionVoluntariaPct !== null && (
              <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-3">
                <div>
                  <p className="text-xs uppercase tracking-wide text-slate-400">Rotación Voluntaria</p>
                  <p className="mt-1 text-lg font-semibold text-slate-900">{formatHrValue(resumen!.tasaRotacionVoluntariaPct, 'percent')}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-slate-400">Rotación Involuntaria</p>
                  <p className="mt-1 text-lg font-semibold text-slate-900">{formatHrValue(resumen!.tasaRotacionInvoluntariaPct, 'percent')}</p>
                </div>
              </div>
            )}

            {rotacionRankingItems.length > 0 ? (
              <HrRankingBarChart items={rotacionRankingItems} statusKey="tasa_rotacion" />
            ) : (
              <p className="text-sm text-slate-400">No se identificó la columna de fecha de salida — la rotación por área quedó sin calcular.</p>
            )}

            {antiguedadDistribucion.length > 0 && (
              <div className="mt-6 border-t border-slate-100 pt-6">
                <p className="mb-2 text-sm font-semibold text-slate-700">Distribución de Antigüedad</p>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                  {antiguedadDistribucion.map((d) => (
                    <div key={d.rango} className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-center">
                      <p className="text-lg font-semibold text-slate-900">{d.count}</p>
                      <p className="text-xs text-slate-500">{d.rango}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>

          {/* ── 3. Ausentismo y Horas Extra ── */}
          <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="mb-3 text-base font-semibold text-slate-900">Ausentismo y Horas Extra</h2>
            {findSeccion(narrative, 'Ausentismo y Horas Extra') && (
              <p className="mb-4 text-sm leading-relaxed text-slate-600">{findSeccion(narrative, 'Ausentismo y Horas Extra')}</p>
            )}

            {ausentismoRankingItems.length > 0 ? (
              <HrRankingBarChart items={ausentismoRankingItems} statusKey="ausentismo_promedio" />
            ) : (
              <p className="text-sm text-slate-400">No se identificó la columna de días de ausencia — el ausentismo por área quedó sin calcular.</p>
            )}

            {horasExtraPorArea.length > 0 && (
              <div className="mt-6 overflow-x-auto border-t border-slate-100 pt-6">
                <p className="mb-2 text-sm font-semibold text-slate-700">Horas Extra por Área</p>
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-400">
                      <th className="py-2 pr-4 font-medium">Área</th>
                      <th className="py-2 pr-4 text-right font-medium">Costo</th>
                      <th className="py-2 text-right font-medium">% sobre Nómina del Área</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {horasExtraPorArea.map((h) => (
                      <tr key={h.area}>
                        <td className="py-2 pr-4 font-medium text-slate-800">{h.area}</td>
                        <td className="py-2 pr-4 text-right text-slate-600">{formatHrValue(h.costo, 'currency')}</td>
                        <td className="py-2 text-right text-slate-500">{h.pctSobreNominaArea !== null ? formatHrValue(h.pctSobreNominaArea, 'percent') : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* ── 4. Desempeño y Riesgo de Fuga ── */}
          <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="mb-3 text-base font-semibold text-slate-900">Desempeño y Riesgo de Fuga</h2>
            {findSeccion(narrative, 'Desempeño y Riesgo de Fuga') && (
              <p className="mb-4 text-sm leading-relaxed text-slate-600">{findSeccion(narrative, 'Desempeño y Riesgo de Fuga')}</p>
            )}

            {riesgoFugaEmpleados.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-400">
                      <th className="py-2 pr-4 font-medium">Empleado</th>
                      <th className="py-2 pr-4 font-medium">Área</th>
                      <th className="py-2 pr-4 font-medium">Cargo</th>
                      <th className="py-2 pr-4 text-right font-medium">Antigüedad</th>
                      <th className="py-2 text-right font-medium">Desempeño</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {riesgoFugaEmpleados.map((e) => (
                      <tr key={e.empleado} className="bg-amber-50/40">
                        <td className="py-2.5 pr-4 font-medium text-slate-800">{e.empleado}</td>
                        <td className="py-2.5 pr-4 text-slate-500">{e.area ?? '—'}</td>
                        <td className="py-2.5 pr-4 text-slate-500">{e.cargo ?? '—'}</td>
                        <td className="py-2.5 pr-4 text-right text-slate-600">{formatHrValue(e.antiguedadMeses, 'months')}</td>
                        <td className="py-2.5 text-right font-medium text-amber-700">{e.desempeno.toFixed(1)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-sm text-slate-400">No se identificó personal en riesgo de fuga, o faltan las columnas de desempeño y/o fecha de ingreso para calcularlo.</p>
            )}

            {(correlacionRotacion || correlacionAusentismo) && (
              <div className="mt-6 grid gap-4 border-t border-slate-100 pt-6 sm:grid-cols-2">
                {correlacionRotacion && (
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                    <p className="text-xs uppercase tracking-wide text-slate-500">Correlación Desempeño vs. Rotación</p>
                    <p className="mt-1 text-lg font-semibold text-slate-900">
                      {correlacionRotacion.coeficiente.toFixed(2)} <span className="text-sm font-normal capitalize text-slate-500">({correlacionRotacion.lectura})</span>
                    </p>
                    <p className="mt-1 text-xs text-slate-400">Sobre {correlacionRotacion.numEmpleados} empleado(s) — observacional, no causal.</p>
                  </div>
                )}
                {correlacionAusentismo && (
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                    <p className="text-xs uppercase tracking-wide text-slate-500">Correlación Desempeño vs. Ausentismo</p>
                    <p className="mt-1 text-lg font-semibold text-slate-900">
                      {correlacionAusentismo.coeficiente.toFixed(2)} <span className="text-sm font-normal capitalize text-slate-500">({correlacionAusentismo.lectura})</span>
                    </p>
                    <p className="mt-1 text-xs text-slate-400">Sobre {correlacionAusentismo.numEmpleados} empleado(s) — observacional, no causal.</p>
                  </div>
                )}
              </div>
            )}
          </section>
        </>
      ) : (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center shadow-sm">
          <p className="text-sm text-slate-500">Este análisis no tiene datos de nómina/talento calculados a partir del archivo cargado.</p>
        </div>
      )}

      {warnings.length > 0 && (
        <section className="rounded-lg border border-amber-200 bg-amber-50 p-4">
          <p className="mb-2 text-sm font-semibold text-amber-800">Advertencias del motor de cálculo</p>
          <ul className="list-disc space-y-1 pl-5 text-sm text-amber-700">
            {warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </section>
      )}

      {riskMap.length > 0 && (
        <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-base font-semibold text-slate-900">Mapa de Riesgos y Semaforización</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-400">
                  <th className="pb-2 pr-4 font-medium">Indicador</th>
                  <th className="pb-2 pr-4 font-medium">Nivel</th>
                  <th className="pb-2 text-right font-medium">Valor</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {riskMap.map((r, i) => (
                  <tr key={i} className={NIVEL_ROW_BG[r.nivel]}>
                    <td className="py-2.5 pr-4 text-slate-700">{r.indicador}</td>
                    <td className="py-2.5 pr-4">
                      <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${NIVEL_BADGE[r.nivel]}`}>
                        <span className={`h-2 w-2 rounded-full ${NIVEL_DOT[r.nivel]}`} aria-hidden />
                        {r.nivel.charAt(0).toUpperCase() + r.nivel.slice(1)}
                      </span>
                    </td>
                    <td className="py-2.5 text-right font-medium text-slate-700">{r.señal}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {riesgosOrdenados.length > 0 && (
        <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="mb-3 text-base font-semibold text-slate-900">Riesgos Priorizados</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {riesgosOrdenados.map((r, i) => (
              <div key={i} className={`rounded-xl border p-4 ${NIVEL_CARD[r.nivel] || 'border-slate-200 bg-slate-50'}`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${NIVEL_BADGE[r.nivel] || 'bg-slate-100 text-slate-600'}`}>
                    <span className={`h-2 w-2 rounded-full ${NIVEL_DOT[r.nivel] || 'bg-slate-300'}`} aria-hidden />
                    {NIVEL_LABEL[r.nivel] || r.nivel}
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

      {narrative?.conclusion && (
        <section className="rounded-xl border border-slate-900 bg-slate-900 p-6 text-white shadow-sm sm:p-8">
          <h2 className="mb-2 text-base font-semibold">Conclusión</h2>
          <p className="text-sm leading-relaxed text-slate-100">{narrative.conclusion}</p>
        </section>
      )}
    </div>
  );
}
