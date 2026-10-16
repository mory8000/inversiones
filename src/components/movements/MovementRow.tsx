import { ArrowRight, CalendarSync, ChevronRight } from 'lucide-react'
import type { EntityRef, Movimiento } from '../../types'
import { entityName, isConSaldo, isCross, isDePaso, isExterna, movementKind, ownerId, ownerOf, sameRef, type Lookup } from '../../lib/movements'
import { MOVEMENT_META, PRODUCT_META, kindMeta } from '../../lib/meta'
import { fmtDate } from '../../lib/format'
import { cn } from '../../lib/cn'
import { Amount } from '../ui/Amount'
import { EntityAvatar, MovementAvatar } from '../ui/icons'
import { TitularTag } from '../Titulares'
import { editMovement } from '../../store/ui'

/**
 * Nombre del movimiento visto desde una cuenta o producto (`perspective`), desde un titular
 * (`titularId`) o en general. Un movimiento de un titular a otro se nombra como tal; el que pasa
 * «de paso» por la cuenta del principal (MyInvestor) es de quien lo recibe: «Aportación a …» (en
 * lo del principal no se ve; si se viera desde su cuenta, «De paso a …»).
 */
export function movementLabel(m: Movimiento, lookup: Lookup, perspective?: EntityRef, titularId?: string): string {
  if (isCross(lookup, m)) {
    const from = ownerOf(lookup, m.origen)!
    const to = ownerOf(lookup, m.destino)!
    const incoming = perspective ? sameRef(m.destino, perspective) : titularId === to.id
    const outgoing = perspective ? sameRef(m.origen, perspective) : titularId === from.id
    if (incoming) return m.destino.kind === 'producto' ? `Aportación de ${from.nombre}` : `Recibido de ${from.nombre}`
    if (outgoing) return isDePaso(lookup, m) ? `De paso a ${to.nombre}` : `Enviado a ${to.nombre}`
    return isDePaso(lookup, m) ? `Aportación a ${to.nombre}` : `De ${from.nombre} a ${to.nombre}`
  }
  // De una cuenta externa a una cuenta con saldo (MyInvestor): una aportación; al revés, una retirada.
  if (m.tipo === 'transferencia') {
    if (isExterna(lookup, m.origen) && isConSaldo(lookup, m.destino)) return 'Aportación'
    if (isConSaldo(lookup, m.origen) && isExterna(lookup, m.destino)) return 'Retirada'
  }
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
  const multi = lookup.titulares.size > 1
  return (
    <span className={cn('inline-flex min-w-0 items-center gap-2', className)}>
      <EntityAvatar cuenta={cuenta} producto={producto} size="xs" />
      <span className="min-w-0">
        <span className="block truncate text-sm font-medium text-slate-800">{entityName(lookup, refe)}</span>
        <span className="flex min-w-0 items-center gap-1 text-[11px] text-slate-400">
          <span className="shrink-0">{sub}</span>
          {multi && (
            <>
              <span aria-hidden>·</span>
              <TitularTag titular={ownerOf(lookup, refe)} />
            </>
          )}
        </span>
      </span>
    </span>
  )
}

/** «Mensual»: lo apuntó sola una transferencia mensual. */
function MonthlyMark() {
  return (
    <span className="inline-flex shrink-0 items-center gap-0.5 rounded bg-fuchsia-50 px-1 py-px text-[10px] font-semibold text-fuchsia-700" title="Transferencia mensual">
      <CalendarSync className="size-3" /> Mensual
    </span>
  )
}

export function MovementRow({ m, lookup, perspective, titularId }: { m: Movimiento; lookup: Lookup; perspective?: EntityRef; titularId?: string }) {
  const viewer = titularId ?? (perspective ? ownerId(lookup, perspective) : undefined)
  const kind = movementKind(lookup, m, viewer)
  const meta = kindMeta(kind)
  const label = movementLabel(m, lookup, perspective, titularId)
  let sign = 0
  if (perspective) sign = sameRef(m.destino, perspective) ? 1 : sameRef(m.origen, perspective) ? -1 : 0
  // Lo que pasa «de paso» por la cuenta no baja su saldo: sin signo menos.
  if (sign < 0 && isDePaso(lookup, m)) sign = 0
  const amountValue = sign === 0 ? m.importe : sign * m.importe
  const amountClass = sign > 0 ? 'text-emerald-600' : 'text-slate-900'
  const origenName = entityName(lookup, m.origen)
  const destinoName = entityName(lookup, m.destino)
  const multi = lookup.titulares.size > 1
  const from = multi ? ownerOf(lookup, m.origen) : undefined
  const to = multi ? ownerOf(lookup, m.destino) : undefined

  return (
    <button
      type="button"
      onClick={() => editMovement(m.id)}
      className="group block w-full text-left transition-colors hover:bg-slate-50 focus-visible:bg-slate-50 focus-visible:outline-none"
      aria-label={`${label}: de ${origenName}${from ? ` (${from.nombre})` : ''} a ${destinoName}${to ? ` (${to.nombre})` : ''}, ${m.importe} euros, ${fmtDate(m.fecha)}`}
    >
      {/* Móvil */}
      <div className="flex items-start gap-3 px-4 py-3.5 md:hidden">
        <MovementAvatar tipo={kind} />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-3">
            <span className="truncate text-[15px] font-semibold text-slate-900">{label}</span>
            <Amount value={amountValue} sign={sign !== 0} className={cn('text-[15px] font-semibold', amountClass)} />
          </div>
          <dl className="mt-1.5 grid grid-cols-[1.75rem_minmax(0,1fr)] gap-x-1 gap-y-1 text-sm">
            <dt className="pt-px text-[11px] font-semibold tracking-wide text-slate-400 uppercase">De</dt>
            <dd className="flex min-w-0 items-baseline gap-1.5">
              <span className="truncate font-medium text-slate-700">{origenName}</span>
              {from && <TitularTag titular={from} className="max-w-[45%] shrink-0 text-xs" />}
            </dd>
            <dt className="pt-px text-[11px] font-semibold tracking-wide text-slate-400 uppercase">A</dt>
            <dd className="flex min-w-0 items-baseline gap-1.5">
              <span className="truncate font-medium text-slate-700">{destinoName}</span>
              {to && <TitularTag titular={to} className="max-w-[45%] shrink-0 text-xs" />}
            </dd>
          </dl>
          <div className="mt-1.5 flex min-w-0 items-center gap-1.5 text-xs text-slate-500">
            {m.programadaId && <MonthlyMark />}
            <span className="truncate">
              {fmtDate(m.fecha)}
              {m.concepto && <> · {m.concepto}</>}
            </span>
          </div>
        </div>
      </div>

      {/* Escritorio */}
      <div className="hidden grid-cols-[6.25rem_9rem_minmax(0,1.3fr)_1rem_minmax(0,1.3fr)_minmax(0,0.8fr)_7.5rem_1rem] items-center gap-3 px-5 py-3 md:grid">
        <span className="text-sm text-slate-500 tabular-nums">{fmtDate(m.fecha)}</span>
        <span className="flex min-w-0 items-center gap-2">
          <MovementAvatar tipo={kind} size="sm" />
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold" style={{ color: meta.text }} title={label}>
              {label}
            </span>
            {m.programadaId && <MonthlyMark />}
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
