import { useMemo, useState } from 'react'
import { ArrowRight, MousePointerClick, Waypoints, X } from 'lucide-react'
import { useFinance } from '../store/useFinance'
import { openMovement } from '../store/ui'
import { buildFlowGraph, type FlowGraph, type FlowNode } from '../lib/flow'
import { periodOptions } from '../lib/movements'
import { navigate, paths } from '../lib/router'
import { PageHeader } from '../components/layout/AppShell'
import { Card, CardHeader, EmptyState } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { SelectInput } from '../components/ui/Field'
import { Amount } from '../components/ui/Amount'
import { ProductAvatar } from '../components/ui/icons'
import { Sankey } from '../components/charts/Sankey'
import { MovementList } from '../components/movements/MovementList'
import { DemoBanner } from '../components/DemoBanner'

function NodeDetail({ graph, node, onClose }: { graph: FlowGraph; node: FlowNode; onClose: () => void }) {
  const label = (id: string) => graph.nodes.find((n) => n.id === id)?.label ?? '—'
  const color = (id: string) => graph.nodes.find((n) => n.id === id)?.color ?? '#94A3B8'
  const incoming = graph.links.filter((l) => l.target === node.id).sort((a, b) => b.value - a.value)
  const outgoing = graph.links.filter((l) => l.source === node.id).sort((a, b) => b.value - a.value)
  const open = () => {
    if (!node.ref) return
    navigate(node.ref.kind === 'cuenta' ? paths.cuenta(node.ref.id) : paths.producto(node.ref.id))
  }
  const List = ({ title, items, other }: { title: string; items: typeof incoming; other: (l: (typeof incoming)[number]) => string }) =>
    items.length ? (
      <div>
        <div className="mb-1.5 text-[11px] font-semibold tracking-wide text-slate-400 uppercase">{title}</div>
        <ul className="space-y-1.5">
          {items.map((l) => (
            <li key={`${l.source}|${l.target}`} className="flex items-center justify-between gap-3 text-sm">
              <span className="flex min-w-0 items-center gap-2">
                <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: color(other(l)) }} />
                <span className="truncate text-slate-700">{label(other(l))}</span>
              </span>
              <Amount value={l.value} className="font-semibold text-slate-900" />
            </li>
          ))}
        </ul>
      </div>
    ) : null

  return (
    <div className="animate-fade-in rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="size-3 shrink-0 rounded" style={{ backgroundColor: node.color }} />
          <div className="min-w-0">
            <div className="truncate font-semibold text-slate-900">{node.label}</div>
            <Amount value={node.value} className="text-sm text-slate-500" />
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {node.ref && (node.kind === 'cuenta' || node.kind === 'producto') && (
            <Button size="sm" variant="secondary" iconRight={ArrowRight} onClick={open}>
              Abrir
            </Button>
          )}
          <button type="button" onClick={onClose} aria-label="Cerrar detalle" className="inline-flex size-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-200/60 hover:text-slate-700">
            <X className="size-4" />
          </button>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <List title="Viene de" items={incoming} other={(l) => l.source} />
        <List title="Va a" items={outgoing} other={(l) => l.target} />
      </div>
    </div>
  )
}

export function Flow() {
  const { ws, ds, positions, lookup, today } = useFinance()
  const multi = ds.titulares.length > 1
  const [periodKey, setPeriodKey] = useState('all')
  const [selected, setSelected] = useState<string | null>(null)
  const periods = useMemo(() => periodOptions(ws.movimientos, today), [ws.movimientos, today])
  const period = periods.find((p) => p.key === periodKey) ?? periods[0]
  const graph = useMemo(() => buildFlowGraph(ds, positions, period), [ds, positions, period])
  const selectedNode = graph.nodes.find((n) => n.id === selected) ?? null
  const productNodes = graph.nodes.filter((n) => n.column === 1)
  const nodeLabel = (id: string) => graph.nodes.find((n) => n.id === id)?.label ?? '—'
  const nodeColor = (id: string) => graph.nodes.find((n) => n.id === id)?.color ?? '#94A3B8'

  return (
    <div>
      <DemoBanner />
      <PageHeader
        title="Flujo del dinero"
        subtitle={multi ? 'De dónde viene, dónde está y a dónde va cada euro, de todos los titulares' : 'De dónde viene, dónde está y a dónde va cada euro'}
        actions={
          ws.movimientos.length > 0 && (
            <div className="w-56">
              <SelectInput
                aria-label="Periodo"
                value={periodKey}
                onChange={(e) => {
                  setPeriodKey(e.target.value)
                  setSelected(null)
                }}
              >
                {periods.map((p) => (
                  <option key={p.key} value={p.key}>
                    {p.label}
                  </option>
                ))}
              </SelectInput>
            </div>
          )
        }
      />

      {ws.movimientos.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Waypoints className="size-6" />}
            title="Aún no hay movimientos"
            description="Cuando registres movimientos verás aquí un diagrama con el recorrido de tu dinero."
            action={<Button onClick={() => openMovement()}>Nuevo movimiento</Button>}
          />
        </Card>
      ) : (
        <div className="space-y-4 lg:space-y-5">
          {/* Cómo leerlo */}
          <div className="grid grid-cols-3 gap-2 sm:gap-3">
            {[
              { n: '1', title: 'De dónde viene', text: multi ? 'Las cuentas de cada titular, traspasos recibidos y la rentabilidad' : 'Tus cuentas, traspasos recibidos y la rentabilidad' },
              { n: '2', title: 'Dónde está', text: multi ? 'Los productos de cada titular: depósitos, fondos, carteras…' : 'Tus productos: depósitos, fondos, carteras…' },
              { n: '3', title: 'A dónde va', text: multi ? 'Reembolsos, traspasos y lo que sigue invertido de cada uno' : 'Reembolsos, traspasos y lo que sigue invertido' },
            ].map((s) => (
              <div key={s.n} className="rounded-2xl border border-slate-200/80 bg-white p-3 sm:p-4">
                <div className="flex items-center gap-2">
                  <span className="inline-flex size-6 items-center justify-center rounded-full bg-brand-900 text-xs font-bold text-white">{s.n}</span>
                  <span className="text-[13px] font-semibold text-slate-900 sm:text-sm">{s.title}</span>
                </div>
                <p className="mt-1.5 hidden text-[13px] text-slate-500 sm:block">{s.text}</p>
              </div>
            ))}
          </div>

          <Card>
            <CardHeader
              title={period.key === 'all' ? 'Todo el histórico' : period.label}
              subtitle={
                <span className="inline-flex items-center gap-1.5">
                  <MousePointerClick className="size-4" /> Toca una caja o una banda para ver su recorrido
                </span>
              }
            />
            {multi && (
              <p className="px-4 pt-2 text-[13px] text-slate-500 sm:px-5">
                Cada caja lleva el nombre de su titular. Si el dinero sale de la cuenta de uno y entra en un producto de otro, cuenta como inversión de
                quien lo recibe. Lo que sigue invertido va por separado para cada titular.
              </p>
            )}
            <div className="px-2 pt-3 pb-4 sm:px-4">
              {graph.nodes.length ? (
                <Sankey graph={graph} selected={selected} onSelect={setSelected} />
              ) : (
                <p className="py-10 text-center text-sm text-slate-500">No hay movimientos de inversión en este periodo.</p>
              )}
              {!graph.isAll && graph.nodes.length > 0 && (
                <p className="mt-3 px-2 text-xs text-slate-500">
                  En un periodo concreto solo se ven los movimientos de esas fechas. «Sigue invertido» es lo que entró y no salió en el periodo.
                </p>
              )}
            </div>
            {selectedNode && (
              <div className="px-4 pb-4 sm:px-5 sm:pb-5">
                <NodeDetail graph={graph} node={selectedNode} onClose={() => setSelected(null)} />
              </div>
            )}
          </Card>

          {productNodes.length > 0 && (
            <Card>
              <CardHeader title="Detalle por producto" subtitle="Lo mismo que el diagrama, en forma de lista" />
              <ul className="mt-3 divide-y divide-slate-100 border-t border-slate-100">
                {productNodes.map((n) => {
                  const ins = graph.links.filter((l) => l.target === n.id).sort((a, b) => b.value - a.value)
                  const outs = graph.links.filter((l) => l.source === n.id).sort((a, b) => b.value - a.value)
                  return (
                    <li key={n.id} className="px-4 py-4 sm:px-5">
                      <button
                        type="button"
                        onClick={() => n.ref && navigate(paths.producto(n.ref.id))}
                        className="flex w-full items-center gap-3 text-left"
                      >
                        {n.tipo && <ProductAvatar tipo={n.tipo} size="sm" />}
                        <span className="min-w-0 flex-1 truncate font-semibold text-slate-900">{n.label}</span>
                        <Amount value={n.value} className="font-semibold text-slate-900" />
                      </button>
                      <div className="mt-3 grid grid-cols-1 gap-3 pl-11 sm:grid-cols-2">
                        <div>
                          <div className="mb-1 text-[11px] font-semibold tracking-wide text-emerald-700 uppercase">← Entra de</div>
                          <ul className="space-y-1">
                            {ins.map((l) => (
                              <li key={l.source} className="flex items-center justify-between gap-2 text-[13px]">
                                <span className="flex min-w-0 items-center gap-1.5">
                                  <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: nodeColor(l.source) }} />
                                  <span className="truncate text-slate-600">{nodeLabel(l.source)}</span>
                                </span>
                                <Amount value={l.value} className="font-medium text-slate-800" />
                              </li>
                            ))}
                          </ul>
                        </div>
                        <div>
                          <div className="mb-1 text-[11px] font-semibold tracking-wide text-brand-700 uppercase">Sale a →</div>
                          <ul className="space-y-1">
                            {outs.map((l) => (
                              <li key={l.target} className="flex items-center justify-between gap-2 text-[13px]">
                                <span className="flex min-w-0 items-center gap-1.5">
                                  <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: nodeColor(l.target) }} />
                                  <span className="truncate text-slate-600">{nodeLabel(l.target)}</span>
                                </span>
                                <Amount value={l.value} className="font-medium text-slate-800" />
                              </li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    </li>
                  )
                })}
              </ul>
            </Card>
          )}

          {graph.transfers.length > 0 && (
            <Card>
              <CardHeader
                title={multi ? 'Transferencias entre cuentas' : 'Transferencias entre tus cuentas'}
                subtitle="Dinero que se ha movido entre cuentas sin pasar por ningún producto"
              />
              <div className="mt-3 border-t border-slate-100">
                <MovementList movements={graph.transfers} lookup={lookup} grouped={false} />
              </div>
            </Card>
          )}
        </div>
      )}
    </div>
  )
}
