'use client';

import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatOperationsValue, type OperationsItemComputed } from '@/lib/operations-analytics';

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border border-slate-200 bg-white px-3 py-2 text-xs shadow-md">
      <p className="mb-1 font-medium text-slate-900">{label}</p>
      {payload.map((p: any) => (
        <p key={p.dataKey} style={{ color: p.color }}>
          {p.name}: {formatOperationsValue(p.value, 'integer')}
        </p>
      ))}
    </div>
  );
}

/** Real vs. meta por área/proceso — solo incluye áreas con ambos valores disponibles. */
export function OperationsRealVsMetaChart({ items }: { items: OperationsItemComputed[] }) {
  const data = items
    .filter((it) => it.unidadesProducidas !== null && it.meta !== null)
    .map((it) => ({ area: it.area, real: it.unidadesProducidas as number, meta: it.meta as number }));

  if (data.length === 0) return null;

  return (
    <div style={{ width: '100%', height: 280 }}>
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 8, right: 16, bottom: 4, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e1e0d9" vertical={false} />
          <XAxis dataKey="area" stroke="#c3c2b7" fontSize={11} tickLine={false} axisLine={false} />
          <YAxis stroke="#c3c2b7" fontSize={11} tickFormatter={(v) => formatOperationsValue(v, 'integer')} tickLine={false} axisLine={false} width={60} />
          <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(148,163,184,0.08)' }} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar dataKey="meta" name="Meta" fill="#94a3b8" radius={[4, 4, 0, 0]} maxBarSize={28} />
          <Bar dataKey="real" name="Real" fill="#2a78d6" radius={[4, 4, 0, 0]} maxBarSize={28} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
