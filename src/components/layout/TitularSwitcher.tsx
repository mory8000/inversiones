// Selector de titular, siempre a la vista: cada titular tiene sus propias cuentas,
// productos y movimientos, y aquí se cambia de uno a otro con un toque.

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Pencil, Plus } from 'lucide-react'
import type { Titular } from '../../types'
import { useData } from '../../store/data'
import { computeFinance } from '../../store/useFinance'
import { openTitular, toast } from '../../store/ui'
import { todayISO } from '../../lib/dates'
import { initials } from '../../lib/format'
import { orderTitulares, shortTitularName, titularColor } from '../../lib/titulares'
import { cn } from '../../lib/cn'
import { Amount } from '../ui/Amount'

const AVATAR_SIZES = {
  xs: 'size-7 text-[11px]',
  sm: 'size-8 text-xs',
  md: 'size-10 text-sm',
  lg: 'size-12 text-base',
} as const

export function TitularAvatar({
  titular,
  size = 'md',
  className,
}: {
  titular: Titular
  size?: keyof typeof AVATAR_SIZES
  className?: string
}) {
  const titulares = useData((s) => s.titulares)
  return (
    <span
      className={cn('inline-flex shrink-0 items-center justify-center rounded-full font-bold text-white', AVATAR_SIZES[size], className)}
      style={{ backgroundColor: titularColor(titulares, titular.id) }}
      aria-hidden
    >
      {initials(titular.nombre)}
    </span>
  )
}

/** Cambia de titular y lo confirma con un aviso (en el móvil el cambio se nota menos). */
export function useSwitchTitular() {
  const switchTitular = useData((s) => s.switchTitular)
  const activeId = useData((s) => s.activeTitularId)
  return (t: Titular) => {
    if (t.id === activeId) return
    switchTitular(t.id)
    toast(`Ahora ves los datos de ${t.nombre}`)
  }
}

/** Patrimonio de un titular (o `null` si aún no tiene movimientos). */
export function useTitularPatrimonio(id: string): number | null {
  const ws = useData((s) => s.workspaces[id])
  if (!ws || ws.movimientos.length === 0) return null
  return computeFinance(ws, todayISO()).totals.patrimonio
}

function SidebarRow({ titular, active }: { titular: Titular; active: boolean }) {
  const pick = useSwitchTitular()
  const patrimonio = useTitularPatrimonio(titular.id)
  return (
    <li className="relative">
      <button
        type="button"
        onClick={() => pick(titular)}
        aria-current={active ? 'true' : undefined}
        title={active ? `Estás viendo los datos de ${titular.nombre}` : `Ver los datos de ${titular.nombre}`}
        className={cn(
          'flex w-full min-w-0 items-center gap-2.5 rounded-xl p-2 text-left transition-colors',
          active ? 'bg-white/12 pr-10' : 'pr-2 hover:bg-white/6',
        )}
      >
        <TitularAvatar titular={titular} className={cn(active ? 'ring-2 ring-white/80' : 'opacity-75')} />
        <span className="min-w-0">
          <span className={cn('block truncate text-sm font-semibold', active ? 'text-white' : 'text-white/70')}>{shortTitularName(titular)}</span>
          <span className="block truncate text-xs text-white/50">
            {patrimonio === null ? 'Sin movimientos' : <Amount value={patrimonio} />}
          </span>
        </span>
      </button>
      {active && (
        <button
          type="button"
          onClick={() => openTitular(titular.id)}
          aria-label={`Editar ${titular.nombre}`}
          title="Nombre y código"
          className="absolute top-1/2 right-1.5 inline-flex size-8 -translate-y-1/2 items-center justify-center rounded-lg text-white/55 transition-colors hover:bg-white/10 hover:text-white"
        >
          <Pencil className="size-3.5" strokeWidth={2.4} />
        </button>
      )}
    </li>
  )
}

/** Menú lateral (escritorio): todos los titulares, cada uno con su patrimonio por separado. */
export function SidebarTitulares() {
  const titulares = useData((s) => s.titulares)
  const activeId = useData((s) => s.activeTitularId)
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
        {orderTitulares(titulares).map((t) => (
          <SidebarRow key={t.id} titular={t} active={t.id === activeId} />
        ))}
      </ul>
    </section>
  )
}

/** Barra superior (móvil): un botón por titular; el activo, resaltado. */
export function TitularTabs() {
  const titulares = useData((s) => s.titulares)
  const activeId = useData((s) => s.activeTitularId)
  const pick = useSwitchTitular()
  const ref = useRef<HTMLDivElement>(null)
  // Lados por los que quedan titulares fuera de la vista (se difuminan para indicar que se puede deslizar).
  const [more, setMore] = useState({ left: false, right: false })
  const updateMore = useCallback(() => {
    const box = ref.current
    if (!box) return
    const left = box.scrollLeft > 1
    const right = box.scrollLeft + box.clientWidth < box.scrollWidth - 1
    setMore((m) => (m.left === left && m.right === right ? m : { left, right }))
  }, [])
  const names = titulares.map((t) => t.nombre).join('|')

  // Si no caben todos, el titular activo se desplaza hasta quedar a la vista (sin mover la página).
  useLayoutEffect(() => {
    const box = ref.current
    const btn = box?.querySelector<HTMLElement>('[aria-pressed="true"]')
    if (box && btn) {
      if (btn.offsetLeft < box.scrollLeft) box.scrollLeft = btn.offsetLeft - 4
      else if (btn.offsetLeft + btn.offsetWidth > box.scrollLeft + box.clientWidth) box.scrollLeft = btn.offsetLeft + btn.offsetWidth - box.clientWidth + 4
    }
    updateMore()
  }, [activeId, names, updateMore])

  useEffect(() => {
    const box = ref.current
    if (!box || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(updateMore)
    ro.observe(box)
    return () => ro.disconnect()
  }, [updateMore])

  const fade = (on: boolean) => (on ? '20px' : '0px')
  const mask =
    more.left || more.right
      ? `linear-gradient(to right, transparent 0, #000 ${fade(more.left)}, #000 calc(100% - ${fade(more.right)}), transparent 100%)`
      : undefined

  return (
    <div
      ref={ref}
      role="group"
      aria-label="Titular"
      onScroll={updateMore}
      data-more={[more.left && 'izquierda', more.right && 'derecha'].filter(Boolean).join(' ') || undefined}
      style={{ maskImage: mask, WebkitMaskImage: mask }}
      className="no-scrollbar relative inline-flex max-w-full min-w-0 gap-1 overflow-x-auto rounded-full bg-slate-200/70 p-1"
    >
      {orderTitulares(titulares).map((t) => {
        const active = t.id === activeId
        return (
          <button
            key={t.id}
            type="button"
            aria-pressed={active}
            onClick={() => pick(t)}
            title={t.nombre}
            className={cn(
              'flex h-9 min-w-0 shrink-0 items-center gap-1.5 rounded-full py-1 pr-3 pl-1 text-[13px] font-semibold transition-colors',
              active ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:bg-white/60',
            )}
          >
            <TitularAvatar titular={t} size="xs" className={cn(!active && 'opacity-60')} />
            <span className="max-w-[7.5rem] truncate">{shortTitularName(t)}</span>
          </button>
        )
      })}
    </div>
  )
}
