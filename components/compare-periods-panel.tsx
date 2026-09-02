'use client';

import { useEffect, useRef, useState } from 'react';
import { getComparisonIndicatorDefs, getComparisonIndicators } from '@/lib/comparison-indicators';
import { ComparisonBarChart } from '@/components/charts/comparison-bar-chart';
import { generateComparisonNarrativeAction } from '@/app/(client)/dashboard/actions';
import type { ComparisonNarrative } from '@/lib/generate-comparison-narrative';
import { AiProviderNote } from '@/components/ai-provider-note';

type PeriodEntry = { id: string; title: string; periodStart: string; periodEnd: string; results: unknown };
export type AnalysisTypeGroup = { typeId: string; typeName: string; typeCode: string; periods: PeriodEntry[] };

const MIN_COMPARABLE = 2;

const TENDENCIA_LABEL: Record<string, string> = {
  positiva: 'Tendencia positiva',
  estable: 'Tendencia estable',
  negativa: 'Tendencia negativa',
  mixta: 'Tendencia mixta',
};
const TENDENCIA_BADGE_CLASS: Record<string, string> = {
  positiva: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
  estable: 'bg-blue-50 text-blue-700 border border-blue-200',
  negativa: 'bg-red-50 text-red-700 border border-red-200',
  mixta: 'bg-amber-50 text-amber-700 border border-amber-200',
};
const TENDENCIA_DOT_CLASS: Record<string, string> = {
  positiva: 'bg-emerald-500',
  estable: 'bg-blue-500',
  negativa: 'bg-red-500',
  mixta: 'bg-amber-500',
};

function lastTwoIds(periods: PeriodEntry[]): Set<string> {
  return new Set(periods.slice(-2).map((p) => p.id));
}

function isComparable(g: AnalysisTypeGroup): boolean {
  return g.periods.length >= MIN_COMPARABLE;
}

function ComparisonNarrativeBox({ narrative, loading, error }: { narrative: ComparisonNarrative | null; loading: boolean; error: string | null }) {
  if (loading) {
    return (
      <div className="flex items-center gap-2.5 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
        <svg className="h-4 w-4 animate-spin text-slate-400" viewBox="0 0 24 24" fill="none" aria-hidden>
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
        </svg>
        Interpretando la comparación…
      </div>
    );
  }

  if (error) {
    return <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-700">{error}</p>;
  }

  if (!narrative) return null;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-2.5 flex flex-wrap items-center gap-2">
        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${TENDENCIA_BADGE_CLASS[narrative.tendencia_general]}`}>
          <span className={`h-2 w-2 rounded-full ${TENDENCIA_DOT_CLASS[narrative.tendencia_general]}`} aria-hidden />
          {TENDENCIA_LABEL[narrative.tendencia_general] || narrative.tendencia_general}
        </span>
      </div>
      <p className="text-sm leading-relaxed text-slate-700">{narrative.resumen}</p>
      {narrative.observaciones.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {narrative.observaciones.map((o, i) => (
            <li key={i} className="flex items-start gap-2 text-sm text-slate-600">
              <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-slate-400" aria-hidden />
              <span>{o}</span>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-3">
        <AiProviderNote provider={narrative.ai_provider} />
      </div>
    </div>
  );
}

/**
 * Paso 1: elegir QUÉ TIPO de análisis comparar. Se listan todos los tipos con
 * al menos un análisis publicado; los que no llegan a 2 aparecen deshabilitados
 * con una nota, en vez de desaparecer sin explicación. Paso 2 (períodos +
 * gráficos + interpretación) solo aparece una vez elegido un tipo comparable.
 */
export function ComparePeriodsPanel({ groups }: { groups: AnalysisTypeGroup[] }) {
  const firstComparable = groups.find(isComparable) ?? null;

  const [selectedTypeId, setSelectedTypeId] = useState(firstComparable?.typeId ?? '');
  const [selectedPeriodIds, setSelectedPeriodIds] = useState<Set<string>>(() => lastTwoIds(firstComparable?.periods ?? []));

  const [narrative, setNarrative] = useState<ComparisonNarrative | null>(null);
  const [narrativeLoading, setNarrativeLoading] = useState(false);
  const [narrativeError, setNarrativeError] = useState<string | null>(null);
  const requestIdRef = useRef(0);

  const activeGroup = groups.find((g) => g.typeId === selectedTypeId) ?? null;

  function handleTypeChange(typeId: string) {
    setSelectedTypeId(typeId);
    const g = groups.find((x) => x.typeId === typeId);
    setSelectedPeriodIds(lastTwoIds(g?.periods ?? []));
  }

  function togglePeriod(id: string) {
    setSelectedPeriodIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const selectedPeriods = activeGroup ? activeGroup.periods.filter((p) => selectedPeriodIds.has(p.id)) : [];
  const indicatorDefs = activeGroup ? getComparisonIndicatorDefs(activeGroup.typeCode) : [];

  const chartData = indicatorDefs.map((def) => ({
    ...def,
    points: selectedPeriods.map((p) => {
      const match = getComparisonIndicators(activeGroup!.typeCode, p.results).find((i) => i.key === def.key);
      return { period: p.periodEnd, value: match?.value ?? null, status: match?.status ?? ('unknown' as const) };
    }),
  }));

  // Interpretación on-demand: se dispara cada vez que cambia el tipo o el
  // conjunto exacto de períodos seleccionados (no en cada render) y nunca se
  // persiste — es una llamada liviana a la API, igual que el resto de esta
  // comparación.
  const selectedPeriodKey = Array.from(selectedPeriodIds).sort().join(',');
  useEffect(() => {
    if (!activeGroup || selectedPeriods.length < 2) {
      setNarrative(null);
      setNarrativeError(null);
      setNarrativeLoading(false);
      return;
    }

    const requestId = ++requestIdRef.current;
    setNarrativeLoading(true);
    setNarrativeError(null);

    generateComparisonNarrativeAction({
      typeName: activeGroup.typeName,
      code: activeGroup.typeCode,
      periods: selectedPeriods.map((p) => ({ periodEnd: p.periodEnd, results: p.results })),
    })
      .then((result) => {
        if (requestIdRef.current !== requestId) return; // respuesta obsoleta, ya se disparó otra selección
        setNarrative(result);
        if (!result) setNarrativeError('No se pudo generar la interpretación de esta comparación en este momento.');
      })
      .catch((e: any) => {
        if (requestIdRef.current !== requestId) return;
        setNarrative(null);
        setNarrativeError(e?.message || 'No se pudo generar la interpretación de esta comparación.');
      })
      .finally(() => {
        if (requestIdRef.current !== requestId) return;
        setNarrativeLoading(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeGroup?.typeId, selectedPeriodKey]);

  return (
    <div className="space-y-5">
      {/* ── Paso 1: tipo de análisis ── */}
      <div>
        <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-400">Paso 1 · Tipo de análisis</label>
        <select
          value={selectedTypeId}
          onChange={(e) => handleTypeChange(e.target.value)}
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
        >
          {!activeGroup && <option value="">Selecciona un tipo de análisis…</option>}
          {groups.map((g) => (
            <option key={g.typeId} value={g.typeId} disabled={!isComparable(g)}>
              {g.typeName}
              {isComparable(g) ? '' : ` — necesitas ${MIN_COMPARABLE}+ publicados (tiene ${g.periods.length})`}
            </option>
          ))}
        </select>
      </div>

      {/* ── Paso 2: períodos + interpretación + gráficos, solo con un tipo comparable elegido ── */}
      {activeGroup && isComparable(activeGroup) && (
        <>
          <div>
            <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-400">
              Paso 2 · Períodos a comparar ({activeGroup.periods.length} publicados)
            </label>
            <div className="flex flex-wrap gap-2">
              {activeGroup.periods.map((p) => {
                const checked = selectedPeriodIds.has(p.id);
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => togglePeriod(p.id)}
                    aria-pressed={checked}
                    className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                      checked ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-slate-300 bg-white text-slate-500 hover:bg-slate-50'
                    }`}
                  >
                    {p.periodEnd}
                  </button>
                );
              })}
            </div>
          </div>

          {selectedPeriods.length < 2 ? (
            <p className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-500">
              Selecciona al menos 2 períodos para comparar.
            </p>
          ) : (
            <>
              <ComparisonNarrativeBox narrative={narrative} loading={narrativeLoading} error={narrativeError} />
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {chartData.map((c) => (
                  <ComparisonBarChart key={c.key} label={c.label} format={c.format} points={c.points} />
                ))}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
