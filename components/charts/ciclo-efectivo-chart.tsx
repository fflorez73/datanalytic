'use client';

import { Bar, BarChart, CartesianGrid, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { classifyIndicator } from '@/lib/financial-indicators';
import { STATUS_HEX } from '@/lib/status-colors';

const ITEMS = [
  { key: 'dso', label: 'DSO' },
  { key: 'dio', label: 'DIO' },
  { key: 'dpo', label: 'DPO' },
  { key: 'ccc', label: 'CCC' },
] as const;

function ChartTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-md border border-slate-200 bg-white px-3 py-2 text-xs shadow-md">
      <p className="font-medium text-slate-900">{d.label}</p>
      <p className="text-slate-600">{d.value.toFixed(1)} días</p>
    </div>
  );
}

export function CicloEfectivoChart({ ciclo }: { ciclo: Record<string, number | null | undefined> }) {
  const data = ITEMS.map((it) => ({
    label: it.label as string,
    value: ciclo[it.key],
    status: classifyIndicator(it.key, ciclo[it.key]),
  })).filter((d): d is { label: string; value: number; status: ReturnType<typeof classifyIndicator> } =>
    typeof d.value === 'number'
  );

  if (data.length === 0) return null;

  return (
    <div style={{ width: '100%', height: 240 }}>
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 20, right: 16, bottom: 4, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e1e0d9" vertical={false} />
          <XAxis dataKey="label" stroke="#c3c2b7" fontSize={12} tickLine={false} axisLine={false} />
          <YAxis
            stroke="#c3c2b7"
            fontSize={11}
            tickFormatter={(v) => `${v}d`}
            tickLine={false}
            axisLine={false}
            width={36}
          />
          <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(148,163,184,0.08)' }} />
          <Bar dataKey="value" radius={[4, 4, 0, 0]} maxBarSize={56}>
            <LabelList
              dataKey="value"
              position="top"
              formatter={(v: any) => (typeof v === 'number' ? v.toFixed(0) : '')}
              style={{ fontSize: 11, fill: '#52514e' }}
            />
            {data.map((d, i) => (
              <Cell key={i} fill={STATUS_HEX[d.status]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
