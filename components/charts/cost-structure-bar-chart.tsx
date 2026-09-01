'use client';

import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatCostValue } from '@/lib/cost-profitability-analytics';

function ChartTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-md border border-slate-200 bg-white px-3 py-2 text-xs shadow-md">
      <p className="font-medium text-slate-900">{d.tipo}</p>
      <p className="text-slate-600">{formatCostValue(d.valor, 'currency')} ({d.pct.toFixed(1)}%)</p>
    </div>
  );
}

/** Estructura de costos consolidada: costo variable vs. costo fijo. */
export function CostStructureBarChart({ costoVariableTotal, costoFijoTotal }: { costoVariableTotal: number; costoFijoTotal: number }) {
  const total = costoVariableTotal + costoFijoTotal;
  if (total <= 0) return null;

  const data = [
    { tipo: 'Costo Variable', valor: costoVariableTotal, pct: (costoVariableTotal / total) * 100 },
    { tipo: 'Costo Fijo', valor: costoFijoTotal, pct: (costoFijoTotal / total) * 100 },
  ];

  return (
    <div style={{ width: '100%', height: 140 }}>
      <ResponsiveContainer>
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 28, bottom: 4, left: 8 }}>
          <XAxis type="number" tickFormatter={(v) => formatCostValue(v, 'currency')} stroke="#c3c2b7" fontSize={11} tickLine={false} />
          <YAxis type="category" dataKey="tipo" width={100} stroke="#52514e" fontSize={12} tickLine={false} axisLine={false} />
          <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(148,163,184,0.08)' }} />
          <Bar dataKey="valor" radius={[0, 4, 4, 0]} barSize={28}>
            {data.map((_, i) => (
              <Cell key={i} fill={i === 0 ? '#2a78d6' : '#eda100'} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
