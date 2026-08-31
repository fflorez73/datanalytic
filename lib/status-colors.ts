import type { SemaphoreStatus } from './financial-indicators';

/** Paleta de estado compartida — usada por tarjetas KPI, tablas de semáforo y gráficos recharts. */
export const STATUS_HEX: Record<SemaphoreStatus, string> = {
  good: '#22c55e',
  warning: '#f59e0b',
  critical: '#ef4444',
  unknown: '#cbd5e1',
};

export const STATUS_LABEL: Record<SemaphoreStatus, string> = {
  good: 'Saludable',
  warning: 'Atención',
  critical: 'Crítico',
  unknown: 'Sin datos',
};

export const STATUS_DOT_CLASS: Record<SemaphoreStatus, string> = {
  good: 'bg-green-500',
  warning: 'bg-amber-500',
  critical: 'bg-red-500',
  unknown: 'bg-slate-300',
};

export const STATUS_BADGE_CLASS: Record<SemaphoreStatus, string> = {
  good: 'bg-green-50 text-green-700',
  warning: 'bg-amber-50 text-amber-700',
  critical: 'bg-red-50 text-red-700',
  unknown: 'bg-slate-100 text-slate-400',
};

/** Fondo degradado de las tarjetas KPI. 'neutral' es para cifras sin rango de semáforo (p.ej. montos). */
export const STATUS_CARD_GRADIENT: Record<SemaphoreStatus | 'neutral', string> = {
  good: 'from-emerald-500 to-emerald-600',
  warning: 'from-amber-500 to-amber-600',
  critical: 'from-rose-500 to-rose-600',
  unknown: 'from-slate-400 to-slate-500',
  neutral: 'from-blue-500 to-blue-600',
};
