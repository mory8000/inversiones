import { useEffect, type ReactNode } from 'react'
import { ArrowDownLeft, ArrowUpRight, CalendarSync, ChevronRight, Pencil, Repeat } from 'lucide-react'
import { useFinance } from '../store/useFinance'
import { openProduct, useUI } from '../store/ui'
import { aportarA, programarAportacionMensual, retirarDe, traspasarDe } from '../store/acciones'
import { involvesProduct } from '../lib/finance'
import { sortMovementsDesc } from '../lib/movements'
import { MOVEMENT_META, PRODUCT_META } from '../lib/meta'
import { navigate, paths } from '../lib/router'
import { Sheet } from './ui/Sheet'
import { Button } from './ui/Button'
import { Amount, GainBadge } from './ui/Amount'
import { PercentBox } from './PercentBox'
import { ActionTile } from './ui/ActionTile'
import { ProductAvatar } from './ui/icons'
import { DepositProgress, StatusBadge } from './ProductCard'
import { MovementMini } from './movements/MovementMini'

function Stat({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="truncate text-[11px] font-medium text-slate-500">{label}</dt>
      <dd className="truncate text-sm font-semibold text-slate-800">{children}</dd>
    </div>
  )
}

/**
 * Ventanilla de una inversión: se abre al tocarla en Inicio. Enseña cómo va y deja hacer
 * cualquier movimiento (aportar, retirar, traspasar, actualizar su valor…). Las transferencias
 * mensuales que recibe se cambian en la ventana de MyInvestor, no aquí.
 */
export function InvestmentSheet({ modalId, productId }: { modalId: string; productId: string }) {
  const close = useUI((s) => s.close)
  const fin = useFinance()
  const { ds, ws, positions, lookup } = fin
  const p = ds.productos.find((x) => x.id === productId)

  // Si se elimina el producto (desde «Editar»), se cierra la ventanilla.
  useEffect(() => {
    if (!p) close(modalId)
  }, [p, close, modalId])
  if (!p) return null

  const pos = positions.get(p.id)!
  const meta = PRODUCT_META[p.tipo]
  const titular = lookup.titulares.get(p.titularId)
  const multi = ds.titulares.length > 1
  const closed = pos.estado === 'cerrado'
  const isDeposit = p.tipo === 'deposito'
  const ref = { kind: 'producto' as const, id: p.id }
  const recent = sortMovementsDesc(ws.movimientos.filter((m) => involvesProduct(m, p.id))).slice(0, 4)
  const done = () => close(modalId)

  return (
    <Sheet
      title={p.nombre}
      subtitle={[meta.label, multi && titular ? `de ${titular.nombre}` : null, p.entidad || null].filter(Boolean).join(' · ')}
      onClose={done}
      footer={
        <div className="flex items-center gap-2">
          <Button variant="ghost" icon={Pencil} onClick={() => openProduct({ productId: p.id })}>
            Editar
          </Button>
          <div className="flex-1" />
          <Button variant="secondary" onClick={done}>
            Cerrar
          </Button>
        </div>
      }
    >
      <div className="space-y-5">
        {/* Cómo va */}
        <div className="rounded-2xl p-4" style={{ backgroundColor: `${meta.soft}99` }}>
          <div className="flex items-center gap-3">
            <ProductAvatar tipo={p.tipo} />
            <div className="min-w-0 flex-1">
              <div className="text-xs font-medium text-slate-600">{closed ? 'Resultado final' : isDeposit ? 'Saldo hoy (con intereses)' : 'Saldo actual'}</div>
              <Amount value={closed ? pos.ganancia : pos.saldo} sign={closed} tone={closed} className="text-2xl font-bold tracking-tight text-slate-900" />
            </div>
            <StatusBadge pos={pos} />
          </div>
          {!closed && pos.estado !== 'sin-movimientos' && <GainBadge className="mt-3" ganancia={pos.ganancia} rentabilidad={pos.rentabilidad} />}
          {isDeposit && pos.deposito && !closed && pos.estado !== 'sin-movimientos' && <DepositProgress info={pos.deposito} compact />}
          <dl className="mt-4 grid grid-cols-3 gap-2 rounded-xl bg-white/70 p-3">
            <Stat label="Invertido">
              <Amount value={pos.invertido} />
            </Stat>
            <Stat label="Reembolsado">
              <Amount value={pos.reembolsado + pos.traspasoSalida} />
            </Stat>
            <Stat label="Capital">
              <Amount value={pos.capital} />
            </Stat>
          </dl>
        </div>

        {/* El % que genera (rentabilidad o interés), para cambiarlo */}
        {!closed && <PercentBox p={p} pos={pos} />}

        {/* Movimientos que se pueden hacer */}
        <section>
          <h3 className="mb-2 text-sm font-semibold text-slate-900">¿Qué quieres hacer?</h3>
          <div className="grid grid-cols-2 gap-2">
            <ActionTile
              icon={ArrowUpRight}
              label="Aportar"
              text="Meter más dinero"
              color={MOVEMENT_META.inversion.color}
              soft={MOVEMENT_META.inversion.soft}
              onClick={() => aportarA(ds, p)}
            />
            <ActionTile
              icon={ArrowDownLeft}
              label="Retirar"
              text="Reembolso a una cuenta"
              color={MOVEMENT_META.reembolso.color}
              soft={MOVEMENT_META.reembolso.soft}
              onClick={() => retirarDe(ds, p)}
            />
            <ActionTile
              icon={Repeat}
              label="Traspasar"
              text="A otra inversión"
              color={MOVEMENT_META.traspaso.color}
              soft={MOVEMENT_META.traspaso.soft}
              onClick={() => traspasarDe(p)}
            />
            <ActionTile
              icon={CalendarSync}
              label="Programar transferencia mensual"
              text="Que se apunte sola cada mes"
              color="#C026D3"
              soft="#FAE8FF"
              onClick={() => programarAportacionMensual(ds, p)}
            />
          </div>
        </section>

        {/* Últimos movimientos */}
        <section>
          <div className="mb-1 flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-slate-900">Últimos movimientos</h3>
            <span className="text-xs text-slate-500">
              {pos.numMovimientos} en total
            </span>
          </div>
          {recent.length === 0 ? (
            <p className="rounded-xl bg-slate-50 p-3 text-sm text-slate-500">Todavía no tiene movimientos. Pulsa «Aportar» para apuntar el primero.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {recent.map((m) => (
                <MovementMini key={m.id} m={m} perspective={ref} lookup={lookup} ds={ds} />
              ))}
            </ul>
          )}
          <Button
            variant="soft"
            className="mt-3 w-full"
            iconRight={ChevronRight}
            onClick={() => {
              done()
              navigate(paths.producto(p.id))
            }}
          >
            Ver todos sus datos y movimientos
          </Button>
        </section>
      </div>
    </Sheet>
  )
}
