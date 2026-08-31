'use client';

import { useEffect, useRef } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { createCompany } from '../actions';

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-slate-800 disabled:opacity-50"
    >
      {pending ? 'Creando...' : 'Crear empresa'}
    </button>
  );
}

export function CreateCompanyForm() {
  const [state, formAction] = useFormState(createCompany, {});
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.success) formRef.current?.reset();
  }, [state]);

  return (
    <form ref={formRef} action={formAction} className="grid gap-3 sm:grid-cols-2">
      <div>
        <label className="mb-1 block text-xs font-medium text-slate-600">Nombre *</label>
        <input
          name="name"
          required
          className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-slate-600">NIT</label>
        <input
          name="nit"
          className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-slate-600">Sector</label>
        <input
          name="sector"
          className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-slate-600">Tamaño *</label>
        <select
          name="size"
          required
          defaultValue=""
          className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
        >
          <option value="" disabled>
            Selecciona...
          </option>
          <option value="micro">Micro</option>
          <option value="pequena">Pequeña</option>
          <option value="mediana">Mediana</option>
          <option value="grande">Grande</option>
          <option value="corporativa">Corporativa</option>
        </select>
      </div>

      {state?.error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600 sm:col-span-2">{state.error}</p>
      )}
      {state?.success && (
        <p className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-700 sm:col-span-2">
          Empresa creada correctamente.
        </p>
      )}

      <div className="sm:col-span-2">
        <SubmitButton />
      </div>
    </form>
  );
}
