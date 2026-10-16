import { CalendarClock } from 'lucide-react'
import type { Cuenta, Producto } from '../types'
import type { AccountStats, DepositInfo, Position } from '../lib/finance'
import { PRODUCT_META } from '../lib/meta'
import { fmtDate, fmtPct, maskIban } from '../lib/format'
import { navigate, paths } from '../lib/router'
import { Amount, GainBadge } from './ui/Amount'
import { AccountAvatar, ProductAvatar } from './ui/icons'

export function DepositProgress({ info, compact = false }: { info: DepositInfo; compact?: boolean }) {
  const pct = info.diasTotales ? Math.min(100, Math.max(0, (info.diasTranscurridos / info.diasTotales) * 100)) : null
  return (
    <div className={compact ? 'mt-3' : 'mt-4'}>
      <div className="flex items-center justify-between gap-2 text-xs text-slate-500">
        <span className="flex items-center gap-1">
          <CalendarClock className="size-3.5" /> {fmtPct(info.tae / 100)} TAE
        </span>
        {info.vencimiento ? (
          <span className={info.vencido ? 'font-semibold text-amber-700' : ''}>
            {info.vencido
              ? `Venció el ${fmtDate(info.vencimiento)}`
              : `Vence el ${fmtDate(info.vencimiento)} · ${info.diasRestantes} día${info.diasRestantes === 1 ? '' : 's'}`}
          </span>
        ) : (
          <span>Sin fecha de vencimiento</span>
        )}
      </div>
      {pct !== null && (
        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-amber-100" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
          <div className="h-full rounded-full bg-amber-500" style={{ width: `${pct}%` }} />
        </div>
      )}
    </div>
  )
}

export function StatusBadge({ pos }: { pos: Position }) {
  if (pos.estado === 'cerrado') return <span className="shrink-0 rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] font-semibold text-slate-500 uppercase">Cerrado</span>
  if (pos.estado === 'sin-movimientos')
    return <span className="shrink-0 rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] font-semibold text-slate-500 uppercase">Sin movimientos</span>
  if (pos.deposito?.vencido) return <span className="shrink-0 rounded-md bg-amber-100 px-1.5 py-0.5 text-[11px] font-semibold text-amber-800 uppercase">Vencido</span>
  return null
}

export function ProductCard({ p, pos }: { p: Producto; pos: Position }) {
  const meta = PRODUCT_META[p.tipo]
  const subtitle = [p.entidad, p.isin].filter(Boolean).join(' · ')
  const closed = pos.estado === 'cerrado'
  return (
    <button
      type="button"
      onClick={() => navigate(paths.producto(p.id))}
      className="group flex w-full flex-col rounded-2xl border border-slate-200/80 bg-white p-4 text-left shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md focus-visible:outline-2 focus-visible:outline-brand-500"
    >
      <div className="flex items-start gap-3">
        <ProductAvatar tipo={p.tipo} />
        <div className="min-w-0 flex-1">
          <div className="truncate font-semibold text-slate-900">{p.nombre}</div>
          <div className="truncate text-xs text-slate-500">{subtitle || meta.label}</div>
        </div>
        <StatusBadge pos={pos} />
      </div>
      <div className="mt-4 flex flex-wrap items-end justify-between gap-2">
        <div className="min-w-0">
          <div className="text-xs text-slate-500">{closed ? 'Resultado final' : 'Saldo'}</div>
          <Amount value={closed ? pos.ganancia : pos.saldo} sign={closed} tone={closed} className="text-xl font-bold text-slate-900" />
        </div>
        {!closed && <GainBadge size="sm" ganancia={pos.ganancia} rentabilidad={pos.rentabilidad} />}
      </div>
      {p.tipo === 'deposito' && pos.deposito && !closed && pos.estado !== 'sin-movimientos' && <DepositProgress info={pos.deposito} compact />}
      <div className="mt-3 flex items-center justify-between gap-2 border-t border-slate-100 pt-3 text-xs text-slate-500">
        <span>
          {closed ? 'Invertido ' : 'Capital '}
          <Amount value={closed ? pos.invertido : pos.capital} className="font-semibold text-slate-700" />
        </span>
        <span>
          {pos.numMovimientos} movimiento{pos.numMovimientos === 1 ? '' : 's'}
        </span>
      </div>
    </button>
  )
}

export function AccountCard({ c, s }: { c: Cuenta; s: AccountStats }) {
  const hasTransfers = s.transferenciasEnviadas > 0 || s.transferenciasRecibidas > 0
  const cell = (label: string, value: number, strong = false, warn = false) => (
    <div className="min-w-0">
      <dt className="truncate text-[11px] font-medium text-slate-500">{label}</dt>
      <dd>
        <Amount value={value} decimals={0} className={warn ? 'text-sm font-bold text-rose-600' : strong ? 'text-sm font-bold text-slate-900' : 'text-sm font-semibold text-slate-800'} />
      </dd>
    </div>
  )
  return (
    <button
      type="button"
      onClick={() => navigate(paths.cuenta(c.id))}
      className="flex w-full flex-col rounded-2xl border border-slate-200/80 bg-white p-4 text-left shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md focus-visible:outline-2 focus-visible:outline-brand-500"
    >
      <div className="flex items-center gap-3">
        <AccountAvatar color={c.color} />
        <div className="min-w-0 flex-1">
          <div className="truncate font-semibold text-slate-900">{c.nombre}</div>
          <div className="truncate text-xs text-slate-500">{[c.entidad, c.iban && maskIban(c.iban)].filter(Boolean).join(' · ') || 'Cuenta'}</div>
        </div>
        <span
          className={
            c.externa
              ? 'shrink-0 rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] font-semibold text-slate-500 uppercase'
              : 'shrink-0 rounded-md bg-indigo-50 px-1.5 py-0.5 text-[11px] font-semibold text-indigo-700 uppercase'
          }
        >
          {c.externa ? 'Externa' : 'Con saldo'}
        </span>
      </div>
      <dl className="mt-4 grid grid-cols-3 gap-2">
        {c.externa ? (
          <>
            {cell('Ha salido', s.salidas)}
            {cell('Ha vuelto', s.entradas)}
            {cell('Aportado (neto)', s.salidas - s.entradas, true)}
          </>
        ) : (
          <>
            {cell('Entradas', s.entradas)}
            {cell('Salidas', s.salidas)}
            {cell('Saldo', s.saldo, true, s.saldo < -0.005)}
          </>
        )}
      </dl>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-t border-slate-100 pt-3 text-xs text-slate-500">
        <span>
          {s.numMovimientos} movimiento{s.numMovimientos === 1 ? '' : 's'}
        </span>
        {hasTransfers && c.externa && (
          <span className="truncate">
            Transferencias: <Amount value={s.transferenciasRecibidas - s.transferenciasEnviadas} sign decimals={0} className="font-semibold text-slate-700" />
          </span>
        )}
        {s.enviadoOtros > 0 && (
          <span className="truncate text-fuchsia-700">
            A otros titulares: <Amount value={s.enviadoOtros} decimals={0} className="font-semibold" />
          </span>
        )}
        {s.dePaso > 0 && (
          <span className="truncate text-fuchsia-700">
            De paso a otros: <Amount value={s.dePaso} decimals={0} className="font-semibold" /> (no cuenta)
          </span>
        )}
        {s.recibidoOtros > 0 && (
          <span className="truncate text-fuchsia-700">
            De otros titulares: <Amount value={s.recibidoOtros} decimals={0} className="font-semibold" />
          </span>
        )}
      </div>
    </button>
  )
}
