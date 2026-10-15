import { useMemo } from 'react'
import { ArrowDownLeft, ArrowRightLeft, ArrowUpRight, Pencil, SearchX } from 'lucide-react'
import { useFinance } from '../store/useFinance'
import { openAccount, openMovement } from '../store/ui'
import { involvesAccount } from '../lib/finance'
import { counterparts } from '../lib/movements'
import { PRODUCT_META } from '../lib/meta'
import { maskIban } from '../lib/format'
import { navigate, paths } from '../lib/router'
import { Card, CardHeader, EmptyState } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Amount } from '../components/ui/Amount'
import { AccountAvatar, ProductAvatar } from '../components/ui/icons'
import { MovementList } from '../components/movements/MovementList'
import { BreakdownList, counterpartItems } from '../components/Breakdown'
import { BackLink } from './ProductDetail'

export function AccountDetail({ id }: { id: string }) {
  const { ws, accounts, lookup, positions } = useFinance()
  const c = ws.cuentas.find((x) => x.id === id)
  const movs = useMemo(() => ws.movimientos.filter((m) => involvesAccount(m, id)), [ws.movimientos, id])

  if (!c) {
    return (
      <Card>
        <EmptyState
          icon={<SearchX className="size-6" />}
          title="Esta cuenta no existe"
          description="Puede que se haya eliminado."
          action={<Button onClick={() => navigate(paths.cuentas)}>Ver cuentas</Button>}
        />
      </Card>
    )
  }

  const s = accounts.get(c.id)!
  const ref = { kind: 'cuenta' as const, id: c.id }
  const transfersIn = counterparts(movs, ref, 'in').filter((x) => x.ref.kind === 'cuenta')
  const transfersOut = counterparts(movs, ref, 'out').filter((x) => x.ref.kind === 'cuenta')
  const transferItems = [
    ...counterpartItems(transfersIn, lookup, () => 'Recibido de la cuenta'),
    ...counterpartItems(transfersOut, lookup, () => 'Enviado a la cuenta'),
  ]

  return (
    <div>
      <BackLink label="Cuentas" fallback={paths.cuentas} />

      <Card className="relative overflow-hidden">
        <div className="absolute inset-x-0 top-0 h-1.5" style={{ backgroundColor: c.color }} />
        <div className="p-5 sm:p-6">
          <div className="flex items-start gap-3.5">
            <AccountAvatar color={c.color} size="lg" />
            <div className="min-w-0 flex-1">
              <span className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Cuenta</span>
              <h1 className="mt-0.5 text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">{c.nombre}</h1>
              <p className="truncate text-sm text-slate-500">{[c.entidad, c.iban && maskIban(c.iban)].filter(Boolean).join(' · ') || 'Sin entidad'}</p>
            </div>
            <Button variant="secondary" size="sm" icon={Pencil} onClick={() => openAccount({ accountId: c.id })} className="shrink-0">
              <span className="hidden sm:inline">Editar</span>
            </Button>
          </div>

          <dl className="mt-5 grid grid-cols-3 gap-3 rounded-2xl bg-slate-50 p-4">
            <div className="min-w-0">
              <dt className="text-xs text-slate-500">Enviado a inversiones</dt>
              <dd>
                <Amount value={s.enviado} className="text-base font-bold text-slate-900 sm:text-lg" />
              </dd>
            </div>
            <div className="min-w-0">
              <dt className="text-xs text-slate-500">Recibido de inversiones</dt>
              <dd>
                <Amount value={s.recibido} className="text-base font-bold text-slate-900 sm:text-lg" />
              </dd>
            </div>
            <div className="min-w-0">
              <dt className="text-xs text-slate-500">Neto invertido</dt>
              <dd>
                <Amount value={s.netoInvertido} className="text-base font-bold text-brand-700 sm:text-lg" />
              </dd>
            </div>
          </dl>

          <div className="mt-4 grid grid-cols-1 gap-2 sm:flex sm:flex-wrap">
            <Button variant="soft" icon={ArrowUpRight} onClick={() => openMovement({ tipo: 'inversion', origen: ref })}>
              Invertir desde esta cuenta
            </Button>
            <Button variant="soft" icon={ArrowDownLeft} onClick={() => openMovement({ tipo: 'reembolso', destino: ref })}>
              Reembolso a esta cuenta
            </Button>
            <Button variant="soft" icon={ArrowRightLeft} onClick={() => openMovement({ tipo: 'transferencia', origen: ref })}>
              Transferir a otra cuenta
            </Button>
          </div>
        </div>
      </Card>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:mt-5 lg:grid-cols-5 lg:gap-5">
        <div className="min-w-0 space-y-4 lg:col-span-3 lg:space-y-5">
          <Card>
            <CardHeader title="¿A dónde ha ido el dinero de esta cuenta?" subtitle="Por producto: lo enviado, lo que ha vuelto y lo que sigue invertido" />
            {s.porProducto.length === 0 ? (
              <p className="px-5 pt-3 pb-5 text-sm text-slate-500">Desde esta cuenta todavía no se ha invertido nada.</p>
            ) : (
              <>
              <ul className="mt-3 divide-y divide-slate-100 border-t border-slate-100 sm:hidden">
                {s.porProducto.map((row) => {
                  const p = lookup.productos.get(row.productoId)
                  return (
                    <li key={row.productoId}>
                      <button
                        type="button"
                        onClick={() => p && navigate(paths.producto(p.id))}
                        className="flex w-full items-center gap-3 px-4 py-3 text-left active:bg-slate-50"
                      >
                        {p && <ProductAvatar tipo={p.tipo} size="sm" />}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-baseline justify-between gap-2">
                            <span className="truncate text-sm font-semibold text-slate-800">{p?.nombre ?? 'Producto eliminado'}</span>
                            <Amount value={row.enviado - row.recibido} className="text-sm font-bold text-slate-900" />
                          </div>
                          <div className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-slate-500">
                            <span>
                              Enviado <Amount value={row.enviado} className="font-medium text-slate-700" />
                            </span>
                            <span>
                              Ha vuelto <Amount value={row.recibido} className="font-medium text-slate-700" />
                            </span>
                          </div>
                        </div>
                      </button>
                    </li>
                  )
                })}
              </ul>
              <div className="mt-3 hidden overflow-x-auto sm:block">
                <table className="w-full min-w-[520px] text-sm">
                  <thead>
                    <tr className="border-y border-slate-100 text-[11px] font-semibold tracking-wide text-slate-400 uppercase">
                      <th className="py-2 pr-3 pl-5 text-left font-semibold">Producto</th>
                      <th className="px-3 py-2 text-right font-semibold">Enviado</th>
                      <th className="px-3 py-2 text-right font-semibold">Ha vuelto</th>
                      <th className="py-2 pr-5 pl-3 text-right font-semibold">Neto</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {s.porProducto.map((row) => {
                      const p = lookup.productos.get(row.productoId)
                      return (
                        <tr
                          key={row.productoId}
                          className="cursor-pointer transition-colors hover:bg-slate-50"
                          onClick={() => p && navigate(paths.producto(p.id))}
                        >
                          <td className="py-2.5 pr-3 pl-5">
                            <div className="flex items-center gap-2.5">
                              {p && <ProductAvatar tipo={p.tipo} size="sm" />}
                              <div className="min-w-0">
                                <div className="truncate font-medium text-slate-800">{p?.nombre ?? 'Producto eliminado'}</div>
                                <div className="text-xs text-slate-400">
                                  {p ? PRODUCT_META[p.tipo].label : ''}
                                  {p && positions.get(p.id)?.estado === 'cerrado' ? ' · cerrado' : ''}
                                </div>
                              </div>
                            </div>
                          </td>
                          <td className="px-3 py-2.5 text-right text-slate-700">
                            <Amount value={row.enviado} />
                          </td>
                          <td className="px-3 py-2.5 text-right text-slate-700">
                            <Amount value={row.recibido} />
                          </td>
                          <td className="py-2.5 pr-5 pl-3 text-right font-semibold text-slate-900">
                            <Amount value={row.enviado - row.recibido} />
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              </>
            )}
            <div className="h-2" />
          </Card>

          <Card>
            <CardHeader title="Movimientos" subtitle={`${movs.length} movimiento${movs.length === 1 ? '' : 's'} de esta cuenta`} />
            <div className="mt-3 border-t border-slate-100">
              {movs.length ? (
                <MovementList movements={movs} lookup={lookup} perspective={ref} />
              ) : (
                <EmptyState
                  title="Sin movimientos"
                  description="Registra el dinero que sale de esta cuenta hacia tus inversiones."
                  action={
                    <Button icon={ArrowUpRight} onClick={() => openMovement({ tipo: 'inversion', origen: ref })}>
                      Invertir
                    </Button>
                  }
                />
              )}
            </div>
          </Card>
        </div>

        <div className="min-w-0 space-y-4 lg:col-span-2 lg:space-y-5">
          <Card>
            <CardHeader title="Destinos" subtitle="Productos a los que ha ido el dinero" />
            <div className="px-2 pt-2 pb-3 sm:px-3">
              <BreakdownList
                items={counterpartItems(
                  counterparts(movs, ref, 'out').filter((x) => x.ref.kind === 'producto'),
                  lookup,
                  () => 'Invertido',
                )}
                empty="Aún no se ha invertido nada desde esta cuenta."
              />
            </div>
          </Card>
          <Card>
            <CardHeader title="Lo que ha vuelto" subtitle="Reembolsos recibidos en esta cuenta" />
            <div className="px-2 pt-2 pb-3 sm:px-3">
              <BreakdownList
                items={counterpartItems(
                  counterparts(movs, ref, 'in').filter((x) => x.ref.kind === 'producto'),
                  lookup,
                  () => 'Reembolsado',
                )}
                empty="Todavía no ha vuelto dinero a esta cuenta."
              />
            </div>
          </Card>
          {transferItems.length > 0 && (
            <Card>
              <CardHeader title="Transferencias entre cuentas" />
              <div className="px-2 pt-2 pb-3 sm:px-3">
                <BreakdownList items={transferItems} empty="" />
              </div>
            </Card>
          )}
          {c.notas && (
            <Card>
              <CardHeader title="Notas" />
              <p className="px-4 pt-2 pb-5 text-sm whitespace-pre-line text-slate-600 sm:px-5">{c.notas}</p>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}
