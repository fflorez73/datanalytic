import { buildCostRiskMap, classifyCostIndicator, formatCostValue, type CostAnalyticsResult } from '@/lib/cost-profitability-analytics';
import type { CostProfitabilityNarrative } from '@/lib/generate-cost-profitability-narrative';
import { CostProfitabilityRankingBarChart } from '@/components/charts/cost-profitability-ranking-bar-chart';
import { CostStructureBarChart } from '@/components/charts/cost-structure-bar-chart';
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
  favorable: 'La rentabilidad del portafolio de productos/proyectos no muestra riesgos relevantes para la junta.',
  favorable_con_observaciones: 'Situación general sana, con puntos específicos a vigilar.',
  requiere_atencion: 'Uno o más productos/proyectos en pérdida o con variación presupuestal negativa relevante — requiere seguimiento cercano.',
  critico: 'Problema de rentabilidad severo y generalizado en el portafolio — se requiere acción inmediata.',
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

function findSeccion(narrative: CostProfitabilityNarrative | null | undefined, titulo: string): string | undefined {
  return narrative?.secciones?.find((s) => s.titulo === titulo)?.analisis;
}

export function CostProfitabilityAnalysisDetail({
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
  narrative?: CostProfitabilityNarrative | null;
}) {
  const r = (results && typeof results === 'object' ? results : {}) as Partial<CostAnalyticsResult>;
  const resumen = r.resumen ?? null;
  const items = r.items ?? [];
  const ranking = r.ranking ?? null;
  const productosEnPerdida = r.productosEnPerdida ?? [];
  const productoMasRentable = r.productoMasRentable ?? null;
  const comparativo = r.comparativo_periodo_anterior ?? null;
  const warnings = r.warnings ?? [];
  const hasData = resumen !== null;

  const kpiCards = hasData
    ? [
        resumen!.utilidadNetaTotal !== null
          ? { label: 'Utilidad Total', value: formatCostValue(resumen!.utilidadNetaTotal, 'currency'), status: resumen!.utilidadNetaTotal >= 0 ? ('good' as const) : ('critical' as const) }
          : null,
        resumen!.margenContribucionPromedioPct !== null
          ? { label: 'Margen de Contribución % Promedio', value: formatCostValue(resumen!.margenContribucionPromedioPct, 'percent'), status: classifyCostIndicator('margen_contribucion_promedio_pct', resumen!.margenContribucionPromedioPct) }
          : null,
        productoMasRentable !== null ? { label: 'Producto Más Rentable', value: productoMasRentable.producto, status: 'good' as const } : null,
        resumen!.numProductosEnPerdida !== null && resumen!.numProductosEnPerdida > 0 && productosEnPerdida.length > 0
          ? { label: 'Producto con Pérdida', value: productosEnPerdida[0].producto, status: 'critical' as const }
          : null,
      ].filter((k): k is NonNullable<typeof k> => k !== null)
    : [];

  const riskMap = hasData ? buildCostRiskMap(r as CostAnalyticsResult) : [];

  const riesgosOrdenados = narrative?.riesgos
    ? [...narrative.riesgos].sort((a, b) => (PRIORIDAD_RANK[a.prioridad] ?? 1) - (PRIORIDAD_RANK[b.prioridad] ?? 1))
    : [];

  const itemsConVariacion = items.filter((it) => it.variacionPresupuestalPct !== null);
  const itemsConRoi = items.filter((it) => it.roiPct !== null);

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
            indicador de costos/rentabilidad a partir del archivo cargado, o a que la generación con IA falló.
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
          {/* ── 1. Rentabilidad por Producto/Proyecto ── */}
          <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="mb-3 text-base font-semibold text-slate-900">Rentabilidad por Producto/Proyecto</h2>
            {findSeccion(narrative, 'Rentabilidad por Producto/Proyecto') && (
              <p className="mb-4 text-sm leading-relaxed text-slate-600">{findSeccion(narrative, 'Rentabilidad por Producto/Proyecto')}</p>
            )}

            {ranking && ranking.items.length > 0 ? (
              <CostProfitabilityRankingBarChart items={ranking.items} metrica={ranking.metrica} />
            ) : (
              <p className="text-sm text-slate-400">No se identificaron ingreso y/o costo variable — la rentabilidad por producto/proyecto quedó sin calcular.</p>
            )}

            {productosEnPerdida.length > 0 && (
              <div className="mt-6 overflow-x-auto border-t border-slate-100 pt-6">
                <p className="mb-2 text-sm font-semibold text-slate-700">Productos/Proyectos en Pérdida</p>
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-400">
                      <th className="py-2 pr-4 font-medium">Producto/Proyecto</th>
                      <th className="py-2 pr-4 text-right font-medium">Utilidad Neta</th>
                      <th className="py-2 pr-4 text-right font-medium">Margen Contrib. %</th>
                      <th className="py-2 font-medium">Diagnóstico</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {productosEnPerdida.map((p) => (
                      <tr key={p.producto} className="bg-red-50/40">
                        <td className="py-2.5 pr-4 font-medium text-slate-800">{p.producto}</td>
                        <td className="py-2.5 pr-4 text-right text-red-600">{p.utilidadNeta !== null ? formatCostValue(p.utilidadNeta, 'currency') : '—'}</td>
                        <td className="py-2.5 pr-4 text-right text-slate-600">{p.margenContribucionPct !== null ? formatCostValue(p.margenContribucionPct, 'percent') : '—'}</td>
                        <td className="py-2.5 text-slate-500">{p.diagnostico}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* ── 2. Estructura de Costos y Punto de Equilibrio ── */}
          <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="mb-3 text-base font-semibold text-slate-900">Estructura de Costos y Punto de Equilibrio</h2>
            {findSeccion(narrative, 'Estructura de Costos y Punto de Equilibrio') && (
              <p className="mb-4 text-sm leading-relaxed text-slate-600">{findSeccion(narrative, 'Estructura de Costos y Punto de Equilibrio')}</p>
            )}

            {resumen!.costoVariableTotal !== null && resumen!.costoFijoTotal !== null ? (
              <CostStructureBarChart costoVariableTotal={resumen!.costoVariableTotal} costoFijoTotal={resumen!.costoFijoTotal} />
            ) : (
              <p className="text-sm text-slate-400">No se identificaron el costo variable y el costo fijo simultáneamente — la estructura de costos quedó sin calcular.</p>
            )}

            {resumen!.puntoEquilibrioConsolidadoValor !== null && (
              <div className="mt-6 border-t border-slate-100 pt-6">
                <p className="text-xs uppercase tracking-wide text-slate-400">Punto de Equilibrio Consolidado ($)</p>
                <p className="mt-1 text-lg font-semibold text-slate-900">{formatCostValue(resumen!.puntoEquilibrioConsolidadoValor, 'currency')}</p>
              </div>
            )}

            {comparativo && (
              <div className="mt-6 grid grid-cols-2 gap-4 border-t border-slate-100 pt-6 sm:grid-cols-4">
                {Object.entries(comparativo.indicadores).map(([key, entry]) => {
                  if (!entry) return null;
                  const format = key.includes('pct') ? 'percent' : 'currency';
                  const label =
                    key === 'ingreso_total' ? 'Ingreso Total' :
                    key === 'costo_total' ? 'Costo Total' :
                    key === 'margen_contribucion_promedio_pct' ? 'Margen Contrib. %' :
                    key === 'utilidad_neta_total' ? 'Utilidad Neta' : 'ROI Consolidado';
                  return (
                    <div key={key}>
                      <p className="text-xs uppercase tracking-wide text-slate-400">{label}</p>
                      <p className="mt-1 text-lg font-semibold text-slate-900">{formatCostValue(entry.valor_actual, format as any)}</p>
                      <p className="text-xs text-slate-500">
                        vs {formatCostValue(entry.valor_anterior, format as any)}
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

          {/* ── 3. Variación Presupuestal ── */}
          <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="mb-3 text-base font-semibold text-slate-900">Variación Presupuestal</h2>
            {findSeccion(narrative, 'Variación Presupuestal') && (
              <p className="mb-4 text-sm leading-relaxed text-slate-600">{findSeccion(narrative, 'Variación Presupuestal')}</p>
            )}

            {resumen!.variacionPresupuestalPromedioPct !== null && (
              <div className="mb-6">
                <p className="text-xs uppercase tracking-wide text-slate-400">Variación Presupuestal Consolidada</p>
                <p className={`mt-1 text-lg font-semibold ${resumen!.variacionPresupuestalPromedioPct >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {resumen!.variacionPresupuestalPromedioPct >= 0 ? '+' : ''}
                  {formatCostValue(resumen!.variacionPresupuestalPromedioPct, 'percent')}
                </p>
              </div>
            )}

            {itemsConVariacion.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-400">
                      <th className="py-2 pr-4 font-medium">Producto/Proyecto</th>
                      <th className="py-2 pr-4 text-right font-medium">Ingreso Real</th>
                      <th className="py-2 pr-4 text-right font-medium">Presupuesto</th>
                      <th className="py-2 text-right font-medium">Variación</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {itemsConVariacion.map((it) => (
                      <tr key={it.producto}>
                        <td className="py-2.5 pr-4 font-medium text-slate-800">{it.producto}</td>
                        <td className="py-2.5 pr-4 text-right text-slate-600">{formatCostValue(it.ingreso, 'currency')}</td>
                        <td className="py-2.5 pr-4 text-right text-slate-500">{formatCostValue(it.presupuestoIngreso, 'currency')}</td>
                        <td className={`py-2.5 text-right font-medium ${(it.variacionPresupuestalPct ?? 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {(it.variacionPresupuestalPct ?? 0) >= 0 ? '+' : ''}
                          {formatCostValue(it.variacionPresupuestalPct, 'percent')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-sm text-slate-400">No se identificó la columna de presupuesto/meta de ingreso — la variación presupuestal quedó sin calcular.</p>
            )}
          </section>

          {/* ── 4. Retorno de Inversión y Recomendaciones de Portafolio ── */}
          <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="mb-3 text-base font-semibold text-slate-900">Retorno de Inversión y Recomendaciones de Portafolio</h2>
            {findSeccion(narrative, 'Retorno de Inversión y Recomendaciones de Portafolio') && (
              <p className="mb-4 text-sm leading-relaxed text-slate-600">{findSeccion(narrative, 'Retorno de Inversión y Recomendaciones de Portafolio')}</p>
            )}

            {resumen!.roiConsolidadoPct !== null && (
              <div className="mb-6">
                <p className="text-xs uppercase tracking-wide text-slate-400">ROI Consolidado</p>
                <p className="mt-1 text-lg font-semibold text-slate-900">{formatCostValue(resumen!.roiConsolidadoPct, 'percent')}</p>
              </div>
            )}

            {itemsConRoi.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-400">
                      <th className="py-2 pr-4 font-medium">Proyecto</th>
                      <th className="py-2 pr-4 text-right font-medium">Inversión Inicial</th>
                      <th className="py-2 pr-4 text-right font-medium">Utilidad Neta</th>
                      <th className="py-2 text-right font-medium">ROI</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {itemsConRoi.map((it) => (
                      <tr key={it.producto}>
                        <td className="py-2.5 pr-4 font-medium text-slate-800">{it.producto}</td>
                        <td className="py-2.5 pr-4 text-right text-slate-600">{formatCostValue(it.inversionInicial, 'currency')}</td>
                        <td className="py-2.5 pr-4 text-right text-slate-600">{formatCostValue(it.utilidadNeta, 'currency')}</td>
                        <td className={`py-2.5 text-right font-medium ${(it.roiPct ?? 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>{formatCostValue(it.roiPct, 'percent')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-sm text-slate-400">No se identificó la columna de inversión inicial — el ROI quedó sin calcular.</p>
            )}
          </section>
        </>
      ) : (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center shadow-sm">
          <p className="text-sm text-slate-500">Este análisis no tiene datos de costos/rentabilidad calculados a partir del archivo cargado.</p>
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
