// Piezas para mostrar a los titulares: todos se ven a la vez, cada uno con su color.

import type { CSSProperties } from 'react'
import { Pencil, Plus } from 'lucide-react'
import type { Titular } from '../types'
import { useTitulares } from '../store/data'
import { useFinance } from '../store/useFinance'
import { openTitular } from '../store/ui'
import { initials } from '../lib/format'
import { titularColor } from '../lib/titulares'
import { cn } from '../lib/cn'
import { Amount } from './ui/Amount'

const AVATAR_SIZES = {
  xs: 'size-6 text-[10px]',
  sm: 'size-8 text-xs',
  md: 'size-10 text-sm',
  lg: 'size-12 text-base',
} as const

export function useTitularColor(id: string | undefined): string {
  const titulares = useTitulares()
  return titularColor(titulares, id)
}

export function TitularAvatar({ titular, size = 'md', className }: { titular: Titular; size?: keyof typeof AVATAR_SIZES; className?: string }) {
  const color = useTitularColor(titular.id)
  return (
    <span
      className={cn('inline-flex shrink-0 items-center justify-center rounded-full font-bold text-white', AVATAR_SIZES[size], className)}
      style={{ backgroundColor: color }}
      aria-hidden
    >
      {initials(titular.nombre)}
    </span>
  )
}

/** Nombre del titular con su color: para saber de quién es cada cuenta, producto o movimiento. */
export function TitularTag({ titular, className }: { titular: Titular | undefined; className?: string }) {
  const color = useTitularColor(titular?.id)
  if (!titular) return null
  return (
    <span className={cn('inline-flex min-w-0 items-center gap-1 font-medium', className)} style={{ color }}>
      <span className="size-1.5 shrink-0 rounded-full" style={{ backgroundColor: color }} aria-hidden />
      <span className="truncate">{titular.nombre}</span>
    </span>
  )
}

export function PrincipalBadge({ dark = false, className }: { dark?: boolean; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center rounded-md px-1.5 py-0.5 text-[10px] font-bold tracking-wide uppercase',
        dark ? 'bg-white/15 text-white/85' : 'bg-brand-100 text-brand-700',
        className,
      )}
    >
      Principal
    </span>
  )
}

/** Menú lateral (escritorio): todos los titulares a la vez, cada uno con su patrimonio. */
export function SidebarTitulares() {
  const { titulares } = useFinance()
  return (
    <section aria-label="Titulares">
      <div className="flex items-center justify-between pr-1 pl-2">
        <span className="text-[11px] font-semibold tracking-wider text-white/45 uppercase">Titulares</span>
        <button
          type="button"
          onClick={() => openTitular()}
          aria-label="Añadir titular"
          title="Añadir titular"
          className="inline-flex size-7 items-center justify-center rounded-lg text-white/55 transition-colors hover:bg-white/10 hover:text-white"
        >
          <Plus className="size-4" strokeWidth={2.4} />
        </button>
      </div>
      <ul className="mt-1.5 space-y-1">
        {titulares.map((tf) => (
          <li key={tf.titular.id} className="group flex min-w-0 items-center gap-2.5 rounded-xl p-2 transition-colors hover:bg-white/6">
            <TitularAvatar titular={tf.titular} />
            <div className="min-w-0 flex-1">
              <div className="flex min-w-0 items-center gap-1.5">
                <span className="truncate text-sm font-semibold text-white">{tf.titular.nombre}</span>
                {tf.index === 0 && <PrincipalBadge dark />}
              </div>
              <div className="truncate text-xs text-white/55">
                {tf.ws.movimientos.length === 0 ? 'Sin movimientos' : <Amount value={tf.totals.patrimonio} />}
              </div>
            </div>
            <button
              type="button"
              onClick={() => openTitular(tf.titular.id)}
              aria-label={`Editar ${tf.titular.nombre}`}
              title="Nombre y código"
              className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-white/40 transition-colors hover:bg-white/10 hover:text-white"
            >
              <Pencil className="size-3.5" strokeWidth={2.4} />
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}

/** «¿De quién es?»: elige el titular de una cuenta o un producto. */
export function TitularPicker({
  value,
  onChange,
  label = '¿De quién es?',
  hint,
}: {
  value: string
  onChange: (id: string) => void
  label?: string
  hint?: string
}) {
  const titulares = useTitulares()
  if (titulares.length < 2) return null
  return (
    <fieldset>
      <legend className="mb-2 text-sm font-medium text-slate-700">{label}</legend>
      <div className="flex flex-wrap gap-2">
        {titulares.map((t, i) => {
          const active = t.id === value
          return (
            <button
              key={t.id}
              type="button"
              aria-pressed={active}
              onClick={() => onChange(t.id)}
              className={cn(
                'flex min-w-0 max-w-full items-center gap-2 rounded-xl border py-1.5 pr-3 pl-1.5 text-sm font-semibold transition-all',
                active ? 'border-transparent bg-white text-slate-900 shadow-sm ring-2' : 'border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50',
              )}
              style={active ? ({ '--tw-ring-color': titularColor(titulares, t.id) } as CSSProperties) : undefined}
            >
              <TitularAvatar titular={t} size="sm" className={cn(!active && 'opacity-70')} />
              <span className="truncate">{t.nombre}</span>
              {i === 0 && <span className="text-[11px] font-medium text-slate-400">(principal)</span>}
            </button>
          )
        })}
      </div>
      {hint && <p className="mt-2 text-[13px] text-slate-500">{hint}</p>}
    </fieldset>
  )
}
