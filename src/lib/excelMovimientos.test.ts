// El Excel de movimientos: que se genera con la estructura prometida, sin «#¡VALOR!» y con su
// gráfico de tres columnas por cuenta.

import { describe, expect, it } from 'vitest'
import JSZip from 'jszip'
import ExcelJS from 'exceljs'
import { generarExcelMovimientos, type EntradaExcel } from './excelMovimientos'
import { entradaDesdeApp } from './excelDesdeApp'
import type { FinanceData } from '../store/useFinance'
import type { Position } from './finance'
import type { Dataset, Movimiento, Titular } from '../types'

const HOY = '2026-10-22'

const ENTRADA: EntradaExcel = {
  hoy: HOY,
  movimientos: [
    { fecha: '2026-10-01', de: 'Exterior', a: 'MyInvestor', importe: 1000 },
    { fecha: '2026-10-02', de: 'MyInvestor', a: 'Fondo indexado', importe: 400 },
    { fecha: '2026-10-03', de: 'MyInvestor', a: 'Vanguard Global Stock Index', importe: 300 },
  ],
  titulares: [
    {
      nombre: 'Marta',
      color: '#2447B8',
      grupos: [
        {
          cuenta: 'MyInvestor',
          inversiones: [
            { nombre: 'Vanguard Global Stock Index', rentabilidad: 0.1 },
            { nombre: 'Fidelity MSCI World Index', rentabilidad: null },
          ],
        },
        { cuenta: 'Cuenta nómina · BBVA', inversiones: [] },
      ],
    },
    {
      nombre: 'Fondo ahorro',
      color: '#EA580C',
      grupos: [{ cuenta: null, inversiones: [{ nombre: 'Fondo indexado', rentabilidad: 0.05 }] }],
    },
  ],
}

async function generar(entrada: EntradaExcel = ENTRADA) {
  const buffer = await generarExcelMovimientos(entrada)
  const zip = await JSZip.loadAsync(buffer)
  const libro = new ExcelJS.Workbook()
  await libro.xlsx.load(buffer)
  return { buffer, zip, hoja: libro.getWorksheet('Movimientos')! }
}

const filaDe = (hoja: ExcelJS.Worksheet, nombre: string) => {
  for (let f = 6; f <= 60; f++) if (hoja.getCell(`F${f}`).value === nombre) return f
  throw new Error(`no está ${nombre}`)
}

describe('el Excel de movimientos', () => {
  it('escribe los movimientos, con su fecha, su origen y su destino', async () => {
    const { hoja } = await generar()
    expect(hoja.getCell('B6').value).toBe('Exterior')
    expect(hoja.getCell('C6').value).toBe('MyInvestor')
    expect(hoja.getCell('D6').value).toBe(1000)
    expect(hoja.getCell('B7').value).toBe('MyInvestor')
    expect(hoja.getCell('C7').value).toBe('Fondo indexado')
  })

  it('deja una sola fila para escribir: la siguiente aparece al rellenar la anterior', async () => {
    const { hoja } = await generar()
    const reglas = (hoja as unknown as { conditionalFormattings: { rules: { formulae: string[] }[] }[] }).conditionalFormattings
    const formulas = reglas.flatMap((cf) => cf.rules.map((r) => r.formulae).flat())
    // La fila que toca se pinta; la anterior escrita se ve normal; las demás van en blanco.
    expect(formulas.some((f) => f.includes('AND($D5<>"",$D6="")'))).toBe(true)
    expect(formulas.some((f) => f === '$D5<>""')).toBe(true)
    expect(formulas.some((f) => f === '$D5=""')).toBe(true)
  })

  it('lleva el resumen de cada cuenta con sus inversiones debajo', async () => {
    const { hoja } = await generar()
    expect(filaDe(hoja, 'MyInvestor')).toBeLessThan(filaDe(hoja, 'Vanguard Global Stock Index'))
    expect(hoja.getCell(`G${filaDe(hoja, 'Vanguard Global Stock Index')}`).value).toBe('Marta')
    expect(hoja.getCell(`G${filaDe(hoja, 'Fondo indexado')}`).value).toBe('Fondo ahorro')
    expect(filaDe(hoja, 'Total MyInvestor')).toBeGreaterThan(filaDe(hoja, 'Fidelity MSCI World Index'))
    expect(filaDe(hoja, 'TOTAL')).toBeGreaterThan(filaDe(hoja, 'Total MyInvestor'))
  })

  it('escribe la rentabilidad en % (los euros y el saldo se calculan solos)', async () => {
    const { hoja } = await generar()
    const vanguard = filaDe(hoja, 'Vanguard Global Stock Index')
    expect(hoja.getCell(`I${vanguard}`).value).toBeCloseTo(0.1, 10)
    expect(hoja.getCell(`K${vanguard}`).value).toEqual({ formula: expect.stringContaining('$H9*(1+$I9') })
    expect(hoja.getCell(`J${vanguard}`).value).toEqual({ formula: expect.stringContaining('$K9-$H9') })
  })

  it('envuelve todas las fórmulas en SI.ERROR: nunca sale «#¡VALOR!»', async () => {
    const { hoja } = await generar()
    let formulas = 0
    hoja.eachRow((fila) => {
      fila.eachCell((celda) => {
        const v = celda.value as { formula?: string } | null
        if (v && typeof v === 'object' && v.formula) {
          formulas++
          expect(v.formula.startsWith('IFERROR(')).toBe(true)
        }
      })
    })
    expect(formulas).toBeGreaterThan(20)
  })

  it('los desplegables salen sin huecos y crecen solos', async () => {
    const { zip, hoja } = await generar()
    const libro = (await zip.file('xl/workbook.xml')!.async('string')) as string
    expect(libro).toContain('name="ListaNombres"')
    expect(libro).toContain('COUNTA(')
    const hojaXml = (await zip.file('xl/worksheets/sheet1.xml')!.async('string')) as string
    expect(hojaXml).toContain('<formula1>ListaNombres</formula1>')
    // Los nombres van seguidos desde la primera fila del resumen: el COUNTA no se equivoca.
    const hasta = filaDe(hoja, 'Total MyInvestor')
    const nombres: (string | null)[] = []
    for (let f = 6; f < hasta; f++) nombres.push(hoja.getCell(`F${f}`).value as string | null)
    const primerVacio = nombres.indexOf(null)
    expect(primerVacio).toBeGreaterThan(0)
    expect(nombres.slice(primerVacio).every((n) => n === null)).toBe(true)
  })

  it('pone el gráfico de tres columnas (aportado, rentabilidad y saldo) por cuenta', async () => {
    const { zip } = await generar()
    const chart = (await zip.file('xl/charts/chart1.xml')!.async('string')) as string
    const dibujo = (await zip.file('xl/drawings/drawing1.xml')!.async('string')) as string
    const tipos = (await zip.file('[Content_Types].xml')!.async('string')) as string
    const hojaXml = (await zip.file('xl/worksheets/sheet1.xml')!.async('string')) as string
    expect(chart).toContain('<c:barDir val="col"/>')
    expect(chart).toContain('<c:v>Aportado</c:v>')
    expect(chart).toContain('<c:v>Rentabilidad</c:v>')
    expect(chart).toContain('<c:v>Saldo</c:v>')
    expect(chart).toContain('$H$') // aportado
    expect(chart).toContain('$J$') // rentabilidad
    expect(chart).toContain('$K$') // saldo
    expect(dibujo).toContain('<xdr:graphicFrame')
    expect(hojaXml).toContain('<drawing r:id="rId1"/>')
    expect(tipos).toContain('/xl/charts/chart1.xml')
    expect(tipos).toContain('/xl/drawings/drawing1.xml')
  })

  it('colorea la lista: negros los tres primeros y después el color de cada titular', async () => {
    const { hoja } = await generar()
    const colorDe = (nombre: string) => (hoja.getCell(`F${filaDe(hoja, nombre)}`).font as { color?: { argb?: string } })?.color?.argb
    expect(colorDe('Exterior')).toBe('FF0F172A')
    expect(colorDe('Interés')).toBe('FF0F172A')
    expect(colorDe('MyInvestor')).toBe('FF0F172A') // el tercero
    expect(colorDe('Fidelity MSCI World Index')).toBe('FF2447B8') // azul de Marta
    expect(colorDe('Fondo indexado')).toBe('FFEA580C') // naranja del «Fondo ahorro»
  })

  it('deja filas libres al final para añadir o quitar inversiones', async () => {
    const { hoja } = await generar()
    const hasta = filaDe(hoja, 'Total MyInvestor')
    const libres: unknown[] = []
    for (let f = 6; f < hasta; f++) libres.push(hoja.getCell(`F${f}`).value)
    // Seis filas libres (más la línea en blanco antes de los totales) y ningún hueco antes.
    expect(libres.slice(-7).every((v) => v === null)).toBe(true)
    expect(libres.slice(0, -7).some((v) => v === null)).toBe(false)
  })
})

describe('el Excel se llena con los datos de la app', () => {
  const posicion = (parcial: Partial<Position>): Position =>
    ({
      productoId: 'p1',
      aportado: 0,
      traspasoEntrada: 0,
      reembolsado: 0,
      traspasoSalida: 0,
      comisiones: 0,
      invertido: 0,
      capital: 0,
      saldo: 0,
      ganancia: 0,
      rentabilidad: null,
      numMovimientos: 0,
      primeraFecha: null,
      ultimaFecha: null,
      estado: 'activo',
      metodo: 'sin-valoracion',
      valoracion: null,
      deposito: null,
      ...parcial,
    }) as Position

  const titular = (id: string, nombre: string): Titular =>
    ({ id, codigo: '0001', nombre, createdAt: '2026-01-01T00:00:00.000Z' }) as Titular

  function finDe(parcial: {
    cuentas: Dataset['cuentas']
    productos: Dataset['productos']
    movimientos: Movimiento[]
    posiciones?: Map<string, Position>
  }): FinanceData {
    const t1 = titular('t1', 'Marta')
    const ds = {
      titulares: [t1],
      cuentas: parcial.cuentas,
      productos: parcial.productos,
      movimientos: parcial.movimientos,
      programadas: [],
    } as unknown as Dataset
    const ws = {
      cuentas: parcial.cuentas,
      productos: parcial.productos,
      movimientos: parcial.movimientos,
    }
    return {
      ds,
      ws,
      today: HOY,
      lookup: {} as never,
      positions: parcial.posiciones ?? new Map(),
      accounts: new Map(),
      titulares: [{ titular: t1, index: 0, color: '#2447B8', ws } as never],
      byTitular: new Map(),
      owner: () => t1.id,
    } as unknown as FinanceData
  }

  const cuenta = (id: string, nombre: string, externa: boolean) =>
    ({ id, titularId: 't1', nombre, entidad: '', iban: '', color: '', notas: '', externa, createdAt: '2026-01-01T00:00:00.000Z' }) as Dataset['cuentas'][number]
  const producto = (id: string, nombre: string) =>
    ({
      id,
      titularId: 't1',
      tipo: 'fondo',
      nombre,
      entidad: '',
      isin: '',
      notas: '',
      tae: null,
      vencimiento: null,
      valoraciones: [],
      createdAt: '2026-01-01T00:00:00.000Z',
    }) as unknown as Dataset['productos'][number]
  const movimiento = (de: { kind: 'cuenta' | 'producto'; id: string }, a: { kind: 'cuenta' | 'producto'; id: string }, importe: number): Movimiento =>
    ({
      id: `m-${Math.random()}`,
      tipo: 'inversion',
      fecha: '2026-10-01',
      origen: de,
      destino: a,
      importe,
      concepto: '',
      createdAt: '2026-10-01T00:00:00.000Z',
      updatedAt: '2026-10-01T00:00:00.000Z',
    }) as Movimiento

  it('pone cada inversión debajo de la cuenta que la paga', () => {
    const fin = finDe({
      cuentas: [cuenta('c1', 'MyInvestor', false), cuenta('c2', 'Cuenta nómina', true)],
      productos: [producto('p1', 'Fondo uno'), producto('p2', 'Fondo dos')],
      movimientos: [
        movimiento({ kind: 'cuenta', id: 'c1' }, { kind: 'producto', id: 'p1' }, 500),
        movimiento({ kind: 'cuenta', id: 'c2' }, { kind: 'producto', id: 'p2' }, 100),
      ],
    })
    const entrada = entradaDesdeApp(fin, HOY)
    const grupos = entrada.titulares[0].grupos
    expect(grupos.find((g) => g.cuenta === 'MyInvestor')?.inversiones.map((i) => i.nombre)).toEqual(['Fondo uno'])
    expect(grupos.find((g) => g.cuenta === 'Cuenta nómina')?.inversiones.map((i) => i.nombre)).toEqual(['Fondo dos'])
  })

  it('el dinero que llega de una cuenta externa se ve como «Exterior → cuenta externa → destino»', () => {
    const fin = finDe({
      cuentas: [cuenta('c1', 'MyInvestor', false), cuenta('c2', 'Cuenta nómina', true)],
      productos: [producto('p1', 'Fondo uno')],
      movimientos: [movimiento({ kind: 'cuenta', id: 'c2' }, { kind: 'cuenta', id: 'c1' }, 900)],
    })
    const entrada = entradaDesdeApp(fin, HOY)
    expect(entrada.movimientos).toEqual([
      { fecha: '2026-10-01', de: 'Exterior', a: 'Cuenta nómina', importe: 900 },
      { fecha: '2026-10-01', de: 'Cuenta nómina', a: 'MyInvestor', importe: 900 },
    ])
  })

  it('lleva la rentabilidad de cada inversión tal y como la ve la app', () => {
    const fin = finDe({
      cuentas: [cuenta('c1', 'MyInvestor', false)],
      productos: [producto('p1', 'Fondo uno'), producto('p2', 'Fondo dos')],
      movimientos: [movimiento({ kind: 'cuenta', id: 'c1' }, { kind: 'producto', id: 'p1' }, 100)],
      posiciones: new Map([
        ['p1', posicion({ productoId: 'p1', rentabilidad: 0.07, capital: 100, saldo: 107 })],
        ['p2', posicion({ productoId: 'p2', capital: 200, saldo: 210 })],
      ]),
    })
    const entrada = entradaDesdeApp(fin, HOY)
    const inversiones = entrada.titulares[0].grupos.flatMap((g) => g.inversiones)
    expect(inversiones.find((i) => i.nombre === 'Fondo uno')?.rentabilidad).toBeCloseTo(0.07, 10)
    expect(inversiones.find((i) => i.nombre === 'Fondo dos')?.rentabilidad).toBeCloseTo(0.05, 10)
  })
})
