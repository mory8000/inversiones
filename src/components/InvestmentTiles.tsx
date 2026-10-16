import { Suspense, lazy, useState } from 'react'
import { ArrowUpDown, Calculator, CalendarSync, Check, ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import type { Producto, Titular } from '../types'
import type { Position } from '../lib/finance'
import type { FinanceData } from '../store/useFinance'
import { useData } from '../store/data'
import { openInvestment, openProduct, openValores, toast } from '../store/ui'
import { PRODUCT_META } from '../lib/meta'
import { fmtPct } from '../lib/format'
import { moveInList } from '../lib/titulares'
import { navigate, paths } from '../lib/router'
import { cn } from '../lib/cn'
import { Button } from './ui/Button'
import { Amount, Pct } from './ui/Amount'
import { ProductAvatar } from './ui/icons'
import { TitularAvatar } from './Titulares'

export const TILE =
  'relative flex h-full w-full min-w-0 flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-3.5 pt-4 text-left shadow-[0_1px_2px_rgba(15,23,42,0.04)]'

/** Lo que se ve dentro de una ventanilla. */
export function TileBody({ p, pos, titular, multi, mensual }: { p: Producto; pos: Position; titular?: Titular; multi: boolean; mensual: boolean }) {
  const meta = PRODUCT_META[p.tipo]
  const sinMovimientos = pos.estado === 'sin-movimientos'
  return (
    <>
      <span className="absolute inset-x-0 top-0 h-1" style={{ backgroundColor: meta.color }} aria-hidden />
      <span className="flex min-w-0 items-center gap-2">
        <ProductAvatar tipo={p.tipo} size="xs" />
        <span className="truncate text-[11px] font-semibold tracking-wide uppercase" style={{ color: meta.text }}>
          {meta.label}
        </span>
        {mensual && (
          <span className="ml-auto inline-flex shrink-0 items-center rounded bg-fuchsia-50 p-0.5 text-fuchsia-700" title="Recibe una transferencia mensual">
            <CalendarSync className="size-3.5" aria-label="Recibe una transferencia mensual" />
          </span>
        )}
      </span>
      <span className="mt-2 line-clamp-2 min-h-[2.5rem] text-sm leading-5 font-semibold text-slate-900">{p.nombre}</span>
      <span className="mt-auto pt-2">
        <Amount value={pos.saldo} className="block text-lg leading-tight font-bold tracking-tight text-slate-900" />
        <span className="mt-0.5 block text-xs">
          {sinMovimientos ? (
            <span className="text-slate-400">Sin movimientos</span>
          ) : p.tipo === 'deposito' && pos.deposito ? (
            <span className="font-semibold text-amber-700">{fmtPct(pos.deposito.tae / 100)} TAE</span>
          ) : (
            <Pct value={pos.rentabilidad} className="font-semibold" />
          )}
        </span>
      </span>
      {multi && titular && (
        <span className="mt-2.5 flex min-w-0 items-center gap-1.5 border-t border-slate-100 pt-2 text-xs text-slate-500">
          <TitularAvatar titular={titular} size="xs" />
          <span className="truncate">{titular.nombre}</span>
        </span>
      )}
    </>
  )
}

/** Botones «Antes» / «Después» de una ventanilla en el modo «Ordenar». */
export function MoveButtons({ p, index, count, onMove }: { p: Producto; index: number; count: number; onMove: (id: string, dir: -1 | 1) => void }) {
  return (
    <span className="mt-3 grid grid-cols-2 gap-1.5">
      <button
        type="button"
        onClick={() => onMove(p.id, -1)}
        disabled={index === 0}
        aria-label={`Poner antes ${p.nombre}`}
        className="inline-flex h-9 items-center justify-center gap-0.5 rounded-lg bg-white text-[13px] font-semibold text-brand-700 shadow-sm ring-1 ring-slate-200 hover:bg-brand-50 disabled:opacity-35"
      >
        <ChevronLeft className="size-4" strokeWidth={2.6} /> Antes
      </button>
      <button
        type="button"
        onClick={() => onMove(p.id, 1)}
        disabled={index === count - 1}
        aria-label={`Poner después ${p.nombre}`}
        className="inline-flex h-9 items-center justify-center gap-0.5 rounded-lg bg-white text-[13px] font-semibold text-brand-700 shadow-sm ring-1 ring-slate-200 hover:bg-brand-50 disabled:opacity-35"
      >
        Después <ChevronRight className="size-4" strokeWidth={2.6} />
      </button>
    </span>
  )
}

export interface TileItem {
  p: Producto
  pos: Position
  titular?: Titular
  mensual: boolean
}

/** Ventanilla normal: al tocarla se abre (con lo que se puede hacer). */
function Tile({ item, multi }: { item: TileItem; multi: boolean }) {
  const { p } = item
  return (
    <li className="min-w-0" data-tile={p.id}>
      <button
        type="button"
        onClick={() => openInvestment(p.id)}
        aria-label={`${p.nombre}: abrir para ver y hacer un movimiento`}
        className={cn(TILE, 'transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md focus-visible:outline-2 focus-visible:outline-brand-500 active:translate-y-0')}
      >
        <TileBody p={p} pos={item.pos} titular={item.titular} multi={multi} mensual={item.mensual} />
      </button>
    </li>
  )
}

/** Mientras se carga lo de arrastrar: las mismas ventanillas, con «Antes» / «Después». */
function PlainSortGrid({ items, multi, onMove }: { items: TileItem[]; multi: boolean; onMove: (id: string, dir: -1 | 1) => void }) {
  return (
    <ul className={GRID}>
      {items.map((it, i) => (
        <li key={it.p.id} className="min-w-0" data-tile={it.p.id}>
          <div className={cn(TILE, SORTING_TILE)}>
            <span className="mb-2 flex items-center justify-between gap-2">
              <PositionBadge n={i + 1} />
            </span>
            <TileBody p={it.p} pos={it.pos} titular={it.titular} multi={multi} mensual={it.mensual} />
            <MoveButtons p={it.p} index={i} count={items.length} onMove={onMove} />
          </div>
        </li>
      ))}
    </ul>
  )
}

export function PositionBadge({ n }: { n: number }) {
  return (
    <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-brand-600 px-1.5 text-xs font-bold text-white" aria-label={`Puesto ${n}`}>
      {n}
    </span>
  )
}

export const GRID = 'grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4'
export const SORTING_TILE = 'border-dashed border-brand-300 bg-brand-50/30'

// Arrastrar para ordenar (con su librería) solo se carga al pulsar «Ordenar».
const SortableGrid = lazy(() => import('./InvestmentTilesSortable'))

/**
 * «Mis inversiones»: una ventanilla por inversión (fondo, cartera, depósito…), en el orden que
 * elija el usuario. Al tocar una se abre y se puede hacer cualquier movimiento. Con «Ordenar»
 * se cambian de sitio (arrastrando o con «Antes» / «Después»).
 */
export function InvestmentTiles({ fin }: { fin: FinanceData }) {
  const { ds, positions, lookup } = fin
  const reorder = useData((s) => s.reorderProductos)
  const [sorting, setSorting] = useState(false)
  const multi = ds.titulares.length > 1
  const visibles = ds.productos.filter((p) => positions.get(p.id) && positions.get(p.id)!.estado !== 'cerrado')
  const cerrados = ds.productos.length - visibles.length
  const ids = visibles.map((p) => p.id)
  const conMensual = new Set(ds.programadas.filter((x) => x.destino.kind === 'producto').map((x) => x.destino.id))
  const items: TileItem[] = visibles.map((p) => ({ p, pos: positions.get(p.id)!, titular: lookup.titulares.get(p.titularId), mensual: conMensual.has(p.id) }))
  const sorting2 = sorting && visibles.length > 1
  const onMove = (id: string, dir: -1 | 1) => reorder(moveInList(ids, id, dir))

  return (
    <section aria-labelledby="mis-inversiones" className="mt-5 lg:mt-6">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-x-3 gap-y-2">
        <div className="min-w-0">
          <h2 id="mis-inversiones" className="text-base font-semibold text-slate-900">
            Mis inversiones
          </h2>
          <p className="text-sm text-slate-500">
            {sorting2
              ? 'Arrastra cada una con ⠿ o pulsa «Antes» / «Después». El orden se guarda solo.'
              : visibles.length
                ? 'Toca una para verla y hacer un movimiento'
                : 'Aquí verás una ventanilla por cada inversión'}
          </p>
        </div>
        <div className="flex min-w-0 shrink flex-wrap justify-end gap-2">
          {sorting2 ? (
            <Button
              icon={Check}
              onClick={() => {
                setSorting(false)
                // El orden se guarda al moverlas; con «Deshacer» (arriba) vuelve al de antes de ordenar.
                toast('Orden guardado')
              }}
            >
              Listo
            </Button>
          ) : (
            <>
              {visibles.length > 1 && (
                <Button variant="secondary" icon={ArrowUpDown} onClick={() => setSorting(true)}>
                  Ordenar
                </Button>
              )}
              {visibles.length > 0 && (
                <Button variant="secondary" icon={Calculator} onClick={openValores}>
                  Valores
                </Button>
              )}
              <Button variant="soft" icon={Plus} onClick={() => openProduct({ abrirVentanilla: true })} aria-label="Nueva inversión">
                Nueva
              </Button>
            </>
          )}
        </div>
      </div>

      {sorting2 ? (
        <Suspense fallback={<PlainSortGrid items={items} multi={multi} onMove={onMove} />}>
          <SortableGrid items={items} multi={multi} onMove={onMove} onReorder={reorder} />
        </Suspense>
      ) : (
        <ul className={GRID}>
          {items.map((it) => (
            <Tile key={it.p.id} item={it} multi={multi} />
          ))}
          <li className="min-w-0">
            <button
              type="button"
              onClick={() => openProduct({ abrirVentanilla: true })}
              className="flex h-full min-h-[9.5rem] w-full flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-slate-300 p-3.5 text-center text-sm font-semibold text-slate-500 transition-colors hover:border-brand-400 hover:bg-brand-50/40 hover:text-brand-700"
            >
              <span className="inline-flex size-9 items-center justify-center rounded-full bg-slate-100">
                <Plus className="size-5" strokeWidth={2.6} />
              </span>
              Nueva inversión
              <span className="text-xs font-normal text-slate-400">Fondo, cartera, depósito…</span>
            </button>
          </li>
        </ul>
      )}

      {cerrados > 0 && !sorting2 && (
        <button
          type="button"
          onClick={() => navigate(paths.productos())}
          className="mt-3 text-sm font-semibold text-brand-700 hover:text-brand-900"
        >
          {cerrados === 1 ? 'Hay 1 inversión cerrada (ya sin dinero): verla en Inversiones' : `Hay ${cerrados} inversiones cerradas (ya sin dinero): verlas en Inversiones`}
        </button>
      )}
    </section>
  )
}
