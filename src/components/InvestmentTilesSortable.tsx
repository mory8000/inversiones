// Ventanillas que se pueden arrastrar para ordenarlas (se carga solo al pulsar «Ordenar»).

import { GripVertical } from 'lucide-react'
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, arrayMove, rectSortingStrategy, sortableKeyboardCoordinates, useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { cn } from '../lib/cn'
import { GRID, MoveButtons, PositionBadge, SORTING_TILE, TILE, TileBody, type TileItem } from './InvestmentTiles'

function SortableTile({ item, multi, index, count, onMove }: { item: TileItem; multi: boolean; index: number; count: number; onMove: (id: string, dir: -1 | 1) => void }) {
  const { p } = item
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: p.id })
  return (
    <li ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className={cn('min-w-0', isDragging && 'relative z-20')} data-tile={p.id}>
      <div className={cn(TILE, SORTING_TILE, isDragging && 'shadow-xl ring-2 ring-brand-400')}>
        <span className="mb-2 flex items-center justify-between gap-2">
          <PositionBadge n={index + 1} />
          <button
            type="button"
            ref={setActivatorNodeRef}
            {...attributes}
            {...listeners}
            aria-label={`Arrastrar ${p.nombre}`}
            title="Mantén pulsado y arrastra"
            className="inline-flex size-8 cursor-grab touch-none items-center justify-center rounded-lg text-slate-500 hover:bg-white hover:text-slate-800 active:cursor-grabbing"
          >
            <GripVertical className="size-5" />
          </button>
        </span>
        <TileBody p={p} pos={item.pos} titular={item.titular} multi={multi} mensual={item.mensual} />
        <MoveButtons p={p} index={index} count={count} onMove={onMove} />
      </div>
    </li>
  )
}

export default function InvestmentTilesSortable({
  items,
  multi,
  onMove,
  onReorder,
}: {
  items: TileItem[]
  multi: boolean
  onMove: (id: string, dir: -1 | 1) => void
  onReorder: (ids: string[]) => void
}) {
  const ids = items.map((x) => x.p.id)
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return
    const from = ids.indexOf(String(active.id))
    const to = ids.indexOf(String(over.id))
    if (from < 0 || to < 0) return
    onReorder(arrayMove(ids, from, to))
  }
  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <SortableContext items={ids} strategy={rectSortingStrategy}>
        <ul className={GRID}>
          {items.map((it, i) => (
            <SortableTile key={it.p.id} item={it} multi={multi} index={i} count={items.length} onMove={onMove} />
          ))}
        </ul>
      </SortableContext>
    </DndContext>
  )
}
