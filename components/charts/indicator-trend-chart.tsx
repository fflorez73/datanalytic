'use client';

import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { scoreVsIdeal } from '@/lib/financial-indicators';

// Un indicador principal por sección — mismo orden categórico fijo siempre.
const TREND_INDICATORS = [
  { key: 'razon_corriente', section: 'liquidez', label: 'Razón Corriente', color: '#2a78d6' },
  { key: 'nivel_endeudamiento', section: 'endeudamiento', label: 'Nivel de Endeudamiento', color: '#eb6834' },
  { key: 'margen_neto', section: 'rentabilidad', label: 'Margen Neto', color: '#1baf7a' },
] as const;

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border border-slate-200 bg-white px-3 py-2 text-xs shadow-md">
      <p className="mb-1 font-medium text-slate-900">{label}</p>
      {payload.map((p: any) => (
        <p key={p.dataKey} style={{ color: p.color }}>
          {p.name}: {p.value === null || p.value === undefined ? 'sin datos' : `${Math.round(p.value)}% de la meta`}
        </p>
      ))}
    </div>
  );
}

export function IndicatorTrendChart({
  points,
}: {
  points: { periodLabel: string; results: any }[];
}) {
  const data = points.map((p) => {
    const row: Record<string, unknown> = { period: p.periodLabel };
    for (const ind of TREND_INDICATORS) {
      const value = p.results?.[ind.section]?.[ind.key] ?? null;
      row[ind.key] = scoreVsIdeal(ind.key, value);
    }
    return row;
  });

  return (
    <div style={{ width: '100%', height: 280 }}>
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 8, right: 16, bottom: 4, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e1e0d9" vertical={false} />
          <XAxis dataKey="period" stroke="#c3c2b7" fontSize={11} tickLine={false} />
          <YAxis
            stroke="#c3c2b7"
            fontSize={11}
            tickFormatter={(v) => `${v}%`}
            tickLine={false}
            axisLine={false}
            width={44}
          />
          <ReferenceLine y={100} stroke="#94a3b8" strokeDasharray="3 3" />
          <Tooltip content={<ChartTooltip />} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          {TREND_INDICATORS.map((ind) => (
            <Line
              key={ind.key}
              type="monotone"
              dataKey={ind.key}
              name={ind.label}
              stroke={ind.color}
              strokeWidth={2}
              dot={{ r: 4 }}
              activeDot={{ r: 6 }}
              connectNulls
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
