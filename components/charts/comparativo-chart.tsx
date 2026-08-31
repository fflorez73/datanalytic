'use client';

import { Bar, BarChart, CartesianGrid, Legend, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatIndicatorValue, scoreVsIdeal, type IndicatorFormat } from '@/lib/financial-indicators';
import type { ComparativoPeriodoAnterior } from '@/lib/financial-indicators';

// Indicadores principales, uno por sección — mismo criterio que IndicatorTrendChart,
// más CCC (ciclo de efectivo) ya que también tiene rango de semáforo definido y por
// lo tanto se puede normalizar a % de meta junto a los demás.
const HEADLINE = [
  { section: 'liquidez', key: 'razon_corriente', label: 'Razón Corriente', format: 'ratio' as IndicatorFormat },
  { section: 'endeudamiento', key: 'nivel_endeudamiento', label: 'Endeudamiento', format: 'percent' as IndicatorFormat },
  { section: 'rentabilidad', key: 'margen_neto', label: 'Margen Neto', format: 'percent' as IndicatorFormat },
  { section: 'rentabilidad', key: 'roe', label: 'ROE', format: 'percent' as IndicatorFormat },
  { section: 'ciclo_efectivo', key: 'ccc', label: 'CCC', format: 'days' as IndicatorFormat },
] as const;

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border border-slate-200 bg-white px-3 py-2 text-xs shadow-md">
      <p className="mb-1 font-medium text-slate-900">{label}</p>
      {payload.map((p: any) => (
        <p key={p.dataKey} style={{ color: p.color }}>
          {p.name}: {p.dataKey === 'actual' ? p.payload.actual_raw : p.payload.anterior_raw}
        </p>
      ))}
    </div>
  );
}

export function ComparativoChart({ comparativo }: { comparativo: ComparativoPeriodoAnterior | null | undefined }) {
  const indicadores = comparativo?.indicadores;
  if (!indicadores) return null;

  const data = HEADLINE.map((h) => {
    const entry = (indicadores as any)?.[h.section]?.[h.key];
    if (!entry) return null;
    const actual = scoreVsIdeal(h.key, entry.valor_actual);
    const anterior = scoreVsIdeal(h.key, entry.valor_anterior);
    if (actual === null || anterior === null) return null;
    return {
      label: h.label,
      actual,
      anterior,
      actual_raw: formatIndicatorValue(entry.valor_actual, h.format),
      anterior_raw: formatIndicatorValue(entry.valor_anterior, h.format),
    };
  }).filter((d): d is NonNullable<typeof d> => d !== null);

  if (data.length === 0) return null;

  return (
    <div style={{ width: '100%', height: 280 }}>
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 8, right: 16, bottom: 4, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e1e0d9" vertical={false} />
          <XAxis dataKey="label" stroke="#c3c2b7" fontSize={12} tickLine={false} axisLine={false} />
          <YAxis
            stroke="#c3c2b7"
            fontSize={11}
            tickFormatter={(v) => `${v}%`}
            tickLine={false}
            axisLine={false}
            width={40}
          />
          <ReferenceLine y={100} stroke="#94a3b8" strokeDasharray="3 3" />
          <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(148,163,184,0.08)' }} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar dataKey="anterior" name="Período anterior" fill="#eb6834" radius={[4, 4, 0, 0]} maxBarSize={28} />
          <Bar dataKey="actual" name="Período actual" fill="#2a78d6" radius={[4, 4, 0, 0]} maxBarSize={28} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
