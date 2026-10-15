import { CircleSlash, SlidersHorizontal } from 'lucide-react'
import type { FinanceData } from '../store/useFinance'
import { openTotal } from '../store/ui'
import { EPS } from '../lib/finance'
import { PRODUCT_META } from '../lib/meta'
import { cn } from '../lib/cn'
import { Button } from './ui/Button'
import { Amount, GainBadge } from './ui/Amount'

/** «A», «A y B», «A, B y C». */
export function listaNombres(nombres: string[]): string {
  const q = nombres.map((n) => `«${n}»`)
  return q.length <= 1 ? (q[0] ?? '') : `${q.slice(0, -1).join(', ')} y ${q[q.length - 1]}`
}

function Linea({ color, label, value, negativeWarn = false }: { color: string; label: string; value: number; negativeWarn?: boolean }) {
  const neg = negativeWarn && value < -EPS
  return (
    <li className="flex items-center gap-2.5 py-1 text-sm">
      <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: color }} aria-hidden />
      <span className="min-w-0 flex-1 truncate font-medium text-slate-700">{label}</span>
      <Amount value={value} className={cn('font-semibold', neg ? 'text-rose-600' : 'text-slate-900')} />
    </li>
  )
}

/**
 * TOTAL de Inicio: todo el dinero (inversiones de todos los titulares y saldo real de sus
 * cuentas con saldo, como MyInvestor), menos lo que se deja fuera (p. ej. «Fondo ahorro»).
 */
export function TotalCard({ fin }: { fin: FinanceData }) {
  const { granTotal: g, lookup, ds } = fin
  const multi = ds.titulares.length > 1
  const fuera = g.fuera.map((f) => f.nombre)
  return (
    <section aria-labelledby="total-titulo" className="relative overflow-hidden rounded-3xl border border-slate-200/80 bg-white p-5 shadow-sm sm:p-6" data-total>
      <div className="absolute inset-y-0 left-0 w-1.5 bg-emerald-400" aria-hidden />
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id="total-titulo" className="text-[13px] font-bold tracking-[0.16em] text-brand-700 uppercase">
            Total
          </h2>
          <p className="text-[13px] text-slate-500">{fuera.length ? `Todo, menos ${listaNombres(fuera)}` : multi ? 'Todo, de todos los titulares' : 'Todo tu dinero'}</p>
        </div>
        <Button variant="secondary" size="sm" icon={SlidersHorizontal} onClick={openTotal} className="shrink-0" aria-label="Qué suma en el TOTAL">
          Qué suma
        </Button>
      </div>
      <div className="mt-1 text-[36px] leading-tight font-bold tracking-tight text-slate-900 sm:text-[42px]" data-total-valor>
        <Amount value={g.total} />
      </div>
      {Math.abs(g.capital) > EPS && (
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <GainBadge ganancia={g.ganancia} rentabilidad={g.rentabilidad} />
          <span className="text-sm text-slate-500">{g.ganancia < -EPS ? 'pérdida' : 'beneficio'} de las inversiones</span>
        </div>
      )}
      {(g.porTipo.length > 0 || g.porCuenta.length > 0) && (
        <ul className="mt-4 grid grid-cols-1 gap-x-8 border-t border-slate-100 pt-3 sm:grid-cols-2 xl:grid-cols-3">
          {g.porTipo.map((r) => (
            <Linea key={r.tipo} color={PRODUCT_META[r.tipo].color} label={PRODUCT_META[r.tipo].plural} value={r.saldo} />
          ))}
          {g.porCuenta.map((x) => {
            const c = lookup.cuentas.get(x.cuentaId)
            const t = c && lookup.titulares.get(c.titularId)
            return (
              <Linea
                key={x.cuentaId}
                color={c?.color ?? '#6366F1'}
                label={`Cuenta ${c?.nombre ?? ''}${multi && t ? ` (${t.nombre})` : ''}${x.saldo < -EPS ? ' · en negativo' : ''}`}
                value={x.saldo}
                negativeWarn
              />
            )
          })}
        </ul>
      )}
      {g.fuera.length > 0 && (
        <p className="mt-3 flex items-start gap-1.5 rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-500">
          <CircleSlash className="mt-px size-3.5 shrink-0" />
          <span>
            No suma:{' '}
            {g.fuera.map((f, i) => (
              <span key={`${f.nivel}-${f.id}`}>
                {i > 0 ? ', ' : ''}«{f.nombre}» (<Amount value={f.valor} />)
              </span>
            ))}
            .{' '}
            <button type="button" onClick={openTotal} className="font-semibold text-brand-700 underline underline-offset-2">
              Cambiar
            </button>
          </span>
        </p>
      )}
    </section>
  )
}

