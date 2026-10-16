import { CalendarSync, Pencil } from 'lucide-react'
import type { Programada } from '../types'
import type { FinanceData } from '../store/useFinance'
import { openProgramada } from '../store/ui'
import { countsForOwner, entityName, isDePaso } from '../lib/movements'
import { diaDe, movimientosDe, proximaFecha } from '../lib/programadas'
import { fmtDate, fmtEUR } from '../lib/format'
import { Amount, useHidden } from './ui/Amount'

/**
 * Una transferencia mensual, en una ventana: cuánto, cuándo, de dónde a dónde y cuántas van.
 * Con su botón «Editar» a la vista: al tocarla se cambia (o se elimina).
 */
export function ProgramadaItem({ p, fin }: { p: Programada; fin: FinanceData }) {
  const { ds, lookup, today, owner } = fin
  const hidden = useHidden()
  const from = lookup.titulares.get(owner(p.origen) ?? '')
  const to = lookup.titulares.get(owner(p.destino) ?? '')
  const cross = !!from && !!to && from.id !== to.id
  /** Sale de la cuenta del principal (MyInvestor) hacia otro titular: dinero «de paso», no baja su saldo. */
  const dePaso = isDePaso(lookup, p)
  const hechas = movimientosDe(ds, p.id)
  const total = hechas.reduce((sum, m) => sum + m.importe, 0)
  const next = proximaFecha(p, today)
  return (
    <li>
      <button
        type="button"
        onClick={() => openProgramada({ programadaId: p.id })}
        aria-label={`Editar la transferencia mensual: ${hidden ? '•••••• €' : fmtEUR(p.importe)} al mes a «${entityName(lookup, p.destino)}»`}
        className="group flex w-full items-start gap-3 rounded-2xl border border-fuchsia-200 bg-fuchsia-50/60 p-3 text-left transition-colors hover:bg-fuchsia-50"
        data-programada={p.id}
      >
        <span className="mt-0.5 inline-flex size-8 shrink-0 items-center justify-center rounded-lg bg-white text-fuchsia-600">
          <CalendarSync className="size-4" strokeWidth={2.4} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-slate-900">
            <Amount value={p.importe} /> al mes{cross && to ? ` a ${to.nombre}` : ''} · el día {diaDe(p)}
          </span>
          <span className="block truncate text-xs text-slate-600">
            «{entityName(lookup, p.origen)}» → «{entityName(lookup, p.destino)}»
          </span>
          <span className="block text-xs text-slate-500">
            {hechas.length} apuntada{hechas.length === 1 ? '' : 's'} (<Amount value={total} />) · {next ? `próxima: ${fmtDate(next)}` : 'terminada'}
          </span>
          {cross && to && from && (
            <span className="block text-xs font-medium text-fuchsia-800">
              {countsForOwner(lookup, p.destino) ? `Cuenta solo para ${to.nombre}, no para ${from.nombre}` : `Va a una cuenta externa de ${to.nombre}`}
              {dePaso ? `. Pasa por «${entityName(lookup, p.origen)}» de paso: no baja su saldo` : ''}
            </span>
          )}
        </span>
        <span className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-fuchsia-600 px-2.5 py-1.5 text-xs font-bold text-white shadow-sm group-hover:bg-fuchsia-700">
          <Pencil className="size-3.5" strokeWidth={2.5} />
          Editar
        </span>
      </button>
    </li>
  )
}
