'use client';

import { useState, useTransition } from 'react';
import { publishCombinedAnalysis, deleteCombinedAnalysis } from '../actions';

export function CombinedAnalysisRowActions({
  combinedAnalysisId,
  companyId,
  status,
}: {
  combinedAnalysisId: string;
  companyId: string;
  status: string;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const handlePublish = () => {
    setError(null);
    startTransition(async () => {
      try {
        await publishCombinedAnalysis(combinedAnalysisId, companyId);
      } catch (e: any) {
        setError(e.message || 'Error al publicar.');
      }
    });
  };

  const handleDelete = () => {
    if (!confirm('¿Eliminar este análisis combinado?')) return;
    setError(null);
    startTransition(async () => {
      try {
        await deleteCombinedAnalysis(combinedAnalysisId, companyId);
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
          className="rounded-md bg-indigo-600 px-2.5 py-1 text-xs font-medium text-white transition hover:bg-indigo-500 disabled:opacity-50"
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
