import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { SignOutButton } from '@/components/sign-out-button';
import { KpiCard } from '@/components/kpi-card';
import { ComparePeriodsPanel, type AnalysisTypeGroup } from '@/components/compare-periods-panel';

const CATEGORY_META: Record<string, { label: string; badgeClass: string; dotClass: string }> = {
  financiero: { label: 'Financiero', badgeClass: 'bg-blue-50 text-blue-700', dotClass: 'bg-blue-500' },
  comercial: { label: 'Comercial', badgeClass: 'bg-purple-50 text-purple-700', dotClass: 'bg-purple-500' },
  operativo: { label: 'Operativo', badgeClass: 'bg-orange-50 text-orange-700', dotClass: 'bg-orange-500' },
  talento_humano: { label: 'Talento Humano', badgeClass: 'bg-teal-50 text-teal-700', dotClass: 'bg-teal-500' },
};
const DEFAULT_CATEGORY_META = { label: 'Otro', badgeClass: 'bg-slate-100 text-slate-600', dotClass: 'bg-slate-400' };

const DICTAMEN_BADGE_CLASS: Record<string, string> = {
  favorable: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
  favorable_con_observaciones: 'bg-blue-50 text-blue-700 border border-blue-200',
  requiere_atencion: 'bg-amber-50 text-amber-700 border border-amber-200',
  critico: 'bg-red-50 text-red-700 border border-red-200',
};
const DICTAMEN_LABEL: Record<string, string> = {
  favorable: 'Favorable',
  favorable_con_observaciones: 'Con observaciones',
  requiere_atencion: 'Requiere atención',
  critico: 'Crítico',
};
const DICTAMEN_DOT_CLASS: Record<string, string> = {
  favorable: 'bg-emerald-500',
  favorable_con_observaciones: 'bg-blue-500',
  requiere_atencion: 'bg-amber-500',
  critico: 'bg-red-500',
};
const DICTAMEN_KPI_STATUS: Record<string, 'good' | 'warning' | 'critical' | 'neutral'> = {
  favorable: 'good',
  favorable_con_observaciones: 'neutral',
  requiere_atencion: 'warning',
  critico: 'critical',
};

function DictamenBadge({ dictamen }: { dictamen: string | null | undefined }) {
  if (!dictamen || !DICTAMEN_LABEL[dictamen]) {
    return <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-xs font-medium text-slate-400">Sin narrativa</span>;
  }
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${DICTAMEN_BADGE_CLASS[dictamen]}`}>
      <span className={`h-2 w-2 rounded-full ${DICTAMEN_DOT_CLASS[dictamen]}`} aria-hidden />
      {DICTAMEN_LABEL[dictamen]}
    </span>
  );
}

type AnalysisRow = {
  id: string;
  title: string;
  period_start: string;
  period_end: string;
  results: unknown;
  narrative: unknown;
  analysis_type_id: string;
  analysis_types: { id: string; name: string; code: string; category: string } | null;
};

export default async function ClientDashboardPage() {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const { data: profile } = await supabase.from('profiles').select('company_id').eq('id', user.id).single();

  const [{ data: analyses }, { data: allTypes }] = profile?.company_id
    ? await Promise.all([
        supabase
          .from('analyses')
          .select('id, title, period_start, period_end, results, narrative, analysis_type_id, analysis_types(id, name, code, category)')
          .eq('company_id', profile.company_id)
          .eq('status', 'published')
          .is('deleted_at', null)
          .order('period_end', { ascending: false }),
        supabase.from('analysis_types').select('id').eq('active', true),
      ])
    : [{ data: null }, { data: null }];

  const list = (analyses ?? []) as unknown as AnalysisRow[];
  const totalTypesInCatalog = allTypes?.length ?? 0;

  // ── KPIs ──
  const totalPublicados = list.length;
  const distinctTypeIds = new Set(list.map((a) => a.analysis_type_id));
  const masReciente = list[0] ?? null;
  const masRecienteDictamen = (masReciente?.narrative as any)?.dictamen ?? null;
  const masRecienteDictamenStatus = masReciente
    ? masRecienteDictamen
      ? DICTAMEN_KPI_STATUS[masRecienteDictamen] ?? 'neutral'
      : 'unknown'
    : 'unknown';

  // ── Agrupar por analysis_type (cada tipo es su propia sección) ──
  const groupsById = new Map<string, { typeId: string; typeName: string; typeCode: string; category: string; items: AnalysisRow[] }>();
  for (const a of list) {
    const t = a.analysis_types;
    if (!groupsById.has(a.analysis_type_id)) {
      groupsById.set(a.analysis_type_id, {
        typeId: a.analysis_type_id,
        typeName: t?.name ?? 'Análisis',
        typeCode: t?.code ?? '',
        category: t?.category ?? '',
        items: [],
      });
    }
    groupsById.get(a.analysis_type_id)!.items.push(a);
  }
  const typeGroups = Array.from(groupsById.values()).sort((a, b) => {
    const maxA = a.items[0]?.period_end ?? '';
    const maxB = b.items[0]?.period_end ?? '';
    return maxB.localeCompare(maxA);
  });

  // ── Todos los tipos con al menos un análisis publicado, para el selector
  // "Paso 1" del panel de comparación (los que tienen <2 se listan igual,
  // deshabilitados) — la sección solo se renderiza si al menos uno es
  // comparable (≥2 análisis publicados del mismo tipo).
  const analysisTypeGroupsForCompare: AnalysisTypeGroup[] = typeGroups.map((g) => ({
    typeId: g.typeId,
    typeName: g.typeName,
    typeCode: g.typeCode,
    periods: g.items
      .slice()
      .sort((a, b) => a.period_end.localeCompare(b.period_end))
      .map((a) => ({ id: a.id, title: a.title, periodStart: a.period_start, periodEnd: a.period_end, results: a.results })),
  }));
  const hasComparableGroup = typeGroups.some((g) => g.items.length >= 2);

  return (
    <main className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div>
            <h1 className="text-lg font-semibold text-slate-900">Datanalytic</h1>
            <div className="mt-1 leading-tight">
              <p className="text-[11px] text-slate-400">Producto Mindaxis - Francisco Flórez</p>
              <p className="text-[11px] text-slate-400">Ciencia de datos aplicada al crecimiento empresarial</p>
            </div>
            <p className="mt-1 text-sm text-slate-500">{user.email}</p>
          </div>
          <SignOutButton />
        </div>
      </header>

      <div className="mx-auto max-w-6xl space-y-8 px-6 py-8">
        {/* ── Resumen visual ── */}
        <section>
          <h2 className="mb-4 text-base font-semibold text-slate-900">Panel Ejecutivo</h2>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <KpiCard label="Análisis Publicados" value={String(totalPublicados)} status="neutral" />
            <KpiCard label="Módulos con Datos" value={`${distinctTypeIds.size} de ${totalTypesInCatalog || distinctTypeIds.size}`} status="neutral" />
            <KpiCard
              label="Último Dictamen General"
              value={masReciente ? DICTAMEN_LABEL[masRecienteDictamen] ?? 'Sin narrativa' : '—'}
              status={masRecienteDictamenStatus}
              delta={masReciente ? masReciente.analysis_types?.name : undefined}
            />
            <KpiCard label="Análisis Más Reciente" value={masReciente ? masReciente.period_end : '—'} status="neutral" delta={masReciente ? masReciente.title : undefined} />
          </div>
        </section>

        {/* ── Análisis publicados, agrupados por tipo ── */}
        <section>
          <h2 className="mb-4 text-base font-semibold text-slate-900">Análisis Publicados</h2>

          {typeGroups.length > 0 ? (
            <div className="space-y-6">
              {typeGroups.map((g) => {
                const catMeta = CATEGORY_META[g.category] ?? DEFAULT_CATEGORY_META;
                return (
                  <div key={g.typeId} className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
                    <div className="mb-4 flex flex-wrap items-center gap-3">
                      <h3 className="text-sm font-semibold text-slate-900">{g.typeName}</h3>
                      <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${catMeta.badgeClass}`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${catMeta.dotClass}`} aria-hidden />
                        {catMeta.label}
                      </span>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      {g.items.map((a) => (
                        <div key={a.id} className="flex flex-col justify-between rounded-lg border border-slate-200 bg-slate-50/60 p-4">
                          <div>
                            <p className="text-sm font-medium text-slate-800">{a.title}</p>
                            <p className="mt-0.5 text-xs text-slate-500">
                              {a.period_start} — {a.period_end}
                            </p>
                            <div className="mt-2.5">
                              <DictamenBadge dictamen={(a.narrative as any)?.dictamen} />
                            </div>
                          </div>
                          <Link
                            href={`/dashboard/analyses/${a.id}`}
                            className="mt-3 inline-flex items-center justify-center rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-700"
                          >
                            Ver detalle
                          </Link>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center shadow-sm">
              <p className="text-sm text-slate-500">Aún no hay análisis publicados para tu empresa.</p>
            </div>
          )}
        </section>

        {/* ── Comparar entre períodos ── */}
        <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="mb-1 text-base font-semibold text-slate-900">Comparar Períodos</h2>
          <p className="mb-4 text-xs text-slate-400">Compara los indicadores principales de un mismo tipo de análisis a través de varios períodos.</p>

          {hasComparableGroup ? (
            <ComparePeriodsPanel groups={analysisTypeGroupsForCompare} />
          ) : (
            <p className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-500">
              Necesitas al menos 2 análisis publicados del mismo tipo para comparar períodos.
            </p>
          )}
        </section>
      </div>
    </main>
  );
}
