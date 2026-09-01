'use client';

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatSalesValue, type EvolucionPunto } from '@/lib/sales-analytics';

function ChartTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-md border border-slate-200 bg-white px-3 py-2 text-xs shadow-md">
      <p className="font-medium text-slate-900">{d.periodo}</p>
      <p className="text-slate-600">{formatSalesValue(d.monto, 'currency')}</p>
      {d.cantidad !== null && <p className="text-slate-500">{formatSalesValue(d.cantidad, 'integer')} unidades</p>}
    </div>
  );
}

/** Evolución mensual de ventas — barras verticales ordenadas cronológicamente. */
export function SalesTrendChart({ evolucion }: { evolucion: EvolucionPunto[] }) {
  if (evolucion.length === 0) return null;

  return (
    <div style={{ width: '100%', height: 280 }}>
      <ResponsiveContainer>
        <BarChart data={evolucion} margin={{ top: 8, right: 16, bottom: 4, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e1e0d9" vertical={false} />
          <XAxis dataKey="periodo" stroke="#c3c2b7" fontSize={11} tickLine={false} axisLine={false} />
          <YAxis
            stroke="#c3c2b7"
            fontSize={11}
            tickFormatter={(v) => formatSalesValue(v, 'currency')}
            tickLine={false}
            axisLine={false}
            width={70}
          />
          <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(148,163,184,0.08)' }} />
          <Bar dataKey="monto" fill="#2a78d6" radius={[4, 4, 0, 0]} maxBarSize={48} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
