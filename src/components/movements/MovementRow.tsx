import { ArrowRight, ChevronRight } from 'lucide-react'
import type { EntityRef, Movimiento } from '../../types'
import { entityName, sameRef, type Lookup } from '../../lib/movements'
import { MOVEMENT_META, PRODUCT_META } from '../../lib/meta'
import { fmtDate } from '../../lib/format'
import { cn } from '../../lib/cn'
import { Amount } from '../ui/Amount'
import { EntityAvatar, MovementAvatar } from '../ui/icons'
import { editMovement } from '../../store/ui'

export function movementLabel(m: Movimiento, perspective?: EntityRef): string {
  if (!perspective) return MOVEMENT_META[m.tipo].label
  const incoming = sameRef(m.destino, perspective)
  switch (m.tipo) {
    case 'inversion':
      return perspective.kind === 'producto' ? 'Aportación' : 'Inversión'
    case 'reembolso':
      return perspective.kind === 'producto' ? 'Reembolso' : 'Reembolso recibido'
    case 'traspaso':
      return incoming ? 'Traspaso recibido' : 'Traspaso enviado'
    case 'transferencia':
      return incoming ? 'Transferencia recibida' : 'Transferencia enviada'
  }
}

export function EntityChip({ lookup, refe, className }: { lookup: Lookup; refe: EntityRef; className?: string }) {
  const cuenta = refe.kind === 'cuenta' ? lookup.cuentas.get(refe.id) : undefined
  const producto = refe.kind === 'producto' ? lookup.productos.get(refe.id) : undefined
  const sub = producto ? PRODUCT_META[producto.tipo].label : 'Cuenta'
  return (
    <span className={cn('inline-flex min-w-0 items-center gap-2', className)}>
      <EntityAvatar cuenta={cuenta} producto={producto} size="xs" />
      <span className="min-w-0">
        <span className="block truncate text-sm font-medium text-slate-800">{entityName(lookup, refe)}</span>
        <span className="block truncate text-[11px] text-slate-400">{sub}</span>
      </span>
    </span>
  )
}

export function MovementRow({ m, lookup, perspective }: { m: Movimiento; lookup: Lookup; perspective?: EntityRef }) {
  const meta = MOVEMENT_META[m.tipo]
  const label = movementLabel(m, perspective)
  let sign = 0
  if (perspective) sign = sameRef(m.destino, perspective) ? 1 : sameRef(m.origen, perspective) ? -1 : 0
  const amountValue = sign === 0 ? m.importe : sign * m.importe
  const amountClass = sign > 0 ? 'text-emerald-600' : 'text-slate-900'
  const origenName = entityName(lookup, m.origen)
  const destinoName = entityName(lookup, m.destino)

  return (
    <button
      type="button"
      onClick={() => editMovement(m.id)}
      className="group block w-full text-left transition-colors hover:bg-slate-50 focus-visible:bg-slate-50 focus-visible:outline-none"
      aria-label={`${label}: de ${origenName} a ${destinoName}, ${m.importe} euros, ${fmtDate(m.fecha)}`}
    >
      {/* Móvil */}
      <div className="flex items-start gap-3 px-4 py-3.5 md:hidden">
        <MovementAvatar tipo={m.tipo} />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-3">
            <span className="truncate text-[15px] font-semibold text-slate-900">{label}</span>
            <Amount value={amountValue} sign={sign !== 0} className={cn('text-[15px] font-semibold', amountClass)} />
          </div>
          <dl className="mt-1.5 grid grid-cols-[1.75rem_minmax(0,1fr)] gap-x-1 gap-y-1 text-sm">
            <dt className="pt-px text-[11px] font-semibold tracking-wide text-slate-400 uppercase">De</dt>
            <dd className="truncate font-medium text-slate-700">{origenName}</dd>
            <dt className="pt-px text-[11px] font-semibold tracking-wide text-slate-400 uppercase">A</dt>
            <dd className="truncate font-medium text-slate-700">{destinoName}</dd>
          </dl>
          <div className="mt-1.5 truncate text-xs text-slate-500">
            {fmtDate(m.fecha)}
            {m.concepto && <> · {m.concepto}</>}
          </div>
        </div>
      </div>

      {/* Escritorio */}
      <div className="hidden grid-cols-[6.25rem_9rem_minmax(0,1.3fr)_1rem_minmax(0,1.3fr)_minmax(0,0.8fr)_7.5rem_1rem] items-center gap-3 px-5 py-3 md:grid">
        <span className="text-sm text-slate-500 tabular-nums">{fmtDate(m.fecha)}</span>
        <span className="flex min-w-0 items-center gap-2">
          <MovementAvatar tipo={m.tipo} size="sm" />
          <span className="truncate text-sm font-semibold" style={{ color: meta.text }}>
            {label}
          </span>
        </span>
        <EntityChip lookup={lookup} refe={m.origen} />
        <ArrowRight className="size-4 text-slate-300" aria-hidden />
        <EntityChip lookup={lookup} refe={m.destino} />
        <span className="truncate text-sm text-slate-500">{m.concepto || '—'}</span>
        <Amount value={amountValue} sign={sign !== 0} className={cn('text-right text-[15px] font-semibold', amountClass)} />
        <ChevronRight className="size-4 text-slate-300 transition-colors group-hover:text-slate-500" aria-hidden />
      </div>
    </button>
  )
}

export function MovementTableHeader() {
  return (
    <div className="hidden grid-cols-[6.25rem_9rem_minmax(0,1.3fr)_1rem_minmax(0,1.3fr)_minmax(0,0.8fr)_7.5rem_1rem] gap-3 border-b border-slate-100 px-5 py-2.5 text-[11px] font-semibold tracking-wide text-slate-400 uppercase md:grid">
      <span>Fecha</span>
      <span>Tipo</span>
      <span>De (origen)</span>
      <span />
      <span>A (destino)</span>
      <span>Concepto</span>
      <span className="text-right">Importe</span>
      <span />
    </div>
  )
}
