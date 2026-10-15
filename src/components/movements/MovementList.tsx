import type { EntityRef, Movimiento } from '../../types'
import { groupByMonth, sortMovementsDesc, type Lookup } from '../../lib/movements'
import { fmtMonthKey } from '../../lib/format'
import { Amount } from '../ui/Amount'
import { MovementRow, MovementTableHeader } from './MovementRow'

/** Lista de movimientos agrupada por meses. */
export function MovementList({
  movements,
  lookup,
  perspective,
  grouped = true,
  limit,
}: {
  movements: Movimiento[]
  lookup: Lookup
  perspective?: EntityRef
  grouped?: boolean
  limit?: number
}) {
  if (!grouped) {
    const items = sortMovementsDesc(movements).slice(0, limit ?? movements.length)
    return (
      <div>
        <MovementTableHeader />
        <ul className="divide-y divide-slate-100">
          {items.map((m) => (
            <li key={m.id}>
              <MovementRow m={m} lookup={lookup} perspective={perspective} />
            </li>
          ))}
        </ul>
      </div>
    )
  }

  const groups = groupByMonth(movements)
  return (
    <div>
      <MovementTableHeader />
      {groups.map((g) => {
        const invested = g.totals.inversion
        const refunded = g.totals.reembolso
        return (
          <section key={g.key} aria-label={fmtMonthKey(g.key)}>
            <div className="sticky top-[calc(3.5rem+env(safe-area-inset-top))] z-[1] flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-y border-slate-100 bg-slate-50/95 px-4 py-2 backdrop-blur md:px-5 lg:top-0">
              <h3 className="text-[13px] font-semibold text-slate-700">{fmtMonthKey(g.key)}</h3>
              <div className="flex gap-3 text-xs text-slate-500">
                {invested > 0 && (
                  <span>
                    Invertido <Amount value={invested} className="font-semibold text-slate-700" />
                  </span>
                )}
                {refunded > 0 && (
                  <span>
                    Reembolsado <Amount value={refunded} className="font-semibold text-slate-700" />
                  </span>
                )}
                {invested === 0 && refunded === 0 && (
                  <span>
                    {g.items.length} movimiento{g.items.length === 1 ? '' : 's'}
                  </span>
                )}
              </div>
            </div>
            <ul className="divide-y divide-slate-100">
              {g.items.map((m) => (
                <li key={m.id}>
                  <MovementRow m={m} lookup={lookup} perspective={perspective} />
                </li>
              ))}
            </ul>
          </section>
        )
      })}
    </div>
  )
}
