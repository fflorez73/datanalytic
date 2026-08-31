'use client';

import { useState } from 'react';

export function DownloadPdfButton({ analysisId, fileName }: { analysisId: string; fileName: string }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDownload() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/analyses/${analysisId}/pdf`);
      if (!response.ok) throw new Error('No se pudo generar el PDF.');

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${fileName}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      setError(e.message || 'Error inesperado generando el PDF.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={handleDownload}
        disabled={loading}
        className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
      >
        <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
          <path d="M10 12.5a.75.75 0 00.75-.75V4.56l1.72 1.72a.75.75 0 101.06-1.06l-3-3a.75.75 0 00-1.06 0l-3 3a.75.75 0 101.06 1.06l1.72-1.72v7.19c0 .414.336.75.75.75z" />
          <path d="M3.5 12.75a.75.75 0 011.5 0v2.5c0 .414.336.75.75.75h8.5a.75.75 0 00.75-.75v-2.5a.75.75 0 011.5 0v2.5A2.25 2.25 0 0114.25 17.5h-8.5A2.25 2.25 0 013.5 15.25v-2.5z" />
        </svg>
        {loading ? 'Generando PDF…' : 'Descargar PDF'}
      </button>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
