import {
  buildSalesRiskMap,
  classifySalesIndicator,
  formatSalesValue,
  type SalesAnalyticsResult,
} from '@/lib/sales-analytics';
import type { SalesNarrative } from '@/lib/generate-sales-narrative';
import { STATUS_DOT_CLASS } from '@/lib/status-colors';
import { SalesTrendChart } from '@/components/charts/sales-trend-chart';
import { SalesTop5BarChart } from '@/components/charts/sales-top5-bar-chart';
import { SalesParetoChart } from '@/components/charts/sales-pareto-chart';
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
  favorable: 'El desempeño comercial del período no muestra riesgos relevantes para la junta.',
  favorable_con_observaciones: 'Desempeño general sano, con puntos específicos a vigilar.',
  requiere_atencion: 'Caída de ventas, concentración o margen en zona de alerta — requiere seguimiento cercano.',
  critico: 'Riesgo real para la viabilidad comercial — se requiere acción inmediata.',
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

const CANAL_COLORS = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#4a3aa7', '#e34948'];

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

function findSeccion(narrative: SalesNarrative | null | undefined, titulo: string): string | undefined {
  return narrative?.secciones?.find((s) => s.titulo === titulo)?.analisis;
}

export function SalesAnalysisDetail({
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
  narrative?: SalesNarrative | null;
}) {
  const r = (results && typeof results === 'object' ? results : {}) as Partial<SalesAnalyticsResult>;
  const resumen = r.resumen ?? null;
  const evolucion = r.evolucionTemporal ?? [];
  const pareto = r.pareto ?? null;
  const top5 = r.concentracionTop5 ?? [];
  const estacionalidad = r.estacionalidad ?? null;
  const margenPorProducto = r.margenPorProducto ?? null;
  const canal = r.canal ?? null;
  const comparativo = r.comparativo_periodo_anterior ?? null;
  const warnings = r.warnings ?? [];
  const hasData = resumen !== null;

  const crecimientoPct = comparativo?.indicadores?.ventas_totales?.variacion_relativa_pct ?? null;

  const kpiCards = hasData
    ? [
        { label: 'Ventas Totales', value: formatSalesValue(resumen!.ventasTotales, 'currency'), status: 'neutral' as const, delta: null as string | null },
        { label: 'Ticket Promedio', value: formatSalesValue(resumen!.ticketPromedio, 'currency'), status: 'neutral' as const, delta: null },
        crecimientoPct !== null
          ? {
              label: 'Crecimiento vs. Período Anterior',
              value: `${crecimientoPct >= 0 ? '+' : ''}${crecimientoPct.toFixed(1)}%`,
              status: classifySalesIndicator('crecimiento_ventas_pct', crecimientoPct),
              delta: null,
            }
          : null,
        resumen!.margenBrutoPct !== null
          ? {
              label: 'Margen Bruto',
              value: formatSalesValue(resumen!.margenBrutoPct, 'percent'),
              status: classifySalesIndicator('margen_bruto_pct', resumen!.margenBrutoPct),
              delta: null,
            }
          : null,
      ].filter((k): k is NonNullable<typeof k> => k !== null)
    : [];

  const riskMap = hasData ? buildSalesRiskMap(r as SalesAnalyticsResult) : [];

  const canalPieData = canal
    ? canal.map((c, i) => ({ label: c.nombre, value: c.pctTotal / 100, color: CANAL_COLORS[i % CANAL_COLORS.length] }))
    : [];

  const dimensionLabel = pareto?.dimension === 'cliente' ? 'clientes' : 'productos';

  const riesgosOrdenados = narrative?.riesgos
    ? [...narrative.riesgos].sort((a, b) => (PRIORIDAD_RANK[a.prioridad] ?? 1) - (PRIORIDAD_RANK[b.prioridad] ?? 1))
    : [];

  const hasRentabilidadSeccion = Boolean((margenPorProducto && margenPorProducto.length > 0) || (canal && canal.length > 0));

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
            <KpiCard key={k.label} label={k.label} value={k.value} status={k.status} delta={k.delta} />
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
            indicador de ventas a partir del archivo cargado, o a que la generación con IA falló.
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
          {/* ── 1. Evolución y Desempeño de Ventas ── */}
          <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="mb-3 text-base font-semibold text-slate-900">Evolución y Desempeño de Ventas</h2>
            {findSeccion(narrative, 'Evolución y Desempeño de Ventas') && (
              <p className="mb-4 text-sm leading-relaxed text-slate-600">{findSeccion(narrative, 'Evolución y Desempeño de Ventas')}</p>
            )}
            {evolucion.length > 0 ? (
              <SalesTrendChart evolucion={evolucion} />
            ) : (
              <p className="text-sm text-slate-400">No hay suficientes fechas identificables para construir la evolución temporal.</p>
            )}

            {comparativo && (
              <div className="mt-6 grid grid-cols-2 gap-4 border-t border-slate-100 pt-6 sm:grid-cols-4">
                {Object.entries(comparativo.indicadores).map(([key, entry]) => {
                  if (!entry) return null;
                  const format = key === 'margen_bruto_pct' ? 'percent' : key === 'num_transacciones' ? 'integer' : 'currency';
                  const label = key === 'ventas_totales' ? 'Ventas' : key === 'ticket_promedio' ? 'Ticket Promedio' : key === 'margen_bruto_pct' ? 'Margen Bruto' : 'Transacciones';
                  return (
                    <div key={key}>
                      <p className="text-xs uppercase tracking-wide text-slate-400">{label}</p>
                      <p className="mt-1 text-lg font-semibold text-slate-900">{formatSalesValue(entry.valor_actual, format as any)}</p>
                      <p className="text-xs text-slate-500">
                        vs {formatSalesValue(entry.valor_anterior, format as any)}
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

          {/* ── 2. Análisis Pareto y Concentración de Producto ── */}
          <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="mb-3 text-base font-semibold text-slate-900">Análisis Pareto y Concentración de {pareto?.dimension === 'cliente' ? 'Clientes' : 'Producto'}</h2>
            {findSeccion(narrative, 'Análisis Pareto y Concentración de Producto') && (
              <p className="mb-4 text-sm leading-relaxed text-slate-600">{findSeccion(narrative, 'Análisis Pareto y Concentración de Producto')}</p>
            )}
            {pareto ? (
              <>
                <SalesParetoChart items={pareto.items} />
                <p className="mt-3 text-sm text-slate-600">
                  <span className="font-semibold text-slate-900">{pareto.itemsPara80pct}</span> de {pareto.totalItems} {dimensionLabel} generan el 80% de las ventas.
                </p>
                <div className="mt-6 border-t border-slate-100 pt-6">
                  <SalesTop5BarChart items={top5} dimensionLabel={dimensionLabel} />
                </div>
              </>
            ) : (
              <p className="text-sm text-slate-400">No hay columna de producto ni de cliente disponible para calcular el análisis Pareto.</p>
            )}
          </section>

          {/* ── 3. Estacionalidad y Tendencia ── */}
          <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="mb-3 text-base font-semibold text-slate-900">Estacionalidad y Tendencia</h2>
            {findSeccion(narrative, 'Estacionalidad y Tendencia') && (
              <p className="mb-4 text-sm leading-relaxed text-slate-600">{findSeccion(narrative, 'Estacionalidad y Tendencia')}</p>
            )}
            {estacionalidad ? (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                {estacionalidad.mesPico && (
                  <div className="rounded-lg border border-green-200 bg-green-50 p-4">
                    <p className="text-xs uppercase tracking-wide text-green-700">Mes Pico</p>
                    <p className="mt-1 text-lg font-semibold text-green-900">{estacionalidad.mesPico.periodo}</p>
                    <p className="text-sm text-green-700">{formatSalesValue(estacionalidad.mesPico.monto, 'currency')}</p>
                  </div>
                )}
                {estacionalidad.mesValle && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
                    <p className="text-xs uppercase tracking-wide text-amber-700">Mes Valle</p>
                    <p className="mt-1 text-lg font-semibold text-amber-900">{estacionalidad.mesValle.periodo}</p>
                    <p className="text-sm text-amber-700">{formatSalesValue(estacionalidad.mesValle.monto, 'currency')}</p>
                  </div>
                )}
                {estacionalidad.coeficienteVariacion !== null && (
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                    <p className="text-xs uppercase tracking-wide text-slate-500">Coef. de Variación Mensual</p>
                    <p className="mt-1 text-lg font-semibold text-slate-900">{estacionalidad.coeficienteVariacion.toFixed(2)}</p>
                    <p className="text-sm text-slate-500">Más alto = ventas más volátiles mes a mes</p>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-sm text-slate-400">Se necesitan al menos 3 meses distintos con fecha identificable para evaluar estacionalidad.</p>
            )}
          </section>

          {/* ── 4. Rentabilidad por Línea/Canal (condicional) ── */}
          {hasRentabilidadSeccion && (
            <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="mb-3 text-base font-semibold text-slate-900">Rentabilidad por Línea/Canal</h2>
              {findSeccion(narrative, 'Rentabilidad por Línea/Canal') && (
                <p className="mb-4 text-sm leading-relaxed text-slate-600">{findSeccion(narrative, 'Rentabilidad por Línea/Canal')}</p>
              )}

              {margenPorProducto && margenPorProducto.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-400">
                        <th className="py-2 pr-4 font-medium">Producto/Categoría</th>
                        <th className="py-2 pr-4 text-right font-medium">Ventas</th>
                        <th className="py-2 pr-4 text-right font-medium">Costo</th>
                        <th className="py-2 text-right font-medium">Margen</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {margenPorProducto.map((m) => (
                        <tr key={m.nombre}>
                          <td className="py-2.5 pr-4 font-medium text-slate-800">{m.nombre}</td>
                          <td className="py-2.5 pr-4 text-right text-slate-600">{formatSalesValue(m.monto, 'currency')}</td>
                          <td className="py-2.5 pr-4 text-right text-slate-500">{formatSalesValue(m.costo, 'currency')}</td>
                          <td className={`py-2.5 text-right font-semibold ${m.margenPct >= 30 ? 'text-green-700' : m.margenPct >= 10 ? 'text-amber-700' : 'text-red-700'}`}>
                            {m.margenPct.toFixed(1)}%
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {canal && canal.length > 0 && (
                <div className={`grid gap-6 lg:grid-cols-2 lg:items-center ${margenPorProducto && margenPorProducto.length > 0 ? 'mt-6 border-t border-slate-100 pt-6' : ''}`}>
                  <ComposicionPieChart title="Ventas por Canal" data={canalPieData} />
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-400">
                        <th className="py-2 pr-4 font-medium">Canal</th>
                        <th className="py-2 pr-4 text-right font-medium">Ventas</th>
                        <th className="py-2 text-right font-medium">% Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {canal.map((c) => (
                        <tr key={c.nombre}>
                          <td className="py-2.5 pr-4 font-medium text-slate-800">{c.nombre}</td>
                          <td className="py-2.5 pr-4 text-right text-slate-600">{formatSalesValue(c.monto, 'currency')}</td>
                          <td className="py-2.5 text-right text-slate-500">{c.pctTotal.toFixed(1)}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          )}
        </>
      ) : (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center shadow-sm">
          <p className="text-sm text-slate-500">Este análisis no tiene ventas calculadas a partir del archivo cargado.</p>
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

      {/* ── Riesgos priorizados (narrativa IA) ── */}
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

      {/* ── Señales de alerta ── */}
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
    </div>
  );
}
