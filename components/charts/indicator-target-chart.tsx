'use client';

import { Bar, BarChart, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import {
  classifyIndicator,
  formatIndicatorValue,
  scoreVsIdeal,
  type IndicatorFormat,
  type SemaphoreStatus,
} from '@/lib/financial-indicators';
import { STATUS_HEX as STATUS_COLOR, STATUS_LABEL } from '@/lib/status-colors';

function ChartTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-md border border-slate-200 bg-white px-3 py-2 text-xs shadow-md">
      <p className="font-medium text-slate-900">{d.label}</p>
      <p className="text-slate-600">Valor: {d.formattedValue}</p>
      <p className="text-slate-600">
        {Math.round(d.rawScore)}% de la meta — {STATUS_LABEL[d.status as SemaphoreStatus]}
      </p>
    </div>
  );
}

export function IndicatorTargetChart({
  items,
}: {
  items: { key: string; label: string; value: number | null; format: IndicatorFormat }[];
}) {
  const data = items
    .map((item) => {
      const rawScore = scoreVsIdeal(item.key, item.value);
      if (rawScore === null) return null;
      return {
        label: item.label,
        score: Math.min(rawScore, 200),
        rawScore,
        status: classifyIndicator(item.key, item.value),
        formattedValue: formatIndicatorValue(item.value, item.format),
      };
    })
    .filter((d): d is NonNullable<typeof d> => d !== null);

  if (data.length === 0) return null;

  return (
    <div style={{ width: '100%', height: data.length * 44 + 40 }}>
      <ResponsiveContainer>
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 28, bottom: 4, left: 8 }}>
          <XAxis
            type="number"
            domain={[0, 200]}
            tickFormatter={(v) => `${v}%`}
            stroke="#c3c2b7"
            fontSize={11}
            tickLine={false}
          />
          <YAxis
            type="category"
            dataKey="label"
            width={150}
            stroke="#52514e"
            fontSize={12}
            tickLine={false}
            axisLine={false}
          />
          <ReferenceLine
            x={100}
            stroke="#94a3b8"
            strokeDasharray="3 3"
            label={{ value: 'Meta', position: 'top', fontSize: 10, fill: '#64748b' }}
          />
          <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(148,163,184,0.08)' }} />
          <Bar dataKey="score" radius={[0, 4, 4, 0]} barSize={18}>
            {data.map((d, i) => (
              <Cell key={i} fill={STATUS_COLOR[d.status]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
