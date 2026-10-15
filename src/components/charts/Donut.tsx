import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'
import { fmtEUR, fmtPct, HIDDEN } from '../../lib/format'
import { useHidden } from '../ui/Amount'

export interface DonutDatum {
  key: string
  label: string
  value: number
  color: string
}

export function Donut({ data, centerLabel, centerValue, height = 210 }: { data: DonutDatum[]; centerLabel: string; centerValue: string; height?: number }) {
  const hidden = useHidden()
  const total = data.reduce((s, d) => s + d.value, 0)
  const items = data.filter((d) => d.value > 0.005)
  return (
    <div className="relative" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={items.length ? items : [{ key: 'vacio', label: 'Sin datos', value: 1, color: '#E2E8F0' }]}
            dataKey="value"
            nameKey="label"
            innerRadius="72%"
            outerRadius="100%"
            paddingAngle={items.length > 1 ? 2 : 0}
            cornerRadius={4}
            stroke="none"
            startAngle={90}
            endAngle={-270}
            isAnimationActive={false}
          >
            {(items.length ? items : [{ key: 'vacio', color: '#E2E8F0' }]).map((d) => (
              <Cell key={d.key} fill={d.color} />
            ))}
          </Pie>
          {items.length > 0 && (
            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null
                const d = payload[0].payload as DonutDatum
                return (
                  <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-lg">
                    <div className="flex items-center gap-2 font-semibold text-slate-800">
                      <span className="size-2.5 rounded-full" style={{ backgroundColor: d.color }} />
                      {d.label}
                    </div>
                    <div className="mt-0.5 text-slate-600 tabular-nums">
                      {hidden ? `${HIDDEN} €` : fmtEUR(d.value)} · {fmtPct(total ? d.value / total : 0, { short: true })}
                    </div>
                  </div>
                )
              }}
            />
          )}
        </PieChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
        <span className="text-xs font-medium text-slate-500">{centerLabel}</span>
        <span className="mt-0.5 text-lg font-bold text-slate-900 tabular-nums">{hidden ? `${HIDDEN} €` : centerValue}</span>
      </div>
    </div>
  )
}
