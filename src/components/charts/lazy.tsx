// Los gráficos (recharts) se cargan aparte para que la app abra más rápido.

import { lazy, Suspense, type ComponentProps } from 'react'

const EvolutionChartImpl = lazy(() => import('./EvolutionChart').then((m) => ({ default: m.EvolutionChart })))
const DonutImpl = lazy(() => import('./Donut').then((m) => ({ default: m.Donut })))

function Skeleton({ height }: { height: number }) {
  return <div className="animate-pulse rounded-xl bg-slate-100" style={{ height }} aria-hidden />
}

export function EvolutionChart(props: ComponentProps<typeof EvolutionChartImpl>) {
  return (
    <Suspense fallback={<Skeleton height={props.height ?? 240} />}>
      <EvolutionChartImpl {...props} />
    </Suspense>
  )
}

export function Donut(props: ComponentProps<typeof DonutImpl>) {
  return (
    <Suspense fallback={<Skeleton height={props.height ?? 210} />}>
      <DonutImpl {...props} />
    </Suspense>
  )
}
