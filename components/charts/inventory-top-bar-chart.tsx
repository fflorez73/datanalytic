'use client';

import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ABC_CLASS_COLOR, formatInventoryValue, type InventoryItemComputed } from '@/lib/inventory-analytics';

function ChartTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-md border border-slate-200 bg-white px-3 py-2 text-xs shadow-md">
      <p className="font-medium text-slate-900">{d.sku}</p>
      <p className="text-slate-600">{formatInventoryValue(d.valorInventario, 'currency')}</p>
      <p className="text-slate-500">Clase {d.claseAbc}</p>
    </div>
  );
}

/** Top-N productos por valor de inventario, ordenados desc, coloreados por clase ABC. */
export function InventoryTopBarChart({ items, limit = 10 }: { items: InventoryItemComputed[]; limit?: number }) {
  const data = [...items].sort((a, b) => b.valorInventario - a.valorInventario).slice(0, limit);
  if (data.length === 0) return null;

  return (
    <div style={{ width: '100%', height: Math.max(200, data.length * 36 + 20) }}>
      <ResponsiveContainer>
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 28, bottom: 4, left: 8 }}>
          <XAxis type="number" tickFormatter={(v) => formatInventoryValue(v, 'currency')} stroke="#c3c2b7" fontSize={11} tickLine={false} />
          <YAxis type="category" dataKey="sku" width={90} stroke="#52514e" fontSize={12} tickLine={false} axisLine={false} />
          <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(148,163,184,0.08)' }} />
          <Bar dataKey="valorInventario" radius={[0, 4, 4, 0]} barSize={18}>
            {data.map((d, i) => (
              <Cell key={i} fill={ABC_CLASS_COLOR[d.claseAbc]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
