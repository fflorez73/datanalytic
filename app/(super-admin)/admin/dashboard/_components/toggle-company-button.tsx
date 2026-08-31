'use client';

import { useState, useTransition } from 'react';
import { toggleCompanyActive } from '../actions';

export function ToggleCompanyButton({ companyId, active }: { companyId: string; active: boolean }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const handleClick = () => {
    setError(null);
    startTransition(async () => {
      try {
        await toggleCompanyActive(companyId, !active);
      } catch (e: any) {
        setError(e.message || 'Error al actualizar.');
      }
    });
  };

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={handleClick}
        disabled={isPending}
        className={`rounded-md px-2.5 py-1 text-xs font-medium transition disabled:opacity-50 ${
          active
            ? 'bg-red-50 text-red-600 hover:bg-red-100'
            : 'bg-green-50 text-green-700 hover:bg-green-100'
        }`}
      >
        {isPending ? '...' : active ? 'Desactivar' : 'Activar'}
      </button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </div>
  );
}
