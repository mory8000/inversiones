// El Excel de movimientos: que se genera con la estructura prometida, sin «#¡VALOR!», protegido y
// con su gráfico de dos barras por titular (aportado neto y beneficio / pérdida).

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
      grupos: [
        {
          cuenta: null,
          inversiones: [
            { nombre: 'Fondo indexado', rentabilidad: 0.05 },
            { nombre: 'iShares Developed World Index (IE) Acc EUR clase s', rentabilidad: 0.02 },
          ],
        },
      ],
    },
  ],
}

/** Dos cuentas con el mismo fondo: es el caso real que había que区分. */
const ENTRADA_REPETIDOS: EntradaExcel = {
  ...ENTRADA,
  titulares: [
    {
      nombre: 'Marta',
      color: '#2447B8',
      grupos: [
        {
          cuenta: 'Cuenta Myinvestor',
          inversiones: [{ nombre: 'iShares Developed World Index (IE) Acc EUR clase s', rentabilidad: 0.02 }],
        },
      ],
    },
    {
      nombre: 'Fondo ahorro',
      color: '#EA580C',
      grupos: [
        {
          cuenta: null,
          inversiones: [{ nombre: 'iShares Developed World Index (IE) Acc EUR clase s', rentabilidad: 0.03 }],
        },
      ],
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

const xml = async (zip: JSZip, nombre: string) => (await zip.file(nombre)!.async('string')) as string

const filaDe = (hoja: ExcelJS.Worksheet, nombre: string) => {
  for (let f = 6; f <= 80; f++) if (hoja.getCell(`F${f}`).value === nombre) return f
  throw new Error(`no está ${nombre}`)
}

const nombresDelResumen = (hoja: ExcelJS.Worksheet) => {
  const out: string[] = []
  for (let f = 6; f <= 80; f++) {
    const v = hoja.getCell(`F${f}`).value
    if (typeof v === 'string' && v.startsWith('Total ')) break
    if (typeof v === 'string') out.push(v)
  }
  return out
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

  it('tiene 500 filas de movimientos, y solo se ve la que toca', async () => {
    const { hoja, zip } = await generar()
    // 500 filas: de la 6 a la 505.
    expect(hoja.getCell('A6').value).toBeInstanceOf(Date)
    expect(hoja.getCell('D505').protection).toMatchObject({ locked: false })
    expect(hoja.getCell('D506').value).toBeNull()
    const hojaXml = await xml(zip, 'xl/worksheets/sheet1.xml')
    expect(hojaXml).toContain('A6:D505')
    // La fila que toca se pinta; la anterior escrita se ve normal; las demás van en blanco.
    const reglas = (hoja as unknown as { conditionalFormattings: { rules: { formulae: string[] }[] }[] })
      .conditionalFormattings
    const formulas = reglas.flatMap((cf) => cf.rules.map((r) => r.formulae).flat())
    expect(formulas.some((f) => f.includes('AND($D5<>"",$D6="")'))).toBe(true)
    expect(formulas.some((f) => f === '$D5<>""')).toBe(true)
    expect(formulas.some((f) => f === '$D5=""')).toBe(true)
  })

  it('lleva el resumen de cada cuenta con sus inversiones debajo', async () => {
    const { hoja } = await generar()
    expect(filaDe(hoja, 'MyInvestor')).toBeLessThan(filaDe(hoja, 'Vanguard Global Stock Index'))
    expect(hoja.getCell(`G${filaDe(hoja, 'Vanguard Global Stock Index')}`).value).toBe('Marta')
    expect(hoja.getCell(`G${filaDe(hoja, 'Fondo indexado')}`).value).toBe('Fondo ahorro')
    expect(filaDe(hoja, 'TOTAL')).toBeGreaterThan(filaDe(hoja, 'Total MyInvestor-Marta'))
  })

  it('acorta los nombres largos y no les añade el titular', async () => {
    const { hoja } = await generar()
    const nombres = nombresDelResumen(hoja)
    expect(nombres).toContain('iShares Developed World Index')
    expect(nombres.some((n) => n.includes('Fondo ahorro)'))).toBe(false)
    expect(nombres.some((n) => /\((?!ahorro)/.test(n))).toBe(false)
    expect(nombres.every((n) => n.length <= 32)).toBe(true)
  })

  it('si dos inversiones se llaman igual, salen las dos en corto y distintas', async () => {
    const { hoja } = await generar(ENTRADA_REPETIDOS)
    const nombres = nombresDelResumen(hoja)
    expect(nombres).toContain('iShares Developed World Index')
    expect(nombres).toContain('iShares Developed World Index 2')
    expect(nombres.filter((n) => n.startsWith('iShares')).length).toBe(2)
  })

  it('no tiene «Interés»: el interés se escribe en el % de cada producto', async () => {
    const { hoja } = await generar()
    expect(nombresDelResumen(hoja)).not.toContain('Interés')
    expect(nombresDelResumen(hoja)[0]).toBe('Exterior')
  })

  it('escribe la rentabilidad en % (los euros y el saldo se calculan solos)', async () => {
    const { hoja } = await generar()
    const vanguard = filaDe(hoja, 'Vanguard Global Stock Index')
    expect(hoja.getCell(`I${vanguard}`).value).toBeCloseTo(0.1, 10)
    expect(hoja.getCell(`K${vanguard}`).value).toEqual({ formula: expect.stringContaining('$H8*(1+$I8') })
    expect(hoja.getCell(`J${vanguard}`).value).toEqual({ formula: expect.stringContaining('$K8-$H8') })
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
    const libro = await xml(zip, 'xl/workbook.xml')
    expect(libro).toContain('name="ListaNombres"')
    expect(libro).toContain('COUNTA(')
    const hojaXml = await xml(zip, 'xl/worksheets/sheet1.xml')
    expect(hojaXml).toContain('<formula1>ListaNombres</formula1>')
    // Los nombres van seguidos desde la primera fila del resumen: el COUNTA no se equivoca.
    const hasta = filaDe(hoja, 'Total MyInvestor-Marta')
    const nombres: (string | null)[] = []
    for (let f = 6; f < hasta; f++) nombres.push(hoja.getCell(`F${f}`).value as string | null)
    const primerVacio = nombres.indexOf(null)
    expect(primerVacio).toBeGreaterThan(0)
    expect(nombres.slice(primerVacio).every((n) => n === null)).toBe(true)
  })

  it('pone el gráfico del modelo: dos barras por titular, con el importe encima', async () => {
    const { zip, hoja } = await generar()
    const chart = await xml(zip, 'xl/charts/chart1.xml')
    const dibujo = await xml(zip, 'xl/drawings/drawing1.xml')
    const tipos = await xml(zip, '[Content_Types].xml')
    const hojaXml = await xml(zip, 'xl/worksheets/sheet1.xml')
    expect(chart).toContain('<c:barDir val="col"/>')
    // Dos series: lo que has puesto (azul) y lo que has ganado o perdido (naranja).
    expect(chart).toContain('<c:v>Aportado neto</c:v>')
    expect(chart).toContain('<c:v>Beneficio-pérdida</c:v>')
    expect(chart).toContain('srgbClr val="2563EB"')
    expect(chart).toContain('srgbClr val="E67E22"')
    // Cada barra lleva su importe encima y la leyenda va arriba.
    expect(chart).toContain('<c:showVal val="1"/>')
    expect(chart).toContain('<c:dLblPos val="outEnd"/>')
    expect(chart).toContain('<c:legendPos val="t"/>')
    // Un grupo de barras por titular, en orden.
    expect(chart).toContain('<c:v>Marta</c:v>')
    expect(chart).toContain('<c:v>Fondo ahorro</c:v>')
    // Y los valores salen de las filas de total de cada titular.
    const marta = filaDe(hoja, 'Total MyInvestor-Marta')
    const fondo = filaDe(hoja, 'Total Fondo ahorro')
    expect(chart).toContain(`$H$${marta}:$H$${fondo}`) // aportado neto
    expect(chart).toContain(`$J$${marta}:$J$${fondo}`) // beneficio / pérdida
    // Va en las columnas L hasta O.
    expect(dibujo).toContain('<xdr:col>11</xdr:col>')
    expect(dibujo).toContain('<xdr:col>14</xdr:col>')
    expect(hojaXml).toContain('<drawing r:id="rId1"/>')
    expect(tipos).toContain('/xl/charts/chart1.xml')
    expect(tipos).toContain('/xl/drawings/drawing1.xml')
  })

  it('deja una fila de total por titular, seguidas y en orden: son las del gráfico', async () => {
    const { hoja } = await generar()
    const marta = filaDe(hoja, 'Total MyInvestor-Marta')
    const fondo = filaDe(hoja, 'Total Fondo ahorro')
    expect(fondo).toBe(marta + 1)
    expect(hoja.getCell(`G${marta}`).value).toBe('Marta')
    expect(hoja.getCell(`G${fondo}`).value).toBe('Fondo ahorro')
    // Y el total del titular es la suma de lo suyo (por titular, no por fila).
    expect(hoja.getCell(`H${marta}`).formula).toContain('SUMIFS')
    // Si el titular tiene una sola cuenta con inversiones, no se repite su fila de cuenta.
    expect(() => filaDe(hoja, 'Total MyInvestor')).toThrow()
  })

  it('colorea la lista: negros los primeros y después el color de cada titular', async () => {
    const { hoja } = await generar()
    const colorDe = (nombre: string) =>
      (hoja.getCell(`F${filaDe(hoja, nombre)}`).font as { color?: { argb?: string } })?.color?.argb
    expect(colorDe('Exterior')).toBe('FF0F172A')
    expect(colorDe('MyInvestor')).toBe('FF0F172A')
    expect(colorDe('Fidelity MSCI World Index')).toBe('FF2447B8') // azul de Marta
    expect(colorDe('Fondo indexado')).toBe('FFEA580C') // naranja del «Fondo ahorro»
  })

  it('deja una sola fila amarilla a la vista: al rellenarla sale la siguiente', async () => {
    const { zip, hoja } = await generar()
    const hojaXml = await xml(zip, 'xl/worksheets/sheet1.xml')
    // Dos filas libres: la de arriba a la vista y la otra de reserva.
    const libres = nombresDelResumen(hoja).length
    expect(hoja.getCell(`F${6 + libres + 1}`).protection).toMatchObject({ locked: false })
    expect(hoja.getCell(`F${6 + libres + 2}`).value).toBeNull()
    // Y los totales quedan justo debajo: solo una fila en blanco de separación.
    expect(filaDe(hoja, 'Total MyInvestor-Marta')).toBe(6 + libres + 2 + 1)
    expect(hojaXml).toContain('AND($F')
    const reglas = (hoja as unknown as { conditionalFormattings: { ref: string; rules: { formulae: string[] }[] }[] })
      .conditionalFormattings
    const lib = reglas.find((cf) => cf.ref.startsWith('F') && cf.ref.includes(':K'))
    expect(lib).toBeTruthy()
    const formulas = lib!.rules.map((r) => r.formulae).flat()
    expect(formulas.some((f) => f.includes(`AND(`) && f.includes(`="")`))).toBe(true)
    // La fila de antes marca si esta se ve: si está vacía, esta va en blanco.
    expect(formulas.some((f) => f === `$F${5 + libres}=""`)).toBe(true)
  })

  it('protege la hoja: solo se puede escribir en los movimientos, las filas nuevas y el %', async () => {
    const { hoja } = await generar()
    const proteccion = (hoja as unknown as { sheetProtection?: Record<string, boolean> }).sheetProtection
    expect(proteccion).toMatchObject({ sheet: true })
    // Se puede elegir cualquier celda y borrar o añadir filas: así se quita una inversión a cero.
    const { zip } = await generar()
    const hojaXml = await xml(zip, 'xl/worksheets/sheet1.xml')
    for (const permite of ['selectLockedCells', 'selectUnlockedCells', 'deleteRows', 'insertRows'])
      expect(hojaXml).toContain(`${permite}="0"`)
    // Los movimientos: fecha, de, a e importe.
    for (const c of ['A', 'B', 'C', 'D']) {
      expect(hoja.getCell(`${c}6`).protection).toMatchObject({ locked: false })
      expect(hoja.getCell(`${c}505`).protection).toMatchObject({ locked: false })
    }
    // El % de cada inversión… y nada más del resumen.
    expect(hoja.getCell(`I${filaDe(hoja, 'Vanguard Global Stock Index')}`).protection).toMatchObject({ locked: false })
    expect(hoja.getCell(`F${filaDe(hoja, 'Vanguard Global Stock Index')}`).protection?.locked).not.toBe(false)
    expect(hoja.getCell(`H${filaDe(hoja, 'Vanguard Global Stock Index')}`).protection?.locked).not.toBe(false)
    // Las filas nuevas: nombre, titular y %.
    const primeraLibre = 6 + nombresDelResumen(hoja).length
    for (const c of ['F', 'G', 'I']) {
      expect(hoja.getCell(`${c}${primeraLibre}`).protection).toMatchObject({ locked: false })
    }
    // Los totales, protegidos.
    expect(hoja.getCell(`H${filaDe(hoja, 'TOTAL')}`).protection?.locked).not.toBe(false)
  })
})

describe('el Excel se llena con los datos de la app', () => {
  const titular = (id: string, nombre: string): Titular =>
    ({
      id,
      nombre,
      codigo: id,
      esPrincipal: id === 't1',
      color: '',
      createdAt: '2026-01-01T00:00:00.000Z',
    }) as unknown as Titular

  const cuenta = (id: string, nombre: string, titularId: string, externa = false) =>
    ({
      id,
      titularId,
      nombre,
      entidad: '',
      iban: '',
      color: '',
      notas: '',
      externa,
    }) as unknown as Dataset['cuentas'][number]

  const producto = (id: string, nombre: string, titularId: string) =>
    ({
      id,
      titularId,
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

  const movimiento = (fecha: string, o: string, d: string, importe: number) =>
    ({
      id: `${fecha}-${o}-${d}-${importe}`,
      fecha,
      origen: { kind: o.startsWith('c') ? 'cuenta' : 'producto', id: o },
      destino: { kind: d.startsWith('c') ? 'cuenta' : 'producto', id: d },
      importe,
      createdAt: `${fecha}T00:00:00.000Z`,
    }) as unknown as Movimiento

  const fin = (ds: Dataset, titulares: ReturnType<typeof titular>[]) => {
    const vacio = {
      patrimonio: 0,
      efectivo: 0,
      invertidoValor: 0,
      capital: 0,
      ganancia: 0,
      rentabilidad: 0,
      aportado: 0,
      reembolsado: 0,
      comisiones: 0,
      aportadoNeto: 0,
      resultado: 0,
      resultadoPct: 0,
    }
    const ws = (titularId: string) => ({
      cuentas: ds.cuentas.filter((c) => c.titularId === titularId),
      productos: ds.productos.filter((p) => p.titularId === titularId),
      totales: vacio,
      byType: new Map(),
      recibido: 0,
    })
    const tfs = titulares.map((t, i) => ({ titular: t, index: i, color: '#2447B8', ws: ws(t.id), positions: [], accounts: [], totals: vacio, byType: new Map(), recibido: 0 }))
    // Todas las inversiones con datos, salvo que la prueba diga otra cosa.
    const posiciones = new Map<string, Position>(
      ds.productos.map((p) => [p.id, { rentabilidad: null, capital: 0, saldo: 0, numMovimientos: 1 } as unknown as Position]),
    )
    return {
      ds,
      ws: ws(titulares[0].id),
      today: HOY,
      lookup: new Map(),
      positions: posiciones,
      accounts: new Map(),
      titulares: tfs,
      byTitular: new Map(tfs.map((t) => [t.titular.id, t])),
      owner: (ref: { id: string }) => ref,
    } as unknown as FinanceData
  }

  it('pone cada inversión debajo de la cuenta que la paga', () => {
    const ds = {
      cuentas: [cuenta('c1', 'Cuenta Myinvestor', 't1'), cuenta('c2', 'Otra', 't1')],
      productos: [producto('p1', 'Fondo indexado', 't1')],
      movimientos: [movimiento('2026-10-01', 'c1', 'p1', 500)],
    } as unknown as Dataset
    const entrada = entradaDesdeApp(fin(ds, [titular('t1', 'Marta')]), HOY)
    const grupo = entrada.titulares[0].grupos.find((g) => g.cuenta === 'Cuenta Myinvestor')
    expect(grupo?.inversiones.map((i) => i.nombre)).toEqual(['Fondo indexado'])
  })

  it('las cuentas externas no salen en el resumen: ese dinero es «Exterior»', () => {
    const ds = {
      cuentas: [cuenta('c1', 'Cuenta Myinvestor', 't1'), cuenta('c2', 'Cuenta nómina', 't1', true)],
      productos: [],
      movimientos: [movimiento('2026-10-01', 'c2', 'c1', 1000)],
    } as unknown as Dataset
    const entrada = entradaDesdeApp(fin(ds, [titular('t1', 'Marta')]), HOY)
    expect(entrada.titulares[0].grupos.map((g) => g.cuenta)).toEqual(['Cuenta Myinvestor'])
    expect(entrada.movimientos).toEqual([
      { fecha: '2026-10-01', de: 'Exterior', a: 'Cuenta nómina', importe: 1000 },
      { fecha: '2026-10-01', de: 'Cuenta nómina', a: 'Cuenta Myinvestor', importe: 1000 },
    ])
  })

  it('el dinero que llega de una cuenta externa se ve como «Exterior → cuenta externa → destino»', () => {
    const ds = {
      cuentas: [cuenta('c1', 'Cuenta Myinvestor', 't1'), cuenta('c2', 'Otro banco', 't1', true)],
      productos: [producto('p1', 'Fondo indexado', 't1')],
      movimientos: [movimiento('2026-10-02', 'c2', 'p1', 300)],
    } as unknown as Dataset
    const entrada = entradaDesdeApp(fin(ds, [titular('t1', 'Marta')]), HOY)
    expect(entrada.movimientos.map((m) => [m.de, m.a])).toEqual([
      ['Exterior', 'Otro banco'],
      ['Otro banco', 'Fondo indexado'],
    ])
  })

  it('escribe «Cuenta Myinvestor» aunque en la app se llame «Myinvestor»', () => {
    const ds = {
      cuentas: [cuenta('c1', 'Myinvestor', 't1')],
      productos: [producto('p1', 'Fondo indexado', 't1')],
      movimientos: [movimiento('2026-10-01', 'c1', 'p1', 300)],
    } as unknown as Dataset
    const entrada = entradaDesdeApp(fin(ds, [titular('t1', 'Marta')]), HOY)
    expect(entrada.titulares[0].grupos[0].cuenta).toBe('Cuenta Myinvestor')
    expect(entrada.movimientos[0]).toEqual({
      fecha: '2026-10-01',
      de: 'Cuenta Myinvestor',
      a: 'Fondo indexado',
      importe: 300,
    })
  })

  it('las inversiones que quedan a cero y sin movimientos no salen en el resumen', () => {
    const ds = {
      cuentas: [cuenta('c1', 'Cuenta Myinvestor', 't1')],
      productos: [producto('p1', 'Fondo indexado', 't1'), producto('p2', 'Fondo viejo', 't1')],
      movimientos: [movimiento('2026-10-01', 'c1', 'p1', 300)],
    } as unknown as Dataset
    const base = fin(ds, [titular('t1', 'Marta')])
    base.positions.set('p2', { rentabilidad: null, capital: 0, saldo: 0, numMovimientos: 0 } as unknown as Position)
    const entrada = entradaDesdeApp(base, HOY)
    const nombres = entrada.titulares[0].grupos.flatMap((g) => g.inversiones.map((i) => i.nombre))
    expect(nombres).toContain('Fondo indexado')
    expect(nombres).not.toContain('Fondo viejo')
  })

  it('lleva la rentabilidad de cada inversión tal y como la ve la app', () => {
    const ds = {
      cuentas: [cuenta('c1', 'Cuenta Myinvestor', 't1')],
      productos: [producto('p1', 'Fondo indexado', 't1'), producto('p2', 'Depósito', 't1')],
      movimientos: [movimiento('2026-10-01', 'c1', 'p1', 100), movimiento('2026-10-01', 'c1', 'p2', 200)],
    } as unknown as Dataset
    const base = fin(ds, [titular('t1', 'Marta')])
    base.positions.set('p1', { rentabilidad: 0.1, capital: 100, saldo: 110 } as unknown as Position)
    base.positions.set('p2', { rentabilidad: null, capital: 200, saldo: 220 } as unknown as Position)
    const entrada = entradaDesdeApp(base, HOY)
    const nombres = Object.fromEntries(
      entrada.titulares[0].grupos.flatMap((g) => g.inversiones.map((i) => [i.nombre, i.rentabilidad])),
    )
    expect(nombres['Fondo indexado']).toBe(0.1)
    expect(nombres['Depósito']).toBeCloseTo(0.1, 10) // 220 / 200 − 1
  })
})
