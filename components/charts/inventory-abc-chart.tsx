'use client';

import { Bar, Cell, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ABC_CLASS_COLOR, formatInventoryValue, type InventoryItemComputed } from '@/lib/inventory-analytics';

function ChartTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-md border border-slate-200 bg-white px-3 py-2 text-xs shadow-md">
      <p className="font-medium text-slate-900">{d.sku}</p>
      <p className="text-slate-600">{formatInventoryValue(d.valorInventario, 'currency')} ({d.pctValorTotal.toFixed(1)}%)</p>
      <p className="text-slate-500">Acumulado: {d.pctAcumulado.toFixed(1)}% · Clase {d.claseAbc}</p>
    </div>
  );
}

/** Gráfico Pareto/ABC: barras de % individual (coloreadas por clase) + línea de % acumulado, con referencias en 80%/95%. */
export function InventoryAbcChart({ items }: { items: InventoryItemComputed[] }) {
  if (items.length === 0) return null;

  const sorted = [...items].sort((a, b) => b.valorInventario - a.valorInventario).slice(0, 20);
  let cumulative = 0;
  const total = items.reduce((s, it) => s + it.valorInventario, 0);
  const data = sorted.map((it) => {
    cumulative += it.valorInventario;
    return {
      sku: it.sku,
      valorInventario: it.valorInventario,
      pctValorTotal: it.pctValorTotal,
      pctAcumulado: total > 0 ? (cumulative / total) * 100 : 0,
      claseAbc: it.claseAbc,
    };
  });

  return (
    <div style={{ width: '100%', height: 300 }}>
      <ResponsiveContainer>
        <ComposedChart data={data} margin={{ top: 8, right: 16, bottom: 32, left: 0 }}>
          <XAxis dataKey="sku" stroke="#c3c2b7" fontSize={10} tickLine={false} angle={-35} textAnchor="end" interval={0} height={60} />
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
          <ReferenceLine yAxisId="pct" y={80} stroke="#16a34a" strokeDasharray="3 3" label={{ value: '80% (A)', position: 'right', fontSize: 9, fill: '#16a34a' }} />
          <ReferenceLine yAxisId="pct" y={95} stroke="#eda100" strokeDasharray="3 3" label={{ value: '95% (B)', position: 'right', fontSize: 9, fill: '#b45309' }} />
          <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(148,163,184,0.08)' }} />
          <Bar yAxisId="pct" dataKey="pctValorTotal" radius={[4, 4, 0, 0]} maxBarSize={30}>
            {data.map((d, i) => (
              <Cell key={i} fill={ABC_CLASS_COLOR[d.claseAbc]} />
            ))}
          </Bar>
          <Line yAxisId="pct" type="monotone" dataKey="pctAcumulado" stroke="#2a78d6" strokeWidth={2} dot={{ r: 3 }} />
        </ComposedChart>
      </ResponsiveContainer>
      <div className="mt-2 flex flex-wrap justify-center gap-x-4 gap-y-1">
        {(['A', 'B', 'C'] as const).map((clase) => (
          <div key={clase} className="flex items-center gap-1.5 text-xs text-slate-600">
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: ABC_CLASS_COLOR[clase] }} />
            Clase {clase}
          </div>
        ))}
      </div>
    </div>
  );
}
