import { useEffect, useState } from 'react'
import { ArrowDownLeft, ArrowUpRight, CalendarSync, ChevronRight, Pencil, Plus, TriangleAlert } from 'lucide-react'
import type { EntityRef } from '../types'
import { useFinance } from '../store/useFinance'
import { openAccount, useUI } from '../store/ui'
import { anadirDinero, invertirDesde, programarMensual, sacarDinero } from '../store/acciones'
import { isExterna, seVeEn, sortMovementsDesc } from '../lib/movements'
import { cuentaPrincipal } from '../lib/titulares'
import { navigate, paths } from '../lib/router'
import { cn } from '../lib/cn'
import { Sheet } from './ui/Sheet'
import { Button } from './ui/Button'
import { Amount } from './ui/Amount'
import { ActionTile } from './ui/ActionTile'
import { AccountAvatar } from './ui/icons'
import { MovementMini } from './movements/MovementMini'
import { ProgramadaItem } from './ProgramadaItem'

/** Movimientos que se ven en la ventana (el resto, en «Ver todos»). */
const VISIBLES = 6

/**
 * Ventana de una cuenta con saldo (la cuenta principal «MyInvestor»): su saldo real, lo que se
 * puede hacer (añadir dinero, invertir, programar la transferencia mensual, sacar dinero), sus
 * transferencias mensuales (el único sitio donde se cambian, con «Editar») y sus movimientos,
 * cada uno con «Editar» y «Borrar». Lo que se desvía de la cuenta (camino del «Fondo ahorro») no
 * cuenta en ella (ni lo que entra ni lo que sale) y no figura entre sus movimientos.
 */
export function AccountSheet({ modalId, cuentaId }: { modalId: string; cuentaId: string }) {
  const close = useUI((s) => s.close)
  const [verTodos, setVerTodos] = useState(false)
  const fin = useFinance()
  const { ds, ws, accounts, lookup } = fin
  const c = ds.cuentas.find((x) => x.id === cuentaId)

  // Si se elimina la cuenta (desde «Editar»), se cierra la ventana.
  useEffect(() => {
    if (!c) close(modalId)
  }, [c, close, modalId])
  if (!c) return null

  const s = accounts.get(c.id)
  const saldo = s?.saldo ?? 0
  const negativo = saldo < -0.005
  const titular = lookup.titulares.get(c.titularId)
  const multi = ds.titulares.length > 1
  const esPrincipal = cuentaPrincipal(ds.cuentas, c.titularId)?.id === c.id
  const ref = { kind: 'cuenta' as const, id: c.id }
  // Sin lo que se desvía camino de otro titular: no figura aquí (no cuenta ni al entrar ni al salir).
  const movs = sortMovementsDesc(ws.movimientos.filter((m) => seVeEn(lookup, m, ref)))
  /** Dinero traído desde bancos externos (aportaciones): se puede cambiar o borrar. */
  const traidos = movs.filter((m) => m.destino.kind === 'cuenta' && m.destino.id === c.id && isExterna(lookup, m.origen))
  const otros = movs.filter((m) => !traidos.includes(m))
  // Las transferencias mensuales solo se cambian aquí: las que salen o llegan a esta cuenta y, en la
  // cuenta principal del titular principal, también las que no pasan por ninguna cuenta con saldo
  // (p. ej. desde una cuenta externa), para que ninguna se quede sin poder cambiarse.
  const conSaldo = new Set(ds.cuentas.filter((x) => !x.externa).map((x) => x.id))
  const esLaCuenta = (r: EntityRef) => r.kind === 'cuenta' && r.id === c.id
  const pasaPorConSaldo = (r: EntityRef) => r.kind === 'cuenta' && conSaldo.has(r.id)
  const laPrincipal = esPrincipal && c.titularId === ds.titulares[0]?.id
  const mensuales = ds.programadas.filter(
    (p) => esLaCuenta(p.origen) || esLaCuenta(p.destino) || (laPrincipal && !pasaPorConSaldo(p.origen) && !pasaPorConSaldo(p.destino)),
  )
  const done = () => close(modalId)

  return (
    <Sheet
      title={c.nombre}
      subtitle={[esPrincipal ? 'Cuenta principal' : 'Cuenta con saldo', multi && titular ? `de ${titular.nombre}` : null, c.entidad && c.entidad !== c.nombre ? c.entidad : null]
        .filter(Boolean)
        .join(' · ')}
      onClose={done}
      footer={
        <div className="flex items-center gap-2">
          <Button variant="ghost" icon={Pencil} onClick={() => openAccount({ accountId: c.id })}>
            Editar
          </Button>
          <div className="flex-1" />
          <Button variant="secondary" onClick={done}>
            Cerrar
          </Button>
        </div>
      }
    >
      <div className="space-y-5" data-cuenta-sheet={c.nombre}>
        {/* Saldo real */}
        <div className={cn('rounded-2xl p-4', negativo ? 'bg-rose-50' : 'bg-indigo-50/70')}>
          <div className="flex items-center gap-3">
            <AccountAvatar color={c.color} />
            <div className="min-w-0 flex-1">
              <div className="text-xs font-medium text-slate-600">Saldo (dinero sin invertir)</div>
              <Amount value={saldo} className={cn('text-2xl font-bold tracking-tight', negativo ? 'text-rose-700' : 'text-slate-900')} />
            </div>
          </div>
          <dl className="mt-3 grid grid-cols-2 gap-2 rounded-xl bg-white/70 p-3">
            <div className="min-w-0">
              <dt className="truncate text-[11px] font-medium text-slate-500">Ha entrado</dt>
              <dd className="truncate text-sm font-semibold text-slate-800">
                <Amount value={s?.entradas ?? 0} />
              </dd>
            </div>
            <div className="min-w-0">
              <dt className="truncate text-[11px] font-medium text-slate-500">Ha salido</dt>
              <dd className="truncate text-sm font-semibold text-slate-800">
                <Amount value={s?.salidas ?? 0} />
              </dd>
            </div>
          </dl>
          {negativo ? (
            <p className="mt-3 flex gap-2 text-[13px] text-rose-800">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" />
              <span>
                Saldo negativo: han salido <Amount value={-saldo} className="font-semibold" /> más de los que han entrado. Pulsa «Añadir dinero» para apuntar lo que
                trajiste de tu banco, o revisa los movimientos de abajo.
              </span>
            </p>
          ) : (
            <p className="mt-3 text-[13px] text-slate-600">
              Es el saldo real: lo que ha entrado menos lo que ha salido (también lo que ha pasado de camino a otro titular). Suma en el patrimonio de {titular?.nombre ?? 'su titular'}.
            </p>
          )}
        </div>

        {/* Lo que se puede hacer */}
        <section>
          <h3 className="mb-2 text-sm font-semibold text-slate-900">¿Qué quieres hacer?</h3>
          <div className="grid grid-cols-2 gap-2">
            <ActionTile icon={Plus} label="Añadir dinero" text="Desde tu banco (cuenta externa)" color="#059669" soft="#D1FAE5" onClick={() => anadirDinero(ds, c.id)} />
            <ActionTile icon={ArrowUpRight} label="Invertir" text="En un fondo, cartera, depósito…" color="#2447B8" soft="#DBEAFE" onClick={() => invertirDesde(ds, c.id)} />
            <ActionTile
              icon={CalendarSync}
              label="Programar transferencia mensual"
              text="La app la apunta sola cada mes"
              color="#C026D3"
              soft="#FAE8FF"
              onClick={() => programarMensual(ds, c.titularId, c.id)}
            />
            <ActionTile icon={ArrowDownLeft} label="Sacar dinero" text="A tu banco (cuenta externa)" color="#B45309" soft="#FEF3C7" onClick={() => sacarDinero(ds, c.id)} />
          </div>
        </section>

        {/* Transferencias mensuales */}
        {mensuales.length > 0 && (
          <section>
            <h3 className="mb-2 text-sm font-semibold text-slate-900">{mensuales.length === 1 ? 'Transferencia mensual' : 'Transferencias mensuales'}</h3>
            <ul className="space-y-2">
              {mensuales.map((p) => (
                <ProgramadaItem key={p.id} p={p} fin={fin} />
              ))}
            </ul>
          </section>
        )}

        {/* Dinero traído de bancos externos */}
        <section>
          <div className="mb-1 flex items-baseline justify-between gap-2">
            <h3 className="text-sm font-semibold text-slate-900">Dinero añadido desde bancos externos</h3>
            {traidos.length > 0 && (
              <span className="shrink-0 text-xs text-slate-500">
                <Amount value={traidos.reduce((sum, m) => sum + m.importe, 0)} className="font-semibold text-slate-700" />
              </span>
            )}
          </div>
          {traidos.length === 0 ? (
            <p className="rounded-xl bg-slate-50 p-3 text-sm text-slate-500">Todavía no has añadido dinero. Pulsa «Añadir dinero» para apuntar lo que traes de tu banco.</p>
          ) : (
            <>
              <p className="mb-1 text-xs text-slate-500">Puedes cambiar o borrar cada una con sus botones.</p>
              <ul className="divide-y divide-slate-100">
                {(verTodos ? traidos : traidos.slice(0, VISIBLES)).map((m) => (
                  <MovementMini key={m.id} m={m} perspective={ref} lookup={lookup} ds={ds} />
                ))}
              </ul>
              {traidos.length > VISIBLES && (
                <button type="button" onClick={() => setVerTodos((v) => !v)} className="mt-1 text-sm font-semibold text-brand-700 hover:text-brand-900">
                  {verTodos ? 'Ver menos' : `Ver las ${traidos.length}`}
                </button>
              )}
            </>
          )}
        </section>

        {/* Otros movimientos */}
        {otros.length > 0 && (
          <section>
            <div className="mb-1 flex items-baseline justify-between gap-2">
              <h3 className="text-sm font-semibold text-slate-900">Otros movimientos</h3>
              <span className="text-xs text-slate-500">{otros.length} en total</span>
            </div>
            <ul className="divide-y divide-slate-100">
              {otros.slice(0, VISIBLES).map((m) => (
                <MovementMini key={m.id} m={m} perspective={ref} lookup={lookup} ds={ds} />
              ))}
            </ul>
          </section>
        )}
        <Button
          variant="soft"
          className="w-full"
          iconRight={ChevronRight}
          onClick={() => {
            done()
            navigate(paths.cuenta(c.id))
          }}
        >
          Ver todos sus datos y movimientos
        </Button>
      </div>
    </Sheet>
  )
}
