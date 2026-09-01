'use client';

import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatSalesValue, type ConcentracionItem } from '@/lib/sales-analytics';

function ChartTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-md border border-slate-200 bg-white px-3 py-2 text-xs shadow-md">
      <p className="font-medium text-slate-900">{d.nombre}</p>
      <p className="text-slate-600">{formatSalesValue(d.monto, 'currency')}</p>
      <p className="text-slate-500">{d.pctTotal.toFixed(1)}% del total</p>
    </div>
  );
}

/** Top-5 productos/categorías/clientes por venta, ordenado desc. */
export function SalesTop5BarChart({ items, dimensionLabel }: { items: ConcentracionItem[]; dimensionLabel: string }) {
  if (items.length === 0) return null;

  return (
    <div>
      <p className="mb-2 text-xs font-medium text-slate-500">Top-5 {dimensionLabel} por venta</p>
      <div style={{ width: '100%', height: Math.max(160, items.length * 40 + 20) }}>
        <ResponsiveContainer>
          <BarChart data={items} layout="vertical" margin={{ top: 4, right: 28, bottom: 4, left: 8 }}>
            <XAxis type="number" tickFormatter={(v) => formatSalesValue(v, 'currency')} stroke="#c3c2b7" fontSize={11} tickLine={false} />
            <YAxis type="category" dataKey="nombre" width={110} stroke="#52514e" fontSize={12} tickLine={false} axisLine={false} />
            <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(148,163,184,0.08)' }} />
            <Bar dataKey="monto" fill="#1baf7a" radius={[0, 4, 4, 0]} barSize={18} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
