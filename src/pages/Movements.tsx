import { useMemo, useState, type CSSProperties } from 'react'
import { ArrowLeftRight, Download, Plus, Search, SlidersHorizontal, X } from 'lucide-react'
import type { MovementType, ProductType } from '../types'
import { useFinance } from '../store/useFinance'
import { useActiveTitular } from '../store/data'
import { openMovement, toast } from '../store/ui'
import { EMPTY_FILTERS, filterMovements, movementsToCSV, periodOptions, refKey, totalsOf, type MovementFilters } from '../lib/movements'
import { MOVEMENT_META, MOVEMENT_TYPES, PRODUCT_META, PRODUCT_TYPES } from '../lib/meta'
import { downloadFile } from '../lib/download'
import { cn } from '../lib/cn'
import { PageHeader } from '../components/layout/AppShell'
import { Card, EmptyState } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Chip } from '../components/ui/Segmented'
import { SelectInput, inputBase } from '../components/ui/Field'
import { Amount } from '../components/ui/Amount'
import { MOVEMENT_ICONS } from '../components/ui/icons'
import { MovementList } from '../components/movements/MovementList'
import { DemoBanner } from '../components/DemoBanner'

const PLURAL: Record<MovementType, string> = {
  inversion: 'Inversiones',
  reembolso: 'Reembolsos',
  traspaso: 'Traspasos',
  transferencia: 'Transferencias',
}

export function Movements({ params }: { params: URLSearchParams }) {
  const { ws, lookup, today } = useFinance()
  const titular = useActiveTitular()
  const initialTipo = params.get('tipo')
  const [filters, setFilters] = useState<MovementFilters>(() => ({
    ...EMPTY_FILTERS,
    tipo: initialTipo && (MOVEMENT_TYPES as string[]).includes(initialTipo) ? (initialTipo as MovementType) : 'todos',
    entidad: params.get('entidad') ?? '',
  }))
  const [periodKey, setPeriodKey] = useState('all')
  const [showFilters, setShowFilters] = useState(false)

  const periods = useMemo(() => periodOptions(ws.movimientos, today), [ws.movimientos, today])
  const period = periods.find((p) => p.key === periodKey) ?? periods[0]
  const effective = useMemo(() => ({ ...filters, from: period.from, to: period.to }), [filters, period])
  const filtered = useMemo(() => filterMovements(ws.movimientos, lookup, effective), [ws.movimientos, lookup, effective])
  const withoutType = useMemo(() => filterMovements(ws.movimientos, lookup, { ...effective, tipo: 'todos' }), [ws.movimientos, lookup, effective])
  const totals = totalsOf(filtered)
  const counts = totalsOf(withoutType)
  const countByType = (t: MovementType) => withoutType.filter((m) => m.tipo === t).length

  const set = (patch: Partial<MovementFilters>) => setFilters((f) => ({ ...f, ...patch }))
  const activeExtra = (filters.entidad ? 1 : 0) + (filters.productType !== 'todos' ? 1 : 0) + (periodKey !== 'all' ? 1 : 0)
  const anyFilter = activeExtra > 0 || filters.tipo !== 'todos' || filters.q.trim() !== ''
  const clear = () => {
    setFilters(EMPTY_FILTERS)
    setPeriodKey('all')
  }

  const exportCSV = () => {
    if (!filtered.length) return
    const csv = movementsToCSV(filtered, lookup)
    const name = titular.nombre.replace(/[^\p{L}\p{N}]+/gu, '-').toLowerCase()
    downloadFile(`movimientos-${name}-${today}.csv`, csv, 'text/csv;charset=utf-8')
    toast('Movimientos exportados (se abren con Excel)')
  }

  const stats: { key: MovementType; value: number }[] = MOVEMENT_TYPES.map((t) => ({ key: t, value: totals[t] }))

  return (
    <div>
      <DemoBanner />
      <PageHeader
        title="Movimientos"
        subtitle="Todo el dinero que se mueve: de dónde viene y a dónde va"
        actions={
          <>
            <Button variant="secondary" icon={Download} onClick={exportCSV} disabled={!filtered.length} className="max-sm:hidden">
              Exportar a Excel
            </Button>
            <Button icon={Plus} onClick={() => openMovement()}>
              Nuevo
            </Button>
          </>
        }
      />

      {ws.movimientos.length === 0 ? (
        <Card>
          <EmptyState
            icon={<ArrowLeftRight className="size-6" />}
            title="Aún no hay movimientos"
            description="Cada vez que muevas dinero (de tu cuenta a un fondo, de un depósito a tu cuenta…) regístralo aquí."
            action={
              <Button icon={Plus} onClick={() => openMovement()}>
                Nuevo movimiento
              </Button>
            }
          />
        </Card>
      ) : (
        <>
          {/* Tipos */}
          <div className="no-scrollbar -mx-4 mb-3 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0">
            <Chip active={filters.tipo === 'todos'} onClick={() => set({ tipo: 'todos' })}>
              Todos <span className="opacity-60">{counts.count}</span>
            </Chip>
            {MOVEMENT_TYPES.map((t) => {
              const n = countByType(t)
              if (n === 0 && filters.tipo !== t) return null
              return (
                <Chip key={t} active={filters.tipo === t} color={MOVEMENT_META[t].color} onClick={() => set({ tipo: t })}>
                  {PLURAL[t]} <span className="opacity-60">{n}</span>
                </Chip>
              )
            })}
          </div>

          {/* Búsqueda y filtros */}
          <div className="mb-4 flex gap-2">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-slate-400" />
              <input
                type="search"
                value={filters.q}
                onChange={(e) => set({ q: e.target.value })}
                placeholder="Buscar por cuenta, producto, concepto…"
                aria-label="Buscar movimientos"
                className={cn(inputBase, 'h-11 border-slate-300 pl-10')}
              />
            </div>
            <Button
              variant={showFilters || activeExtra ? 'soft' : 'secondary'}
              icon={SlidersHorizontal}
              onClick={() => setShowFilters((v) => !v)}
              aria-expanded={showFilters}
              className="h-11"
            >
              <span className="hidden sm:inline">Filtros</span>
              {activeExtra > 0 && <span className="rounded-full bg-brand-600 px-1.5 text-[11px] text-white">{activeExtra}</span>}
            </Button>
          </div>

          {showFilters && (
            <Card className="mb-4 grid grid-cols-1 gap-3 p-4 sm:grid-cols-3">
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-slate-500">Cuenta o producto</span>
                <SelectInput value={filters.entidad} onChange={(e) => set({ entidad: e.target.value })}>
                  <option value="">Todos</option>
                  {ws.cuentas.length > 0 && (
                    <optgroup label="Cuentas">
                      {ws.cuentas.map((c) => (
                        <option key={c.id} value={refKey({ kind: 'cuenta', id: c.id })}>
                          {c.nombre}
                        </option>
                      ))}
                    </optgroup>
                  )}
                  {PRODUCT_TYPES.map((t) => {
                    const list = ws.productos.filter((p) => p.tipo === t)
                    if (!list.length) return null
                    return (
                      <optgroup key={t} label={PRODUCT_META[t].plural}>
                        {list.map((p) => (
                          <option key={p.id} value={refKey({ kind: 'producto', id: p.id })}>
                            {p.nombre}
                          </option>
                        ))}
                      </optgroup>
                    )
                  })}
                </SelectInput>
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-slate-500">Tipo de producto</span>
                <SelectInput value={filters.productType} onChange={(e) => set({ productType: e.target.value as ProductType | 'todos' })}>
                  <option value="todos">Todos</option>
                  {PRODUCT_TYPES.filter((t) => ws.productos.some((p) => p.tipo === t)).map((t) => (
                    <option key={t} value={t}>
                      {PRODUCT_META[t].plural}
                    </option>
                  ))}
                </SelectInput>
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-slate-500">Periodo</span>
                <SelectInput value={periodKey} onChange={(e) => setPeriodKey(e.target.value)}>
                  {periods.map((p) => (
                    <option key={p.key} value={p.key}>
                      {p.label}
                    </option>
                  ))}
                </SelectInput>
              </label>
            </Card>
          )}

          {/* Totales del filtro */}
          <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
            {stats.map((s) => {
              const meta = MOVEMENT_META[s.key]
              const Icon = MOVEMENT_ICONS[s.key]
              return (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => set({ tipo: filters.tipo === s.key ? 'todos' : s.key })}
                  className={cn(
                    'rounded-2xl border bg-white p-3 text-left transition-all sm:p-4',
                    filters.tipo === s.key ? 'border-transparent ring-2' : 'border-slate-200/80 hover:border-slate-300',
                  )}
                  style={filters.tipo === s.key ? ({ '--tw-ring-color': meta.color } as CSSProperties) : undefined}
                >
                  <div className="flex items-center gap-1.5 text-xs font-medium" style={{ color: meta.text }}>
                    <Icon className="size-3.5" strokeWidth={2.5} />
                    {PLURAL[s.key]}
                  </div>
                  <Amount value={s.value} className="mt-1 block text-base font-bold text-slate-900 sm:text-lg" />
                </button>
              )
            })}
          </div>

          {anyFilter && (
            <div className="mb-3 flex items-center justify-between gap-2 text-sm text-slate-500">
              <span>
                {filtered.length} de {ws.movimientos.length} movimientos
              </span>
              <button type="button" onClick={clear} className="inline-flex items-center gap-1 font-semibold text-brand-600 hover:text-brand-700">
                <X className="size-4" /> Quitar filtros
              </button>
            </div>
          )}

          <Card>
            {filtered.length ? (
              <MovementList movements={filtered} lookup={lookup} />
            ) : (
              <EmptyState
                icon={<Search className="size-6" />}
                title="No hay movimientos con estos filtros"
                action={
                  <Button variant="secondary" onClick={clear}>
                    Quitar filtros
                  </Button>
                }
              />
            )}
          </Card>

          <div className="mt-4 sm:hidden">
            <Button variant="secondary" icon={Download} onClick={exportCSV} disabled={!filtered.length} className="w-full">
              Exportar a Excel (CSV)
            </Button>
          </div>
        </>
      )}
    </div>
  )
}
