import type { SemaphoreStatus } from '@/lib/financial-indicators';
import { STATUS_CARD_GRADIENT } from '@/lib/status-colors';

export function KpiCard({
  label,
  value,
  status = 'neutral',
  delta,
}: {
  label: string;
  value: string;
  status?: SemaphoreStatus | 'neutral';
  delta?: string | null;
}) {
  const gradient = STATUS_CARD_GRADIENT[status] ?? STATUS_CARD_GRADIENT.neutral;

  return (
    <div className={`rounded-2xl bg-gradient-to-br ${gradient} p-5 text-white shadow-sm`}>
      <p className="text-3xl font-semibold tracking-tight sm:text-4xl">{value}</p>
      <p className="mt-1 text-sm font-medium text-white/85">{label}</p>
      {delta && <p className="mt-2.5 text-xs font-medium text-white/75">{delta}</p>}
    </div>
  );
}
