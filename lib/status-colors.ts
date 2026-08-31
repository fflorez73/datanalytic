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

/**
 * Fondo degradado de las tarjetas KPI. 'neutral' es para cifras sin rango de
 * semáforo (p.ej. montos). Tonos 600/700+ (no 500/600) a propósito — texto
 * blanco necesita ese nivel de oscuridad para buen contraste, especialmente
 * en 'warning' (el ámbar es una familia de color clara incluso en 600).
 */
export const STATUS_CARD_GRADIENT: Record<SemaphoreStatus | 'neutral', string> = {
  good: 'from-emerald-600 to-emerald-700',
  warning: 'from-amber-700 to-amber-800',
  critical: 'from-rose-600 to-rose-700',
  unknown: 'from-slate-500 to-slate-600',
  neutral: 'from-blue-600 to-blue-700',
};
