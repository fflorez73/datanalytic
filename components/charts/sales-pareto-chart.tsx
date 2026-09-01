'use client';

import { Bar, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatSalesValue, type ParetoItem } from '@/lib/sales-analytics';

function ChartTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-md border border-slate-200 bg-white px-3 py-2 text-xs shadow-md">
      <p className="font-medium text-slate-900">{d.nombre}</p>
      <p className="text-slate-600">{formatSalesValue(d.monto, 'currency')} ({d.pctTotal.toFixed(1)}%)</p>
      <p className="text-slate-500">Acumulado: {d.pctAcumulado.toFixed(1)}%</p>
    </div>
  );
}

/** Gráfico Pareto: barras de % individual + línea de % acumulado, con referencia en 80%. */
export function SalesParetoChart({ items }: { items: ParetoItem[] }) {
  if (items.length === 0) return null;
  // Limita a los primeros 15 para legibilidad — el 80/20 casi siempre se resuelve mucho antes.
  const data = items.slice(0, 15);

  return (
    <div style={{ width: '100%', height: 300 }}>
      <ResponsiveContainer>
        <ComposedChart data={data} margin={{ top: 8, right: 16, bottom: 32, left: 0 }}>
          <XAxis dataKey="nombre" stroke="#c3c2b7" fontSize={10} tickLine={false} angle={-35} textAnchor="end" interval={0} height={60} />
          <YAxis
            yAxisId="pct"
            stroke="#c3c2b7"
            fontSize={11}
            tickFormatter={(v) => `${v}%`}
            tickLine={false}
            axisLine={false}
            domain={[0, 100]}
            width={40}
          />
          <ReferenceLine yAxisId="pct" y={80} stroke="#eb6834" strokeDasharray="3 3" label={{ value: '80%', position: 'right', fontSize: 10, fill: '#eb6834' }} />
          <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(148,163,184,0.08)' }} />
          <Bar yAxisId="pct" dataKey="pctTotal" fill="#2a78d6" radius={[4, 4, 0, 0]} maxBarSize={36} />
          <Line yAxisId="pct" type="monotone" dataKey="pctAcumulado" stroke="#eb6834" strokeWidth={2} dot={{ r: 3 }} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
