// El Excel de movimientos: protegido, sin «#¡VALOR!» y con el recorrido origen → pasos → final.

import { describe, expect, it } from 'vitest'
import JSZip from 'jszip'
import ExcelJS from 'exceljs'
import { generarExcelMovimientos, type EntradaExcel } from './excelMovimientos'
import { entradaDesdeApp } from './excelDesdeApp'
import { crearExcelDeApp } from './descargarExcelMovimientos'
import { buildFlowGraph } from './flow'
import { computeFinance } from '../store/useFinance'
import { ANCHO_GRAFICO, dibujarGraficoDinero, grafoDinero } from './graficoDineroExcel'
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

  it('el dinero va al nombre en corto: una inversión con el nombre largo no se queda a cero', async () => {
    // El movimiento llega con el nombre completo de la app («...(IE) Acc EUR clase s») y en el
    // resumen la fila sale en corto: el movimiento tiene que escribirse con ese nombre, o la fila
    // no encontraría su dinero y se quedaría a cero.
    const { hoja } = await generar({
      ...ENTRADA,
      movimientos: [
        { fecha: '2026-10-01', de: 'Exterior', a: 'MyInvestor', importe: 500 },
        { fecha: '2026-10-02', de: 'MyInvestor', a: 'iShares Developed World Index (IE) Acc EUR clase s', importe: 500 },
      ],
    })
    expect(hoja.getCell(7, 3).value).toBe('iShares Developed World Index')
    expect(nombresDelResumen(hoja)).toContain('iShares Developed World Index')
  })

  it('las cuentas sin dinero y sin inversiones no salen: lo de abajo sube', async () => {
    const { hoja } = await generar()
    const nombres = nombresDelResumen(hoja)
    // «Cuenta nómina · BBVA» no tiene ni movimientos ni inversiones: se va y no deja hueco.
    expect(nombres.some((n) => n.includes('nómina') || n.includes('BBVA'))).toBe(false)
    expect(nombres[0]).toBe('Exterior')
    expect(nombres[1]).toBe('MyInvestor')
  })

  it('una cuenta que tuvo movimientos pero quedó vacía baja al final: no deja hueco entre las demás', async () => {
    const { hoja } = await generar({
      ...ENTRADA,
      titulares: [
        ...ENTRADA.titulares.slice(0, 1),
        { nombre: 'Pasajera', color: '#123456', grupos: [{ cuenta: 'Cuenta puente', inversiones: [] }] },
        ...ENTRADA.titulares.slice(1),
      ],
      movimientos: [
        ...ENTRADA.movimientos,
        { fecha: '2026-10-05', de: 'Exterior', a: 'Cuenta puente', importe: 100 },
        { fecha: '2026-10-06', de: 'Cuenta puente', a: 'Exterior', importe: 100 },
      ],
    })
    expect(nombresDelResumen(hoja)).not.toContain('Cuenta puente')
    expect(hoja.getCell('B10').value).toBe('Cuenta puente') // conserva el histórico
    expect(hoja.getCell('F10').value).toBe('Fondo indexado')
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

  it('conserva los gráficos de cuentas y usa una imagen REAL para el nuevo Sankey', async () => {
    const { zip, buffer, hoja } = await generar()
    const libro = new ExcelJS.Workbook()
    await libro.xlsx.load(buffer)
    expect(libro.worksheets.map((h) => h.name)).toEqual(['Movimientos', 'Gráficos', 'Gráfico del dinero'])
    expect(libro.getWorksheet('Mapa del dinero')).toBeUndefined()
    const dibujoCuentas = await xml(zip, 'xl/drawings/drawing2.xml')
    expect((dibujoCuentas.match(/<xdr:graphicFrame/g) ?? []).length).toBe(2)
    const anchuras = [...dibujoCuentas.matchAll(/<xdr:(?:from|to)>\s*<xdr:col>(\d+)<\/xdr:col><xdr:colOff>(\d+)<\/xdr:colOff>/g)]
    expect(anchuras).toHaveLength(4)
    for (const [i, nombre] of ['Marta', 'Fondo ahorro'].entries()) {
      // Cada ancla ocupa 4,8 columnas: 80 % de las 6 que ocupaba antes.
      const inicio = anchuras[i * 2], fin = anchuras[i * 2 + 1]
      expect((+fin[1] - +inicio[1]) + (+fin[2] - +inicio[2]) / (110 * 9525)).toBeCloseTo(4.8, 1)
      const chart = await xml(zip, `xl/charts/chart${i + 1}.xml`)
      expect(chart).toContain(`<c:v>${nombre}</c:v>`)
      expect((chart.match(/<c:ser>/g) ?? []).length).toBe(3)
      expect(chart).not.toContain('<c:legend>') // leyenda en celdas, lejos de las barras
      expect(chart).not.toContain('<c:majorGridlines')
      expect(chart).toContain('<c:tickLblPos val="none"/>')
      expect(chart).toContain('<c:manualLayout>')
      const total = filaDe(hoja, i === 0 ? 'Total MyInvestor-Marta' : 'Total Fondo ahorro')
      for (const c of ['H', 'J', 'K']) expect(chart).toContain(`$${c}$${total}`)
    }
    const leyenda = libro.getWorksheet('Gráficos')!
    for (const col of ['B', 'J']) {
      expect(leyenda.getCell(`${col}17`).value).toBe('■ Aportado')
      expect(leyenda.getCell(`${col}18`).value).toBe('■ Rentabilidad')
      expect(leyenda.getCell(`${col}19`).value).toBe('■ Aportado + rentabilidad')
    }
    const dibujoImagen = await xml(zip, 'xl/drawings/drawing1.xml')
    expect(dibujoImagen).toContain('<xdr:pic>')
    // Anchura y altura efectivas del Sankey = 70 % de la imagen original; nitidez intacta.
    const cx = Number(dibujoImagen.match(/<xdr:ext cx="(\d+)"/)?.[1])
    const cy = Number(dibujoImagen.match(/<xdr:ext cx="\d+" cy="(\d+)"/)?.[1])
    expect(cx / 9525).toBeCloseTo(ANCHO_GRAFICO * 0.7, 0)
    expect(await xml(zip, 'xl/drawings/_rels/drawing1.xml.rels')).toContain('../media/image1.png')
    const imagen = await zip.file('xl/media/image1.png')!.async('uint8array')
    expect([...imagen.slice(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10])
    expect(imagen.byteLength).toBeGreaterThan(5000)
    const alturaOriginal = new DataView(imagen.buffer, imagen.byteOffset, imagen.byteLength).getUint32(20)
    expect(cy / 9525).toBeCloseTo(alturaOriginal * 0.7, 0)
  })

  it('el gráfico de bandas conserva el importe por origen, inversión y destino, con rentabilidad', () => {
    const caminos = [{ pasos: ['Exterior', 'Cuenta Myinvestor', 'Fondo'], importe: 100, seQueda: false }]
    const propietarios = new Map([['Fondo', 'Marta'], ['Cuenta Myinvestor', 'Marta']])
    const { origen, final } = grafoDinero(caminos, propietarios, new Map([['Fondo', 0.1]]))
    expect(origen).toEqual([
      { de: 'Cuenta Myinvestor', a: 'Fondo', importe: 100 },
      { de: 'Rentabilidad generada · Marta', a: 'Fondo', importe: 10 },
    ])
    expect(final).toEqual([{ de: 'Fondo', a: 'Sigue invertido · Marta', importe: 110 }])
    const { svg } = dibujarGraficoDinero(caminos, propietarios, new Map([['Fondo', 0.1]]))
    expect(svg).toContain('DE DÓNDE VIENE')
    expect(svg).toContain('DÓNDE ESTÁ')
    expect(svg).toContain('A DÓNDE VA')
    expect(svg).toContain('<path d="M') // cintas curvas, no tarjetas
    expect(svg).toContain('Rentabilidad generada')
  })

  it('la banda directa usa Aportaciones; las pérdidas terminan en Pérdidas', () => {
    const caminos = [{ pasos: ['Exterior', 'Fondo'], importe: 200, seQueda: false }]
    const { origen, final } = grafoDinero(caminos, new Map([['Fondo', 'Fondo ahorro']]), new Map([['Fondo', -0.1]]))
    expect(origen).toEqual([{ de: 'Aportaciones · Fondo ahorro', a: 'Fondo', importe: 200 }])
    expect(final).toEqual([
      { de: 'Fondo', a: 'Sigue invertido · Fondo ahorro', importe: 180 },
      { de: 'Fondo', a: 'Pérdidas · Fondo ahorro', importe: 20 },
    ])
  })

  it('muestra Myinvestor y Fondo ahorro por separado, aunque el fondo pase por la cuenta principal', () => {
    const propietarios = new Map([
      ['Cuenta Myinvestor', 'Marta'], ['Vanguard', 'Marta'], ['Fondo', 'Fondo ahorro'],
    ])
    const caminos = [
      { pasos: ['Exterior', 'Cuenta Myinvestor', 'Vanguard'], importe: 300, seQueda: false },
      { pasos: ['Exterior', 'Cuenta Myinvestor', 'Fondo'], importe: 200, seQueda: false },
    ]
    const { origen } = grafoDinero(caminos, propietarios, new Map())
    expect(origen).toContainEqual({ de: 'Cuenta Myinvestor', a: 'Vanguard', importe: 300 })
    expect(origen).toContainEqual({ de: 'Aportaciones · Fondo ahorro', a: 'Fondo', importe: 200 })
    const { svg } = dibujarGraficoDinero(caminos, propietarios, new Map(), ['Marta', 'Fondo ahorro'])
    expect(svg).toContain('Cuenta Myinvestor')
    expect(svg).toContain('Aportaciones · Fondo ahorro')
    // Si se cierra el fondo, el titular sigue en la leyenda con 0 € (sin crear bandas falsas).
    const sinFondo = dibujarGraficoDinero(caminos.slice(0, 1), propietarios, new Map(), ['Marta', 'Fondo ahorro']).svg
    expect(sinFondo).toContain('Aportaciones · Fondo ahorro')
    expect(sinFondo).toContain('0 €')
  })

  it('no borra los movimientos que ya vienen a cero: mantiene sus cuatro campos originales', async () => {
    const { hoja } = await generar({
      ...ENTRADA,
      movimientos: [
        ENTRADA.movimientos[0],
        { fecha: '2026-10-02', de: 'MyInvestor', a: 'Vanguard Global Stock Index', importe: 0 },
        ENTRADA.movimientos[1],
      ],
    })
    expect(hoja.getCell('B7').value).toBe('MyInvestor')
    expect(hoja.getCell('C7').value).toBe('Vanguard Global Stock Index')
    expect(hoja.getCell('D7').value).toBe(0)
    expect((hoja.getCell('A7').value as Date).toISOString().slice(0, 10)).toBe('2026-10-02')
    expect(hoja.getCell('D8').value).toBe(400)
    // El .xlsx no incorpora una macro: no se puede disparar un cambio de 0 con Worksheet_Change.
    expect(hoja.getCell('D7').dataValidation.type).toBe('custom')
  })

  it('impide retirar más saldo del origen, sin contar dinero de fechas futuras, y deja poner cero', async () => {
    const { hoja, zip } = await generar()
    const validacion = hoja.getCell('D6').dataValidation
    expect(validacion.type).toBe('custom')
    expect(validacion.errorStyle).toBe('stop')
    const f = String(validacion.formulae[0])
    expect(f).toContain('SUMIFS($D$6:$D6,$C$6:$C6,$B6)')
    expect(f).toContain('SUMIFS($D$6:$D6,$B$6:$B6,$B6)+$D6')
    expect(f).toContain('VLOOKUP($B6,$F$6:$I$') // % de la cuenta o inversión
    expect(f).toContain('OR($D6=0,')
    expect(f).toContain('$B6="Exterior"')
    const hojaXml = await xml(zip, 'xl/worksheets/sheet1.xml')
    expect(hojaXml).toContain('errorStyle="stop"')
    expect(hoja.getCell('D505').dataValidation.type).toBe('custom')
  })

  it('ordena los movimientos por fecha', async () => {
    const { hoja } = await generar({
      ...ENTRADA,
      movimientos: [
        { fecha: '2026-10-09', de: 'MyInvestor', a: 'Vanguard Global Stock Index', importe: 50 },
        { fecha: '2026-10-01', de: 'Exterior', a: 'MyInvestor', importe: 100 },
        { fecha: '2026-10-05', de: 'MyInvestor', a: 'Fondo indexado', importe: 25 },
      ],
    })
    const fechas: string[] = []
    for (let f = 6; f <= 8; f++) {
      const d = hoja.getCell(f, 1).value
      fechas.push((d as Date).toISOString().slice(0, 10))
    }
    expect(fechas).toEqual(['2026-10-01', '2026-10-05', '2026-10-09'])
  })

  it('en el resumen se puede escribir el % de una cuenta, y mueve su rentabilidad y su saldo', async () => {
    const { zip, hoja } = await generar()
    const xmlHoja = await xml(zip, 'xl/worksheets/sheet1.xml')
    // La fila de la cuenta (la 7) calcula los euros y el saldo con el %, igual que las inversiones.
    const filaCuenta = String(hoja.getCell('F7').value)
    expect(filaCuenta).toBe('MyInvestor')
    expect(hoja.getCell('I7').value).toBeNull() // el % está vacío: lo escribes tú
    const euros = String((hoja.getCell('J7').value as { formula: string }).formula)
    const saldo = String((hoja.getCell('K7').value as { formula: string }).formula)
    expect(euros).toContain('$K7-$H7')
    // El saldo de la cuenta es lo aportado por lo que suba o baje ese %: como en las inversiones.
    expect(saldo).toContain('$H7*(1+$I7)')
    // Y la celda del % se puede escribir: la hoja está protegida, pero esa celda no.
    expect(xmlHoja).toContain('<sheetProtection')
    expect(hoja.getCell('I7').protection?.locked).toBe(false)
    const cf = (hoja as unknown as { conditionalFormattings: { ref: string; rules: { formulae: string[] }[] }[] })
      .conditionalFormattings.find((x) => x.ref.startsWith('I7:I'))
    expect(cf?.rules[0].formulae[0]).toContain('AND($F7<>"",$H7<>"")')
  })

  it('imprime las tres hojas y no incluye ni Flujo ni Mapa del dinero', async () => {
    const { zip } = await generar()
    for (const hoja of ['sheet1', 'sheet2', 'sheet3'])
      expect(await xml(zip, `xl/worksheets/${hoja}.xml`)).toContain('fitToWidth="1"')
    const libro = await xml(zip, 'xl/workbook.xml')
    expect(libro).toContain('&apos;Movimientos&apos;!$A1:$O')
    expect(libro).toContain('&apos;Gráficos&apos;!$A1:$O')
    expect(libro).toContain('&apos;Gráfico del dinero&apos;!$A1:$M')
    expect(libro).not.toContain('name="Flujo"')
    expect(libro).not.toContain('name="Mapa del dinero"')
  })

  it('deja una fila de total por titular, seguidas y en orden', async () => {
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
    // Siete filas libres: la de arriba a la vista y seis de reserva.
    const nombres = nombresDelResumen(hoja).length
    const LIBRES = 7
    expect(hoja.getCell(`F${6 + nombres}`).protection).toMatchObject({ locked: false })
    expect(hoja.getCell(`F${6 + nombres + LIBRES - 1}`).protection).toMatchObject({ locked: false })
    expect(hoja.getCell(`F${6 + nombres + LIBRES}`).value).toBeNull()
    // Y los totales quedan justo debajo: solo una fila en blanco de separación.
    expect(filaDe(hoja, 'Total MyInvestor-Marta')).toBe(6 + nombres + LIBRES + 1)
    expect(hojaXml).toContain('AND($F')
    const reglas = (hoja as unknown as { conditionalFormattings: { ref: string; rules: { formulae: string[] }[] }[] })
      .conditionalFormattings
    const lib = reglas.find((cf) => cf.ref.startsWith('F') && cf.ref.includes(':K'))
    expect(lib).toBeTruthy()
    const formulas = lib!.rules.map((r) => r.formulae).flat()
    expect(formulas.some((f) => f.includes(`AND(`) && f.includes(`="")`))).toBe(true)
    // La fila de antes marca si esta se ve: si está vacía, esta va en blanco.
    expect(formulas.some((f) => f === `$F${5 + nombres}=""`)).toBe(true)
  })

  it('lo que se queda a cero desaparece del resumen', async () => {
    const { zip, hoja } = await generar()
    const fila = filaDe(hoja, 'Vanguard Global Stock Index')
    // El capital se vacía en cuanto lo que sale (el saldo: lo aportado más la rentabilidad) se
    // ha llevado todo lo que entró.
    const bruto = hoja.getCell(`H${fila}`).value as { formula?: string } | string
    const capital = typeof bruto === 'string' ? bruto : String(bruto.formula)
    expect(capital).toContain('AND(SUMIFS($D$6:$D$505,$C$6:$C$505,"Vanguard Global Stock Index")>0')
    // Y la fila entera se queda en blanco.
    const reglas = (hoja as unknown as { conditionalFormattings: { ref: string; rules: { formulae: string[] }[] }[] })
      .conditionalFormattings
    const seVa = reglas.find((cf) => cf.rules.some((r) => r.formulae[0] === '$H7=""'))
    expect(seVa).toBeTruthy()
    expect(seVa!.ref.startsWith('F7:')).toBe(true)
    // La letra en blanco: la fila se ve vacía.
    expect(await xml(zip, 'xl/styles.xml')).toContain('<color rgb="FFFFFFFF"/>')
  })

  it('lleva «Myinvestor» de título', async () => {
    const { hoja } = await generar()
    expect(hoja.getCell('A1').value).toBe('Myinvestor')
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
      ds.productos.map((p) => [p.id, { rentabilidad: null, capital: 100, saldo: 100, numMovimientos: 1 } as unknown as Position]),
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

  it('al añadir o editar un movimiento, el gráfico de la app y el del nuevo Excel usan el mismo dato actualizado', async () => {
    const primera = { ...movimiento('2026-10-01', 'c1', 'p1', 300), tipo: 'inversion' as const }
    const segunda = { ...movimiento('2026-10-02', 'c1', 'p1', 200), tipo: 'inversion' as const }
    const base = {
      titulares: [titular('t1', 'Marta')],
      cuentas: [cuenta('c1', 'Cuenta de origen', 't1', true)],
      productos: [producto('p1', 'Fondo indexado', 't1')],
      movimientos: [primera],
      programadas: [],
    } as Dataset
    const añadido = { ...base, movimientos: [primera, segunda] }
    const editado = { ...añadido, movimientos: [{ ...primera, importe: 450 }, segunda] }
    const totalEnGraficoApp = (ds: Dataset) => {
      const fin = computeFinance(ds, HOY)
      return buildFlowGraph(fin.ds, fin.positions, { from: null, to: null }).links
        .find((l) => l.source === 'L:c:c1' && l.target === 'M:p1')?.value
    }
    expect([base, añadido, editado].map(totalEnGraficoApp)).toEqual([300, 500, 650])

    const libro = async (ds: Dataset) => {
      const buffer = await crearExcelDeApp(computeFinance(ds, HOY))
      const excel = new ExcelJS.Workbook()
      await excel.xlsx.load(buffer)
      const zip = await JSZip.loadAsync(buffer)
      return {
        importes: [excel.getWorksheet('Movimientos')!.getCell('D6').value, excel.getWorksheet('Movimientos')!.getCell('D7').value],
        imagen: await zip.file('xl/media/image1.png')!.async('uint8array'),
        hojas: excel.worksheets.map((h) => h.name),
      }
    }
    const anterior = await libro(base)
    const nuevo = await libro(añadido)
    const corregido = await libro(editado)
    expect(anterior.importes).toEqual([300, null])
    expect(nuevo.importes).toEqual([300, 200])
    expect(corregido.importes).toEqual([450, 200])
    expect(nuevo.hojas).toContain('Gráfico del dinero')
    expect(nuevo.imagen).not.toEqual(anterior.imagen)
    expect(corregido.imagen).not.toEqual(nuevo.imagen)
  })

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
    // De la cuenta nómina no se ve nada: ni como fila ni en los movimientos.
    expect(entrada.movimientos).toEqual([{ fecha: '2026-10-01', de: 'Exterior', a: 'Cuenta Myinvestor', importe: 1000 }])
  })

  it('de la cuenta de fuera (la nómina) no se nombra nada: ese dinero es «Exterior»', () => {
    const ds = {
      cuentas: [cuenta('c1', 'Cuenta Myinvestor', 't1'), cuenta('c2', 'Otro banco', 't1', true)],
      productos: [producto('p1', 'Fondo indexado', 't1')],
      movimientos: [
        movimiento('2026-10-02', 'c2', 'p1', 300),
        movimiento('2026-10-03', 'c1', 'c2', 100),
      ],
    } as unknown as Dataset
    const entrada = entradaDesdeApp(fin(ds, [titular('t1', 'Marta')]), HOY)
    expect(entrada.movimientos.map((m) => [m.de, m.a])).toEqual([
      ['Exterior', 'Fondo indexado'],
      ['Cuenta Myinvestor', 'Exterior'],
    ])
  })

  it('las cuentas por las que no pasa dinero no salen en el resumen', () => {
    const ds = {
      cuentas: [cuenta('c1', 'Cuenta Myinvestor', 't1'), cuenta('c2', 'Cuenta vacía', 't1')],
      productos: [producto('p1', 'Fondo indexado', 't1')],
      movimientos: [movimiento('2026-10-01', 'c1', 'p1', 300)],
    } as unknown as Dataset
    const entrada = entradaDesdeApp(fin(ds, [titular('t1', 'Marta')]), HOY)
    expect(entrada.titulares[0].grupos.map((g) => g.cuenta)).toEqual(['Cuenta Myinvestor'])
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

  it('las inversiones que quedan a cero no salen en el resumen, aunque tengan movimientos', () => {
    const ds = {
      cuentas: [cuenta('c1', 'Cuenta Myinvestor', 't1')],
      productos: [producto('p1', 'Fondo indexado', 't1'), producto('p2', 'Fondo viejo', 't1')],
      movimientos: [movimiento('2026-10-01', 'c1', 'p1', 300)],
    } as unknown as Dataset
    const base = fin(ds, [titular('t1', 'Marta')])
    // Se vendió del todo: tiene movimientos, pero no queda dinero, así que no deja hueco.
    base.positions.set('p2', { rentabilidad: null, capital: 0, saldo: 0, numMovimientos: 3 } as unknown as Position)
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
