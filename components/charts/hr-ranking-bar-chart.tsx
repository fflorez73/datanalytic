'use client';

import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { classifyHrIndicator } from '@/lib/hr-analytics';
import { STATUS_HEX } from '@/lib/status-colors';

function ChartTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-md border border-slate-200 bg-white px-3 py-2 text-xs shadow-md">
      <p className="font-medium text-slate-900">{d.area}</p>
      <p className="text-slate-600">{d.valor.toFixed(1)}%</p>
    </div>
  );
}

/** Ranking por área para un indicador de tipo "lower-better" (rotación o ausentismo) — coloreado por semáforo. */
export function HrRankingBarChart({
  items,
  statusKey,
}: {
  items: { area: string; valor: number }[];
  statusKey: 'tasa_rotacion' | 'ausentismo_promedio';
}) {
  if (items.length === 0) return null;

  return (
    <div style={{ width: '100%', height: Math.max(160, items.length * 36 + 20) }}>
      <ResponsiveContainer>
        <BarChart data={items} layout="vertical" margin={{ top: 4, right: 28, bottom: 4, left: 8 }}>
          <XAxis type="number" tickFormatter={(v) => `${v}%`} stroke="#c3c2b7" fontSize={11} tickLine={false} />
          <YAxis type="category" dataKey="area" width={110} stroke="#52514e" fontSize={12} tickLine={false} axisLine={false} />
          <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(148,163,184,0.08)' }} />
          <Bar dataKey="valor" radius={[0, 4, 4, 0]} barSize={18}>
            {items.map((d, i) => (
              <Cell key={i} fill={STATUS_HEX[classifyHrIndicator(statusKey, d.valor)]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
