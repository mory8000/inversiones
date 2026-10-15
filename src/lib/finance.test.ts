import { describe, expect, it } from 'vitest'
import type { EntityRef, Movimiento, Producto, Valoracion, Workspace } from '../types'
import { buildTimeline, computeAccountStats, computePositions, computeTotals, evaluateProduct, summarizeByType } from './finance'
import { buildFlowGraph } from './flow'
import { parseNumber, fmtEUR, fmtPct } from './format'
import { inferMovementType } from './meta'
import { buildDemoWorkspace } from './demo'
import { movementsToCSV, buildLookup, filterMovements, movementKind, totalsOf, EMPTY_FILTERS } from './movements'
import { addMonths, daysBetween } from './dates'

let n = 0
const C = (id: string): EntityRef => ({ kind: 'cuenta', id })
const P = (id: string): EntityRef => ({ kind: 'producto', id })
const mov = (fecha: string, origen: EntityRef, destino: EntityRef, importe: number): Movimiento => {
  n++
  const stamp = `${fecha}T10:00:${String(n % 60).padStart(2, '0')}.000Z`
  return { id: `m${n}`, tipo: inferMovementType(origen.kind, destino.kind), fecha, origen, destino, importe, concepto: '', createdAt: stamp, updatedAt: stamp }
}
const prod = (id: string, tipo: Producto['tipo'], extra: Partial<Producto> = {}): Producto => ({
  id,
  titularId: 'T',
  tipo,
  nombre: id,
  entidad: '',
  isin: '',
  notas: '',
  tae: null,
  vencimiento: null,
  valoraciones: [],
  createdAt: '2025-01-01T00:00:00.000Z',
  ...extra,
})
const val = (fecha: string, modo: Valoracion['modo'], x: number): Valoracion => ({
  id: `v-${fecha}-${x}`,
  fecha,
  modo,
  valor: modo === 'valor' ? x : 0,
  porcentaje: modo === 'porcentaje' ? x : 0,
  createdAt: `${fecha}T20:00:00.000Z`,
})

describe('fórmula del Excel', () => {
  it('Saldo = (Invertido − Reembolso − Traspaso) × (1 + %)', () => {
    const f = prod('F', 'fondo', { valoraciones: [val('2025-06-01', 'porcentaje', 10)] })
    const movs = [
      mov('2025-01-10', C('A'), P('F'), 1000),
      mov('2025-02-10', P('F'), C('A'), 200),
      mov('2025-03-10', P('F'), P('G'), 100),
    ]
    const pos = evaluateProduct(f, movs, { asOf: '2025-07-01', mode: 'actual' })
    expect(pos.invertido).toBe(1000)
    expect(pos.reembolsado).toBe(200)
    expect(pos.traspasoSalida).toBe(100)
    expect(pos.capital).toBe(700)
    expect(pos.saldo).toBeCloseTo(770, 6)
    expect(pos.ganancia).toBeCloseTo(70, 6)
    expect(pos.rentabilidad).toBeCloseTo(0.1, 6)
  })

  it('sin valoración el saldo es el capital (0 %)', () => {
    const f = prod('F', 'fondo')
    const pos = evaluateProduct(f, [mov('2025-01-10', C('A'), P('F'), 500)], { asOf: '2025-07-01', mode: 'actual' })
    expect(pos.saldo).toBe(500)
    expect(pos.ganancia).toBe(0)
    expect(pos.metodo).toBe('sin-valoracion')
  })

  it('valor actual en € + movimientos posteriores', () => {
    const f = prod('F', 'fondo', { valoraciones: [val('2025-05-01', 'valor', 1100)] })
    const movs = [mov('2025-01-10', C('A'), P('F'), 1000), mov('2025-06-01', C('A'), P('F'), 500)]
    const pos = evaluateProduct(f, movs, { asOf: '2025-07-01', mode: 'actual' })
    expect(pos.capital).toBe(1500)
    expect(pos.saldo).toBe(1600)
    expect(pos.ganancia).toBe(100)
  })

  it('reembolso total con ganancia → producto cerrado con resultado positivo', () => {
    const f = prod('F', 'fondo')
    const movs = [mov('2025-01-10', C('A'), P('F'), 1000), mov('2025-06-10', P('F'), C('A'), 1200)]
    const pos = evaluateProduct(f, movs, { asOf: '2025-07-01', mode: 'actual' })
    expect(pos.saldo).toBe(0)
    expect(pos.ganancia).toBe(200)
    expect(pos.estado).toBe('cerrado')
    expect(pos.rentabilidad).toBeCloseTo(0.2, 6)
  })
})

describe('depósitos', () => {
  const d = prod('D', 'deposito', { tae: 2.5, vencimiento: '2027-01-01' })
  const movs = [mov('2026-01-01', C('A'), P('D'), 10000)]

  it('calcula los intereses generados hasta hoy y al vencimiento', () => {
    const pos = evaluateProduct(d, movs, { asOf: '2026-07-02', mode: 'actual' })
    const days = daysBetween('2026-01-01', '2026-07-02')
    expect(pos.deposito?.interesesHoy).toBeCloseTo((10000 * 0.025 * days) / 365, 6)
    expect(pos.deposito?.interesesVencimiento).toBeCloseTo(250, 6)
    expect(pos.saldo).toBeCloseTo(10000 + (10000 * 0.025 * days) / 365, 6)
    expect(pos.deposito?.vencido).toBe(false)
  })

  it('después del vencimiento los intereses no siguen creciendo', () => {
    const pos = evaluateProduct(d, movs, { asOf: '2027-03-01', mode: 'actual' })
    expect(pos.deposito?.interesesHoy).toBeCloseTo(250, 6)
    expect(pos.deposito?.vencido).toBe(true)
  })

  it('al reembolsar capital + intereses queda cerrado con la ganancia', () => {
    const all = [...movs, mov('2027-01-01', P('D'), C('A'), 10250)]
    const pos = evaluateProduct(d, all, { asOf: '2027-03-01', mode: 'actual' })
    expect(pos.saldo).toBe(0)
    expect(pos.ganancia).toBe(250)
    expect(pos.estado).toBe('cerrado')
  })
})

describe('cuentas, totales y resumen', () => {
  const ws: Workspace = {
    cuentas: [
      { id: 'A', titularId: 'T', nombre: 'A', entidad: '', iban: '', color: '#000', notas: '', createdAt: '' },
      { id: 'B', titularId: 'T', nombre: 'B', entidad: '', iban: '', color: '#000', notas: '', createdAt: '' },
    ],
    productos: [prod('F1', 'fondo', { valoraciones: [val('2025-12-01', 'porcentaje', 10)] }), prod('F2', 'fondo'), prod('K', 'cartera')],
    movimientos: [
      mov('2025-01-01', C('A'), C('B'), 3000),
      mov('2025-01-02', C('A'), P('F1'), 2000),
      mov('2025-01-03', C('B'), P('K'), 1000),
      mov('2025-02-01', P('F1'), P('F2'), 500),
      mov('2025-03-01', P('K'), C('B'), 300),
      mov('2025-04-01', P('F2'), P('K'), 200),
    ],
  }
  const positions = computePositions(ws, '2026-01-01')

  it('estadísticas por cuenta', () => {
    const stats = computeAccountStats(ws)
    expect(stats.get('A')).toMatchObject({ enviado: 2000, recibido: 0, transferenciasEnviadas: 3000, netoInvertido: 2000 })
    expect(stats.get('B')).toMatchObject({ enviado: 1000, recibido: 300, transferenciasRecibidas: 3000, netoInvertido: 700 })
  })

  it('los traspasos no cambian el capital total', () => {
    const totals = computeTotals(ws, positions)
    expect(totals.aportado).toBe(3000)
    expect(totals.reembolsado).toBe(300)
    expect(totals.capital).toBe(2700)
    // F1: capital 1500 × 1,10
    expect(totals.patrimonio).toBeCloseTo(1650 + 300 + 900, 6)
  })

  it('resumen por tipo con traspasos netos', () => {
    const rows = summarizeByType(ws, positions)
    const fondos = rows.find((r) => r.tipo === 'fondo')!
    const carteras = rows.find((r) => r.tipo === 'cartera')!
    expect(fondos.aportado).toBe(2000)
    expect(fondos.traspasosNeto).toBe(-200)
    expect(fondos.capital).toBe(1800)
    expect(carteras.traspasosNeto).toBe(200)
    expect(carteras.capital).toBe(900)
  })

  it('el diagrama de flujo cuadra en cada producto', () => {
    const graph = buildFlowGraph(ws, positions, { from: null, to: null })
    for (const node of graph.nodes.filter((x) => x.column === 1)) {
      const inSum = graph.links.filter((l) => l.target === node.id).reduce((s, l) => s + l.value, 0)
      const outSum = graph.links.filter((l) => l.source === node.id).reduce((s, l) => s + l.value, 0)
      expect(inSum).toBeCloseTo(outSum, 6)
    }
    expect(graph.transfers).toHaveLength(1)
  })

  it('el diagrama por periodo también cuadra', () => {
    const graph = buildFlowGraph(ws, positions, { from: '2025-02-01', to: '2025-12-31' })
    for (const node of graph.nodes.filter((x) => x.column === 1)) {
      const inSum = graph.links.filter((l) => l.target === node.id).reduce((s, l) => s + l.value, 0)
      const outSum = graph.links.filter((l) => l.source === node.id).reduce((s, l) => s + l.value, 0)
      expect(inSum).toBeCloseTo(outSum, 6)
    }
  })
})

describe('evolución', () => {
  it('el último punto coincide con el patrimonio actual', () => {
    const today = '2026-10-15'
    const ws = buildDemoWorkspace(today)
    const positions = computePositions(ws, today)
    const totals = computeTotals(ws, positions)
    const tl = buildTimeline(ws, today)
    const last = tl[tl.length - 1]
    expect(last.fecha).toBe(today)
    expect(last.patrimonio).toBeCloseTo(totals.patrimonio, 4)
    expect(last.capital).toBeCloseTo(totals.capital, 4)
    expect(tl.length).toBeGreaterThan(10)
  })
})

describe('datos de ejemplo', () => {
  it('son coherentes', () => {
    const today = '2026-10-15'
    const ws = buildDemoWorkspace(today)
    const positions = computePositions(ws, today)
    for (const pos of positions.values()) {
      expect(Number.isFinite(pos.saldo)).toBe(true)
      expect(Number.isFinite(pos.ganancia)).toBe(true)
    }
    const totals = computeTotals(ws, positions)
    expect(totals.patrimonio).toBeGreaterThan(20000)
    expect(totals.ganancia).toBeGreaterThan(0)
    expect(ws.movimientos.every((m) => m.fecha <= today)).toBe(true)
    const dep6 = ws.productos.find((p) => p.nombre === 'Depósito 6 meses')!
    expect(positions.get(dep6.id)?.estado).toBe('cerrado')
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28')
  })

  it('exporta CSV con separador ; y decimales con coma', () => {
    const ws = buildDemoWorkspace('2026-10-15')
    const lookup = buildLookup(ws)
    const csv = movementsToCSV(ws.movimientos, lookup)
    expect(csv.startsWith('\ufeffFecha;Tipo;Titular (de);De;')).toBe(true)
    expect(csv).toContain(';200,00;')
    const filtered = filterMovements(ws.movimientos, lookup, { ...EMPTY_FILTERS, tipo: 'traspaso' })
    expect(filtered).toHaveLength(1)
    const searched = filterMovements(ws.movimientos, lookup, { ...EMPTY_FILTERS, q: 'vacaciones' })
    expect(searched).toHaveLength(1)
  })
})

describe('entre titulares', () => {
  // T1 envía 1.000 € de su cuenta al fondo de T2: cuenta como inversión de T2, no de T1.
  const ws: Workspace = {
    cuentas: [
      { id: 'C1', titularId: 'T1', nombre: 'Cuenta de T1', entidad: '', iban: '', color: '#000', notas: '', createdAt: '' },
      { id: 'C2', titularId: 'T2', nombre: 'Cuenta de T2', entidad: '', iban: '', color: '#000', notas: '', createdAt: '' },
    ],
    productos: [prod('F1', 'fondo', { titularId: 'T1' }), prod('F2', 'fondo', { titularId: 'T2' })],
    movimientos: [
      mov('2025-01-01', C('C1'), P('F1'), 500),
      mov('2025-02-01', C('C1'), P('F2'), 1000),
      mov('2025-03-01', C('C1'), C('C2'), 200),
    ],
  }
  const positions = computePositions(ws, '2026-01-01')
  const of = (titular: string) => {
    const own = new Map([...positions].filter(([id]) => ws.productos.find((p) => p.id === id)?.titularId === titular))
    return computeTotals(ws, own)
  }

  it('lo invertido cuenta para el dueño del producto que lo recibe', () => {
    expect(of('T1').aportado).toBe(500)
    expect(of('T1').patrimonio).toBe(500)
    expect(of('T2').aportado).toBe(1000)
    expect(of('T2').patrimonio).toBe(1000)
  })

  it('la cuenta separa lo enviado a otro titular de lo invertido en lo suyo', () => {
    const c1 = computeAccountStats(ws).get('C1')!
    expect(c1.enviado).toBe(500)
    expect(c1.enviadoOtros).toBe(1200)
    expect(c1.transferenciasEnviadas).toBe(0)
    expect(c1.netoInvertido).toBe(500)
    const c2 = computeAccountStats(ws).get('C2')!
    expect(c2.recibidoOtros).toBe(200)
  })

  it('se ven como «entre titulares», salvo para quien lo recibe en un producto', () => {
    const lookup = buildLookup(ws)
    const [own, toFund, toAccount] = ws.movimientos
    expect(movementKind(lookup, own)).toBe('inversion')
    expect(movementKind(lookup, toFund)).toBe('entreTitulares')
    expect(movementKind(lookup, toFund, 'T1')).toBe('entreTitulares')
    expect(movementKind(lookup, toFund, 'T2')).toBe('inversion')
    expect(movementKind(lookup, toAccount, 'T2')).toBe('entreTitulares')
    const t1 = filterMovements(ws.movimientos, lookup, { ...EMPTY_FILTERS, titular: 'T1', tipo: 'inversion' })
    expect(t1.map((m) => m.importe)).toEqual([500])
    const t2 = filterMovements(ws.movimientos, lookup, { ...EMPTY_FILTERS, titular: 'T2' })
    expect(t2).toHaveLength(2)
    expect(totalsOf(t2, lookup, 'T2')).toMatchObject({ inversion: 1000, entreTitulares: 200 })
    expect(totalsOf(ws.movimientos, lookup)).toMatchObject({ inversion: 500, entreTitulares: 1200 })
  })

  it('el diagrama separa lo que sigue invertido de cada titular', () => {
    const titulares = [
      { id: 'T1', codigo: '', nombre: 'Ana', createdAt: '' },
      { id: 'T2', codigo: '', nombre: 'Luis', createdAt: '' },
    ]
    const g = buildFlowGraph({ ...ws, titulares }, positions, { from: null, to: null })
    const saldo = g.nodes.filter((n) => n.kind === 'saldo').map((n) => `${n.label}=${n.value}`)
    expect(saldo.sort()).toEqual(['Sigue invertido · Ana=500', 'Sigue invertido · Luis=1000'])
    expect(g.nodes.find((n) => n.id === 'L:c:C1')?.label).toBe('Cuenta de T1 · Ana')
  })
})

describe('formato', () => {
  it('interpreta importes escritos de muchas formas', () => {
    expect(parseNumber('1.234,56')).toBe(1234.56)
    expect(parseNumber('1234,56')).toBe(1234.56)
    expect(parseNumber('1234.56')).toBe(1234.56)
    expect(parseNumber('1.234')).toBe(1234)
    expect(parseNumber('1.234.567,8')).toBe(1234567.8)
    expect(parseNumber('12.5')).toBe(12.5)
    expect(parseNumber('0.5')).toBe(0.5)
    expect(parseNumber('1 000 €')).toBe(1000)
    expect(parseNumber('-3,5 %')).toBe(-3.5)
    expect(parseNumber('abc')).toBeNull()
    expect(parseNumber('')).toBeNull()
  })

  it('formatea en euros y porcentajes', () => {
    expect(fmtEUR(1234.5)).toBe('1.234,50\u00a0€')
    expect(fmtEUR(-0.001)).toBe('0,00\u00a0€')
    expect(fmtEUR(50, { sign: true })).toBe('+50,00\u00a0€')
    expect(fmtPct(0.0523, { sign: true })).toBe('+5,23\u00a0%')
    expect(fmtPct(null)).toBe('—')
    expect(fmtEUR(-12.5)).toBe('\u221212,50\u00a0€')
    expect(fmtPct(-0.031, { sign: true })).toBe('\u22123,10\u00a0%')
  })
})
