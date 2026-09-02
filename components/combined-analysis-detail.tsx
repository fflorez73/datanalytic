import Link from 'next/link';
import type { CombinedNarrative } from '@/lib/generate-combined-narrative';
import { MODULE_META, DEFAULT_MODULE_META } from '@/lib/module-meta';
import { KpiCard } from '@/components/kpi-card';
import { DownloadPdfButton } from '@/components/download-pdf-button';
import { AiProviderNote } from '@/components/ai-provider-note';

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
  favorable: 'El cruce entre módulos no revela riesgos relevantes adicionales para la junta.',
  favorable_con_observaciones: 'La síntesis es sana en conjunto, con puntos específicos a vigilar.',
  requiere_atencion: 'El cruce entre módulos revela una relación que requiere seguimiento cercano.',
  critico: 'El cruce entre módulos revela un problema severo que ningún análisis individual mostraba por sí solo.',
};

const NIVEL_LABEL: Record<string, string> = { verde: 'Saludable', amarillo: 'Vigilar', rojo: 'Crítico' };
const NIVEL_BADGE: Record<string, string> = {
  verde: 'bg-green-100 text-green-700',
  amarillo: 'bg-amber-100 text-amber-700',
  rojo: 'bg-red-100 text-red-700',
};
const NIVEL_DOT: Record<string, string> = { verde: 'bg-green-500', amarillo: 'bg-amber-500', rojo: 'bg-red-500' };
const NIVEL_CARD: Record<string, string> = {
  verde: 'border-green-200 bg-green-50',
  amarillo: 'border-amber-200 bg-amber-50',
  rojo: 'border-red-200 bg-red-50',
};
const PRIORIDAD_BADGE: Record<string, string> = { alta: 'bg-red-600 text-white', media: 'bg-amber-500 text-white', baja: 'bg-slate-400 text-white' };
const PRIORIDAD_LABEL: Record<string, string> = { alta: 'Prioridad Alta', media: 'Prioridad Media', baja: 'Prioridad Baja' };
const PRIORIDAD_RANK: Record<string, number> = { alta: 0, media: 1, baja: 2 };

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
    <svg className="mt-0.5 h-4 w-4 shrink-0 text-indigo-500" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
      <path
        fillRule="evenodd"
        d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function ModuleTag({ slug }: { slug: string }) {
  const meta = MODULE_META[slug] ?? DEFAULT_MODULE_META;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${meta.badgeClass}`}>
      <span className={`h-2 w-2 rounded-full ${meta.dotClass}`} aria-hidden />
      {meta.label}
    </span>
  );
}

export type CombinedSource = {
  id: string;
  title: string;
  typeName: string;
  moduleFamily: string;
  periodStart: string;
  periodEnd: string;
};

export function CombinedAnalysisDetail({
  id,
  title,
  companyName,
  status,
  narrative,
  sources,
  sourceHref,
  pdfEndpoint,
}: {
  id: string;
  title: string;
  companyName: string;
  status: string;
  narrative?: CombinedNarrative | null;
  sources: CombinedSource[];
  /** Construye el link a un análisis fuente dado su id — distinto para admin (/admin/dashboard/analyses/:id) y cliente (/dashboard/analyses/:id). */
  sourceHref: (analysisId: string) => string;
  pdfEndpoint: string;
}) {
  const distinctModules = Array.from(new Set(sources.map((s) => s.moduleFamily)));
  const periodStarts = sources.map((s) => s.periodStart).sort();
  const periodEnds = sources.map((s) => s.periodEnd).sort();
  const rangoPeriodos = sources.length > 0 ? `${periodStarts[0]} — ${periodEnds[periodEnds.length - 1]}` : '—';

  const riesgosOrdenados = narrative?.riesgos ? [...narrative.riesgos].sort((a, b) => (PRIORIDAD_RANK[a.prioridad] ?? 1) - (PRIORIDAD_RANK[b.prioridad] ?? 1)) : [];

  return (
    <div className="space-y-6">
      {/* ── Encabezado especial ── */}
      <div className="rounded-2xl border-2 border-indigo-200 bg-indigo-50/60 p-6 shadow-sm sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-indigo-600 px-3 py-1 text-xs font-bold uppercase tracking-wide text-white">
              Reporte Especial · Análisis Combinado
            </span>
            <h1 className="mt-3 text-2xl font-semibold tracking-tight text-slate-900">{title}</h1>
            <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
              <div>
                <dt className="text-xs uppercase tracking-wide text-slate-400">Empresa</dt>
                <dd className="mt-0.5 font-medium text-slate-700">{companyName}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-slate-400">Rango de períodos</dt>
                <dd className="mt-0.5 font-medium text-slate-700">{rangoPeriodos}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-slate-400">Estado</dt>
                <dd className="mt-0.5">
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${status === 'published' ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700'}`}>
                    {status === 'published' ? 'Publicado' : 'Borrador'}
                  </span>
                </dd>
              </div>
            </dl>
          </div>
          <DownloadPdfButton analysisId={id} fileName={title} endpoint={pdfEndpoint} />
        </div>
      </div>

      {narrative?.dictamen && <DictamenBanner dictamen={narrative.dictamen} />}

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <KpiCard label="Análisis Fuente" value={String(sources.length)} status="neutral" />
        <KpiCard label="Módulos Cruzados" value={String(distinctModules.length)} status="neutral" />
        <KpiCard label="Conexiones Identificadas" value={String(narrative?.conexiones_identificadas.length ?? 0)} status={narrative && narrative.conexiones_identificadas.length > 0 ? 'good' : 'unknown'} />
        <KpiCard label="Riesgos de la Síntesis" value={String(narrative?.riesgos.length ?? 0)} status={narrative && narrative.riesgos.some((r) => r.nivel === 'rojo') ? 'critical' : 'neutral'} />
      </div>

      {/* ── Fuentes utilizadas ── */}
      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-base font-semibold text-slate-900">Fuentes Utilizadas</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {sources.map((s) => (
            <Link
              key={s.id}
              href={sourceHref(s.id)}
              className="flex flex-col gap-2 rounded-lg border border-slate-200 bg-slate-50/60 p-4 transition hover:border-indigo-300 hover:bg-indigo-50/40"
            >
              <ModuleTag slug={s.moduleFamily} />
              <p className="text-sm font-medium text-slate-800">{s.title}</p>
              <p className="text-xs text-slate-500">
                {s.typeName} · {s.periodStart} — {s.periodEnd}
              </p>
            </Link>
          ))}
        </div>
      </section>

      {narrative?.resumen_ejecutivo && (
        <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <h2 className="text-lg font-semibold text-slate-900">Resumen Ejecutivo</h2>
          <p className="mt-4 text-base leading-relaxed text-slate-700">{narrative.resumen_ejecutivo}</p>
        </section>
      )}

      {!narrative && (
        <section className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center shadow-sm">
          <p className="text-sm text-slate-500">Este reporte combinado no tiene una síntesis generada. Vuelve a intentar generarlo.</p>
        </section>
      )}

      {narrative && narrative.hallazgos_clave.length > 0 && (
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

      {/* ── Conexiones identificadas — la sección estrella ── */}
      <section className="rounded-xl border-2 border-indigo-200 bg-white p-6 shadow-sm">
        <h2 className="mb-1 text-base font-semibold text-slate-900">Conexiones Identificadas</h2>
        <p className="mb-4 text-xs text-slate-400">Insights que solo emergen al cruzar los módulos entre sí.</p>

        {narrative && narrative.conexiones_identificadas.length > 0 ? (
          <div className="grid gap-4 sm:grid-cols-2">
            {narrative.conexiones_identificadas.map((c, i) => (
              <div key={i} className="rounded-xl border-2 border-indigo-100 bg-indigo-50/50 p-4">
                <div className="mb-2.5 flex flex-wrap gap-1.5">
                  {c.modulos_involucrados.map((m, j) => (
                    <ModuleTag key={j} slug={m} />
                  ))}
                </div>
                <p className="text-sm leading-relaxed text-indigo-950">{c.descripcion}</p>
              </div>
            ))}
          </div>
        ) : (
          <p className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-500">
            No se identificaron conexiones significativas entre los análisis seleccionados más allá de lo ya reportado individualmente en cada uno.
          </p>
        )}
      </section>

      {riesgosOrdenados.length > 0 && (
        <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="mb-3 text-base font-semibold text-slate-900">Riesgos Identificados por la Síntesis</h2>
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
              </div>
            ))}
          </div>
        </section>
      )}

      {narrative && narrative.recomendaciones.length > 0 && (
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
        <section className="rounded-xl border border-indigo-900 bg-indigo-950 p-6 text-white shadow-sm sm:p-8">
          <h2 className="mb-2 text-base font-semibold">Conclusión</h2>
          <p className="text-sm leading-relaxed text-indigo-100">{narrative.conclusion}</p>
        </section>
      )}

      <AiProviderNote provider={narrative?.ai_provider} />
    </div>
  );
}
