import type { Dataset, EntityRef, Titular, Workspace } from '../types'
import {
  computeAccountStats,
  computePositions,
  computeTotals,
  summarizeByType,
  type AccountStats,
  type Position,
  type Totals,
  type TypeSummary,
} from '../lib/finance'
import { buildLookup, countsForOwner, type Lookup } from '../lib/movements'
import { todayISO } from '../lib/dates'
import { titularColor, titularWorkspace } from '../lib/titulares'
import { useDataset } from './data'

/** Las cifras de un titular, por separado de las de los demás. */
export interface TitularFinance {
  titular: Titular
  /** Posición en la lista (0 = principal). */
  index: number
  color: string
  /**
   * Sus cuentas y productos, y los movimientos que le tocan (también los que vienen de o van a
   * otro titular). Al principal no le tocan los «de paso» (no dejan constancia en lo suyo), aunque
   * su saldo sí baje por ellos: el de las cuentas es el saldo real.
   */
  ws: Workspace
  /** Sus productos. */
  positions: Map<string, Position>
  /** Sus cuentas. */
  accounts: Map<string, AccountStats>
  totals: Totals
  byType: TypeSummary[]
  /** Dinero recibido de cada uno de los otros titulares en sus productos o cuentas con saldo (cuenta para él). */
  recibido: { titularId: string; importe: number }[]
  /**
   * Dinero enviado a cada uno de los otros titulares (no cuenta para él, sino para quien lo recibe).
   * Sin lo «de paso» por las cuentas del principal, que no deja constancia en lo suyo.
   */
  enviado: { titularId: string; importe: number }[]
  recibidoTotal: number
  enviadoTotal: number
  /** Recibido de otros titulares en sus cuentas externas: no suma hasta que lo invierta. */
  recibidoEnExternas: number
}

export interface FinanceData {
  ds: Dataset
  /** Todo: cuentas, productos y movimientos de todos los titulares. */
  ws: Workspace
  today: string
  lookup: Lookup
  positions: Map<string, Position>
  accounts: Map<string, AccountStats>
  /** Cada titular por separado, en orden (el primero es el principal). */
  titulares: TitularFinance[]
  byTitular: Map<string, TitularFinance>
  /** Titular al que pertenece una cuenta o un producto. */
  owner: (ref: EntityRef) => string | undefined
}

// Caché: se recalcula solo cuando cambian los datos (o el día).
const cache = new WeakMap<Dataset, FinanceData>()

const pick = <V,>(map: Map<string, V>, ids: Iterable<string>) => {
  const out = new Map<string, V>()
  for (const id of ids) {
    const v = map.get(id)
    if (v) out.set(id, v)
  }
  return out
}

export function computeFinance(ds: Dataset, today: string): FinanceData {
  const hit = cache.get(ds)
  if (hit && hit.today === today) return hit
  const positions = computePositions(ds, today)
  const lookup = buildLookup(ds)
  const accounts = computeAccountStats(ds)
  const owner = (ref: EntityRef) => (ref.kind === 'cuenta' ? lookup.cuentas.get(ref.id)?.titularId : lookup.productos.get(ref.id)?.titularId)

  const titulares = ds.titulares.map((titular, index): TitularFinance => {
    const ws = titularWorkspace(ds, titular.id)
    const own = pick(positions, ws.productos.map((p) => p.id))
    const recibido = new Map<string, number>()
    const enviado = new Map<string, number>()
    let recibidoEnExternas = 0
    for (const m of ws.movimientos) {
      const o = owner(m.origen)
      const d = owner(m.destino)
      if (!o || !d || o === d) continue
      if (d === titular.id) {
        if (countsForOwner(lookup, m.destino)) recibido.set(o, (recibido.get(o) ?? 0) + m.importe)
        else recibidoEnExternas += m.importe
      }
      if (o === titular.id) enviado.set(d, (enviado.get(d) ?? 0) + m.importe)
    }
    const list = (map: Map<string, number>) => [...map.entries()].map(([titularId, importe]) => ({ titularId, importe }))
    const sum = (map: Map<string, number>) => [...map.values()].reduce((a, b) => a + b, 0)
    const ownAccounts = pick(accounts, ws.cuentas.map((c) => c.id))
    return {
      titular,
      index,
      color: titularColor(ds.titulares, titular.id),
      ws,
      positions: own,
      accounts: ownAccounts,
      totals: computeTotals(ws, own, ownAccounts),
      byType: summarizeByType(ws, own),
      recibido: list(recibido),
      enviado: list(enviado),
      recibidoTotal: sum(recibido),
      enviadoTotal: sum(enviado),
      recibidoEnExternas,
    }
  })

  const data: FinanceData = {
    ds,
    ws: ds,
    today,
    lookup,
    positions,
    accounts,
    titulares,
    byTitular: new Map(titulares.map((t) => [t.titular.id, t])),
    owner,
  }
  cache.set(ds, data)
  return data
}

export function useFinance(): FinanceData {
  const ds = useDataset()
  return computeFinance(ds, todayISO())
}
