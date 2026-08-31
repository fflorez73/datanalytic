'use client';

import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';

function ChartTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-md border border-slate-200 bg-white px-3 py-2 text-xs shadow-md">
      <p className="font-medium text-slate-900">{d.label}</p>
      <p className="text-slate-600">{(d.value * 100).toFixed(1)}%</p>
    </div>
  );
}

const RADIAN = Math.PI / 180;

function renderSliceLabel(props: any) {
  const { cx, cy, midAngle, innerRadius, outerRadius, value } = props;
  if (value < 0.03) return null; // evita etiquetas ilegibles en cuñas muy finas
  const radius = innerRadius + (outerRadius - innerRadius) * 0.6;
  const x = cx + radius * Math.cos(-midAngle * RADIAN);
  const y = cy + radius * Math.sin(-midAngle * RADIAN);
  return (
    <text x={x} y={y} fill="#ffffff" textAnchor="middle" dominantBaseline="central" fontSize={12} fontWeight={600}>
      {`${(value * 100).toFixed(0)}%`}
    </text>
  );
}

export function ComposicionPieChart({
  title,
  data,
}: {
  title: string;
  data: { label: string; value: number; color: string }[];
}) {
  const items = data.filter((d) => typeof d.value === 'number' && d.value > 0);
  if (items.length === 0) return null;

  return (
    <div>
      <p className="mb-2 text-center text-sm font-semibold text-slate-700">{title}</p>
      <div style={{ width: '100%', height: 260 }}>
        <ResponsiveContainer>
          <PieChart>
            <Pie
              data={items}
              dataKey="value"
              nameKey="label"
              cx="50%"
              cy="48%"
              outerRadius={90}
              label={renderSliceLabel}
              labelLine={false}
              isAnimationActive={false}
            >
              {items.map((d, i) => (
                <Cell key={i} fill={d.color} />
              ))}
            </Pie>
            <Tooltip content={<ChartTooltip />} />
            <Legend
              layout="horizontal"
              verticalAlign="bottom"
              align="center"
              wrapperStyle={{ fontSize: 11 }}
              formatter={(value) => <span style={{ color: '#52514e' }}>{value}</span>}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
