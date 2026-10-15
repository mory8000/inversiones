import { TrendingDown, TrendingUp, Minus } from 'lucide-react'
import { useData } from '../../store/data'
import { fmtEUR, fmtPct, HIDDEN } from '../../lib/format'
import { cn } from '../../lib/cn'

export function useHidden(): boolean {
  return useData((s) => s.hideAmounts)
}

export function toneClass(value: number | null | undefined): string {
  if (value === null || value === undefined) return 'text-slate-500'
  if (value > 0.005) return 'text-emerald-600'
  if (value < -0.005) return 'text-rose-600'
  return 'text-slate-500'
}

/** Importe en euros (respeta la opción de ocultar importes). */
export function Amount({
  value,
  sign = false,
  tone = false,
  decimals,
  className,
}: {
  value: number
  sign?: boolean
  tone?: boolean
  decimals?: 0 | 2
  className?: string
}) {
  const hidden = useHidden()
  return (
    <span className={cn('tabular-nums whitespace-nowrap', tone && toneClass(value), className)}>
      {hidden ? `${HIDDEN} €` : fmtEUR(value, { sign, decimals })}
    </span>
  )
}

export function Pct({ value, tone = true, sign = true, className }: { value: number | null; tone?: boolean; sign?: boolean; className?: string }) {
  return <span className={cn('tabular-nums whitespace-nowrap', tone && toneClass(value), className)}>{fmtPct(value, { sign })}</span>
}

/** Píldora de rentabilidad: "▲ +523,10 € · +5,23 %" */
export function GainBadge({
  ganancia,
  rentabilidad,
  size = 'md',
  onDark = false,
  className,
}: {
  ganancia: number
  rentabilidad: number | null
  size?: 'sm' | 'md'
  onDark?: boolean
  className?: string
}) {
  const hidden = useHidden()
  const positive = ganancia > 0.005
  const negative = ganancia < -0.005
  const Icon = positive ? TrendingUp : negative ? TrendingDown : Minus
  const palette = onDark
    ? positive
      ? 'bg-emerald-400/15 text-emerald-300'
      : negative
        ? 'bg-rose-400/15 text-rose-300'
        : 'bg-white/10 text-white/70'
    : positive
      ? 'bg-emerald-50 text-emerald-700'
      : negative
        ? 'bg-rose-50 text-rose-700'
        : 'bg-slate-100 text-slate-600'
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full font-semibold tabular-nums whitespace-nowrap',
        size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-sm',
        palette,
        className,
      )}
    >
      <Icon className={size === 'sm' ? 'size-3.5' : 'size-4'} strokeWidth={2.5} />
      {hidden ? `${HIDDEN} €` : fmtEUR(ganancia, { sign: true })}
      {rentabilidad !== null && <span className="opacity-80">· {fmtPct(rentabilidad, { sign: true })}</span>}
    </span>
  )
}
