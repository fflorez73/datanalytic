'use client';

import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatCostValue, type CostRankingMetrica } from '@/lib/cost-profitability-analytics';

function ChartTooltip({ active, payload, metrica }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-md border border-slate-200 bg-white px-3 py-2 text-xs shadow-md">
      <p className="font-medium text-slate-900">{d.producto}</p>
      <p className="text-slate-600">{metrica === 'utilidad_neta' ? formatCostValue(d.valor, 'currency') : formatCostValue(d.valor, 'percent')}</p>
      {d.enPerdida && <p className="font-medium text-red-600">En pérdida</p>}
    </div>
  );
}

/** Ranking de rentabilidad por producto/proyecto — rojo para los que están en pérdida. */
export function CostProfitabilityRankingBarChart({
  items,
  metrica,
}: {
  items: { producto: string; valor: number; enPerdida: boolean }[];
  metrica: CostRankingMetrica;
}) {
  if (items.length === 0) return null;

  return (
    <div style={{ width: '100%', height: Math.max(160, items.length * 36 + 20) }}>
      <ResponsiveContainer>
        <BarChart data={items} layout="vertical" margin={{ top: 4, right: 28, bottom: 4, left: 8 }}>
          <XAxis type="number" tickFormatter={(v) => (metrica === 'utilidad_neta' ? formatCostValue(v, 'currency') : `${v}%`)} stroke="#c3c2b7" fontSize={11} tickLine={false} />
          <YAxis type="category" dataKey="producto" width={120} stroke="#52514e" fontSize={12} tickLine={false} axisLine={false} />
          <Tooltip content={<ChartTooltip metrica={metrica} />} cursor={{ fill: 'rgba(148,163,184,0.08)' }} />
          <Bar dataKey="valor" radius={[0, 4, 4, 0]} barSize={18}>
            {items.map((d, i) => (
              <Cell key={i} fill={d.enPerdida ? '#e34948' : '#1baf7a'} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
