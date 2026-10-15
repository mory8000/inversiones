import { useEffect, type ReactNode } from 'react'
import { ArrowDownLeft, ArrowUpRight, CalendarSync, ChevronRight, Pencil, RefreshCw, Repeat, type LucideIcon } from 'lucide-react'
import type { Movimiento, Producto } from '../types'
import { useFinance } from '../store/useFinance'
import { editMovement, openProduct, openValuation, useUI } from '../store/ui'
import { aportarA, retirarDe, traspasarDe } from '../store/acciones'
import { involvesProduct } from '../lib/finance'
import { entityName, movementKind, ownerOf, sameRef, sortMovementsDesc, type Lookup } from '../lib/movements'
import { MOVEMENT_META, PRODUCT_META } from '../lib/meta'
import { diaDe } from '../lib/programadas'
import { fmtDate } from '../lib/format'
import { navigate, paths } from '../lib/router'
import { cn } from '../lib/cn'
import { Sheet } from './ui/Sheet'
import { Button } from './ui/Button'
import { Amount, GainBadge } from './ui/Amount'
import { MovementAvatar, ProductAvatar } from './ui/icons'
import { DepositProgress, StatusBadge } from './ProductCard'
import { movementLabel } from './movements/MovementRow'

/** Botón grande de una acción («Aportar», «Retirar»…). */
function Action({ icon: Icon, label, text, color, soft, onClick, disabled }: { icon: LucideIcon; label: string; text: string; color: string; soft: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex min-h-[4.5rem] min-w-0 flex-col items-start gap-2 rounded-2xl border border-slate-200 bg-white p-3 text-left transition-colors hover:border-slate-300 hover:bg-slate-50 active:bg-slate-100 disabled:opacity-45 sm:flex-row sm:gap-3"
    >
      <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-xl" style={{ backgroundColor: soft, color }}>
        <Icon className="size-[18px]" strokeWidth={2.4} />
      </span>
      <span className="min-w-0">
        <span className="block text-[15px] font-semibold text-slate-900">{label}</span>
        <span className="block text-xs leading-snug text-slate-500">{text}</span>
      </span>
    </button>
  )
}

function Stat({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="truncate text-[11px] font-medium text-slate-500">{label}</dt>
      <dd className="truncate text-sm font-semibold text-slate-800">{children}</dd>
    </div>
  )
}

/** Movimiento en pequeño (para la ventanilla). */
function MiniMovement({ m, p, lookup }: { m: Movimiento; p: Producto; lookup: Lookup }) {
  const ref = { kind: 'producto' as const, id: p.id }
  const incoming = sameRef(m.destino, ref)
  const other = incoming ? m.origen : m.destino
  const otherOwner = ownerOf(lookup, other)
  const label = movementLabel(m, lookup, ref)
  return (
    <button type="button" onClick={() => editMovement(m.id)} className="flex w-full items-center gap-3 px-1 py-2.5 text-left hover:bg-slate-50">
      <MovementAvatar tipo={movementKind(lookup, m, p.titularId)} size="sm" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-slate-800">{label}</span>
        <span className="block truncate text-xs text-slate-500">
          {fmtDate(m.fecha)} · {incoming ? 'de' : 'a'} {entityName(lookup, other)}
          {otherOwner && otherOwner.id !== p.titularId ? ` (${otherOwner.nombre})` : ''}
        </span>
      </span>
      <Amount value={incoming ? m.importe : -m.importe} sign className={cn('text-sm font-semibold', incoming ? 'text-emerald-600' : 'text-slate-900')} />
    </button>
  )
}

/**
 * Ventanilla de una inversión: se abre al tocarla en Inicio. Enseña cómo va y deja hacer
 * cualquier movimiento (aportar, retirar, traspasar, actualizar su valor…).
 */
export function InvestmentSheet({ modalId, productId }: { modalId: string; productId: string }) {
  const close = useUI((s) => s.close)
  const { ds, ws, positions, lookup } = useFinance()
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
  const recent = sortMovementsDesc(ws.movimientos.filter((m) => involvesProduct(m, p.id))).slice(0, 4)
  const mensuales = ds.programadas.filter((x) => x.destino.kind === 'producto' && x.destino.id === p.id)
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
          {mensuales.map((x) => {
            const de = ownerOf(lookup, x.origen)
            return (
              <p key={x.id} className="mt-3 flex items-start gap-2 text-[13px] text-fuchsia-900">
                <CalendarSync className="mt-0.5 size-4 shrink-0 text-fuchsia-600" />
                <span>
                  Recibe <Amount value={x.importe} className="font-semibold" /> el día {diaDe(x)} de cada mes desde «{entityName(lookup, x.origen)}»
                  {de && de.id !== p.titularId ? ` (de ${de.nombre})` : ''}.
                </span>
              </p>
            )
          })}
        </div>

        {/* Movimientos que se pueden hacer */}
        <section>
          <h3 className="mb-2 text-sm font-semibold text-slate-900">¿Qué quieres hacer?</h3>
          <div className="grid grid-cols-2 gap-2">
            <Action
              icon={ArrowUpRight}
              label="Aportar"
              text="Meter más dinero"
              color={MOVEMENT_META.inversion.color}
              soft={MOVEMENT_META.inversion.soft}
              onClick={() => aportarA(ds, p)}
            />
            <Action
              icon={ArrowDownLeft}
              label="Retirar"
              text="Reembolso a una cuenta"
              color={MOVEMENT_META.reembolso.color}
              soft={MOVEMENT_META.reembolso.soft}
              onClick={() => retirarDe(ds, p)}
            />
            <Action
              icon={Repeat}
              label="Traspasar"
              text="A otra inversión"
              color={MOVEMENT_META.traspaso.color}
              soft={MOVEMENT_META.traspaso.soft}
              onClick={() => traspasarDe(p)}
            />
            {isDeposit ? (
              <Action icon={Pencil} label="TAE y vencimiento" text="Interés y fecha de fin" color="#B45309" soft="#FEF3C7" onClick={() => openProduct({ productId: p.id })} />
            ) : (
              <Action icon={RefreshCw} label="Actualizar valor" text="Cuánto vale hoy" color="#0F766E" soft="#CCFBF1" onClick={() => openValuation(p.id)} />
            )}
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
            <div className="divide-y divide-slate-100">
              {recent.map((m) => (
                <MiniMovement key={m.id} m={m} p={p} lookup={lookup} />
              ))}
            </div>
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
