import { useEffect, useMemo, useRef, useState } from 'react'
import type { FlowGraph, FlowLink, FlowNode } from '../../lib/flow'
import { fmtEUR, HIDDEN } from '../../lib/format'
import { useHidden } from '../ui/Amount'
import { Segmented } from '../ui/Segmented'

interface LaidNode extends FlowNode {
  x: number
  y0: number
  y1: number
  /** Altura proporcional al importe. */
  h: number
  /** Posición de la columna dentro de las visibles (0 = izquierda). */
  slot: number
  /** Nombre partido en líneas (máx. 2). */
  lines: string[]
}

interface LaidLink extends FlowLink {
  key: string
  width: number
  sx: number
  sy: number
  tx: number
  ty: number
  color: string
}

type Column = 0 | 1 | 2

const NODE_W = 14
const PAD = 14
const LINE_H = 14.5
const TOP = 34
const BOTTOM = 12
/** Por debajo de este ancho el diagrama se muestra en dos pasos. */
const NARROW = 640

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [width, setWidth] = useState(0)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver((entries) => setWidth(Math.round(entries[0].contentRect.width)))
    ro.observe(el)
    setWidth(Math.round(el.getBoundingClientRect().width))
    return () => ro.disconnect()
  }, [])
  return [ref, width] as const
}

function truncate(s: string, max: number) {
  return s.length > max ? `${s.slice(0, max - 1)}…` : s
}

/** Parte un texto en un máximo de `maxLines` líneas de `max` caracteres. */
function wrap(text: string, max: number, maxLines = 2): string[] {
  if (text.length <= max) return [text]
  const lines: string[] = []
  let cur = ''
  for (const w of text.split(' ')) {
    const next = cur ? `${cur} ${w}` : w
    if (next.length <= max || !cur) cur = next
    else {
      lines.push(cur)
      cur = w
    }
  }
  if (cur) lines.push(cur)
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines - 1)
    kept.push(truncate(lines.slice(maxLines - 1).join(' '), max))
    return kept
  }
  return lines.map((l) => truncate(l, max))
}

/** Altura mínima del hueco de un nodo para que quepan sus textos. */
const minSlot = (lines: number) => 20 + LINE_H * lines

function layout(graph: FlowGraph, W: number, labelW: number, visible: Column[], rowH: number, charW: number) {
  const columns: FlowNode[][] = visible.map(() => [])
  for (const n of graph.nodes) {
    const slot = visible.indexOf(n.column)
    if (slot >= 0) columns[slot].push(n)
  }
  const visibleIds = new Set(columns.flat().map((n) => n.id))
  const graphLinks = graph.links.filter((l) => visibleIds.has(l.source) && visibleIds.has(l.target))

  const maxCount = Math.max(1, ...columns.map((c) => c.length))
  const xs = visible.length === 3 ? [labelW, Math.round(W / 2 - NODE_W / 2), W - labelW - NODE_W] : [labelW, W - labelW - NODE_W]
  const last = visible.length - 1
  // Caracteres que caben en cada columna (la central llega hasta la derecha).
  const charsFor = (slot: number) =>
    Math.max(10, Math.floor((slot > 0 && slot < last ? xs[last] - xs[slot] - NODE_W - 24 : labelW - 14) / charW))
  const linesOf = new Map<string, string[]>()
  for (const [ci, col] of columns.entries()) for (const n of col) linesOf.set(n.id, wrap(n.label, charsFor(ci)))
  const slotOf = (n: FlowNode) => minSlot(linesOf.get(n.id)?.length ?? 1)

  const innerH = Math.max(220, maxCount * rowH)
  const totals = columns.map((c) => c.reduce((s, n) => s + n.value, 0))
  const maxTotal = Math.max(...totals, 1)
  const scale = (innerH - PAD * (maxCount - 1)) / maxTotal

  const laid = new Map<string, LaidNode>()
  const colHeights = columns.map((col) => col.reduce((s, n) => s + Math.max(slotOf(n), n.value * scale), 0) + PAD * Math.max(0, col.length - 1))
  const height = Math.max(...colHeights)

  columns.forEach((col, ci) => {
    let y = TOP + (height - colHeights[ci]) / 2
    for (const n of col) {
      const h = Math.max(2, n.value * scale)
      const slotH = Math.max(slotOf(n), h)
      const y0 = y + (slotH - h) / 2
      laid.set(n.id, { ...n, x: xs[ci], y0, y1: y0 + h, h, slot: ci, lines: linesOf.get(n.id) ?? [n.label] })
      y += slotH + PAD
    }
  })

  // Posición de cada flujo dentro de su nodo: las salidas se ordenan por la
  // altura del destino y las entradas por la del origen (menos cruces).
  const yOf = (id: string) => laid.get(id)?.y0 ?? 0
  const bySource = new Map<string, FlowLink[]>()
  const byTarget = new Map<string, FlowLink[]>()
  for (const l of graphLinks) {
    bySource.set(l.source, [...(bySource.get(l.source) ?? []), l])
    byTarget.set(l.target, [...(byTarget.get(l.target) ?? []), l])
  }
  const stack = (groups: Map<string, FlowLink[]>, other: (l: FlowLink) => string, out: Map<FlowLink, number>) => {
    for (const [id, ls] of groups) {
      const n = laid.get(id)
      if (!n) continue
      ls.sort((a, b) => yOf(other(a)) - yOf(other(b)))
      const total = ls.reduce((s, l) => s + l.value * scale, 0)
      let off = n.y0 + Math.max(0, (n.h - total) / 2)
      for (const l of ls) {
        const w = l.value * scale
        out.set(l, off + w / 2)
        off += w
      }
    }
  }
  const sy = new Map<FlowLink, number>()
  const ty = new Map<FlowLink, number>()
  stack(bySource, (l) => l.target, sy)
  stack(byTarget, (l) => l.source, ty)

  const links: LaidLink[] = []
  for (const l of graphLinks) {
    const s = laid.get(l.source)
    const t = laid.get(l.target)
    if (!s || !t) continue
    links.push({
      ...l,
      key: `${l.source}|${l.target}`,
      width: Math.max(1, l.value * scale),
      sx: s.x + NODE_W,
      sy: sy.get(l) ?? (s.y0 + s.y1) / 2,
      tx: t.x,
      ty: ty.get(l) ?? (t.y0 + t.y1) / 2,
      // Cada flujo toma el color de su origen; las pérdidas, en rojo.
      color: l.kind === 'perdida' ? '#F43F5E' : s.color,
    })
  }

  return { nodes: [...laid.values()], links, height: TOP + height + BOTTOM, xs }
}

const HEADERS: Record<Column, string> = { 0: 'DE DÓNDE VIENE', 1: 'DÓNDE ESTÁ', 2: 'A DÓNDE VA' }

export function Sankey({
  graph,
  selected,
  onSelect,
  minWidth = 720,
}: {
  graph: FlowGraph
  selected?: string | null
  onSelect?: (id: string | null) => void
  minWidth?: number
}) {
  const [ref, measured] = useWidth<HTMLDivElement>()
  const hidden = useHidden()
  const [hover, setHover] = useState<string | null>(null)
  const [stage, setStage] = useState<'in' | 'out'>('in')

  const narrow = measured > 0 && measured < NARROW
  const visible: Column[] = narrow ? (stage === 'in' ? [0, 1] : [1, 2]) : [0, 1, 2]
  const W = narrow ? measured : Math.max(minWidth, measured || minWidth)
  const labelW = narrow ? Math.round(W * 0.37) : W < 820 ? 150 : W < 980 ? 190 : 220
  const rowH = narrow ? 46 : 54
  const charW = narrow ? 6.4 : 6.9
  const { nodes, links, height, xs } = useMemo(
    () => layout(graph, W, labelW, visible, rowH, charW),
    [graph, W, labelW, visible.join(), rowH, charW],
  )
  const money = (v: number) => (hidden ? `${HIDDEN} €` : fmtEUR(v, { decimals: 0 }))

  const focus = hover ?? selected ?? null
  const isLinkActive = (l: LaidLink) => !focus || l.source === focus || l.target === focus || l.key === focus
  const isNodeActive = (n: LaidNode) =>
    !focus ||
    n.id === focus ||
    links.some((l) => (l.source === focus || l.key === focus) && l.target === n.id) ||
    links.some((l) => (l.target === focus || l.key === focus) && l.source === n.id)

  const lastSlot = visible.length - 1
  const halo = { paintOrder: 'stroke', stroke: 'white', strokeWidth: 4, strokeLinejoin: 'round' } as const

  return (
    <div ref={ref} className="w-full">
      {narrow && (
        <Segmented
          className="mb-3 w-full"
          size="sm"
          ariaLabel="Parte del recorrido"
          value={stage}
          onChange={setStage}
          options={[
            { value: 'in', label: '① De dónde viene' },
            { value: 'out', label: '② A dónde va' },
          ]}
        />
      )}
      <div className={narrow ? '' : 'overflow-x-auto'}>
        <svg
          width={W}
          height={height}
          viewBox={`0 0 ${W} ${height}`}
          role="img"
          aria-label="Diagrama del flujo del dinero: de dónde viene, dónde está y a dónde va"
          className="block select-none"
          onClick={() => onSelect?.(null)}
        >
          {visible.map((col, i) => (
            <text
              key={col}
              x={xs[i] + NODE_W / 2}
              y={14}
              textAnchor={narrow ? (i === 0 ? 'end' : 'start') : 'middle'}
              dx={narrow ? (i === 0 ? NODE_W / 2 : -NODE_W / 2) : 0}
              className="fill-slate-400 text-[10.5px] font-semibold tracking-[0.08em]"
            >
              {HEADERS[col]}
            </text>
          ))}

          <g fill="none">
            {links.map((l) => {
              const xm = (l.sx + l.tx) / 2
              const active = isLinkActive(l)
              return (
                <path
                  key={l.key}
                  d={`M${l.sx},${l.sy} C${xm},${l.sy} ${xm},${l.ty} ${l.tx},${l.ty}`}
                  stroke={l.color}
                  strokeWidth={l.width}
                  strokeOpacity={active ? (focus ? 0.55 : 0.32) : 0.07}
                  className="cursor-pointer transition-[stroke-opacity] duration-150"
                  onMouseEnter={() => setHover(l.key)}
                  onMouseLeave={() => setHover(null)}
                  onClick={(e) => {
                    e.stopPropagation()
                    onSelect?.(l.source === selected ? l.target : l.source)
                  }}
                >
                  <title>{`${nodes.find((n) => n.id === l.source)?.label} → ${nodes.find((n) => n.id === l.target)?.label}: ${money(l.value)}`}</title>
                </path>
              )
            })}
          </g>

          {nodes.map((n) => {
            const active = isNodeActive(n)
            const cy = (n.y0 + n.y1) / 2
            const left = n.slot === 0
            const overLinks = !left && n.slot < lastSlot
            const labelX = left ? n.x - 8 : n.x + NODE_W + 8
            return (
              <g
                key={n.id}
                className="cursor-pointer"
                opacity={active ? 1 : 0.35}
                onMouseEnter={() => setHover(n.id)}
                onMouseLeave={() => setHover(null)}
                onClick={(e) => {
                  e.stopPropagation()
                  onSelect?.(selected === n.id ? null : n.id)
                }}
              >
                <rect x={n.x} y={n.y0} width={NODE_W} height={n.h} rx={3} fill={n.color} />
                {selected === n.id && (
                  <rect x={n.x - 3} y={n.y0 - 3} width={NODE_W + 6} height={n.h + 6} rx={5} fill="none" stroke={n.color} strokeWidth={2} />
                )}
                {(() => {
                  const rows = n.lines.length + 1
                  const top = cy - (rows * LINE_H) / 2 + 11
                  return (
                    <>
                      <text
                        textAnchor={left ? 'end' : 'start'}
                        className={narrow ? 'fill-slate-800 text-[12px] font-semibold' : 'fill-slate-800 text-[12.5px] font-semibold'}
                        style={overLinks ? halo : undefined}
                      >
                        {n.lines.map((line, i) => (
                          <tspan key={i} x={labelX} y={top + i * LINE_H}>
                            {line}
                          </tspan>
                        ))}
                      </text>
                      <text
                        x={labelX}
                        y={top + n.lines.length * LINE_H + 1}
                        textAnchor={left ? 'end' : 'start'}
                        className={narrow ? 'fill-slate-500 text-[11px] tabular-nums' : 'fill-slate-500 text-[11.5px] tabular-nums'}
                        style={overLinks ? halo : undefined}
                      >
                        {money(n.value)}
                      </text>
                    </>
                  )
                })()}
                <title>{`${n.label}: ${money(n.value)}`}</title>
              </g>
            )
          })}
        </svg>
      </div>
    </div>
  )
}
