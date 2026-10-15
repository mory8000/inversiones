import { useState } from 'react'
import { Landmark, Plus, Wallet } from 'lucide-react'
import type { ProductType } from '../types'
import { useFinance } from '../store/useFinance'
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

export function Investments({ tab, tipo }: { tab: 'productos' | 'cuentas'; tipo: string | null }) {
  const { ws, positions, accounts, byType } = useFinance()
  const [showClosed, setShowClosed] = useState(false)
  const typeFilter: ProductType | 'todos' = tipo && (PRODUCT_TYPES as string[]).includes(tipo) ? (tipo as ProductType) : 'todos'

  const present = PRODUCT_TYPES.filter((t) => ws.productos.some((p) => p.tipo === t))
  const closedCount = ws.productos.filter((p) => positions.get(p.id)?.estado === 'cerrado').length

  return (
    <div>
      <DemoBanner />
      <PageHeader
        title={tab === 'productos' ? 'Inversiones' : 'Cuentas'}
        subtitle={tab === 'productos' ? 'Tus depósitos, fondos, carteras y demás productos' : 'Las cuentas de donde sale el dinero y a donde vuelve'}
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
              title="Aún no tienes productos"
              description="Añade tu primer depósito, fondo o cartera. Después podrás registrar el dinero que metes y sacas."
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

            <div className="space-y-8">
              {byType
                .filter((r) => typeFilter === 'todos' || r.tipo === typeFilter)
                .map((r) => {
                  const list = ws.productos
                    .filter((p) => p.tipo === r.tipo)
                    .filter((p) => showClosed || positions.get(p.id)?.estado !== 'cerrado')
                    .sort((a, b) => (positions.get(b.id)?.saldo ?? 0) - (positions.get(a.id)?.saldo ?? 0))
                  const hiddenClosed = r.numProductos - list.length
                  return (
                    <section key={r.tipo} aria-label={PRODUCT_META[r.tipo].plural}>
                      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2.5">
                          <ProductAvatar tipo={r.tipo} size="sm" />
                          <h2 className="text-base font-semibold text-slate-900">{PRODUCT_META[r.tipo].plural}</h2>
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
            title="Aún no tienes cuentas"
            description="Añade la cuenta bancaria de donde sale el dinero que inviertes (y a donde vuelven los reembolsos)."
            action={
              <Button icon={Plus} onClick={() => openAccount()}>
                Nueva cuenta
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {ws.cuentas.map((c) => (
            <AccountCard key={c.id} c={c} s={accounts.get(c.id)!} />
          ))}
        </div>
      )}
    </div>
  )
}
