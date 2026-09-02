import { formatCustomerValue, SEGMENT_COLOR, SEGMENT_STATUS, type CustomerAnalyticsResult } from '@/lib/customer-analytics';
import type { CustomerNarrative } from '@/lib/generate-customer-narrative';
import { AiProviderNote } from '@/components/ai-provider-note';
import { CustomerRevenueBarChart } from '@/components/charts/customer-revenue-bar-chart';
import { CustomerRfmScatterChart } from '@/components/charts/customer-rfm-scatter-chart';
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
  favorable: 'La cartera de clientes no muestra riesgos relevantes para la junta.',
  favorable_con_observaciones: 'Cartera sana en general, con puntos específicos a vigilar.',
  requiere_atencion: 'Concentración o churn en zona de alerta — requiere seguimiento cercano.',
  critico: 'Riesgo real de pérdida de ingreso material — se requiere acción inmediata.',
};

const RIESGO_NIVEL_LABEL: Record<string, string> = { verde: 'Riesgo bajo', amarillo: 'Riesgo medio', rojo: 'Riesgo alto' };
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
const RIESGO_NIVEL_DOT: Record<string, string> = { verde: 'bg-green-500', amarillo: 'bg-amber-500', rojo: 'bg-red-500' };
const PRIORIDAD_BADGE: Record<string, string> = { alta: 'bg-red-600 text-white', media: 'bg-amber-500 text-white', baja: 'bg-slate-400 text-white' };
const PRIORIDAD_LABEL: Record<string, string> = { alta: 'Prioridad Alta', media: 'Prioridad Media', baja: 'Prioridad Baja' };
const PRIORIDAD_RANK: Record<string, number> = { alta: 0, media: 1, baja: 2 };
const TENDENCIA_ICON: Record<string, string> = { mejora: '↑ mejora', estable: '→ estable', deterioro: '↓ deterioro' };

const SEGMENT_BADGE_CLASS: Record<string, string> = {
  good: 'bg-green-100 text-green-700',
  warning: 'bg-amber-100 text-amber-700',
  critical: 'bg-red-100 text-red-700',
};

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

function findSeccion(narrative: CustomerNarrative | null | undefined, titulo: string): string | undefined {
  return narrative?.secciones?.find((s) => s.titulo === titulo)?.analisis;
}

export function CustomerAnalysisDetail({
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
  narrative?: CustomerNarrative | null;
}) {
  const r = (results && typeof results === 'object' ? results : {}) as Partial<CustomerAnalyticsResult>;
  const clientes = r.clientes ?? [];
  const resumen = r.resumen ?? null;
  const concentracion = r.concentracion ?? null;
  const segmentos = r.segmentos ?? [];
  const valorEficiencia = r.valorEficiencia ?? null;
  const clientesRiesgo = r.clientesRiesgo ?? [];
  const upsell = r.upsell ?? [];
  const warnings = r.warnings ?? [];
  const hasData = clientes.length > 0 && resumen !== null;

  const kpiCards = hasData
    ? [
        { label: 'Ingreso Total Cartera', value: formatCustomerValue(resumen!.ingresoTotal, 'currency'), status: 'neutral' as const },
        {
          label: '% Ingreso en Riesgo',
          value: formatCustomerValue(resumen!.pctIngresoRiesgo, 'percent'),
          status: resumen!.pctIngresoRiesgo > 0.15 ? ('critical' as const) : resumen!.pctIngresoRiesgo > 0.05 ? ('warning' as const) : ('good' as const),
        },
        { label: 'Ticket Promedio', value: formatCustomerValue(resumen!.ticketPromedioPonderado, 'currency'), status: 'neutral' as const },
        {
          label: 'Share Top-1',
          value: formatCustomerValue(concentracion!.shareTop1, 'percent'),
          status: concentracion!.shareTop1 > 0.45 ? ('critical' as const) : concentracion!.shareTop1 > 0.3 ? ('warning' as const) : ('good' as const),
        },
      ]
    : [];

  const segmentosClientesPieData = segmentos.map((s) => ({ label: s.segmento, value: s.pctClientes, color: SEGMENT_COLOR[s.segmento] }));
  const segmentosIngresoPieData = segmentos.map((s) => ({ label: s.segmento, value: s.pctIngreso, color: SEGMENT_COLOR[s.segmento] }));

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
            indicador de clientes a partir del archivo cargado, o a que la generación con IA falló.
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
          {/* ── 1. Perfil de la Cartera y Concentración ── */}
          <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="mb-3 text-base font-semibold text-slate-900">Perfil de la Cartera y Concentración de Ingresos</h2>
            {findSeccion(narrative, 'Perfil de la Cartera y Concentración') && (
              <p className="mb-4 text-sm leading-relaxed text-slate-600">{findSeccion(narrative, 'Perfil de la Cartera y Concentración')}</p>
            )}
            <CustomerRevenueBarChart clientes={clientes} />

            <div className="mt-6 overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-400">
                    <th className="py-2 pr-4 font-medium">Cliente</th>
                    <th className="py-2 pr-4 font-medium">Segmento</th>
                    <th className="py-2 pr-4 text-right font-medium">Monto</th>
                    <th className="py-2 pr-4 text-right font-medium">% Ingreso</th>
                    <th className="py-2 pr-4 text-right font-medium">Freq/año</th>
                    <th className="py-2 pr-4 text-right font-medium">Ticket</th>
                    <th className="py-2 pr-4 text-right font-medium">Meses</th>
                    <th className="py-2 text-right font-medium">Recencia</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {clientes.map((c) => (
                    <tr key={c.id}>
                      <td className="py-2.5 pr-4 font-medium text-slate-800">{c.id}</td>
                      <td className="py-2.5 pr-4">
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-medium ${SEGMENT_BADGE_CLASS[SEGMENT_STATUS[c.segmento]]}`}
                        >
                          {c.segmento}
                        </span>
                      </td>
                      <td className="py-2.5 pr-4 text-right text-slate-700">{formatCustomerValue(c.monto, 'currency')}</td>
                      <td className="py-2.5 pr-4 text-right text-slate-500">{formatCustomerValue(c.pctIngreso, 'percent')}</td>
                      <td className="py-2.5 pr-4 text-right text-slate-500">{c.frecuencia}</td>
                      <td className="py-2.5 pr-4 text-right text-slate-500">{formatCustomerValue(c.ticketPromedio, 'currency')}</td>
                      <td className="py-2.5 pr-4 text-right text-slate-500">{c.antiguedadMeses ?? '—'}</td>
                      <td className="py-2.5 text-right text-slate-500">{c.recenciaDias !== null ? `${c.recenciaDias} d` : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {concentracion && (
              <div className="mt-6 grid grid-cols-2 gap-4 border-t border-slate-100 pt-6 sm:grid-cols-4">
                <div>
                  <p className="text-xs uppercase tracking-wide text-slate-400">Share Top-1</p>
                  <p className="mt-1 text-lg font-semibold text-slate-900">{formatCustomerValue(concentracion.shareTop1, 'percent')}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-slate-400">Share Top-3</p>
                  <p className="mt-1 text-lg font-semibold text-slate-900">{formatCustomerValue(concentracion.shareTop3, 'percent')}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-slate-400">Clientes para 80% ingreso</p>
                  <p className="mt-1 text-lg font-semibold text-slate-900">
                    {concentracion.clientesPara80pct} de {concentracion.totalClientes}
                  </p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-slate-400">Ingreso medio / cliente</p>
                  <p className="mt-1 text-lg font-semibold text-slate-900">{formatCustomerValue(concentracion.ingresoMedioPorCliente, 'currency')}</p>
                </div>
              </div>
            )}
          </section>

          {/* ── 2. Segmentación RFM y Mapa de Valor ── */}
          <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="mb-3 text-base font-semibold text-slate-900">Segmentación RFM y Mapa de Valor del Cliente</h2>
            {findSeccion(narrative, 'Segmentación RFM y Mapa de Valor') && (
              <p className="mb-4 text-sm leading-relaxed text-slate-600">{findSeccion(narrative, 'Segmentación RFM y Mapa de Valor')}</p>
            )}
            <CustomerRfmScatterChart clientes={clientes} />

            <div className="mt-6 overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-400">
                    <th className="py-2 pr-4 font-medium">Cliente</th>
                    <th className="py-2 pr-4 text-right font-medium">R</th>
                    <th className="py-2 pr-4 text-right font-medium">F</th>
                    <th className="py-2 pr-4 text-right font-medium">M</th>
                    <th className="py-2 pr-4 text-right font-medium">RFM</th>
                    <th className="py-2 pr-4 font-medium">Segmento</th>
                    <th className="py-2 text-right font-medium">CLV Proxy</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {clientes.map((c) => (
                    <tr key={c.id}>
                      <td className="py-2.5 pr-4 font-medium text-slate-800">{c.id}</td>
                      <td className="py-2.5 pr-4 text-right text-slate-500">{c.scoreR}</td>
                      <td className="py-2.5 pr-4 text-right text-slate-500">{c.scoreF}</td>
                      <td className="py-2.5 pr-4 text-right text-slate-500">{c.scoreM}</td>
                      <td className="py-2.5 pr-4 text-right font-semibold text-slate-900">{c.rfmTotal}</td>
                      <td className="py-2.5 pr-4 text-slate-700">{c.segmento}</td>
                      <td className="py-2.5 text-right text-slate-500">{formatCustomerValue(c.clvProxy, 'currency')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {(segmentosClientesPieData.length > 0 || segmentosIngresoPieData.length > 0) && (
              <div className="mt-6 grid gap-4 border-t border-slate-100 pt-6 sm:grid-cols-2">
                {segmentosClientesPieData.length > 0 && <ComposicionPieChart title="Clientes por Segmento" data={segmentosClientesPieData} />}
                {segmentosIngresoPieData.length > 0 && <ComposicionPieChart title="Ingreso por Segmento" data={segmentosIngresoPieData} />}
              </div>
            )}
          </section>

          {/* ── 3. Riesgo de Churn y Calidad de Relación ── */}
          <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="mb-3 text-base font-semibold text-slate-900">Riesgo de Churn, Calidad de Relación y Carga de Soporte</h2>
            {findSeccion(narrative, 'Riesgo de Churn y Calidad de Relación') && (
              <p className="mb-4 text-sm leading-relaxed text-slate-600">{findSeccion(narrative, 'Riesgo de Churn y Calidad de Relación')}</p>
            )}

            {clientesRiesgo.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-400">
                      <th className="py-2 pr-4 font-medium">Cliente</th>
                      <th className="py-2 pr-4 font-medium">Última compra</th>
                      <th className="py-2 pr-4 text-right font-medium">Recencia</th>
                      <th className="py-2 pr-4 text-right font-medium">Freq</th>
                      <th className="py-2 pr-4 text-right font-medium">Monto</th>
                      <th className="py-2 pr-4 text-right font-medium">Soporte</th>
                      <th className="py-2 font-medium">Diagnóstico</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {clientesRiesgo.map((c) => (
                      <tr key={c.id} className="bg-red-50/40">
                        <td className="py-2.5 pr-4 font-medium text-slate-800">{c.id}</td>
                        <td className="py-2.5 pr-4 text-slate-500">{c.fechaUltimaCompra ?? '—'}</td>
                        <td className="py-2.5 pr-4 text-right text-slate-500">{c.recenciaDias !== null ? `${c.recenciaDias} d` : '—'}</td>
                        <td className="py-2.5 pr-4 text-right text-slate-500">{c.frecuencia}</td>
                        <td className="py-2.5 pr-4 text-right text-slate-500">{formatCustomerValue(c.monto, 'currency')}</td>
                        <td className="py-2.5 pr-4 text-right text-slate-500">{c.ticketsSoporte}</td>
                        <td className="py-2.5 font-medium text-red-700">{c.diagnostico}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-sm text-slate-400">No se identificaron clientes en el segmento En Riesgo.</p>
            )}
          </section>

          {/* ── 4. Creación de Valor Comercial y Eficiencia ── */}
          <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="mb-3 text-base font-semibold text-slate-900">Creación de Valor Comercial y Eficiencia de la Base</h2>
            {findSeccion(narrative, 'Creación de Valor Comercial y Eficiencia') && (
              <p className="mb-4 text-sm leading-relaxed text-slate-600">{findSeccion(narrative, 'Creación de Valor Comercial y Eficiencia')}</p>
            )}

            {valorEficiencia && (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-400">
                      <th className="py-2 pr-4 font-medium">Indicador</th>
                      <th className="py-2 pr-4 text-right font-medium">Activos</th>
                      <th className="py-2 pr-4 text-right font-medium">En Riesgo</th>
                      <th className="py-2 text-right font-medium">Cartera Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    <tr>
                      <td className="py-2.5 pr-4 text-slate-600">Ingreso</td>
                      <td className="py-2.5 pr-4 text-right font-semibold text-slate-900">{formatCustomerValue(valorEficiencia.activos.ingreso, 'currency')}</td>
                      <td className="py-2.5 pr-4 text-right font-semibold text-slate-900">{formatCustomerValue(valorEficiencia.riesgo.ingreso, 'currency')}</td>
                      <td className="py-2.5 text-right font-semibold text-slate-900">{formatCustomerValue(valorEficiencia.total.ingreso, 'currency')}</td>
                    </tr>
                    <tr>
                      <td className="py-2.5 pr-4 text-slate-600">% del ingreso</td>
                      <td className="py-2.5 pr-4 text-right text-slate-700">{formatCustomerValue(valorEficiencia.activos.pctIngreso, 'percent')}</td>
                      <td className="py-2.5 pr-4 text-right text-slate-700">{formatCustomerValue(valorEficiencia.riesgo.pctIngreso, 'percent')}</td>
                      <td className="py-2.5 text-right text-slate-700">{formatCustomerValue(valorEficiencia.total.pctIngreso, 'percent')}</td>
                    </tr>
                    <tr>
                      <td className="py-2.5 pr-4 text-slate-600">Tickets soporte</td>
                      <td className="py-2.5 pr-4 text-right text-slate-700">{valorEficiencia.activos.ticketsSoporte}</td>
                      <td className="py-2.5 pr-4 text-right text-slate-700">{valorEficiencia.riesgo.ticketsSoporte}</td>
                      <td className="py-2.5 text-right text-slate-700">{valorEficiencia.total.ticketsSoporte}</td>
                    </tr>
                    <tr>
                      <td className="py-2.5 pr-4 text-slate-600">Soporte / $1.000 ingreso</td>
                      <td className="py-2.5 pr-4 text-right text-slate-700">{valorEficiencia.activos.soportePorMil.toFixed(2)}</td>
                      <td className="py-2.5 pr-4 text-right text-slate-700">{valorEficiencia.riesgo.soportePorMil.toFixed(2)}</td>
                      <td className="py-2.5 text-right text-slate-700">{valorEficiencia.total.soportePorMil.toFixed(2)}</td>
                    </tr>
                    <tr>
                      <td className="py-2.5 pr-4 text-slate-600">Ticket promedio</td>
                      <td className="py-2.5 pr-4 text-right text-slate-700">{formatCustomerValue(valorEficiencia.activos.ticketPromedio, 'currency')}</td>
                      <td className="py-2.5 pr-4 text-right text-slate-700">{formatCustomerValue(valorEficiencia.riesgo.ticketPromedio, 'currency')}</td>
                      <td className="py-2.5 text-right text-slate-700">{formatCustomerValue(valorEficiencia.total.ticketPromedio, 'currency')}</td>
                    </tr>
                    <tr>
                      <td className="py-2.5 pr-4 text-slate-600">Recencia media</td>
                      <td className="py-2.5 pr-4 text-right text-slate-700">{valorEficiencia.activos.recenciaMedia ?? '—'} d</td>
                      <td className="py-2.5 pr-4 text-right text-slate-700">{valorEficiencia.riesgo.recenciaMedia ?? '—'} d</td>
                      <td className="py-2.5 text-right text-slate-700">{valorEficiencia.total.recenciaMedia ?? '—'} d</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}

            {upsell.length > 0 && (
              <div className="mt-6 border-t border-slate-100 pt-6">
                <h3 className="mb-3 text-sm font-semibold text-slate-900">Oportunidades de Crecimiento (Upsell / Cross-sell)</h3>
                <div className="grid gap-3 sm:grid-cols-2">
                  {upsell.map((u) => (
                    <div key={u.id} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium text-slate-800">{u.id}</span>
                        <span className="text-xs font-medium text-slate-500">{u.segmento}</span>
                      </div>
                      <p className="mt-1.5 text-xs text-slate-500">
                        {formatCustomerValue(u.monto, 'currency')} · Ticket {formatCustomerValue(u.ticketPromedio, 'currency')}
                        {u.antiguedadMeses !== null ? ` · ${u.antiguedadMeses} meses` : ''}
                      </p>
                      <p className="mt-2 text-sm text-slate-700">{u.rationale}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>
        </>
      ) : (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center shadow-sm">
          <p className="text-sm text-slate-500">Este análisis no tiene clientes calculados a partir del archivo cargado.</p>
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

      {riesgosOrdenados.length > 0 && (
        <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="mb-3 text-base font-semibold text-slate-900">Mapa de Riesgos Comerciales</h2>
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

      <AiProviderNote provider={narrative?.ai_provider} />
    </div>
  );
}
