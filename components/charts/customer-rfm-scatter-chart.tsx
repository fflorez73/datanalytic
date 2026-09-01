'use client';

import { CartesianGrid, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis } from 'recharts';
import { SEGMENT_COLOR, formatCustomerValue, type CustomerRfmResult, type CustomerSegment } from '@/lib/customer-analytics';

function ChartTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-md border border-slate-200 bg-white px-3 py-2 text-xs shadow-md">
      <p className="font-medium text-slate-900">{d.label}</p>
      <p className="text-slate-600">{d.segmento}</p>
      <p className="text-slate-600">F: {d.f} · M: {d.m} · R: {d.r}</p>
      <p className="text-slate-500">{formatCustomerValue(d.monto, 'currency')}</p>
    </div>
  );
}

/** Mapa RFM: Frequency Score (x) vs Monetary Score (y), tamaño = Recency Score, color = segmento. */
export function CustomerRfmScatterChart({ clientes }: { clientes: CustomerRfmResult[] }) {
  if (clientes.length === 0) return null;

  const bySegment = new Map<CustomerSegment, typeof clientes>();
  for (const c of clientes) {
    if (!bySegment.has(c.segmento)) bySegment.set(c.segmento, []);
    bySegment.get(c.segmento)!.push(c);
  }

  return (
    <div style={{ width: '100%', height: 320 }}>
      <ResponsiveContainer>
        <ScatterChart margin={{ top: 16, right: 24, bottom: 8, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e1e0d9" />
          <XAxis
            type="number"
            dataKey="f"
            name="Frequency Score"
            domain={[0.5, 5.5]}
            ticks={[1, 2, 3, 4, 5]}
            stroke="#c3c2b7"
            fontSize={11}
            label={{ value: 'Frequency Score (1-5)', position: 'insideBottom', offset: -4, fontSize: 11, fill: '#64748b' }}
          />
          <YAxis
            type="number"
            dataKey="m"
            name="Monetary Score"
            domain={[0.5, 5.5]}
            ticks={[1, 2, 3, 4, 5]}
            stroke="#c3c2b7"
            fontSize={11}
            label={{ value: 'Monetary Score (1-5)', angle: -90, position: 'insideLeft', fontSize: 11, fill: '#64748b' }}
          />
          <ZAxis type="number" dataKey="r" range={[80, 400]} name="Recency Score" />
          <Tooltip content={<ChartTooltip />} cursor={{ strokeDasharray: '3 3' }} />
          {Array.from(bySegment.entries()).map(([segmento, items]) => (
            <Scatter
              key={segmento}
              name={segmento}
              data={items.map((c) => ({ label: c.id, f: c.scoreF, m: c.scoreM, r: c.scoreR, monto: c.monto, segmento: c.segmento }))}
              fill={SEGMENT_COLOR[segmento]}
            />
          ))}
        </ScatterChart>
      </ResponsiveContainer>
      <div className="mt-2 flex flex-wrap justify-center gap-x-4 gap-y-1">
        {Array.from(bySegment.keys()).map((seg) => (
          <div key={seg} className="flex items-center gap-1.5 text-xs text-slate-600">
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: SEGMENT_COLOR[seg] }} />
            {seg}
          </div>
        ))}
      </div>
    </div>
  );
}
