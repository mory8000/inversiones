import type { ReactNode } from 'react'
import { cn } from '../../lib/cn'

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  className,
  size = 'md',
  ariaLabel,
}: {
  value: T
  onChange: (v: T) => void
  options: { value: T; label: ReactNode }[]
  className?: string
  size?: 'sm' | 'md'
  ariaLabel?: string
}) {
  return (
    <div role="tablist" aria-label={ariaLabel} className={cn('inline-flex rounded-xl bg-slate-200/70 p-1', className)}>
      {options.map((o) => {
        const active = o.value === value
        return (
          <button
            key={o.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(o.value)}
            className={cn(
              'flex-1 rounded-lg font-semibold whitespace-nowrap transition-all',
              size === 'sm' ? 'px-3 py-1 text-[13px]' : 'px-4 py-1.5 text-sm',
              active ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900',
            )}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

export function Chip({
  active,
  onClick,
  children,
  color,
  className,
}: {
  active: boolean
  onClick: () => void
  children: ReactNode
  color?: string
  className?: string
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-[13px] font-semibold whitespace-nowrap transition-colors',
        active ? 'border-brand-900 bg-brand-900 text-white' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-900',
        className,
      )}
    >
      {color && <span className="size-2 rounded-full" style={{ backgroundColor: color }} aria-hidden />}
      {children}
    </button>
  )
}

export function Badge({ children, color, soft, className }: { children: ReactNode; color: string; soft: string; className?: string }) {
  return (
    <span
      className={cn('inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-semibold tracking-wide uppercase', className)}
      style={{ backgroundColor: soft, color }}
    >
      {children}
    </span>
  )
}
