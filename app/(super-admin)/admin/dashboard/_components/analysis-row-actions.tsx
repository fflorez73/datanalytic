'use client';

import { useState, useTransition } from 'react';
import { publishAnalysis, deleteAnalysis } from '../actions';

export function AnalysisRowActions({
  analysisId,
  companyId,
  status,
}: {
  analysisId: string;
  companyId: string;
  status: string;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const handlePublish = () => {
    setError(null);
    startTransition(async () => {
      try {
        await publishAnalysis(analysisId, companyId);
      } catch (e: any) {
        setError(e.message || 'Error al publicar.');
      }
    });
  };

  const handleDelete = () => {
    if (!confirm('¿Eliminar este análisis?')) return;
    setError(null);
    startTransition(async () => {
      try {
        await deleteAnalysis(analysisId, companyId);
      } catch (e: any) {
        setError(e.message || 'Error al eliminar.');
      }
    });
  };

  return (
    <div className="flex items-center gap-2">
      {status === 'draft' && (
        <button
          onClick={handlePublish}
          disabled={isPending}
          className="rounded-md bg-slate-900 px-2.5 py-1 text-xs font-medium text-white transition hover:bg-slate-800 disabled:opacity-50"
        >
          {isPending ? '...' : 'Publicar'}
        </button>
      )}
      <button
        onClick={handleDelete}
        disabled={isPending}
        className="rounded-md bg-red-50 px-2.5 py-1 text-xs font-medium text-red-600 transition hover:bg-red-100 disabled:opacity-50"
      >
        Eliminar
      </button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </div>
  );
}
