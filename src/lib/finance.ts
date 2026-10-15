// ─────────────────────────────────────────────────────────────────────────────
// Cálculos financieros.
//
// Se respeta la lógica del Excel original para cada producto:
//
//   Invertido  = aportado desde cuentas + recibido por traspasos
//   Capital    = Invertido − Reembolsado − Traspasado
//   Saldo      = Capital × (1 + %)            ← igual que el Excel
//   Rentab. €  = Saldo − Capital
//
// Además se admite indicar directamente el "valor actual" en € (lo que ves en
// la app del banco) y, para depósitos, se calcula el interés con la TAE y las
// fechas de apertura y vencimiento.
//
// Las cuentas con saldo (como «MyInvestor») llevan su saldo: lo que entra menos
// lo que sale. Ese dinero, aún sin invertir, suma en el patrimonio del titular.
// Las cuentas externas solo dicen de dónde viene el dinero: no llevan saldo.
// ─────────────────────────────────────────────────────────────────────────────

import type { Movimiento, Producto, ProductType, Valoracion, Workspace } from '../types'
import { addMonths, daysBetween, endOfMonth, maxDate, minDate } from './dates'
import { PRODUCT_TYPES } from './meta'

export const EPS = 0.005

export interface DepositInfo {
  /** TAE en % (2.5 = 2,5 %). */
  tae: number
  apertura: string | null
  vencimiento: string | null
  diasTotales: number | null
  diasTranscurridos: number
  diasRestantes: number | null
  /** Intereses generados hasta hoy (estimados). */
  interesesHoy: number
  /** Intereses totales al vencimiento (estimados). */
  interesesVencimiento: number | null
  vencido: boolean
}

export interface Position {
  productoId: string
  /** Dinero aportado desde cuentas. */
  aportado: number
  /** Dinero recibido por traspaso desde otros productos. */
  traspasoEntrada: number
  /** Dinero devuelto a cuentas. */
  reembolsado: number
  /** Dinero enviado por traspaso a otros productos. */
  traspasoSalida: number
  /** Columna "Invertido" del Excel = aportado + traspasos recibidos. */
  invertido: number
  /** Invertido − Reembolsado − Traspasado. */
  capital: number
  /** Valor actual. */
  saldo: number
  /** Rentabilidad en € = Saldo − Capital. */
  ganancia: number
  /** Rentabilidad en tanto por uno (0.05 = 5 %). */
  rentabilidad: number | null
  numMovimientos: number
  primeraFecha: string | null
  ultimaFecha: string | null
  estado: 'activo' | 'cerrado' | 'sin-movimientos'
  /** Cómo se ha calculado el saldo. */
  metodo: 'sin-valoracion' | 'porcentaje' | 'valor' | 'tae'
  valoracion: Valoracion | null
  deposito: DepositInfo | null
}

export interface AccountStats {
  cuentaId: string
  /** Cuenta externa (otro banco): no lleva saldo ni suma en el patrimonio. */
  externa: boolean
  /** Todo lo que ha entrado en la cuenta. */
  entradas: number
  /** Todo lo que ha salido de la cuenta. */
  salidas: number
  /**
   * Entradas − salidas. Solo cuenta en las cuentas con saldo. Si es negativo es que falta
   * apuntar de dónde vino parte del dinero (p. ej. una aportación desde una cuenta externa).
   */
  saldo: number
  /** Lo que ha entrado desde cuentas externas (aportaciones). */
  aportaciones: number
  /** Enviado desde la cuenta a productos (inversiones) del mismo titular. */
  enviado: number
  /** Recibido en la cuenta desde productos (reembolsos) del mismo titular. */
  recibido: number
  /** Transferencias a / desde otras cuentas del mismo titular. */
  transferenciasEnviadas: number
  transferenciasRecibidas: number
  /** Enviado a cuentas o productos de otros titulares (no cuenta como inversión de este titular). */
  enviadoOtros: number
  /** Recibido de cuentas o productos de otros titulares. */
  recibidoOtros: number
  /** Enviado − recibido: lo que sigue "fuera" de la cuenta, invertido. */
  netoInvertido: number
  numMovimientos: number
  primeraFecha: string | null
  ultimaFecha: string | null
  porProducto: { productoId: string; enviado: number; recibido: number }[]
}

export interface Totals {
  /** Valor de los productos + dinero en las cuentas con saldo. */
  patrimonio: number
  /** Dinero sin invertir en las cuentas con saldo (p. ej. MyInvestor). */
  efectivo: number
  /** Valor actual de los productos. */
  invertidoValor: number
  /** Capital invertido en productos (aportado − reembolsado). */
  capital: number
  ganancia: number
  rentabilidad: number | null
  /** Aportado a productos desde cuentas (suma de la columna «Invertido» sin traspasos). */
  aportado: number
  /** Reembolsado de productos a cuentas. */
  reembolsado: number
  /**
   * Dinero que ha entrado desde fuera a sus productos y cuentas con saldo: desde cuentas
   * externas o desde otros titulares. Lo que se mueve entre sus cosas no cuenta dos veces.
   */
  aportadoTotal: number
  /** Dinero que ha salido de sus productos y cuentas con saldo a sus cuentas externas. */
  retiradoTotal: number
  productosActivos: number
  numMovimientos: number
}

export interface TypeSummary {
  tipo: ProductType
  numProductos: number
  activos: number
  aportado: number
  traspasoEntrada: number
  reembolsado: number
  traspasoSalida: number
  /** Traspasos recibidos − enviados. */
  traspasosNeto: number
  invertido: number
  capital: number
  ganancia: number
  saldo: number
  rentabilidad: number | null
}

export interface TimelinePoint {
  fecha: string
  capital: number
  patrimonio: number
}

// ── Utilidades ──────────────────────────────────────────────────────────────

export function sortValuations(vals: Valoracion[]): Valoracion[] {
  return [...vals].sort((a, b) =>
    a.fecha === b.fecha ? a.createdAt.localeCompare(b.createdAt) : a.fecha.localeCompare(b.fecha),
  )
}

/** Última valoración (opcionalmente, hasta una fecha). */
export function latestValuation(p: Producto, upTo?: string): Valoracion | null {
  const sorted = sortValuations(p.valoraciones ?? [])
  for (let i = sorted.length - 1; i >= 0; i--) {
    if (upTo === undefined || sorted[i].fecha <= upTo) return sorted[i]
  }
  return null
}

/** Efecto de un movimiento sobre el capital de un producto (+ entra, − sale). */
export function productDelta(m: Movimiento, productId: string): number {
  let d = 0
  if (m.destino.kind === 'producto' && m.destino.id === productId) d += m.importe
  if (m.origen.kind === 'producto' && m.origen.id === productId) d -= m.importe
  return d
}

export function involvesProduct(m: Movimiento, productId: string): boolean {
  return (
    (m.destino.kind === 'producto' && m.destino.id === productId) ||
    (m.origen.kind === 'producto' && m.origen.id === productId)
  )
}

export function involvesAccount(m: Movimiento, cuentaId: string): boolean {
  return (
    (m.destino.kind === 'cuenta' && m.destino.id === cuentaId) || (m.origen.kind === 'cuenta' && m.origen.id === cuentaId)
  )
}

/** ¿El movimiento es posterior a la valoración? (mismo día → según hora de registro) */
function isAfterValuation(m: Movimiento, v: Valoracion): boolean {
  if (m.fecha !== v.fecha) return m.fecha > v.fecha
  return m.createdAt > v.createdAt
}

function rentabilidadDe(ganancia: number, capital: number, invertido: number): number | null {
  if (capital > EPS) return ganancia / capital
  if (invertido > EPS) return ganancia / invertido // producto cerrado: resultado sobre lo invertido
  return null
}

// ── Evaluación de un producto ───────────────────────────────────────────────

interface EvalOptions {
  /** Fecha de cálculo (hoy o una fecha del histórico). */
  asOf: string
  /**
   * 'actual': incluye todos los movimientos y la última valoración.
   * 'historico': solo lo ocurrido hasta `asOf`.
   */
  mode: 'actual' | 'historico'
}

export function evaluateProduct(p: Producto, movimientos: Movimiento[], opts: EvalOptions): Position {
  const { asOf, mode } = opts
  let aportado = 0
  let traspasoEntrada = 0
  let reembolsado = 0
  let traspasoSalida = 0
  let numMovimientos = 0
  let primeraFecha: string | null = null
  let ultimaFecha: string | null = null
  let primeraEntrada: string | null = null
  const related: Movimiento[] = []

  for (const m of movimientos) {
    if (!involvesProduct(m, p.id)) continue
    if (mode === 'historico' && m.fecha > asOf) continue
    related.push(m)
    numMovimientos++
    primeraFecha = minDate(primeraFecha, m.fecha)
    ultimaFecha = maxDate(ultimaFecha, m.fecha)
    if (m.destino.kind === 'producto' && m.destino.id === p.id) {
      primeraEntrada = minDate(primeraEntrada, m.fecha)
      if (m.origen.kind === 'cuenta') aportado += m.importe
      else traspasoEntrada += m.importe
    }
    if (m.origen.kind === 'producto' && m.origen.id === p.id) {
      if (m.destino.kind === 'cuenta') reembolsado += m.importe
      else traspasoSalida += m.importe
    }
  }

  const invertido = aportado + traspasoEntrada
  const capital = invertido - reembolsado - traspasoSalida
  const base = Math.max(0, capital)

  let saldo = base
  let metodo: Position['metodo'] = 'sin-valoracion'
  let valoracion: Valoracion | null = null
  let deposito: DepositInfo | null = null

  if (p.tipo === 'deposito') {
    metodo = 'tae'
    const tae = p.tae ?? 0
    const venc = p.vencimiento || null
    const apertura = primeraEntrada
    const fin = venc && venc < asOf ? venc : asOf
    const diasTranscurridos = apertura ? Math.max(0, daysBetween(apertura, fin)) : 0
    const diasTotales = apertura && venc ? Math.max(0, daysBetween(apertura, venc)) : null
    const interesesHoy = base * (tae / 100) * (diasTranscurridos / 365)
    const interesesVencimiento = diasTotales !== null ? base * (tae / 100) * (diasTotales / 365) : null
    saldo = base + interesesHoy
    deposito = {
      tae,
      apertura,
      vencimiento: venc,
      diasTotales,
      diasTranscurridos,
      diasRestantes: venc ? daysBetween(asOf, venc) : null,
      interesesHoy,
      interesesVencimiento,
      vencido: !!venc && asOf >= venc && base > EPS,
    }
  } else {
    valoracion = mode === 'actual' ? latestValuation(p) : latestValuation(p, asOf)
    if (valoracion) {
      if (valoracion.modo === 'porcentaje') {
        metodo = 'porcentaje'
        saldo = base * (1 + valoracion.porcentaje / 100)
      } else {
        metodo = 'valor'
        let after = 0
        for (const m of related) if (isAfterValuation(m, valoracion)) after += productDelta(m, p.id)
        saldo = Math.max(0, valoracion.valor + after)
      }
    }
  }

  if (Math.abs(saldo) < EPS) saldo = 0
  const ganancia = saldo - capital
  const estado: Position['estado'] =
    numMovimientos === 0 && saldo <= EPS ? 'sin-movimientos' : saldo <= EPS && capital <= EPS ? 'cerrado' : 'activo'

  return {
    productoId: p.id,
    aportado,
    traspasoEntrada,
    reembolsado,
    traspasoSalida,
    invertido,
    capital,
    saldo,
    ganancia,
    rentabilidad: rentabilidadDe(ganancia, capital, invertido),
    numMovimientos,
    primeraFecha,
    ultimaFecha,
    estado,
    metodo,
    valoracion,
    deposito,
  }
}

export function computePositions(ws: Workspace, today: string): Map<string, Position> {
  const map = new Map<string, Position>()
  for (const p of ws.productos) {
    map.set(p.id, evaluateProduct(p, ws.movimientos, { asOf: today, mode: 'actual' }))
  }
  return map
}

// ── Cuentas ─────────────────────────────────────────────────────────────────

/** Dueño de una cuenta o producto (si los datos lo indican). */
function ownerLookup(ws: Workspace) {
  const owners = new Map<string, string | undefined>()
  for (const c of ws.cuentas) owners.set(`cuenta:${c.id}`, c.titularId)
  for (const p of ws.productos) owners.set(`producto:${p.id}`, p.titularId)
  return (ref: Movimiento['origen']) => owners.get(`${ref.kind}:${ref.id}`)
}

/** ¿El movimiento va de un titular a otro? */
export function isBetweenTitulares(m: Movimiento, owner: (ref: Movimiento['origen']) => string | undefined): boolean {
  const o = owner(m.origen)
  const d = owner(m.destino)
  return !!o && !!d && o !== d
}

export function computeAccountStats(ws: Workspace): Map<string, AccountStats> {
  const map = new Map<string, AccountStats>()
  const perProduct = new Map<string, Map<string, { enviado: number; recibido: number }>>()
  const owner = ownerLookup(ws)
  for (const c of ws.cuentas) {
    map.set(c.id, {
      cuentaId: c.id,
      externa: c.externa,
      entradas: 0,
      salidas: 0,
      saldo: 0,
      aportaciones: 0,
      enviado: 0,
      recibido: 0,
      transferenciasEnviadas: 0,
      transferenciasRecibidas: 0,
      enviadoOtros: 0,
      recibidoOtros: 0,
      netoInvertido: 0,
      numMovimientos: 0,
      primeraFecha: null,
      ultimaFecha: null,
      porProducto: [],
    })
    perProduct.set(c.id, new Map())
  }

  const touch = (cuentaId: string, fecha: string) => {
    const s = map.get(cuentaId)
    if (!s) return null
    s.numMovimientos++
    s.primeraFecha = minDate(s.primeraFecha, fecha)
    s.ultimaFecha = maxDate(s.ultimaFecha, fecha)
    return s
  }

  const externas = new Set(ws.cuentas.filter((c) => c.externa).map((c) => c.id))
  for (const m of ws.movimientos) {
    const cross = isBetweenTitulares(m, owner)
    // Saldo: lo que entra menos lo que sale.
    if (m.origen.kind === 'cuenta') {
      const s = map.get(m.origen.id)
      if (s) s.salidas += m.importe
    }
    if (m.destino.kind === 'cuenta') {
      const s = map.get(m.destino.id)
      if (s) {
        s.entradas += m.importe
        if (m.origen.kind === 'cuenta' && externas.has(m.origen.id) && m.origen.id !== m.destino.id) s.aportaciones += m.importe
      }
    }
    if (m.origen.kind === 'cuenta') {
      const s = touch(m.origen.id, m.fecha)
      if (s) {
        if (m.destino.kind === 'producto') {
          if (cross) s.enviadoOtros += m.importe
          else s.enviado += m.importe
          const pp = perProduct.get(m.origen.id)!
          const e = pp.get(m.destino.id) ?? { enviado: 0, recibido: 0 }
          e.enviado += m.importe
          pp.set(m.destino.id, e)
        } else if (cross) {
          s.enviadoOtros += m.importe
        } else {
          s.transferenciasEnviadas += m.importe
        }
      }
    }
    if (m.destino.kind === 'cuenta') {
      const s = m.origen.kind === 'cuenta' && m.origen.id === m.destino.id ? map.get(m.destino.id) : touch(m.destino.id, m.fecha)
      if (s) {
        if (m.origen.kind === 'producto') {
          if (cross) s.recibidoOtros += m.importe
          else s.recibido += m.importe
          const pp = perProduct.get(m.destino.id)!
          const e = pp.get(m.origen.id) ?? { enviado: 0, recibido: 0 }
          e.recibido += m.importe
          pp.set(m.origen.id, e)
        } else if (cross) {
          s.recibidoOtros += m.importe
        } else {
          s.transferenciasRecibidas += m.importe
        }
      }
    }
  }

  for (const [id, s] of map) {
    s.saldo = s.entradas - s.salidas
    if (Math.abs(s.saldo) < EPS) s.saldo = 0
    s.netoInvertido = s.enviado - s.recibido
    s.porProducto = [...(perProduct.get(id) ?? new Map()).entries()]
      .map(([productoId, v]) => ({ productoId, ...v }))
      .sort((a, b) => b.enviado + b.recibido - (a.enviado + a.recibido))
  }
  return map
}

// ── Totales y resumen por tipo ──────────────────────────────────────────────

/** Dinero en una cuenta con saldo que suma en el patrimonio (nunca menos de 0). */
export const efectivoDe = (s: AccountStats | undefined): number => (s && !s.externa ? Math.max(0, s.saldo) : 0)

export function computeTotals(ws: Workspace, positions: Map<string, Position>, accounts?: Map<string, AccountStats>): Totals {
  let patrimonio = 0
  let capital = 0
  let ganancia = 0
  let productosActivos = 0
  for (const pos of positions.values()) {
    patrimonio += pos.saldo
    capital += pos.capital
    ganancia += pos.ganancia
    if (pos.estado === 'activo') productosActivos++
  }
  // Lo aportado y lo reembolsado salen de los productos: el dinero que llega a un producto
  // cuenta para su dueño, venga de la cuenta que venga (también de otro titular).
  let aportado = 0
  let reembolsado = 0
  for (const pos of positions.values()) {
    aportado += pos.aportado
    reembolsado += pos.reembolsado
  }
  // El dinero que hay en las cuentas con saldo (p. ej. MyInvestor) también es del titular.
  let efectivo = 0
  if (accounts) for (const c of ws.cuentas) if (!c.externa) efectivo += efectivoDe(accounts.get(c.id))
  const invertidoValor = patrimonio
  patrimonio += efectivo

  // Lo que entra «desde fuera» y lo que sale «a fuera» (sin contar lo que se mueve entre sus cosas).
  const suyo = new Set<string>()
  for (const p of ws.productos) suyo.add(`producto:${p.id}`)
  for (const c of ws.cuentas) if (!c.externa) suyo.add(`cuenta:${c.id}`)
  const susExternas = new Set(ws.cuentas.filter((c) => c.externa).map((c) => `cuenta:${c.id}`))
  let aportadoTotal = 0
  let retiradoTotal = 0
  for (const m of ws.movimientos) {
    const o = `${m.origen.kind}:${m.origen.id}`
    const d = `${m.destino.kind}:${m.destino.id}`
    if (suyo.has(d) && !suyo.has(o)) aportadoTotal += m.importe
    if (suyo.has(o) && susExternas.has(d)) retiradoTotal += m.importe
  }
  return {
    patrimonio,
    efectivo,
    invertidoValor,
    capital,
    ganancia,
    rentabilidad: capital > EPS ? ganancia / capital : aportado > EPS ? ganancia / aportado : null,
    aportado,
    reembolsado,
    aportadoTotal,
    retiradoTotal,
    productosActivos,
    numMovimientos: ws.movimientos.length,
  }
}

export function summarizeByType(ws: Workspace, positions: Map<string, Position>): TypeSummary[] {
  const rows = new Map<ProductType, TypeSummary>()
  for (const tipo of PRODUCT_TYPES) {
    rows.set(tipo, {
      tipo,
      numProductos: 0,
      activos: 0,
      aportado: 0,
      traspasoEntrada: 0,
      reembolsado: 0,
      traspasoSalida: 0,
      traspasosNeto: 0,
      invertido: 0,
      capital: 0,
      ganancia: 0,
      saldo: 0,
      rentabilidad: null,
    })
  }
  for (const p of ws.productos) {
    const pos = positions.get(p.id)
    const r = rows.get(p.tipo)
    if (!pos || !r) continue
    r.numProductos++
    if (pos.estado === 'activo') r.activos++
    r.aportado += pos.aportado
    r.traspasoEntrada += pos.traspasoEntrada
    r.reembolsado += pos.reembolsado
    r.traspasoSalida += pos.traspasoSalida
    r.invertido += pos.invertido
    r.capital += pos.capital
    r.ganancia += pos.ganancia
    r.saldo += pos.saldo
  }
  for (const r of rows.values()) {
    r.traspasosNeto = r.traspasoEntrada - r.traspasoSalida
    r.rentabilidad = r.capital > EPS ? r.ganancia / r.capital : r.invertido > EPS ? r.ganancia / r.invertido : null
  }
  return [...rows.values()].filter((r) => r.numProductos > 0)
}

// ── Evolución en el tiempo ──────────────────────────────────────────────────

/** Fechas del gráfico de evolución: inicio, fin de cada mes y hoy. */
export function timelineDates(movimientos: Movimiento[], today: string, maxPoints = 48): string[] {
  if (movimientos.length === 0) return []
  let first: string | null = null
  let last: string | null = null
  for (const m of movimientos) {
    first = minDate(first, m.fecha)
    last = maxDate(last, m.fecha)
  }
  if (!first || !last) return []
  const end = last > today ? last : today

  // Fechas: inicio, fin de cada mes y hoy.
  const dates: string[] = [first]
  let cursor = endOfMonth(first)
  const months: string[] = []
  while (cursor < end) {
    months.push(cursor)
    cursor = endOfMonth(addMonths(cursor.slice(0, 8) + '01', 1))
  }
  const step = Math.max(1, Math.ceil(months.length / maxPoints))
  months.forEach((d, i) => {
    if (i % step === step - 1 || i === months.length - 1) dates.push(d)
  })
  if (dates[dates.length - 1] !== end) dates.push(end)

  return [...new Set(dates)].sort()
}

/**
 * Capital y patrimonio en una fecha del histórico: productos y dinero de las cuentas con saldo
 * (que suma en los dos, porque es dinero puesto que aún no se ha invertido).
 */
function valueAt(ws: Workspace, fecha: string): { capital: number; patrimonio: number } {
  let capital = 0
  let patrimonio = 0
  for (const p of ws.productos) {
    const pos = evaluateProduct(p, ws.movimientos, { asOf: fecha, mode: 'historico' })
    capital += pos.capital
    patrimonio += pos.saldo
  }
  for (const c of ws.cuentas) {
    if (c.externa) continue
    let saldo = 0
    for (const m of ws.movimientos) {
      if (m.fecha > fecha) continue
      if (m.destino.kind === 'cuenta' && m.destino.id === c.id) saldo += m.importe
      if (m.origen.kind === 'cuenta' && m.origen.id === c.id) saldo -= m.importe
    }
    const efectivo = Math.max(0, saldo)
    capital += efectivo
    patrimonio += efectivo
  }
  return { capital, patrimonio }
}

export function buildTimeline(ws: Workspace, today: string, maxPoints = 48): TimelinePoint[] {
  return timelineDates(ws.movimientos, today, maxPoints).map((fecha) => ({ fecha, ...valueAt(ws, fecha) }))
}

/** Un punto del gráfico con varios titulares: `${id}:p` (patrimonio) y `${id}:c` (capital) de cada uno. */
export type MultiTimelinePoint = { fecha: string } & Record<string, number | string>

/** Evolución de varios titulares en las mismas fechas, cada uno por separado (no se suman). */
export function buildTimelineMulti(series: { id: string; ws: Workspace }[], all: Movimiento[], today: string): MultiTimelinePoint[] {
  return timelineDates(all, today).map((fecha) => {
    const point: MultiTimelinePoint = { fecha }
    for (const s of series) {
      const v = valueAt(s.ws, fecha)
      point[`${s.id}:p`] = v.patrimonio
      point[`${s.id}:c`] = v.capital
    }
    return point
  })
}

/** Evolución de un único producto (capital vs. valor). */
export function buildProductTimeline(p: Producto, movimientos: Movimiento[], today: string): TimelinePoint[] {
  const own = movimientos.filter((m) => involvesProduct(m, p.id))
  if (own.length === 0) return []
  const ws: Workspace = { cuentas: [], productos: [p], movimientos: own }
  return buildTimeline(ws, today, 36)
}
