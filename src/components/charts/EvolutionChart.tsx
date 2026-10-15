import { useId } from 'react'
import { Area, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { TimelinePoint } from '../../lib/finance'
import { fmtDate, fmtEUR, fmtEURCompact, fmtMonthShort, HIDDEN } from '../../lib/format'
import { useHidden } from '../ui/Amount'

export function EvolutionChart({ points, height = 240 }: { points: TimelinePoint[]; height?: number }) {
  const hidden = useHidden()
  const gid = useId().replace(/:/g, '')
  if (points.length < 2) {
    return (
      <div className="flex items-center justify-center rounded-xl bg-slate-50 text-sm text-slate-500" style={{ height }}>
        La evolución aparecerá cuando haya movimientos en distintas fechas.
      </div>
    )
  }
  const values = points.flatMap((p) => [p.capital, p.patrimonio])
  const min = Math.min(...values)
  const max = Math.max(...values)
  const pad = (max - min) * 0.08 || max * 0.1 || 1
  const domain: [number, number] = [Math.max(0, Math.floor((min - pad) / 100) * 100), Math.ceil((max + pad) / 100) * 100]

  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id={`pat-${gid}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#2F5BEA" stopOpacity={0.28} />
              <stop offset="100%" stopColor="#2F5BEA" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke="#EEF1F6" />
          <XAxis
            dataKey="fecha"
            tickFormatter={fmtMonthShort}
            tick={{ fontSize: 11, fill: '#94A3B8' }}
            axisLine={false}
            tickLine={false}
            minTickGap={28}
            tickMargin={8}
          />
          <YAxis
            domain={domain}
            tickFormatter={(v: number) => (hidden ? '•••' : fmtEURCompact(v))}
            tick={{ fontSize: 11, fill: '#94A3B8' }}
            axisLine={false}
            tickLine={false}
            width={hidden ? 36 : 64}
          />
          <Tooltip
            cursor={{ stroke: '#CBD5E1', strokeDasharray: '3 3' }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null
              const p = payload[0].payload as TimelinePoint
              const gain = p.patrimonio - p.capital
              const money = (v: number, sign = false) => (hidden ? `${HIDDEN} €` : fmtEUR(v, { sign }))
              return (
                <div className="min-w-48 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm shadow-lg">
                  <div className="mb-1.5 text-xs font-medium text-slate-500">{fmtDate(p.fecha)}</div>
                  <div className="flex items-center justify-between gap-4">
                    <span className="flex items-center gap-1.5 text-slate-600">
                      <span className="size-2.5 rounded-full bg-brand-500" /> Patrimonio
                    </span>
                    <span className="font-semibold text-slate-900 tabular-nums">{money(p.patrimonio)}</span>
                  </div>
                  <div className="mt-1 flex items-center justify-between gap-4">
                    <span className="flex items-center gap-1.5 text-slate-600">
                      <span className="h-0.5 w-2.5 bg-slate-400" /> Capital invertido
                    </span>
                    <span className="font-medium text-slate-700 tabular-nums">{money(p.capital)}</span>
                  </div>
                  <div className="mt-1.5 flex items-center justify-between gap-4 border-t border-slate-100 pt-1.5">
                    <span className="text-slate-600">Rentabilidad</span>
                    <span className={`font-semibold tabular-nums ${gain >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{money(gain, true)}</span>
                  </div>
                </div>
              )
            }}
          />
          <Area type="monotone" dataKey="patrimonio" stroke="#2F5BEA" strokeWidth={2.25} fill={`url(#pat-${gid})`} isAnimationActive={false} />
          <Line type="monotone" dataKey="capital" stroke="#94A3B8" strokeWidth={1.75} strokeDasharray="5 4" dot={false} isAnimationActive={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}
