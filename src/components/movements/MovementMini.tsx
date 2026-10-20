import { CalendarSync, Pencil, Trash2 } from 'lucide-react'
import type { Dataset, EntityRef, Movimiento } from '../../types'
import { entityName, movementKind, ownerOf, sameRef, type Lookup } from '../../lib/movements'
import { fmtDate, fmtEUR } from '../../lib/format'
import { comisionDe, importeDeCuenta, importeEnCuenta } from '../../lib/finance'
import { useHidden } from '../ui/Amount'
import { cn } from '../../lib/cn'
import { editMovement } from '../../store/ui'
import { borrarMovimiento } from '../../store/acciones'
import { Amount } from '../ui/Amount'
import { MovementAvatar } from '../ui/icons'
import { movementLabel } from './MovementRow'

/**
 * Movimiento en pequeño, para las ventanas (ventanilla de una inversión, ventana de MyInvestor),
 * visto desde una cuenta o un producto (`perspective`), con sus botones «Editar» y «Borrar».
 */
export function MovementMini({ m, perspective, lookup, ds }: { m: Movimiento; perspective: EntityRef; lookup: Lookup; ds: Dataset }) {
  const incoming = sameRef(m.destino, perspective)
  // En una cuenta se ve lo que entra de verdad: el importe con la comisión ya aplicada.
  const comision = comisionDe(m)
  const hidden = useHidden()
  const valor =
    perspective.kind === 'cuenta' ? (incoming ? importeEnCuenta(m) : importeDeCuenta(m)) : m.importe
  const other = incoming ? m.origen : m.destino
  const viewer = perspective.kind === 'cuenta' ? lookup.cuentas.get(perspective.id)?.titularId : lookup.productos.get(perspective.id)?.titularId
  const otherOwner = ownerOf(lookup, other)
  const label = movementLabel(m, lookup, perspective)
  return (
    <li className="py-2.5" data-mov={m.id}>
      <div className="flex items-start gap-3">
        <MovementAvatar tipo={movementKind(lookup, m, viewer)} size="sm" />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <span className="truncate text-sm font-semibold text-slate-800">{label}</span>
            <Amount value={incoming ? valor : -valor} sign className={cn('shrink-0 text-sm font-semibold', incoming ? 'text-emerald-600' : 'text-slate-900')} />
          </div>
          <div className="mt-0.5 flex min-w-0 items-center gap-1.5 text-xs text-slate-500">
            {m.programadaId && <CalendarSync className="size-3.5 shrink-0 text-fuchsia-600" aria-label="Transferencia mensual" />}
            <span className="truncate">
              {fmtDate(m.fecha)} · {incoming ? 'de' : 'a'} «{entityName(lookup, other)}»
              {otherOwner && otherOwner.id !== viewer ? ` (${otherOwner.nombre})` : ''}
              {m.concepto ? ` · ${m.concepto}` : ''}
            </span>
            {comision !== 0 && (
              <span
                className={cn(
                  'shrink-0 rounded px-1.5 py-px text-[10px] font-semibold whitespace-nowrap',
                  comision < 0 ? 'bg-rose-50 text-rose-600' : 'bg-emerald-50 text-emerald-600',
                )}
                data-comision
              >
                Comisión {comision < 0 ? '−' : '+'}
                {hidden ? '•••••• €' : fmtEUR(Math.abs(comision))}
              </span>
            )}
          </div>
          <div className="mt-1.5 flex gap-2">
            <button
              type="button"
              onClick={() => editMovement(m.id)}
              aria-label={`Editar: ${label}, ${fmtDate(m.fecha)}`}
              className="inline-flex h-8 items-center gap-1 rounded-lg bg-slate-100 px-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-200"
            >
              <Pencil className="size-3.5" strokeWidth={2.4} /> Editar
            </button>
            <button
              type="button"
              onClick={() => void borrarMovimiento(ds, m)}
              aria-label={`Borrar: ${label}, ${fmtDate(m.fecha)}`}
              className="inline-flex h-8 items-center gap-1 rounded-lg bg-rose-50 px-2.5 text-xs font-semibold text-rose-700 hover:bg-rose-100"
            >
              <Trash2 className="size-3.5" strokeWidth={2.4} /> Borrar
            </button>
          </div>
        </div>
      </div>
    </li>
  )
}
