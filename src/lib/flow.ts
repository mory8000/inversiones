// ─────────────────────────────────────────────────────────────────────────────
// Construye el diagrama de flujo del dinero (Sankey) en 3 columnas:
//
//   ORIGEN (de dónde viene)  →  PRODUCTO (dónde está)  →  DESTINO (a dónde va)
//
//   · Origen:  cuentas, traspasos desde otros productos y rentabilidad generada.
//              Lo que pasa «de paso» por una cuenta del principal camino de otro
//              titular sale como «Aportaciones» de quien lo recibe, no de esa cuenta.
//   · Destino: reembolsos a cuentas, traspasos a otros productos, pérdidas y
//              lo que sigue invertido (valor actual).
// ─────────────────────────────────────────────────────────────────────────────

import type { Cuenta, EntityRef, Movimiento, Producto, ProductType, Titular, Workspace } from '../types'
import { EPS, type Position } from './finance'
import { PRODUCT_META, PRODUCT_TYPES } from './meta'
import { titularColor } from './titulares'
import { buildLookup, isDePaso } from './movements'

export type FlowNodeKind =
  | 'cuenta'
  | 'aportaciones'
  | 'producto'
  | 'traspaso-in'
  | 'traspaso-out'
  | 'ganancia'
  | 'perdida'
  | 'saldo'
  | 'previo'
  | 'pendiente'

export type FlowLinkKind = 'inversion' | 'reembolso' | 'traspaso' | 'ganancia' | 'perdida' | 'saldo' | 'previo' | 'pendiente'

export interface FlowNode {
  id: string
  column: 0 | 1 | 2
  kind: FlowNodeKind
  label: string
  color: string
  value: number
  ref?: EntityRef
  tipo?: ProductType
}

export interface FlowLink {
  source: string
  target: string
  value: number
  kind: FlowLinkKind
}

export interface FlowGraph {
  nodes: FlowNode[]
  links: FlowLink[]
  /** Transferencias entre cuentas (no pasan por ningún producto). */
  transfers: Movimiento[]
  isAll: boolean
}

export interface Period {
  from: string | null
  to: string | null
}

export const FLOW_COLORS = {
  ganancia: '#10B981',
  perdida: '#F43F5E',
  saldo: '#13265C',
  previo: '#94A3B8',
  pendiente: '#1A3380',
}

export function inPeriod(m: Movimiento, period: Period): boolean {
  return (!period.from || m.fecha >= period.from) && (!period.to || m.fecha <= period.to)
}

/**
 * Con varios titulares, cada caja lleva el nombre de su dueño («Cuenta nómina · Ana») y lo que
 * sigue invertido, la rentabilidad y las pérdidas van por separado para cada titular (nunca se suman).
 */
export function buildFlowGraph(ws: Workspace & { titulares?: Titular[] }, positions: Map<string, Position>, period: Period): FlowGraph {
  const isAll = !period.from && !period.to
  const cuentas = new Map<string, Cuenta>(ws.cuentas.map((c) => [c.id, c]))
  const productos = new Map<string, Producto>(ws.productos.map((p) => [p.id, p]))
  const titulares = ws.titulares ?? []
  const multi = titulares.length > 1
  const titularName = new Map(titulares.map((t) => [t.id, t.nombre]))
  const lookup = buildLookup(ws)
  const nodes = new Map<string, FlowNode>()
  const links = new Map<string, FlowLink>()
  const transfers: Movimiento[] = []

  /** « · Ana» si hay varios titulares. */
  const suffix = (titularId: string | undefined) => (multi && titularId && titularName.has(titularId) ? ` · ${titularName.get(titularId)}` : '')
  const productName = (id: string) => {
    const p = productos.get(id)
    return p ? `${p.nombre}${suffix(p.titularId)}` : 'Producto eliminado'
  }
  const productColor = (id: string) => PRODUCT_META[productos.get(id)?.tipo ?? 'otro'].color
  /** Nodo «resumen» (sigue invertido, rentabilidad…), uno por titular si hay varios. */
  const perTitular = (base: string, titularId: string | undefined) => (multi && titularId ? `${base}:${titularId}` : base)

  const ensure = (node: Omit<FlowNode, 'value'>) => {
    if (!nodes.has(node.id)) nodes.set(node.id, { ...node, value: 0 })
    return node.id
  }
  const accountNode = (id: string, column: 0 | 2) =>
    ensure({
      id: `${column === 0 ? 'L' : 'R'}:c:${id}`,
      column,
      kind: 'cuenta',
      label: cuentas.has(id) ? `${cuentas.get(id)!.nombre}${suffix(cuentas.get(id)!.titularId)}` : 'Cuenta eliminada',
      color: cuentas.get(id)?.color ?? '#94A3B8',
      ref: { kind: 'cuenta', id },
    })
  const productNode = (id: string) =>
    ensure({
      id: `M:${id}`,
      column: 1,
      kind: 'producto',
      label: productName(id),
      color: productColor(id),
      ref: { kind: 'producto', id },
      tipo: productos.get(id)?.tipo,
    })
  const addLink = (source: string, target: string, value: number, kind: FlowLinkKind) => {
    if (value <= EPS) return
    const key = `${source}|${target}`
    const l = links.get(key)
    if (l) l.value += value
    else links.set(key, { source, target, value, kind })
  }

  for (const m of ws.movimientos) {
    if (!inPeriod(m, period)) continue
    switch (m.tipo) {
      case 'transferencia':
        transfers.push(m)
        break
      case 'inversion': {
        // Lo que pasa «de paso» por una cuenta del principal no deja constancia en ella: sale como
        // «Aportaciones» de quien lo recibe (p. ej. «Aportaciones · Fondo ahorro»).
        const t = productos.get(m.destino.id)?.titularId
        const source =
          isDePaso(lookup, m) && t
            ? ensure({ id: `L:aportaciones:${t}`, column: 0, kind: 'aportaciones', label: `Aportaciones${suffix(t)}`, color: titularColor(titulares, t) })
            : accountNode(m.origen.id, 0)
        addLink(source, productNode(m.destino.id), m.importe, 'inversion')
        break
      }
      case 'reembolso':
        addLink(productNode(m.origen.id), accountNode(m.destino.id, 2), m.importe, 'reembolso')
        break
      case 'traspaso': {
        const fromId = m.origen.id
        const toId = m.destino.id
        const inNode = ensure({
          id: `L:t:${fromId}`,
          column: 0,
          kind: 'traspaso-in',
          label: `Traspaso desde ${productName(fromId)}`,
          color: productColor(fromId),
          ref: { kind: 'producto', id: fromId },
        })
        const outNode = ensure({
          id: `R:t:${toId}`,
          column: 2,
          kind: 'traspaso-out',
          label: `Traspaso a ${productName(toId)}`,
          color: productColor(toId),
          ref: { kind: 'producto', id: toId },
        })
        addLink(inNode, productNode(toId), m.importe, 'traspaso')
        addLink(productNode(fromId), outNode, m.importe, 'traspaso')
        break
      }
    }
  }

  // Cuadrar cada producto: lo que entra = lo que sale.
  if (isAll) {
    for (const p of ws.productos) {
      const pos = positions.get(p.id)
      if (!pos) continue
      const hasNode = nodes.has(`M:${p.id}`)
      if (!hasNode && pos.saldo <= EPS) continue
      const pid = productNode(p.id)
      const t = p.titularId
      if (pos.ganancia > EPS) {
        const g = ensure({ id: perTitular('L:ganancia', t), column: 0, kind: 'ganancia', label: `Rentabilidad generada${suffix(t)}`, color: FLOW_COLORS.ganancia })
        addLink(g, pid, pos.ganancia, 'ganancia')
      } else if (pos.ganancia < -EPS) {
        const l = ensure({ id: perTitular('R:perdida', t), column: 2, kind: 'perdida', label: `Pérdidas${suffix(t)}`, color: FLOW_COLORS.perdida })
        addLink(pid, l, -pos.ganancia, 'perdida')
      }
      if (pos.saldo > EPS) {
        const color = multi && t ? titularColor(titulares, t) : FLOW_COLORS.saldo
        const s = ensure({ id: perTitular('R:saldo', t), column: 2, kind: 'saldo', label: `Sigue invertido${suffix(t)}`, color })
        addLink(pid, s, pos.saldo, 'saldo')
      }
    }
  } else {
    for (const node of [...nodes.values()]) {
      if (node.column !== 1) continue
      let inSum = 0
      let outSum = 0
      for (const l of links.values()) {
        if (l.target === node.id) inSum += l.value
        if (l.source === node.id) outSum += l.value
      }
      const diff = inSum - outSum
      const t = node.ref ? productos.get(node.ref.id)?.titularId : undefined
      if (diff > EPS) {
        const color = multi && t ? titularColor(titulares, t) : FLOW_COLORS.pendiente
        const s = ensure({ id: perTitular('R:pendiente', t), column: 2, kind: 'pendiente', label: `Sigue invertido${suffix(t)}`, color })
        addLink(node.id, s, diff, 'pendiente')
      } else if (diff < -EPS) {
        const s = ensure({
          id: perTitular('L:previo', t),
          column: 0,
          kind: 'previo',
          label: `Dinero invertido antes del periodo${suffix(t)}`,
          color: FLOW_COLORS.previo,
        })
        addLink(s, node.id, -diff, 'previo')
      }
    }
  }

  // Valor de cada nodo = máx(entradas, salidas).
  const linkList = [...links.values()]
  for (const n of nodes.values()) {
    let inSum = 0
    let outSum = 0
    for (const l of linkList) {
      if (l.target === n.id) inSum += l.value
      if (l.source === n.id) outSum += l.value
    }
    n.value = Math.max(inSum, outSum)
  }

  const ordered = orderNodes([...nodes.values()].filter((n) => n.value > EPS), linkList)
  return { nodes: ordered, links: linkList.filter((l) => l.value > EPS), transfers, isAll }
}

/** Ordena los nodos para que los flujos se crucen lo menos posible. */
function orderNodes(nodes: FlowNode[], links: FlowLink[]): FlowNode[] {
  const typeRank = (t?: ProductType) => (t ? PRODUCT_TYPES.indexOf(t) : 99)
  const middle = nodes
    .filter((n) => n.column === 1)
    .sort((a, b) => typeRank(a.tipo) - typeRank(b.tipo) || b.value - a.value)
  const index = new Map(middle.map((n, i) => [n.id, i]))

  const barycenter = (n: FlowNode) => {
    let w = 0
    let s = 0
    for (const l of links) {
      const other = l.source === n.id ? l.target : l.target === n.id ? l.source : null
      if (other === null) continue
      const i = index.get(other)
      if (i === undefined) continue
      w += l.value
      s += i * l.value
    }
    return w > 0 ? s / w : 0
  }

  const leftRank = (n: FlowNode) => (n.kind === 'ganancia' ? 2 : n.kind === 'previo' ? 1 : 0)
  const rightRank = (n: FlowNode) => (n.kind === 'saldo' || n.kind === 'pendiente' ? -1 : n.kind === 'perdida' ? 2 : 0)

  const left = nodes
    .filter((n) => n.column === 0)
    .sort((a, b) => leftRank(a) - leftRank(b) || barycenter(a) - barycenter(b) || b.value - a.value)
  const right = nodes
    .filter((n) => n.column === 2)
    .sort((a, b) => rightRank(a) - rightRank(b) || barycenter(a) - barycenter(b) || b.value - a.value)

  return [...left, ...middle, ...right]
}
