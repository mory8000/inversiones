import type { Cuenta, EntityRef, Movimiento, MovementKind, Producto, ProductType, Titular, Workspace } from '../types'
import { addDays, addMonths, monthKey, yearOf } from './dates'
import { fmtDateNumeric } from './format'
import { MOVEMENT_META, PRODUCT_META } from './meta'

export interface Lookup {
  cuentas: Map<string, Cuenta>
  productos: Map<string, Producto>
  titulares: Map<string, Titular>
}

export function buildLookup(ws: Workspace & { titulares?: Titular[] }): Lookup {
  return {
    cuentas: new Map(ws.cuentas.map((c) => [c.id, c])),
    productos: new Map(ws.productos.map((p) => [p.id, p])),
    titulares: new Map((ws.titulares ?? []).map((t) => [t.id, t])),
  }
}

/** Titular al que pertenece una cuenta o un producto. */
export function ownerId(lookup: Lookup, ref: EntityRef): string | undefined {
  return ref.kind === 'cuenta' ? lookup.cuentas.get(ref.id)?.titularId : lookup.productos.get(ref.id)?.titularId
}

export function ownerOf(lookup: Lookup, ref: EntityRef): Titular | undefined {
  const id = ownerId(lookup, ref)
  return id ? lookup.titulares.get(id) : undefined
}

/** ¿El movimiento va de un titular a otro? */
export function isCross(lookup: Lookup, m: Movimiento): boolean {
  const o = ownerId(lookup, m.origen)
  const d = ownerId(lookup, m.destino)
  return !!o && !!d && o !== d
}

/** ¿El movimiento toca a este titular (sale de o llega a algo suyo)? */
export function touchesTitular(lookup: Lookup, m: Movimiento, titularId: string): boolean {
  return ownerId(lookup, m.origen) === titularId || ownerId(lookup, m.destino) === titularId
}

export type { MovementKind }

/**
 * Cómo se ve un movimiento desde un titular (o desde todos, sin `titularId`):
 * un movimiento de un titular a otro es «entre titulares», salvo para quien lo recibe
 * en un producto, para quien es una inversión suya (una aportación).
 */
export function movementKind(lookup: Lookup, m: Movimiento, titularId?: string): MovementKind {
  if (!isCross(lookup, m)) return m.tipo
  if (titularId && ownerId(lookup, m.destino) === titularId && m.destino.kind === 'producto') return m.tipo
  return 'entreTitulares'
}

export function entityName(lookup: Lookup, ref: EntityRef): string {
  if (ref.kind === 'cuenta') return lookup.cuentas.get(ref.id)?.nombre ?? 'Cuenta eliminada'
  return lookup.productos.get(ref.id)?.nombre ?? 'Producto eliminado'
}

export function entityTypeLabel(lookup: Lookup, ref: EntityRef): string {
  if (ref.kind === 'cuenta') return 'Cuenta'
  const p = lookup.productos.get(ref.id)
  return p ? PRODUCT_META[p.tipo].label : 'Producto'
}

export function sameRef(a: EntityRef | null | undefined, b: EntityRef | null | undefined): boolean {
  return !!a && !!b && a.kind === b.kind && a.id === b.id
}

export function refKey(ref: EntityRef): string {
  return `${ref.kind}:${ref.id}`
}

export function parseRefKey(key: string): EntityRef | null {
  const [kind, id] = key.split(':')
  if ((kind === 'cuenta' || kind === 'producto') && id) return { kind, id }
  return null
}

export function sortMovementsDesc(movs: Movimiento[]): Movimiento[] {
  return [...movs].sort((a, b) =>
    a.fecha === b.fecha ? b.createdAt.localeCompare(a.createdAt) : b.fecha.localeCompare(a.fecha),
  )
}

// ── Filtros ─────────────────────────────────────────────────────────────────

export interface MovementFilters {
  /** Titular ('' = todos). */
  titular: string
  tipo: MovementKind | 'todos'
  /** Cuenta o producto concreto ("cuenta:id" / "producto:id"). */
  entidad: string
  productType: ProductType | 'todos'
  from: string | null
  to: string | null
  q: string
}

export const EMPTY_FILTERS: MovementFilters = {
  titular: '',
  tipo: 'todos',
  entidad: '',
  productType: 'todos',
  from: null,
  to: null,
  q: '',
}

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

export function filterMovements(movs: Movimiento[], lookup: Lookup, f: MovementFilters): Movimiento[] {
  const ref = f.entidad ? parseRefKey(f.entidad) : null
  const q = normalize(f.q.trim())
  return movs.filter((m) => {
    if (f.titular && !touchesTitular(lookup, m, f.titular)) return false
    if (f.tipo !== 'todos' && movementKind(lookup, m, f.titular || undefined) !== f.tipo) return false
    if (ref && !sameRef(m.origen, ref) && !sameRef(m.destino, ref)) return false
    if (f.productType !== 'todos') {
      const types = [m.origen, m.destino]
        .filter((r) => r.kind === 'producto')
        .map((r) => lookup.productos.get(r.id)?.tipo)
      if (!types.includes(f.productType)) return false
    }
    if (f.from && m.fecha < f.from) return false
    if (f.to && m.fecha > f.to) return false
    if (q) {
      const hay = normalize(
        [
          entityName(lookup, m.origen),
          entityName(lookup, m.destino),
          m.concepto,
          MOVEMENT_META[m.tipo].label,
          fmtDateNumeric(m.fecha),
          String(m.importe).replace('.', ','),
        ].join(' '),
      )
      if (!hay.includes(q)) return false
    }
    return true
  })
}

export interface MovementTotals {
  inversion: number
  reembolso: number
  traspaso: number
  transferencia: number
  entreTitulares: number
  count: number
}

/** Totales por tipo. Con `lookup`, los movimientos entre titulares van aparte (vistos desde `titularId`). */
export function totalsOf(movs: Movimiento[], lookup?: Lookup, titularId?: string): MovementTotals {
  const t: MovementTotals = { inversion: 0, reembolso: 0, traspaso: 0, transferencia: 0, entreTitulares: 0, count: movs.length }
  for (const m of movs) t[lookup ? movementKind(lookup, m, titularId) : m.tipo] += m.importe
  return t
}

export interface MonthGroup {
  key: string
  items: Movimiento[]
  totals: MovementTotals
}

export function groupByMonth(movs: Movimiento[], lookup?: Lookup, titularId?: string): MonthGroup[] {
  const groups = new Map<string, Movimiento[]>()
  for (const m of sortMovementsDesc(movs)) {
    const k = monthKey(m.fecha)
    const g = groups.get(k)
    if (g) g.push(m)
    else groups.set(k, [m])
  }
  return [...groups.entries()].map(([key, items]) => ({ key, items, totals: totalsOf(items, lookup, titularId) }))
}

// ── Periodos ────────────────────────────────────────────────────────────────

export interface PeriodOption {
  key: string
  label: string
  from: string | null
  to: string | null
}

export function periodOptions(movs: Movimiento[], today: string): PeriodOption[] {
  const years = [...new Set(movs.map((m) => yearOf(m.fecha)))].sort((a, b) => b - a)
  const currentYear = yearOf(today)
  const opts: PeriodOption[] = [
    { key: 'all', label: 'Todo el histórico', from: null, to: null },
    { key: 'last30', label: 'Últimos 30 días', from: addDays(today, -29), to: null },
    { key: 'last3m', label: 'Últimos 3 meses', from: addMonths(today, -3), to: null },
    { key: 'last12m', label: 'Últimos 12 meses', from: addMonths(today, -12), to: null },
    { key: 'ytd', label: `Este año (${currentYear})`, from: `${currentYear}-01-01`, to: null },
  ]
  for (const y of years) {
    if (y === currentYear) continue
    opts.push({ key: `y${y}`, label: `Año ${y}`, from: `${y}-01-01`, to: `${y}-12-31` })
  }
  return opts
}

// ── Exportación CSV (se abre directamente en Excel) ────────────────────────

function csvCell(v: string): string {
  if (/[";\n\r]/.test(v)) return `"${v.replace(/"/g, '""')}"`
  return v
}

function csvNumber(n: number): string {
  return n.toFixed(2).replace('.', ',')
}

export function movementsToCSV(movs: Movimiento[], lookup: Lookup): string {
  const header = ['Fecha', 'Tipo', 'Titular (de)', 'De', 'Tipo de origen', 'Titular (a)', 'A', 'Tipo de destino', 'Importe (€)', 'Concepto']
  const rows = sortMovementsDesc(movs).map((m) => [
    fmtDateNumeric(m.fecha),
    isCross(lookup, m) ? 'Entre titulares' : MOVEMENT_META[m.tipo].label,
    ownerOf(lookup, m.origen)?.nombre ?? '',
    entityName(lookup, m.origen),
    entityTypeLabel(lookup, m.origen),
    ownerOf(lookup, m.destino)?.nombre ?? '',
    entityName(lookup, m.destino),
    entityTypeLabel(lookup, m.destino),
    csvNumber(m.importe),
    m.concepto,
  ])
  return '\ufeff' + [header, ...rows].map((r) => r.map((c) => csvCell(String(c))).join(';')).join('\r\n')
}

// ── Contrapartes: de dónde viene / a dónde va el dinero de una cuenta o producto ──

export interface Counterpart {
  ref: EntityRef
  value: number
  count: number
}

export function counterparts(movs: Movimiento[], ref: EntityRef, direction: 'in' | 'out'): Counterpart[] {
  const map = new Map<string, Counterpart>()
  for (const m of movs) {
    const other = direction === 'in' ? (sameRef(m.destino, ref) ? m.origen : null) : sameRef(m.origen, ref) ? m.destino : null
    if (!other) continue
    const k = refKey(other)
    const c = map.get(k)
    if (c) {
      c.value += m.importe
      c.count++
    } else {
      map.set(k, { ref: other, value: m.importe, count: 1 })
    }
  }
  return [...map.values()].sort((a, b) => b.value - a.value)
}
