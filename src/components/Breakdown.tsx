import type { ReactNode } from 'react'
import type { EntityRef } from '../types'
import type { Counterpart, Lookup } from '../lib/movements'
import { entityName } from '../lib/movements'
import { PRODUCT_META } from '../lib/meta'
import { navigate, paths } from '../lib/router'
import { fmtPct } from '../lib/format'
import { Amount } from './ui/Amount'
import { EntityAvatar } from './ui/icons'

export interface BreakdownItem {
  key: string
  label: string
  sublabel?: string
  value: number
  color: string
  avatar?: ReactNode
  onClick?: () => void
}

/** Lista con barras proporcionales (de dónde viene / a dónde va). */
export function BreakdownList({ items, empty }: { items: BreakdownItem[]; empty: string }) {
  if (items.length === 0) return <p className="py-3 text-sm text-slate-500">{empty}</p>
  const total = items.reduce((s, i) => s + i.value, 0)
  const max = Math.max(...items.map((i) => i.value), 1)
  return (
    <ul className="space-y-1">
      {items.map((i) => (
        <li key={i.key}>
          <button
            type="button"
            onClick={i.onClick}
            disabled={!i.onClick}
            className="w-full rounded-xl px-2 py-2 text-left transition-colors enabled:hover:bg-slate-50"
          >
            <div className="flex items-center gap-2.5">
              {i.avatar}
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-sm font-medium text-slate-800">{i.label}</span>
                  <Amount value={i.value} className="text-sm font-semibold text-slate-900" />
                </div>
                <div className="flex items-baseline justify-between gap-2 text-xs text-slate-400">
                  <span className="truncate">{i.sublabel}</span>
                  <span className="tabular-nums">{fmtPct(total ? i.value / total : 0, { short: true })}</span>
                </div>
              </div>
            </div>
            <div className="mt-1.5 ml-[2.625rem] h-1.5 overflow-hidden rounded-full bg-slate-100">
              <div className="h-full rounded-full" style={{ width: `${Math.max(2, (i.value / max) * 100)}%`, backgroundColor: i.color }} />
            </div>
          </button>
        </li>
      ))}
    </ul>
  )
}

export function counterpartItems(list: Counterpart[], lookup: Lookup, verb: (ref: EntityRef) => string): BreakdownItem[] {
  return list.map((c) => {
    const cuenta = c.ref.kind === 'cuenta' ? lookup.cuentas.get(c.ref.id) : undefined
    const producto = c.ref.kind === 'producto' ? lookup.productos.get(c.ref.id) : undefined
    const color = cuenta?.color ?? (producto ? PRODUCT_META[producto.tipo].color : '#94A3B8')
    return {
      key: `${c.ref.kind}:${c.ref.id}`,
      label: entityName(lookup, c.ref),
      sublabel: `${verb(c.ref)} · ${c.count} movimiento${c.count === 1 ? '' : 's'}`,
      value: c.value,
      color,
      avatar: <EntityAvatar cuenta={cuenta} producto={producto} size="sm" />,
      onClick: cuenta ? () => navigate(paths.cuenta(cuenta.id)) : producto ? () => navigate(paths.producto(producto.id)) : undefined,
    }
  })
}
