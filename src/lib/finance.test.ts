import { describe, expect, it } from 'vitest'
import type { Cuenta, Dataset, EntityRef, Movimiento, Producto, Valoracion, Workspace } from '../types'
import { buildTimeline, buildTimelineMulti, computeAccountStats, computePositions, computeTotals, evaluateProduct, interesEntre, recortarDesde, summarizeByType, taeEn, valorEn } from './finance'
import { titularWorkspace } from './titulares'
import { faltaDinero, saldoEn, saldoMinimoDesde } from './saldo'
import { buildFlowGraph } from './flow'
import { parseNumber, fmtEUR, fmtPct } from './format'
import { inferMovementType } from './meta'
import { buildDemoWorkspace } from './demo'
import { movementsToCSV, buildLookup, filterMovements, isDePaso, movementKind, seVeEn, seVePara, totalsOf, EMPTY_FILTERS } from './movements'
import { aplicarProgramadas, movimientosDe } from './programadas'
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

describe('el interés de un depósito puede cambiar', () => {
  // 10.000 € al 3 % desde el 1 de enero; desde el 1 de julio, al 2 %.
  const d = prod('D', 'deposito', {
    tae: 3,
    vencimiento: '2027-01-01',
    cambiosTae: [{ id: 'c1', desde: '2026-07-01', tae: 2, createdAt: '2026-07-01T09:00:00.000Z' }],
  })
  const movs = [mov('2026-01-01', C('A'), P('D'), 10000)]
  const tramo1 = (10000 * 0.03 * daysBetween('2026-01-01', '2026-07-01')) / 365
  const tramo2 = (10000 * 0.02 * daysBetween('2026-07-01', '2027-01-01')) / 365

  it('cada tramo se calcula con su TAE', () => {
    expect(taeEn(d, '2026-06-30')).toBe(3)
    expect(taeEn(d, '2026-07-01')).toBe(2)
    const antes = evaluateProduct(d, movs, { asOf: '2026-06-01', mode: 'actual' })
    expect(antes.deposito).toMatchObject({ tae: 3, taeDesde: null })
    expect(antes.deposito?.interesesHoy).toBeCloseTo((10000 * 0.03 * daysBetween('2026-01-01', '2026-06-01')) / 365, 6)
    const pos = evaluateProduct(d, movs, { asOf: '2026-10-15', mode: 'actual' })
    expect(pos.deposito).toMatchObject({ tae: 2, taeDesde: '2026-07-01' })
    expect(pos.deposito?.tramos).toEqual([
      { desde: null, tae: 3 },
      { desde: '2026-07-01', tae: 2 },
    ])
    expect(pos.deposito?.interesesHoy).toBeCloseTo(tramo1 + (10000 * 0.02 * daysBetween('2026-07-01', '2026-10-15')) / 365, 6)
    expect(pos.deposito?.interesesVencimiento).toBeCloseTo(tramo1 + tramo2, 6)
    expect(pos.saldo).toBeCloseTo(10000 + pos.deposito!.interesesHoy, 6)
  })

  it('un cambio anterior a la apertura rige desde el principio; sin cambios, como siempre', () => {
    const desdeAntes = { ...d, cambiosTae: [{ id: 'c0', desde: '2025-12-01', tae: 4, createdAt: '' }] }
    expect(interesEntre(desdeAntes, 10000, '2026-01-01', '2027-01-01')).toBeCloseTo(400, 6)
    expect(interesEntre({ tae: 2.5 }, 10000, '2026-01-01', '2027-01-01')).toBeCloseTo(250, 6)
    expect(interesEntre({ tae: 2.5 }, 0, '2026-01-01', '2027-01-01')).toBe(0)
  })

  it('también admite interés negativo', () => {
    const neg = prod('N', 'deposito', { tae: -1, vencimiento: null })
    const pos = evaluateProduct(neg, [mov('2026-01-01', C('A'), P('N'), 1000)], { asOf: '2027-01-01', mode: 'actual' })
    expect(pos.saldo).toBeCloseTo(990, 6)
    expect(pos.ganancia).toBeCloseTo(-10, 6)
  })
})

describe('rentabilidad en %, positiva o negativa', () => {
  it('si las acciones suben un 3 %, el fondo vale un 3 % más; si bajan, menos', () => {
    const movs = [mov('2026-01-10', C('A'), P('F'), 2000)]
    const sube = evaluateProduct(prod('F', 'fondo', { valoraciones: [val('2026-10-01', 'porcentaje', 3)] }), movs, { asOf: '2026-10-15', mode: 'actual' })
    expect(sube.saldo).toBeCloseTo(2060, 6)
    expect(sube.ganancia).toBeCloseTo(60, 6)
    const baja = evaluateProduct(prod('F', 'fondo', { valoraciones: [val('2026-10-01', 'porcentaje', -4.5)] }), movs, { asOf: '2026-10-15', mode: 'actual' })
    expect(baja.saldo).toBeCloseTo(1910, 6)
    expect(baja.rentabilidad).toBeCloseTo(-0.045, 6)
  })
})

describe('saldo de la cuenta principal: no se puede sacar más de lo que hay', () => {
  // MyInvestor: entran 1.000 € el 1 de marzo y salen 700 € el 1 de junio.
  const movs = [mov('2026-03-01', C('X'), C('M'), 1000), mov('2026-06-01', C('M'), P('F'), 700)]

  it('saldo de cada día y lo mínimo que habrá desde una fecha', () => {
    expect(saldoEn(movs, 'M', '2026-02-01')).toBe(0)
    expect(saldoEn(movs, 'M', '2026-04-01')).toBe(1000)
    expect(saldoEn(movs, 'M', '2026-10-15')).toBe(300)
    // Desde abril hay 1.000 €, pero en junio salen 700: solo se pueden sacar 300 sin quedarse en negativo.
    expect(saldoMinimoDesde(movs, 'M', '2026-04-01')).toBe(300)
    expect(saldoMinimoDesde(movs, 'M', '2026-02-01')).toBe(0)
  })

  it('sacar más de lo que hay se detecta (también con fecha pasada)', () => {
    const hoy = [...movs, mov('2026-10-15', C('M'), P('F'), 500)]
    expect(faltaDinero(movs, hoy, 'M', '2026-10-15')).toMatchObject({ falta: 200, disponible: 300, saldoMinimo: -200 })
    expect(faltaDinero(movs, [...movs, mov('2026-10-15', C('M'), P('F'), 300)], 'M', '2026-10-15')).toBeNull()
    // En abril había 1.000 €, pero si salen 500 entonces, en junio faltarían 200.
    const abril = [...movs, mov('2026-04-01', C('M'), P('F'), 500)]
    expect(faltaDinero(movs, abril, 'M', '2026-04-01')).toMatchObject({ falta: 200, disponible: 300 })
    // Antes de que entrara el dinero no había nada.
    expect(faltaDinero(movs, [...movs, mov('2026-02-01', C('M'), P('F'), 10)], 'M', '2026-02-01')).toMatchObject({ falta: 10, disponible: 0 })
  })

  it('un cambio que mejora una cuenta que ya estaba en negativo no se bloquea', () => {
    const negativa = [mov('2026-03-01', C('M'), P('F'), 1000)]
    const menos = [mov('2026-03-01', C('M'), P('F'), 800)]
    expect(faltaDinero(negativa, menos, 'M', '2026-03-01')).toBeNull()
    const mas = [mov('2026-03-01', C('M'), P('F'), 1200)]
    expect(faltaDinero(negativa, mas, 'M', '2026-03-01')).toMatchObject({ falta: 200 })
  })
})

describe('cuentas, totales y resumen', () => {
  const ws: Workspace = {
    cuentas: [
      { id: 'A', titularId: 'T', nombre: 'A', entidad: '', iban: '', color: '#000', notas: '', externa: true, createdAt: '' },
      { id: 'B', titularId: 'T', nombre: 'B', entidad: '', iban: '', color: '#000', notas: '', externa: true, createdAt: '' },
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
    const totals = computeTotals(ws, positions, computeAccountStats(ws))
    const tl = buildTimeline(ws, today)
    const last = tl[tl.length - 1]
    expect(last.fecha).toBe(today)
    expect(totals.efectivo).toBeGreaterThan(0)
    expect(last.patrimonio).toBeCloseTo(totals.patrimonio, 4)
    // La línea del dinero puesto incluye lo que hay sin invertir en MyInvestor.
    expect(last.capital).toBeCloseTo(totals.capital + totals.efectivo, 4)
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
      { id: 'C1', titularId: 'T1', nombre: 'Cuenta de T1', entidad: '', iban: '', color: '#000', notas: '', externa: true, createdAt: '' },
      { id: 'C2', titularId: 'T2', nombre: 'Cuenta de T2', entidad: '', iban: '', color: '#000', notas: '', externa: true, createdAt: '' },
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

  describe('las líneas del gráfico', () => {
    const dsBase = (): Dataset => ({
      titulares: [
        { id: 'T1', codigo: '', nombre: 'Luis', createdAt: '' },
        { id: 'T2', codigo: '', nombre: 'Fondo ahorro', createdAt: '' },
      ],
      cuentas: [
        { id: 'MY', titularId: 'T1', nombre: 'MyInvestor', entidad: '', iban: '', color: '#000', notas: '', externa: false, createdAt: '' },
        { id: 'BBVA', titularId: 'T1', nombre: 'Banco', entidad: '', iban: '', color: '#000', notas: '', externa: true, createdAt: '' },
        { id: 'C2', titularId: 'T2', nombre: 'Cuenta ahorro', entidad: '', iban: '', color: '#000', notas: '', externa: false, createdAt: '' },
      ],
      productos: [prod('F', 'fondo', { titularId: 'T1' }), prod('F2', 'fondo', { titularId: 'T2' })],
      movimientos: [mov('2026-01-01', C('BBVA'), C('MY'), 5000), mov('2026-01-05', C('MY'), P('F2'), 300)],
      programadas: [],
    })
    const cifras = (ds: Dataset) => {
      const positions = computePositions(ds, '2026-10-15')
      const accounts = computeAccountStats(ds)
      const de = (titularId: string) => {
        const ws = titularWorkspace(ds, titularId)
        const own = new Map([...positions].filter(([id]) => ws.productos.some((p) => p.id === id)))
        const ownAccounts = new Map([...accounts].filter(([id]) => ws.cuentas.some((c) => c.id === id)))
        return computeTotals(ws, own, ownAccounts)
      }
      return { luis: de('T1'), ahorro: de('T2') }
    }
    const puntos = [
      { fecha: '2026-01-01', 'T1:p': 5000, 'T1:c': 5000, 'T2:p': 0, 'T2:c': 0 },
      { fecha: '2026-09-30', 'T1:p': 4700, 'T1:c': 4700, 'T2:p': 300, 'T2:c': 300 },
      { fecha: '2026-10-16', 'T1:p': 4600, 'T1:c': 4600, 'T2:p': 500, 'T2:c': 500 },
      { fecha: '2026-11-30', 'T1:p': 5000, 'T1:c': 4800, 'T2:p': 650, 'T2:c': 650 },
    ]

    it('empiezan a marcar en la fecha acordada: lo anterior no se dibuja', () => {
      const ds = dsBase()
      const visibles = ['T1', 'T2'].map((id) => ({ id, ws: titularWorkspace(ds, id) }))
      const out = recortarDesde(puntos, '2026-10-17', visibles, ds.movimientos, buildLookup(ds))
      // El primer punto es ayer (aunque no estuviera en el gráfico) y ya no queda nada de antes.
      expect(out.map((p) => p.fecha)).toEqual(['2026-10-17', '2026-11-30'])
      // El punto de ayer lleva lo que había ese día: lo mismo que su tarjeta.
      expect(out[0]['T1:p']).toBeCloseTo(cifras(ds).luis.patrimonio, 6)
      expect(out[0]['T2:p']).toBeCloseTo(cifras(ds).ahorro.patrimonio, 6)
      expect(out[1]['T1:p']).toBe(5000)
    })

    it('si la fecha ya estaba en el gráfico, se queda tal cual', () => {
      const ds = dsBase()
      const visibles = ['T1', 'T2'].map((id) => ({ id, ws: titularWorkspace(ds, id) }))
      const out = recortarDesde(puntos, '2026-10-16', visibles, ds.movimientos, buildLookup(ds))
      expect(out.map((p) => p.fecha)).toEqual(['2026-10-16', '2026-11-30'])
      expect(out[0]['T2:p']).toBe(500)
    })

    it('el valor del día de arranque es el mismo que el de la tarjeta', () => {
      const ds = dsBase()
      const v = valorEn(titularWorkspace(ds, 'T1'), '2026-10-15', ds.movimientos, buildLookup(ds))
      const luis = cifras(ds).luis
      expect(v.patrimonio).toBeCloseTo(luis.patrimonio, 6)
      expect(v.capital).toBeCloseTo(luis.patrimonio - luis.ganancia, 6)
    })
  })

})

describe('el principal y el «Fondo ahorro», cada uno por su lado', () => {
  const cuenta = (id: string, titularId: string, externa: boolean): Cuenta => ({
    id,
    titularId,
    nombre: id,
    entidad: '',
    iban: '',
    color: '#000',
    notas: '',
    externa,
    createdAt: '',
  })
  const base = (): Dataset => ({
    titulares: [
      { id: 'T1', codigo: '', nombre: 'Luis', createdAt: '' },
      { id: 'T2', codigo: '', nombre: 'Fondo ahorro', createdAt: '' },
    ],
    cuentas: [cuenta('MY', 'T1', false), cuenta('BBVA', 'T1', true), cuenta('C2', 'T2', false)],
    productos: [
      prod('F', 'fondo', { titularId: 'T1', valoraciones: [val('2026-09-01', 'porcentaje', 10)] }),
      prod('D', 'deposito', { titularId: 'T1', tae: 0 }),
      prod('K', 'cartera', { titularId: 'T1' }),
      prod('F2', 'fondo', { titularId: 'T2' }),
    ],
    movimientos: [
      mov('2026-01-01', C('BBVA'), C('MY'), 5000),
      mov('2026-01-02', C('MY'), P('F'), 1000),
      mov('2026-01-03', C('MY'), P('D'), 2000),
      mov('2026-01-04', C('MY'), P('K'), 500),
      mov('2026-01-05', C('MY'), P('F2'), 300),
      mov('2026-01-06', C('MY'), C('C2'), 200),
    ],
    programadas: [],
  })
  /** Las cifras de un titular, solo con lo suyo (como en su tarjeta de Inicio). */
  const totales = (ds: Dataset) => {
    const positions = computePositions(ds, '2026-10-15')
    const accounts = computeAccountStats(ds)
    const de = (titularId: string) => {
      const ws = titularWorkspace(ds, titularId)
      const own = new Map([...positions].filter(([id]) => ws.productos.some((p) => p.id === id)))
      const ownAccounts = new Map([...accounts].filter(([id]) => ws.cuentas.some((c) => c.id === id)))
      return computeTotals(ws, own, ownAccounts)
    }
    return { luis: de('T1'), ahorro: de('T2') }
  }

  it('el dinero que pasa por su MyInvestor camino del «Fondo ahorro» no cuenta para el principal: cuenta solo para el «Fondo ahorro»', () => {
    const ds = base()
    const my = computeAccountStats(ds).get('MY')!
    // MyInvestor: entran 5.000 y 500 de ellos se van al «Fondo ahorro», así que no cuentan (ni esa
    // entrada ni esa salida): quedan 4.500 que entran y 3.500 que salen a sus inversiones.
    expect(my).toMatchObject({ entradas: 4500, salidas: 3500, saldo: 1000, dePaso: 500, dePasoNoCuenta: 500, enviadoOtros: 0 })
    // Ni rastro en la cuenta: sus movimientos y «a dónde ha ido su dinero» son solo los de Luis.
    expect(my.numMovimientos).toBe(4)
    expect(my.porProducto.map((x) => x.productoId).sort()).toEqual(['D', 'F', 'K'])
    const { luis, ahorro } = totales(ds)
    // Luis: F 1.100 + D 2.000 + K 500 + MyInvestor 1.000. Su «Aportado» es lo que trajo de su banco
    // menos los 500 que se fueron al «Fondo ahorro» (entraron y se fueron: no engordan lo suyo).
    expect(luis).toMatchObject({ patrimonio: 4600, efectivo: 1000, capital: 3500, ganancia: 100, aportadoTotal: 4500 })
    // Fondo ahorro: F2 300 + C2 200, que ha recibido de Luis.
    expect(ahorro).toMatchObject({ patrimonio: 500, efectivo: 200, aportadoTotal: 500 })
  })

  it('el saldo de la cuenta principal es real: si es negativo, resta', () => {
    const ds = base()
    ds.movimientos.push(mov('2026-02-01', C('MY'), P('F'), 2000))
    // Entran 5.000; salen 3.500 a sus inversiones, 500 al «Fondo ahorro» y 2.000 más a su fondo.
    expect(computeAccountStats(ds).get('MY')!.saldo).toBe(-1000)
    const { luis } = totales(ds)
    expect(luis.efectivo).toBe(-1000)
    // F 3.300 + D 2.000 + K 500 − 1.000.
    expect(luis.patrimonio).toBeCloseTo(4800, 6)
  })

  it('con carácter retroactivo: la transferencia mensual al «Fondo ahorro», también los meses ya pasados, no baja el saldo del principal', () => {
    const programada = { id: 'p1', origen: C('MY'), destino: P('F2'), importe: 453, inicio: '2025-01-15', fin: null, concepto: '', excluidos: [], createdAt: '', updatedAt: '' }
    const ds = aplicarProgramadas({ ...base(), programadas: [programada] }, '2026-10-15')
    const meses = movimientosDe(ds, 'p1')
    // De enero de 2025 a octubre de 2026: 22 meses apuntados de golpe.
    expect(meses).toHaveLength(22)
    const lookup = buildLookup(ds)
    expect(meses.every((m) => isDePaso(lookup, m))).toBe(true)
    const my = computeAccountStats(ds).get('MY')!
    // Los 10.466 € que se han desviado al «Fondo ahorro» no cuentan: solo dejan de contar 5.000 €
    // (lo que sí había entrado); el resto no llegó a entrar y sale del saldo igual.
    expect(my.saldo).toBeCloseTo(5000 - 3500 - 500 - 22 * 453, 6)
    expect(my.entradas).toBeCloseTo(0, 6)
    expect(my.salidas).toBeCloseTo(3500 + (500 + 22 * 453 - 5000), 6)
    expect(my.dePaso).toBeCloseTo(500 + 22 * 453, 6)
    expect(my.dePasoNoCuenta).toBeCloseTo(5000, 6)
    const { luis, ahorro } = totales(ds)
    // Sin apuntar el dinero que llega de fuera, MyInvestor queda en negativo (saldo real, −8.966) y
    // lo aportado no cuenta lo que entró y se fue: los 5.000 € que llegaron son los que se fueron.
    expect(luis.efectivo).toBeCloseTo(-8966, 6)
    expect(luis.patrimonio).toBeCloseTo(3600 - 8966, 6)
    expect(luis.aportadoTotal).toBeCloseTo(0, 6)
    expect(ahorro.patrimonio).toBeCloseTo(500 + 22 * 453, 6)
    expect(ahorro.aportadoTotal).toBeCloseTo(500 + 22 * 453, 6)
    // En la evolución: el último punto de Luis es su patrimonio de hoy (el saldo es el real, así que
    // el gráfico mira también el dinero desviado, que sale de sus cuentas aunque no esté en su lista).
    const tl = buildTimelineMulti(
      [
        { id: 'T1', ws: titularWorkspace(ds, 'T1') },
        { id: 'T2', ws: titularWorkspace(ds, 'T2') },
      ],
      ds.movimientos,
      '2026-10-15',
    )
    const last = tl[tl.length - 1]
    expect(last['T1:p']).toBeCloseTo(3600 - 8966, 6)
    expect(last['T2:p']).toBeCloseTo(500 + 22 * 453, 6)
  })

  it('lo que gane o pierda el «Fondo ahorro» no cambia las cifras del principal', () => {
    const antes = totales(base())
    for (const pct of [50, -30]) {
      const ds = base()
      ds.productos = ds.productos.map((p) => (p.id === 'F2' ? { ...p, valoraciones: [val('2026-09-01', 'porcentaje', pct)] } : p))
      const { luis, ahorro } = totales(ds)
      expect(luis).toEqual(antes.luis)
      expect(ahorro.patrimonio).toBeCloseTo(300 * (1 + pct / 100) + 200, 6)
      expect(ahorro.ganancia).toBeCloseTo(300 * (pct / 100), 6)
    }
  })

  it('lo que sale de la cuenta del «Fondo ahorro» (no es el principal) sí baja su saldo', () => {
    const ds = base()
    ds.movimientos.push(mov('2026-03-01', C('C2'), C('MY'), 150))
    const stats = computeAccountStats(ds)
    expect(stats.get('C2')).toMatchObject({ saldo: 50, dePaso: 0, enviadoOtros: 150 })
    // Para Luis, lo que recibe en su MyInvestor sí es suyo.
    expect(stats.get('MY')).toMatchObject({ saldo: 1150, recibidoOtros: 150 })
  })

  it('el saldo de la cuenta es el real (lo de paso también sale); en los formularios, lo de paso no se comprueba', () => {
    const ds = base()
    const enorme = mov('2026-10-15', C('MY'), P('F2'), 50000)
    // Lo que se va al «Fondo ahorro» sale del saldo como cualquier otra salida.
    expect(saldoEn([...ds.movimientos, enorme], 'MY', '2026-10-15')).toBe(1000 - 50000)
    // Lo que el principal invierte en lo suyo sí se comprueba: 2.000 con 1.000 disponibles.
    const propia = mov('2026-10-15', C('MY'), P('F'), 2000)
    expect(faltaDinero(ds.movimientos, [...ds.movimientos, propia], 'MY', '2026-10-15')).toMatchObject({ falta: 1000, disponible: 1000 })
    // Sin titulares en los datos no hay nada «de paso»: el mismo saldo.
    expect(computeAccountStats({ cuentas: ds.cuentas, productos: ds.productos, movimientos: ds.movimientos }).get('MY')!.saldo).toBe(1000)
  })

  it('lo de paso no deja constancia en lo del principal: ni en sus movimientos, ni en su cuenta, ni en sus filtros; sí en lo del «Fondo ahorro»', () => {
    const ds = base()
    const lookup = buildLookup(ds)
    const paso = ds.movimientos.filter((m) => isDePaso(lookup, m))
    expect(paso.map((m) => m.importe)).toEqual([300, 200])
    // El espacio de Luis no los lleva; el del «Fondo ahorro», sí.
    const luis = titularWorkspace(ds, 'T1')
    const ahorro = titularWorkspace(ds, 'T2')
    expect(luis.movimientos.some((m) => paso.includes(m))).toBe(false)
    expect(luis.movimientos).toHaveLength(4)
    expect(paso.every((m) => ahorro.movimientos.includes(m))).toBe(true)
    // Desde MyInvestor no se ven; desde lo que los recibe, sí.
    for (const m of paso) {
      expect(seVeEn(lookup, m, C('MY'))).toBe(false)
      expect(seVeEn(lookup, m, m.destino)).toBe(true)
      expect(seVePara(lookup, m, 'T1')).toBe(false)
      expect(seVePara(lookup, m, 'T2')).toBe(true)
    }
    // Movimientos filtrados por titular o por cuenta.
    const ver = (f: Partial<typeof EMPTY_FILTERS>) => filterMovements(ds.movimientos, lookup, { ...EMPTY_FILTERS, ...f }).map((m) => m.importe)
    expect(ver({ titular: 'T1' })).toEqual([5000, 1000, 2000, 500])
    expect(ver({ titular: 'T2' })).toEqual([300, 200])
    expect(ver({ entidad: 'cuenta:MY' })).toEqual([5000, 1000, 2000, 500])
    expect(ver({ entidad: 'producto:F2' })).toEqual([300])
    expect(ver({ entidad: 'cuenta:C2' })).toEqual([200])
    // En «todos» siguen estando (son del «Fondo ahorro»).
    expect(ver({})).toHaveLength(6)
  })

  it('lo que va desde una cuenta externa del principal (ING) al «Fondo ahorro» es de paso: no cuenta como inversión, pero sale de su dinero', () => {
    const ds = base()
    const desdeIng = mov('2026-02-15', C('BBVA'), P('F2'), 453)
    ds.movimientos.push(desdeIng)
    const lookup = buildLookup(ds)
    expect(isDePaso(lookup, desdeIng)).toBe(true)
    const ext = computeAccountStats(ds).get('BBVA')!
    // De la cuenta externa sale de verdad (se ve en su «aportado neto»), sin figurar como movimiento suyo.
    expect(ext).toMatchObject({ salidas: 5453, dePaso: 453, numMovimientos: 1, enviadoOtros: 0 })
    expect(titularWorkspace(ds, 'T1').movimientos.includes(desdeIng)).toBe(false)
    const { luis, ahorro } = totales(ds)
    // Los 453 salen de su bolsillo igual: de lo que le quedaba en su «MyInvestor» (1.000), así que
    // le quedan 547. No engorda su «Aportado» (ese dinero no es inversión suya).
    expect(luis).toMatchObject({ patrimonio: 4147, efectivo: 547, aportadoTotal: 4047, numMovimientos: 4 })
    expect(ahorro.patrimonio).toBe(953)
    expect(ahorro.aportadoTotal).toBe(953)
    // Desde el «Fondo ahorro» (no es el principal), lo que sale de sus cuentas no es de paso.
    expect(isDePaso(lookup, mov('2026-03-01', C('C2'), C('MY'), 10))).toBe(false)
  })

  it('un ingreso de 1.000 € deja 547 € en la cuenta principal cuando ese mes se van 453 al «Fondo ahorro» (aunque la transferencia esté puesta en la cuenta externa)', () => {
    const ds = base()
    const antes = totales(ds)
    // Ese mes: entran 1.000 € a MyInvestor desde el banco y la transferencia de 453 € sale de la
    // cuenta externa (la «Cuenta Nómina») camino del «Fondo ahorro».
    ds.movimientos.push(mov('2026-02-15', C('BBVA'), P('F2'), 453))
    ds.movimientos.push(mov('2026-02-20', C('BBVA'), C('MY'), 1000))
    const despues = totales(ds)
    expect(despues.luis.efectivo - antes.luis.efectivo).toBeCloseTo(547, 6)
    expect(despues.luis.aportadoTotal - antes.luis.aportadoTotal).toBeCloseTo(547, 6)
    // El «Fondo ahorro» recibe sus 453 igual.
    expect(despues.ahorro.patrimonio - antes.ahorro.patrimonio).toBe(453)
  })

  it('un ingreso puntual al «Fondo ahorro» sale de la cuenta principal aunque se apunte desde la cuenta externa', () => {
    const ds = base()
    const antes = totales(ds).luis
    ds.movimientos.push(mov('2026-02-16', C('BBVA'), P('F2'), 500))
    const despues = totales(ds).luis
    expect(antes.efectivo).toBe(1000)
    expect(despues.efectivo).toBe(500)
    // No engorda su «Aportado»: es dinero que pasa al «Fondo ahorro».
    expect(despues.aportadoTotal).toBe(antes.aportadoTotal - 500)
    expect(totales(ds).ahorro.patrimonio).toBe(1000)
  })

  it('la línea del gráfico acaba en el mismo dinero que la tarjeta', () => {
    const ds = base()
    ds.movimientos.push(mov('2026-02-15', C('BBVA'), P('F2'), 453))
    const luis = totales(ds).luis
    const tl = buildTimelineMulti([{ id: 'T1', ws: titularWorkspace(ds, 'T1') }], ds.movimientos, '2026-10-15', buildLookup(ds))
    const ultimo = tl[tl.length - 1]
    expect(ultimo['T1:p']).toBeCloseTo(luis.patrimonio, 6)
    // El capital de la línea lleva también el dinero sin invertir (lo que se ve en «En cuentas»).
    expect(ultimo['T1:c']).toBeCloseTo(luis.patrimonio - luis.ganancia, 6)
  })

  it('en el flujo del dinero, lo de paso sale como «Aportaciones» del «Fondo ahorro», no de MyInvestor', () => {
    const ds = base()
    const g = buildFlowGraph(ds, computePositions(ds, '2026-10-15'), { from: null, to: null })
    const node = (id: string) => g.nodes.find((x) => x.id === id)
    const my = node('L:c:MY')!
    // MyInvestor solo lleva lo que Luis invierte en lo suyo (F 1.000 + D 2.000 + K 500).
    expect(my.value).toBe(3500)
    expect(g.links.some((l) => l.source === my.id && l.target === 'M:F2')).toBe(false)
    const ap = node('L:aportaciones:T2')!
    expect(ap).toMatchObject({ kind: 'aportaciones', label: 'Aportaciones · Fondo ahorro', value: 300 })
    expect(g.links.find((l) => l.source === ap.id)).toMatchObject({ target: 'M:F2', value: 300 })
    // La transferencia a la cuenta del «Fondo ahorro» va a la lista de transferencias (como antes).
    expect(g.transfers.map((m) => m.importe)).toEqual([5000, 200])
  })

  it('el valor del día de arranque es el mismo que el de la tarjeta', () => {
    const ds = base()
    const v = valorEn(titularWorkspace(ds, 'T1'), '2026-10-15', ds.movimientos, buildLookup(ds))
    const luis = totales(ds).luis
    expect(v.patrimonio).toBeCloseTo(luis.patrimonio, 6)
    expect(v.capital).toBeCloseTo(luis.patrimonio - luis.ganancia, 6)
  })
  it('el Excel que descarga la app: un libro vivo alrededor de la tabla de movimientos', async () => {
    const { computeFinance } = await import('../store/useFinance')
    const { buildExcel } = await import('./excel')
    const ds = base()
    ds.lineaDesde = '2026-10-14'
    const fin = computeFinance(ds, '2026-10-15')
    const buf = await buildExcel(fin)
    // Un zip (todo .xlsx es un zip): empieza por «PK».
    const bytes = new Uint8Array(buf)
    expect(bytes[0]).toBe(0x50) // «P»
    expect(bytes[1]).toBe(0x4b) // «K»
    // Se vuelve a abrir (como haría Excel).
    const ExcelJS = await import('exceljs')
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(buf)
    // Las hojas: el panel primero, la tabla fuente, y las que se calculan solas.
    expect(wb.worksheets.map((h) => h.name)).toEqual(['Inicio', 'Movimientos', 'Cuentas', 'Inversiones', 'Transferencias', 'Listas'])
    expect(wb.getWorksheet('Listas')!.state).toBe('hidden')
    // El panel: la tarjeta de Luis con sus cifras, y la fórmula que lo calcula.
    const inicio = wb.getWorksheet('Inicio')!
    expect(inicio.getCell('A1').value).toBe('Mis inversiones')
    expect(inicio.getCell('A4').value).toBe('Luis')
    const patrimonio = inicio.getCell('B7').value as { formula: string; result: number }
    expect(patrimonio.formula).toBe('B5+B6')
    expect(patrimonio.result).toBeCloseTo(totales(ds).luis.patrimonio, 6)
    // La tabla de movimientos: cabecera y la primera aportación.
    const mov = wb.getWorksheet('Movimientos')!
    expect(mov.getCell('A5').value).toBe('Fecha')
    expect(mov.getCell('G5').value).toBe('Concepto')
    // El primer movimiento es la aportación desde el banco (cuenta externa → MyInvestor).
    expect(mov.getCell('B6').value).toBe('Ingreso')
    expect(mov.getCell('F6').value).toBe(5000)
    // Y hay filas vacías con los desplegables listos para seguir registrando.
    expect(mov.getCell('B7').value).toBe('Compra')
    expect(mov.getCell('B' + (6 + 30)).dataValidation?.type).toBe('list')
    // Desplegables: tipo, titular, de y a.
    expect(mov.getCell('B6').dataValidation?.type).toBe('list')
    expect(mov.getCell('D6').dataValidation?.type).toBe('list')
    // La columna «Va a (titular)» se calcula sola (BUSCARV sobre la hoja Listas).
    expect((mov.getCell('H6').value as { formula?: string }).formula ?? '').toContain('VLOOKUP(')
    // Las cuentas se calculan solas con SUMIFS sobre la tabla.
    const formula = (c: { value: unknown }) => (c.value as { formula?: string }).formula ?? ''
    const cue = wb.getWorksheet('Cuentas')!
    expect(formula(cue.getCell('D5'))).toContain('SUMIFS(Movimientos!')
    expect(formula(cue.getCell('E5'))).toContain('SUMIFS(Movimientos!')
    // Las inversiones: capital con SUMIFS, % editable y saldo calculado.
    const inv = wb.getWorksheet('Inversiones')!
    expect(formula(inv.getCell('G6'))).toContain('SUMIFS(Movimientos!')
    expect(formula(inv.getCell('J6'))).toContain('*(1+')
    // Los nombres de las listas existen.
    expect(wb.definedNames.model.map((d: { name: string }) => d.name)).toEqual(expect.arrayContaining(['TiposMov', 'ListaTitulares', 'ListaEntidades']))
  })

})
