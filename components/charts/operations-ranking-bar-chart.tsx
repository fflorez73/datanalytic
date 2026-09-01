'use client';

import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { classifyOperationsIndicator, type OperationsRanking, type RankingMetrica } from '@/lib/operations-analytics';
import { STATUS_HEX } from '@/lib/status-colors';

const METRICA_LABEL: Record<RankingMetrica, string> = {
  cumplimiento: 'Cumplimiento de Meta',
  utilizacion: 'Utilización de Capacidad',
  productividad: 'Productividad (u/h-h)',
};

const METRICA_STATUS_KEY: Record<RankingMetrica, string | null> = {
  cumplimiento: 'cumplimiento_meta_promedio',
  utilizacion: 'utilizacion_capacidad_promedio',
  productividad: null,
};

function ChartTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-md border border-slate-200 bg-white px-3 py-2 text-xs shadow-md">
      <p className="font-medium text-slate-900">{d.area}</p>
      <p className="text-slate-600">{d.valor.toFixed(2)}</p>
    </div>
  );
}

/** Ranking comparativo por área/turno/planta, ordenado desc por la métrica de mayor cobertura de datos. */
export function OperationsRankingBarChart({ ranking }: { ranking: OperationsRanking }) {
  if (ranking.items.length === 0) return null;
  const statusKey = METRICA_STATUS_KEY[ranking.metrica];

  return (
    <div>
      <p className="mb-2 text-xs font-medium text-slate-500">Ranking por {METRICA_LABEL[ranking.metrica]}</p>
      <div style={{ width: '100%', height: Math.max(160, ranking.items.length * 36 + 20) }}>
        <ResponsiveContainer>
          <BarChart data={ranking.items} layout="vertical" margin={{ top: 4, right: 28, bottom: 4, left: 8 }}>
            <XAxis type="number" stroke="#c3c2b7" fontSize={11} tickLine={false} />
            <YAxis type="category" dataKey="area" width={110} stroke="#52514e" fontSize={12} tickLine={false} axisLine={false} />
            <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(148,163,184,0.08)' }} />
            <Bar dataKey="valor" radius={[0, 4, 4, 0]} barSize={18}>
              {ranking.items.map((d, i) => {
                const status = statusKey ? classifyOperationsIndicator(statusKey, d.valor) : 'unknown';
                return <Cell key={i} fill={statusKey ? STATUS_HEX[status] : '#2a78d6'} />;
              })}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
