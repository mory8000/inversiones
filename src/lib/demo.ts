// Datos de ejemplo (ficticios) para ver cómo funciona la app.
// Las fechas se calculan respecto a hoy para que siempre parezcan recientes.

import type { Cuenta, Dataset, EntityRef, Movimiento, Producto, Titular, Valoracion, Workspace } from '../types'
import { addMonths, daysBetween, daysInMonth, splitISO } from './dates'
import { round2 } from './format'
import { inferMovementType } from './meta'
import { aplicarProgramadas } from './programadas'

let seq = 0
const demoId = (prefix: string) => `demo-${prefix}-${++seq}`

/** Fecha de hace `monthsAgo` meses, en el día `day` (sin pasarse de hoy). */
const atFor = (today: string) => (monthsAgo: number, day: number): string => {
  const base = addMonths(today, -monthsAgo)
  const [y, m] = splitISO(base)
  const d = Math.min(day, daysInMonth(y, m))
  const iso = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
  return iso > today ? today : iso
}

/** Valoraciones en % en distintas fechas: [hace cuántos meses, % de rentabilidad]. */
function valoraciones(today: string, points: [number, number][]): Valoracion[] {
  const at = atFor(today)
  return points
    .map(([monthsAgo, pct]): Valoracion => {
      const fecha = monthsAgo === 0 ? today : at(monthsAgo, 28)
      return { id: demoId('v'), fecha, modo: 'porcentaje', valor: 0, porcentaje: pct, createdAt: `${fecha}T20:00:00.000Z` }
    })
    .filter((v) => v.fecha <= today)
}

/**
 * Cuentas, productos y movimientos de ejemplo de un titular. Tiene su cuenta principal
 * «MyInvestor» (con saldo), a la que trae dinero cada mes desde su cuenta nómina (externa);
 * desde MyInvestor invierte en fondos, cartera y depósitos. Algunas aportaciones van
 * directamente desde cuentas externas.
 */
export function buildDemoWorkspace(today: string, titularId = 'demo-t-1'): Workspace {
  seq = 0
  const at = atFor(today)

  const cuenta = (nombre: string, entidad: string, iban: string, color: string, externa: boolean): Cuenta => ({
    id: demoId('c'),
    titularId,
    nombre,
    entidad,
    iban,
    color,
    notas: '',
    externa,
    createdAt: `${at(25, 1)}T09:00:00.000Z`,
  })

  const myinvestor = cuenta('MyInvestor', 'MyInvestor', 'ES76 1544 7889 0100 2233 8890', '#6366F1', false)
  const nomina = cuenta('Cuenta nómina', 'BBVA', 'ES21 0182 2370 4102 0154 4521', '#0EA5E9', true)
  const ahorro = cuenta('Cuenta ahorro', 'ING', 'ES12 1465 0100 9917 2201 3307', '#F97316', true)

  const producto = (p: Partial<Producto> & Pick<Producto, 'tipo' | 'nombre'>): Producto => ({
    id: demoId('p'),
    titularId,
    entidad: 'MyInvestor',
    isin: '',
    notas: '',
    tae: null,
    vencimiento: null,
    valoraciones: [],
    createdAt: `${at(25, 1)}T09:00:00.000Z`,
    ...p,
  })

  const vanguard = producto({ tipo: 'fondo', nombre: 'Vanguard Global Stock Index', isin: 'IE00B03HD191' })
  const fidelity = producto({ tipo: 'fondo', nombre: 'Fidelity MSCI World Index', isin: 'IE00BYX5NX33' })
  const emergentes = producto({ tipo: 'fondo', nombre: 'Vanguard Emerging Markets Stock Index', isin: 'IE0031786696' })
  const metal = producto({ tipo: 'cartera', nombre: 'Cartera indexada Metal', notas: 'Roboadvisor 100 % renta variable' })
  const dep6Inicio = at(15, 12)
  const dep6Fin = addMonths(dep6Inicio, 6)
  const dep6 = producto({ tipo: 'deposito', nombre: 'Depósito 6 meses', tae: 3, vencimiento: dep6Fin })
  // Al vencer el de 6 meses, se renueva el mismo día en uno de 12 meses.
  const dep12Inicio = dep6Fin
  const dep12 = producto({ tipo: 'deposito', nombre: 'Depósito 12 meses', tae: 2.5, vencimiento: addMonths(dep12Inicio, 12) })
  const plan = producto({ tipo: 'plan', nombre: 'Plan de pensiones indexado global' })

  const movimientos: Movimiento[] = []
  let tick = 0
  const mov = (fecha: string, origen: EntityRef, destino: EntityRef, importe: number, concepto: string) => {
    if (fecha > today) return
    tick++
    const stamp = `${fecha}T10:${String(tick % 60).padStart(2, '0')}:00.000Z`
    movimientos.push({
      id: demoId('m'),
      tipo: inferMovementType(origen.kind, destino.kind),
      fecha,
      origen,
      destino,
      importe: round2(importe),
      concepto,
      createdAt: stamp,
      updatedAt: stamp,
    })
  }
  const C = (c: Cuenta): EntityRef => ({ kind: 'cuenta', id: c.id })
  const P = (p: Producto): EntityRef => ({ kind: 'producto', id: p.id })

  // Aportaciones a MyInvestor desde la cuenta nómina (externa): una inicial y una cada mes.
  for (let i = 24; i >= 0; i--) mov(at(i, 1), C(nomina), C(myinvestor), 400, 'Aportación mensual a MyInvestor')
  mov(at(24, 3), C(nomina), C(myinvestor), 15000, 'Ahorro para invertir')
  // Fondo indexado con aportación inicial directa desde la cuenta de ahorro (externa).
  mov(at(24, 5), C(ahorro), P(fidelity), 6000, 'Aportación inicial')
  // Aportación mensual al fondo Vanguard desde MyInvestor.
  for (let i = 23; i >= 0; i--) mov(at(i, 2), C(myinvestor), P(vanguard), 200, 'Aportación mensual')
  // Cartera indexada (roboadvisor).
  mov(at(18, 10), C(myinvestor), P(metal), 3000, 'Apertura de la cartera')
  for (let i = 17; i >= 6; i--) mov(at(i, 10), C(myinvestor), P(metal), 100, 'Aportación periódica')
  // Depósito a 6 meses que vence y vuelve a MyInvestor con intereses.
  mov(dep6Inicio, C(myinvestor), P(dep6), 10000, 'Contratación depósito')
  const intereses6 = 10000 * 0.03 * (daysBetween(dep6Inicio, dep6Fin) / 365)
  mov(dep6Fin, P(dep6), C(myinvestor), 10000 + intereses6, 'Vencimiento: capital + intereses')
  // Se renueva a 12 meses.
  mov(dep12Inicio, C(myinvestor), P(dep12), 10000, 'Renovación: depósito a 12 meses')
  // Traspaso entre fondos (sin pasar por la cuenta).
  mov(at(10, 20), P(fidelity), P(emergentes), 2000, 'Diversificar en emergentes')
  // Reembolso parcial de la cartera.
  mov(at(3, 18), P(metal), C(myinvestor), 1000, 'Para vacaciones')
  // Plan de pensiones, directamente desde la cuenta nómina.
  mov(at(22, 27), C(nomina), P(plan), 1500, 'Aportación anual')
  mov(at(10, 27), C(nomina), P(plan), 1500, 'Aportación anual')

  // Valoraciones (rentabilidad en % en distintas fechas).
  const val = (p: Producto, points: [number, number][]) => {
    p.valoraciones = valoraciones(today, points)
  }
  val(vanguard, [[21, 3.1], [18, 6.4], [15, 4.2], [12, 9.8], [9, 12.5], [6, 10.1], [3, 15.2], [0, 17.8]])
  val(fidelity, [[20, 2.0], [16, 5.5], [12, 8.9], [8, 11.0], [4, 13.6], [0, 14.2]])
  val(emergentes, [[7, -1.5], [4, 2.2], [0, -3.4]])
  val(metal, [[15, 1.8], [12, 4.9], [9, 7.3], [6, 5.6], [3, 9.4], [0, 11.8]])
  val(plan, [[18, 2.5], [12, 5.0], [6, 7.2], [0, 9.1]])

  return {
    cuentas: [myinvestor, nomina, ahorro],
    productos: [vanguard, fidelity, emergentes, metal, dep12, dep6, plan],
    movimientos,
  }
}

/**
 * Ejemplo completo con dos titulares: Marta (la principal) y Pablo. Marta envía cada mes
 * 150 € de su cuenta MyInvestor al fondo de Pablo, y una vez 2.000 € a un depósito de Pablo:
 * ese dinero cuenta para Pablo, no para Marta.
 */
export function buildDemoDataset(today: string): Dataset {
  const at = atFor(today)
  const stamp = `${at(25, 1)}T09:00:00.000Z`
  const marta: Titular = { id: 'demo-t-1', codigo: '0001', nombre: 'Marta', createdAt: stamp }
  const pablo: Titular = { id: 'demo-t-2', codigo: '0002', nombre: 'Pablo', createdAt: stamp }
  const ws = buildDemoWorkspace(today, marta.id)
  const myinvestor = ws.cuentas[0]

  const productoDePablo = (p: Partial<Producto> & Pick<Producto, 'tipo' | 'nombre'>): Producto => ({
    id: demoId('p'),
    titularId: pablo.id,
    entidad: 'MyInvestor',
    isin: '',
    notas: '',
    tae: null,
    vencimiento: null,
    valoraciones: [],
    createdAt: stamp,
    ...p,
  })
  const fondoPablo = productoDePablo({
    tipo: 'fondo',
    nombre: 'Fondo indexado de Pablo',
    isin: 'IE00B03HCZ61',
    notas: 'Recibe una transferencia mensual de Marta',
    valoraciones: valoraciones(today, [[11, 1.4], [8, 3.9], [5, 6.2], [2, 7.5], [0, 9.3]]),
  })
  const depInicio = at(9, 15)
  const depositoPablo = productoDePablo({ tipo: 'deposito', nombre: 'Depósito de Pablo', tae: 2.75, vencimiento: addMonths(depInicio, 12) })

  const regalo: Movimiento = {
    id: demoId('m'),
    tipo: 'inversion',
    fecha: depInicio,
    origen: { kind: 'cuenta', id: myinvestor.id },
    destino: { kind: 'producto', id: depositoPablo.id },
    importe: 2000,
    concepto: 'Regalo de cumpleaños para Pablo',
    createdAt: `${depInicio}T11:00:00.000Z`,
    updatedAt: `${depInicio}T11:00:00.000Z`,
  }

  const ds: Dataset = {
    titulares: [marta, pablo],
    cuentas: ws.cuentas,
    productos: [...ws.productos, fondoPablo, depositoPablo],
    movimientos: [...ws.movimientos, regalo],
    programadas: [
      {
        id: 'demo-prog-1',
        origen: { kind: 'cuenta', id: myinvestor.id },
        destino: { kind: 'producto', id: fondoPablo.id },
        importe: 150,
        inicio: at(14, 5),
        fin: null,
        concepto: 'Transferencia mensual a Pablo',
        excluidos: [],
        createdAt: stamp,
        updatedAt: stamp,
      },
    ],
  }
  return aplicarProgramadas(ds, today)
}
