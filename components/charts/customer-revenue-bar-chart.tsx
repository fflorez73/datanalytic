'use client';

import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ACTIVO_RIESGO_COLOR, formatCustomerValue, type CustomerRfmResult } from '@/lib/customer-analytics';

function ChartTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-md border border-slate-200 bg-white px-3 py-2 text-xs shadow-md">
      <p className="font-medium text-slate-900">{d.label}</p>
      <p className="text-slate-600">{formatCustomerValue(d.monto, 'currency')}</p>
      <p className="text-slate-500">{d.segmento}</p>
    </div>
  );
}

/** Barras horizontales de ingreso por cliente, ordenadas desc — igual al gráfico del informe de referencia. */
export function CustomerRevenueBarChart({ clientes }: { clientes: CustomerRfmResult[] }) {
  const data = [...clientes]
    .sort((a, b) => b.monto - a.monto)
    .map((c) => ({
      label: c.id,
      monto: c.monto,
      segmento: c.segmento,
      enRiesgo: c.segmento === 'En Riesgo',
    }));

  if (data.length === 0) return null;

  return (
    <div style={{ width: '100%', height: Math.max(200, data.length * 40 + 40) }}>
      <ResponsiveContainer>
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 28, bottom: 4, left: 8 }}>
          <XAxis
            type="number"
            tickFormatter={(v) => formatCustomerValue(v, 'currency')}
            stroke="#c3c2b7"
            fontSize={11}
            tickLine={false}
          />
          <YAxis type="category" dataKey="label" width={80} stroke="#52514e" fontSize={12} tickLine={false} axisLine={false} />
          <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(148,163,184,0.08)' }} />
          <Bar dataKey="monto" radius={[0, 4, 4, 0]} barSize={18}>
            {data.map((d, i) => (
              <Cell key={i} fill={d.enRiesgo ? ACTIVO_RIESGO_COLOR.riesgo : ACTIVO_RIESGO_COLOR.activo} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
