import { useState, type ReactNode } from 'react'
import { Landmark, Plus, Wallet } from 'lucide-react'
import type { ProductType } from '../types'
import { useFinance, type TitularFinance } from '../store/useFinance'
import { openAccount, openProduct } from '../store/ui'
import { PRODUCT_META, PRODUCT_TYPES } from '../lib/meta'
import { navigate, paths } from '../lib/router'
import { PageHeader } from '../components/layout/AppShell'
import { Button } from '../components/ui/Button'
import { Card, EmptyState } from '../components/ui/Card'
import { Chip, Segmented } from '../components/ui/Segmented'
import { Amount, GainBadge } from '../components/ui/Amount'
import { ProductAvatar } from '../components/ui/icons'
import { AccountCard, ProductCard } from '../components/ProductCard'
import { DemoBanner } from '../components/DemoBanner'
import { PrincipalBadge, TitularAvatar } from '../components/Titulares'

/** Cabecera del apartado de un titular. */
function TitularHeader({ tf, total, action }: { tf: TitularFinance; total?: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b-2 pb-3" style={{ borderColor: tf.color }}>
      <div className="flex min-w-0 items-center gap-2.5">
        <TitularAvatar titular={tf.titular} />
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-1.5">
            <h2 className="truncate text-lg font-bold text-slate-900">{tf.titular.nombre}</h2>
            {tf.index === 0 && <PrincipalBadge />}
          </div>
          {total}
        </div>
      </div>
      {action}
    </div>
  )
}

export function Investments({ tab, tipo }: { tab: 'productos' | 'cuentas'; tipo: string | null }) {
  const { ws, ds, positions, titulares } = useFinance()
  const [showClosed, setShowClosed] = useState(false)
  const typeFilter: ProductType | 'todos' = tipo && (PRODUCT_TYPES as string[]).includes(tipo) ? (tipo as ProductType) : 'todos'
  const multi = ds.titulares.length > 1

  const present = PRODUCT_TYPES.filter((t) => ws.productos.some((p) => p.tipo === t))
  const closedCount = ws.productos.filter((p) => positions.get(p.id)?.estado === 'cerrado').length

  return (
    <div>
      <DemoBanner />
      <PageHeader
        title={tab === 'productos' ? 'Inversiones' : 'Cuentas'}
        subtitle={
          tab === 'productos'
            ? multi
              ? 'Los depósitos, fondos, carteras y demás productos de cada titular'
              : 'Tus depósitos, fondos, carteras y demás productos'
            : multi
              ? 'Las cuentas de cada titular: de donde sale el dinero y a donde vuelve'
              : 'Las cuentas de donde sale el dinero y a donde vuelve'
        }
        actions={
          tab === 'productos' ? (
            <Button icon={Plus} onClick={() => openProduct({ presetTipo: typeFilter === 'todos' ? undefined : typeFilter })}>
              Nuevo producto
            </Button>
          ) : (
            <Button icon={Plus} onClick={() => openAccount()}>
              Nueva cuenta
            </Button>
          )
        }
      />

      <Segmented
        className="mb-5 w-full sm:w-auto"
        ariaLabel="Ver productos o cuentas"
        value={tab}
        onChange={(v) => navigate(v === 'cuentas' ? paths.cuentas : paths.productos())}
        options={[
          { value: 'productos', label: `Productos (${ws.productos.length})` },
          { value: 'cuentas', label: `Cuentas (${ws.cuentas.length})` },
        ]}
      />

      {tab === 'productos' ? (
        ws.productos.length === 0 ? (
          <Card>
            <EmptyState
              icon={<Wallet className="size-6" />}
              title="Aún no hay productos"
              description="Añade el primer depósito, fondo o cartera. Después podrás registrar el dinero que entra y sale."
              action={
                <Button icon={Plus} onClick={() => openProduct()}>
                  Nuevo producto
                </Button>
              }
            />
          </Card>
        ) : (
          <>
            <div className="no-scrollbar -mx-4 mb-5 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0">
              <Chip active={typeFilter === 'todos'} onClick={() => navigate(paths.productos())}>
                Todos
              </Chip>
              {present.map((t) => (
                <Chip key={t} active={typeFilter === t} color={PRODUCT_META[t].color} onClick={() => navigate(paths.productos(t))}>
                  {PRODUCT_META[t].plural}
                </Chip>
              ))}
            </div>

            <div className="space-y-10">
              {titulares.map((tf) => {
                const groups = tf.byType.filter((r) => typeFilter === 'todos' || r.tipo === typeFilter)
                return (
                  <section key={tf.titular.id} aria-label={`Productos de ${tf.titular.nombre}`}>
                    {multi && (
                      <TitularHeader
                        tf={tf}
                        total={
                          tf.ws.productos.length > 0 ? (
                            <div className="flex flex-wrap items-center gap-2 text-sm">
                              <Amount value={tf.totals.patrimonio} className="font-semibold text-slate-700" />
                              <GainBadge size="sm" ganancia={tf.totals.ganancia} rentabilidad={tf.totals.rentabilidad} />
                            </div>
                          ) : (
                            <div className="text-sm text-slate-500">Sin productos</div>
                          )
                        }
                        action={
                          <Button
                            variant="soft"
                            size="sm"
                            icon={Plus}
                            onClick={() => openProduct({ presetTitularId: tf.titular.id, presetTipo: typeFilter === 'todos' ? undefined : typeFilter })}
                          >
                            Producto
                          </Button>
                        }
                      />
                    )}
                    {groups.length === 0 ? (
                      <p className="rounded-2xl border border-dashed border-slate-300 px-4 py-5 text-center text-sm text-slate-500">
                        {tf.ws.productos.length === 0 ? `${tf.titular.nombre} aún no tiene productos.` : 'Ninguno de este tipo.'}
                      </p>
                    ) : (
                      <div className="space-y-8">
                        {groups.map((r) => {
                          const list = tf.ws.productos
                            .filter((p) => p.tipo === r.tipo)
                            .filter((p) => showClosed || positions.get(p.id)?.estado !== 'cerrado')
                            .sort((a, b) => (positions.get(b.id)?.saldo ?? 0) - (positions.get(a.id)?.saldo ?? 0))
                          const hiddenClosed = r.numProductos - list.length
                          return (
                            <section key={r.tipo} aria-label={`${PRODUCT_META[r.tipo].plural} de ${tf.titular.nombre}`}>
                              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                                <div className="flex items-center gap-2.5">
                                  <ProductAvatar tipo={r.tipo} size="sm" />
                                  <h3 className="text-base font-semibold text-slate-900">{PRODUCT_META[r.tipo].plural}</h3>
                                  <span className="rounded-full bg-slate-200/70 px-2 py-0.5 text-xs font-semibold text-slate-600">{r.numProductos}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <Amount value={r.saldo} className="font-bold text-slate-900" />
                                  <GainBadge size="sm" ganancia={r.ganancia} rentabilidad={r.rentabilidad} />
                                </div>
                              </div>
                              {list.length > 0 ? (
                                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                                  {list.map((p) => (
                                    <ProductCard key={p.id} p={p} pos={positions.get(p.id)!} />
                                  ))}
                                </div>
                              ) : (
                                <p className="rounded-2xl border border-dashed border-slate-300 px-4 py-5 text-center text-sm text-slate-500">
                                  {hiddenClosed > 0 ? `${hiddenClosed} producto${hiddenClosed === 1 ? '' : 's'} cerrado${hiddenClosed === 1 ? '' : 's'}.` : 'Sin productos.'}
                                </p>
                              )}
                            </section>
                          )
                        })}
                      </div>
                    )}
                  </section>
                )
              })}
            </div>

            {closedCount > 0 && (
              <div className="mt-8 text-center">
                <Button variant="secondary" size="sm" onClick={() => setShowClosed((v) => !v)}>
                  {showClosed ? 'Ocultar productos cerrados' : `Mostrar productos cerrados (${closedCount})`}
                </Button>
              </div>
            )}
          </>
        )
      ) : ws.cuentas.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Landmark className="size-6" />}
            title="Aún no hay cuentas"
            description="Añade la cuenta bancaria de donde sale el dinero que se invierte (y a donde vuelven los reembolsos)."
            action={
              <Button icon={Plus} onClick={() => openAccount()}>
                Nueva cuenta
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="space-y-10">
          {titulares.map((tf) => (
            <section key={tf.titular.id} aria-label={`Cuentas de ${tf.titular.nombre}`}>
              {multi && (
                <TitularHeader
                  tf={tf}
                  total={<div className="text-sm text-slate-500">{tf.ws.cuentas.length === 0 ? 'Sin cuentas' : `${tf.ws.cuentas.length} cuenta${tf.ws.cuentas.length === 1 ? '' : 's'}`}</div>}
                  action={
                    <Button variant="soft" size="sm" icon={Plus} onClick={() => openAccount({ presetTitularId: tf.titular.id })}>
                      Cuenta
                    </Button>
                  }
                />
              )}
              {tf.ws.cuentas.length > 0 ? (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {tf.ws.cuentas.map((c) => (
                    <AccountCard key={c.id} c={c} s={tf.accounts.get(c.id)!} />
                  ))}
                </div>
              ) : (
                <p className="rounded-2xl border border-dashed border-slate-300 px-4 py-5 text-center text-sm text-slate-500">{tf.titular.nombre} aún no tiene cuentas.</p>
              )}
            </section>
          ))}
        </div>
      )}
    </div>
  )
}
