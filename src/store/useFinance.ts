import type { Workspace } from '../types'
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
import { buildLookup, type Lookup } from '../lib/movements'
import { todayISO } from '../lib/dates'
import { useWorkspace } from './data'

export interface FinanceData {
  ws: Workspace
  today: string
  lookup: Lookup
  positions: Map<string, Position>
  accounts: Map<string, AccountStats>
  totals: Totals
  byType: TypeSummary[]
}

// Caché: se recalcula solo cuando cambian los datos (o el día).
const cache = new WeakMap<Workspace, FinanceData>()

export function computeFinance(ws: Workspace, today: string): FinanceData {
  const hit = cache.get(ws)
  if (hit && hit.today === today) return hit
  const positions = computePositions(ws, today)
  const data: FinanceData = {
    ws,
    today,
    lookup: buildLookup(ws),
    positions,
    accounts: computeAccountStats(ws),
    totals: computeTotals(ws, positions),
    byType: summarizeByType(ws, positions),
  }
  cache.set(ws, data)
  return data
}

export function useFinance(): FinanceData {
  const ws = useWorkspace()
  return computeFinance(ws, todayISO())
}
