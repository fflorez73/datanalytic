'use client';

import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { STATUS_HEX } from '@/lib/status-colors';
import { formatComparisonValue, type ComparisonFormat, type ComparisonStatus } from '@/lib/comparison-indicators';

function ChartTooltip({ active, payload, format }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-md border border-slate-200 bg-white px-3 py-2 text-xs shadow-md">
      <p className="font-medium text-slate-900">{d.period}</p>
      <p className="text-slate-600">{formatComparisonValue(d.value, format)}</p>
    </div>
  );
}

/** Compara un único indicador a través de N períodos — pieza reutilizable de la vista de "pequeños múltiplos" del panel de comparación. */
export function ComparisonBarChart({
  label,
  format,
  points,
}: {
  label: string;
  format: ComparisonFormat;
  points: { period: string; value: number | null; status: ComparisonStatus }[];
}) {
  const hasAny = points.some((p) => p.value !== null);
  if (!hasAny) return null;

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <p className="mb-3 text-sm font-semibold text-slate-700">{label}</p>
      <div style={{ width: '100%', height: 180 }}>
        <ResponsiveContainer>
          <BarChart data={points} margin={{ top: 8, right: 8, bottom: 4, left: 0 }}>
            <XAxis dataKey="period" stroke="#c3c2b7" fontSize={11} tickLine={false} axisLine={false} />
            <YAxis
              stroke="#c3c2b7"
              fontSize={11}
              tickFormatter={(v) => formatComparisonValue(v, format)}
              tickLine={false}
              axisLine={false}
              width={format === 'currency' ? 60 : 40}
            />
            <Tooltip content={<ChartTooltip format={format} />} cursor={{ fill: 'rgba(148,163,184,0.08)' }} />
            <Bar dataKey="value" radius={[4, 4, 0, 0]} maxBarSize={48}>
              {points.map((p, i) => (
                <Cell key={i} fill={STATUS_HEX[p.status]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
