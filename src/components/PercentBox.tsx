import { Pencil, Percent } from 'lucide-react'
import type { Producto } from '../types'
import type { Position } from '../lib/finance'
import { openInteres, openValuation } from '../store/ui'
import { fmtDate, fmtPct } from '../lib/format'
import { cn } from '../lib/cn'
import { Button } from './ui/Button'
import { Amount, toneClass } from './ui/Amount'

/**
 * El % que genera la inversión, con el botón para cambiarlo: en fondos, carteras… su
 * rentabilidad (positiva o negativa); en depósitos, su interés (TAE), que puede variar.
 */
export function PercentBox({ p, pos, className }: { p: Producto; pos: Position; className?: string }) {
  const isDeposit = p.tipo === 'deposito'
  if (isDeposit) {
    const d = pos.deposito
    const tramos = d?.tramos ?? [{ desde: null, tae: p.tae ?? 0 }]
    const anterior = d?.taeDesde ? tramos[tramos.findIndex((t) => t.desde === d.taeDesde) - 1] : undefined
    return (
      <div className={cn('rounded-2xl border border-amber-200 bg-amber-50/70 p-3.5', className)} data-percent-box>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-xs font-medium text-amber-900/80">Interés (TAE)</div>
            <div className="text-xl font-bold tracking-tight text-amber-900 tabular-nums">{fmtPct((d?.tae ?? p.tae ?? 0) / 100)}</div>
          </div>
          <Button size="sm" variant="secondary" icon={Pencil} onClick={() => openInteres(p.id)} className="shrink-0">
            Cambiar interés
          </Button>
        </div>
        <p className="mt-1 text-xs text-amber-900/80">
          {d?.taeDesde ? `Desde el ${fmtDate(d.taeDesde)}${anterior ? ` (antes, ${fmtPct(anterior.tae / 100)})` : ''}. ` : ''}
          {d && d.interesesHoy !== 0 ? (
            <>
              Intereses hasta hoy: <Amount value={d.interesesHoy} sign className="font-semibold" />
            </>
          ) : (
            'El interés puede variar: cámbialo desde la fecha en que cambie.'
          )}
        </p>
      </div>
    )
  }
  const v = pos.valoracion
  const pct = pos.rentabilidad
  return (
    <div className={cn('rounded-2xl border border-teal-200 bg-teal-50/60 p-3.5', className)} data-percent-box>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs font-medium text-teal-900/80">Rentabilidad (beneficio o pérdida)</div>
          <div className="flex flex-wrap items-baseline gap-x-2">
            <span className={cn('text-xl font-bold tracking-tight tabular-nums', pct === null ? 'text-slate-500' : toneClass(pct))}>
              {pct === null ? '0 %' : fmtPct(pct, { sign: true })}
            </span>
            {pct !== null && <Amount value={pos.ganancia} sign tone className="text-sm font-semibold" />}
          </div>
        </div>
        <Button size="sm" variant="secondary" icon={Percent} onClick={() => openValuation(p.id)} className="shrink-0">
          Cambiar %
        </Button>
      </div>
      <p className="mt-1 text-xs text-teal-900/80">
        {v
          ? v.modo === 'porcentaje'
            ? `Indicada el ${fmtDate(v.fecha)}: saldo = capital × (1 ${v.porcentaje < 0 ? '−' : '+'} ${fmtPct(Math.abs(v.porcentaje) / 100)}).`
            : `Valor indicado el ${fmtDate(v.fecha)}.`
          : 'Aún no has puesto cuánto gana o pierde. Si sube un 3 %, pulsa «Cambiar %» y pon 3.'}
      </p>
    </div>
  )
}

