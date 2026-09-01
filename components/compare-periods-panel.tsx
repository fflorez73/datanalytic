'use client';

import { useState } from 'react';
import { getComparisonIndicatorDefs, getComparisonIndicators } from '@/lib/comparison-indicators';
import { ComparisonBarChart } from '@/components/charts/comparison-bar-chart';

type PeriodEntry = { id: string; title: string; periodStart: string; periodEnd: string; results: unknown };
export type AnalysisTypeGroup = { typeId: string; typeName: string; typeCode: string; periods: PeriodEntry[] };

const MIN_COMPARABLE = 2;

function lastTwoIds(periods: PeriodEntry[]): Set<string> {
  return new Set(periods.slice(-2).map((p) => p.id));
}

function isComparable(g: AnalysisTypeGroup): boolean {
  return g.periods.length >= MIN_COMPARABLE;
}

/**
 * Paso 1: elegir QUÉ TIPO de análisis comparar. Se listan todos los tipos con
 * al menos un análisis publicado; los que no llegan a 2 aparecen deshabilitados
 * con una nota, en vez de desaparecer sin explicación. Paso 2 (períodos +
 * gráficos) solo aparece una vez elegido un tipo comparable.
 */
export function ComparePeriodsPanel({ groups }: { groups: AnalysisTypeGroup[] }) {
  const firstComparable = groups.find(isComparable) ?? null;

  const [selectedTypeId, setSelectedTypeId] = useState(firstComparable?.typeId ?? '');
  const [selectedPeriodIds, setSelectedPeriodIds] = useState<Set<string>>(() => lastTwoIds(firstComparable?.periods ?? []));

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

      {/* ── Paso 2: períodos + gráficos, solo con un tipo comparable elegido ── */}
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
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {chartData.map((c) => (
                <ComparisonBarChart key={c.key} label={c.label} format={c.format} points={c.points} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
