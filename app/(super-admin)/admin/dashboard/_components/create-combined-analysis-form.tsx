'use client';

import { useEffect, useRef, useState } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { createCombinedAnalysis } from '../actions';

function SubmitButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending || disabled}
      className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-indigo-500 disabled:opacity-50"
    >
      {pending ? 'Generando síntesis…' : 'Generar Análisis Combinado'}
    </button>
  );
}

export type PublishedAnalysisOption = {
  id: string;
  title: string;
  typeName: string;
  periodStart: string;
  periodEnd: string;
};

export function CreateCombinedAnalysisForm({
  companyId,
  publishedAnalyses,
}: {
  companyId: string;
  publishedAnalyses: PublishedAnalysisOption[];
}) {
  const [state, formAction] = useFormState(createCombinedAnalysis, {});
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.success) {
      formRef.current?.reset();
      setSelectedIds(new Set());
    }
  }, [state]);

  function toggle(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  if (publishedAnalyses.length < 2) {
    return (
      <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-700">
        Esta empresa necesita al menos 2 análisis publicados (de cualquier tipo o período) para poder generar un Análisis Combinado. Actualmente tiene {publishedAnalyses.length}.
      </p>
    );
  }

  return (
    <form ref={formRef} action={formAction} className="space-y-4">
      <input type="hidden" name="company_id" value={companyId} />

      <div>
        <label className="mb-1 block text-xs font-medium text-slate-600">Título del reporte combinado *</label>
        <input
          name="title"
          required
          placeholder="p.ej. Diagnóstico Integral 1er Semestre 2026"
          className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        />
      </div>

      <div>
        <label className="mb-1.5 block text-xs font-medium text-slate-600">
          Análisis fuente (selecciona 2 o más) — {selectedIds.size} seleccionado(s)
        </label>
        <div className="max-h-72 space-y-1.5 overflow-y-auto rounded-md border border-slate-200 p-2">
          {publishedAnalyses.map((a) => {
            const checked = selectedIds.has(a.id);
            return (
              <label
                key={a.id}
                className={`flex cursor-pointer items-start gap-2.5 rounded-md border p-2.5 text-sm transition ${
                  checked ? 'border-indigo-400 bg-indigo-50' : 'border-slate-200 bg-white hover:bg-slate-50'
                }`}
              >
                <input
                  type="checkbox"
                  name="source_analysis_ids"
                  value={a.id}
                  checked={checked}
                  onChange={() => toggle(a.id)}
                  className="mt-0.5 h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                />
                <span className="flex-1">
                  <span className="block font-medium text-slate-800">{a.title}</span>
                  <span className="block text-xs text-slate-500">
                    {a.typeName} · {a.periodStart} — {a.periodEnd}
                  </span>
                </span>
              </label>
            );
          })}
        </div>
      </div>

      {state?.error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">{state.error}</p>}
      {state?.success && <p className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">Análisis combinado generado como borrador.</p>}

      <SubmitButton disabled={selectedIds.size < 2} />
    </form>
  );
}
