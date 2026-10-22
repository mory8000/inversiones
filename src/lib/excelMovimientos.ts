/**
 * Hoja de cálculo de los movimientos: UNA sola hoja, compacta y viva.
 *
 * A la izquierda, los movimientos (Fecha · De · A · Importe), con desplegable para el origen y el
 * destino. Solo se ve una fila vacía (con la fecha de hoy, que se puede cambiar): en cuanto la
 * rellenas, aparece la siguiente.
 *
 * A la derecha, el resumen de cada cuenta y, debajo de ella, las inversiones que se pagan desde
 * esa cuenta: Capital aportado, Rentabilidad (se escribe el %, y de ahí salen los euros), y Saldo.
 * Después, el total de cada cuenta, el de cada titular y el TOTAL. Y un gráfico con tres columnas
 * (Aportado · Rentabilidad · Saldo) por cada cuenta.
 *
 * El dinero que llega de fuera («Exterior») entra en la cuenta principal; lo que de ahí se va a
 * otro titular (p. ej. al «Fondo ahorro») no cuenta en esa cuenta: si traes 1.000 € y se van 400,
 * la cuenta principal marca 600 y el «Fondo ahorro» 400.
 *
 * Todo son fórmulas (SUMIFS) sobre la tabla de movimientos, envueltas en SI.ERROR para que una
 * celda sin datos salga en blanco y no con «#¡VALOR!». Los nombres del resumen alimentan los
 * desplegables (con un nombre definido que crece solo, sin huecos), así que añadir una inversión
 * es escribir su nombre en una fila libre, y quitarla, borrar la fila.
 */

// ── Lo que hay que darle al generador ──────────────────────────────────────

export interface MovimientoExcel {
  /** AAAA-MM-DD */
  fecha: string
  /** Nombre de donde sale el dinero («Exterior» si viene de fuera). */
  de: string
  /** Nombre de a dónde va. */
  a: string
  /** Siempre positivo. */
  importe: number
}

export interface InversionExcel {
  nombre: string
  /** Rentabilidad en tanto por uno (0,05 = 5 %). `null` si todavía no se sabe. */
  rentabilidad: number | null
}

/** Una cuenta y las inversiones que se pagan desde ella. */
export interface GrupoExcel {
  /** `null`: el titular no tiene cuenta (el dinero va directo a sus inversiones). */
  cuenta: string | null
  inversiones: InversionExcel[]
}

export interface TitularExcel {
  nombre: string
  /** Color del titular en la app (#RRGGBB): es el color de la letra en la lista. */
  color: string
  grupos: GrupoExcel[]
}

export interface EntradaExcel {
  /** AAAA-MM-DD: la fecha que se pone en la fila nueva. */
  hoy: string
  titulares: TitularExcel[]
  movimientos: MovimientoExcel[]
  /** Filas libres al final del resumen para añadir inversiones. */
  libres?: number
}

// ── Columnas y filas ───────────────────────────────────────────────────────
const COL = { fecha: 1, de: 2, a: 3, importe: 4, nombre: 6, titular: 7, aportado: 8, pct: 9, euros: 10, saldo: 11 }
type Col = keyof typeof COL
const letra = (n: number) => {
  let s = ''
  for (let x = n; x > 0; x = Math.floor((x - 1) / 26)) s = String.fromCharCode(65 + ((x - 1) % 26)) + s
  return s
}
const L = Object.fromEntries(Object.entries(COL).map(([k, v]) => [k, letra(v)])) as Record<Col, string>

const FILA_TITULO = 1
const FILA_CABECERAS = 5
const RES_1 = 6 // Primera fila del resumen (y de los movimientos).
const EXTERIOR = 'Exterior'
const INTERES = 'Interés'

const AZUL = 'FF1D4ED8'
const TINTA = 'FF0F172A'
const GRIS = 'FF64748B'
const CABECERA_FILL = 'FFF1F5F9'
const AMARILLO = 'FFFFFBEB'
const AMARILLO_FUERTE = 'FFFEF3C7'
const GRIS_CLARO = 'FFF8FAFC'
const BORDE = 'FFD8DEE9'

const MONEDA = '#,##0.00 "€"'
const PORCENTAJE = '0.00 %'
const FECHA = 'dd/mm/yyyy'

const hexArgb = (hex: string) => `FF${hex.replace('#', '').toUpperCase()}`

/** Nombres únicos: si dos cosas se llaman igual, se añade el titular («MyInvestor (Luis)»). */
function nombresUnicos(entrada: EntradaExcel) {
  const usados = new Map<string, number>()
  for (const t of entrada.titulares) {
    for (const g of t.grupos) {
      if (g.cuenta) usados.set(g.cuenta, (usados.get(g.cuenta) ?? 0) + 1)
      for (const i of g.inversiones) usados.set(i.nombre, (usados.get(i.nombre) ?? 0) + 1)
    }
  }
  return (nombre: string, titular: string) =>
    (usados.get(nombre) ?? 0) > 1 ? `${nombre} (${titular})` : nombre
}

/** RANGO con el que se alimentan los desplegables: solo los nombres escritos, sin huecos. */
function nombreDefinido(hoja: string, desde: number, hasta: number) {
  return `OFFSET('${hoja}'!$${L.nombre}$${desde},0,0,MAX(COUNTA('${hoja}'!$${L.nombre}$${desde}:$${L.nombre}$${hasta}),1),1)`
}

/* eslint-disable @typescript-eslint/no-explicit-any */
/** Carga exceljs (navegador y Node: el módulo llega de las dos maneras). */
async function cargarExcelJS(): Promise<any> {
  const mod: any = await import('exceljs')
  return mod.Workbook ? mod : mod.default
}

/** Carga JSZip, para poder añadir el gráfico al archivo ya escrito. */
async function cargarJSZip(): Promise<any> {
  const mod: any = await import('jszip')
  return mod.default ?? mod
}

export async function generarExcelMovimientos(entrada: EntradaExcel): Promise<ArrayBuffer> {
  // Las librerías pesan: se cargan solo cuando se genera el archivo.
  const ExcelJS = await cargarExcelJS()
  const libro = new ExcelJS.Workbook()
  libro.creator = 'Mis Inversiones'
  libro.created = new Date()
  // Que Excel recalcule todas las fórmulas al abrirlo (el libro no guarda resultados).
  libro.calcProperties = { fullCalcOnLoad: true }

  const HOJA = 'Movimientos'
  const libres = entrada.libres ?? 6
  const FILAS_MOV = Math.max(60, entrada.movimientos.length * 2 + 40)
  const FILA_MOV_N = RES_1 + FILAS_MOV - 1

  const ws = libro.addWorksheet(HOJA, {
    views: [{ state: 'frozen', ySplit: FILA_CABECERAS, showGridLines: false }],
    pageSetup: {
      orientation: 'landscape',
      paperSize: 9, // A4
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 1,
      margins: { left: 0.3, right: 0.3, top: 0.4, bottom: 0.4, header: 0, footer: 0 },
    },
  })
  ws.properties.tabColor = { argb: AZUL }

  ws.getColumn(COL.fecha).width = 11
  ws.getColumn(COL.de).width = 21
  ws.getColumn(COL.a).width = 21
  ws.getColumn(COL.importe).width = 12
  ws.getColumn(5).width = 2
  ws.getColumn(COL.nombre).width = 29
  ws.getColumn(COL.titular).width = 11
  ws.getColumn(COL.aportado).width = 15
  ws.getColumn(COL.pct).width = 10
  ws.getColumn(COL.euros).width = 12
  ws.getColumn(COL.saldo).width = 13

  const celda = (f: number, c: number) => ws.getCell(f, c)
  const relleno = (argb: string) => ({ type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb } })
  const bordeFino = { bottom: { style: 'thin' as const, color: { argb: BORDE } } }
  const poner = (f: number, c: number, valor: unknown, estilo: Record<string, unknown> = {}) => {
    const x = celda(f, c)
    x.value = valor as never
    if (estilo.numFmt) x.numFmt = estilo.numFmt as string
    if (estilo.font) x.font = estilo.font as never
    if (estilo.fill) x.fill = estilo.fill as never
    if (estilo.alignment) x.alignment = estilo.alignment as never
    if (estilo.border) x.border = estilo.border as never
    return x
  }

  // ── Títulos y esquema ────────────────────────────────────────────────────
  ws.mergeCells(FILA_TITULO, 1, FILA_TITULO, COL.saldo)
  poner(FILA_TITULO, 1, 'MIS INVERSIONES · MOVIMIENTOS: DE DÓNDE VIENE EL DINERO', {
    font: { bold: true, size: 14, color: { argb: TINTA } },
    alignment: { vertical: 'middle' },
  })
  ws.getRow(FILA_TITULO).height = 22

  ws.mergeCells(2, 1, 3, COL.importe)
  poner(2, 1, 'Escribe cada movimiento: fecha, de dónde sale (De), a dónde va (A) e importe. Solo se ve una fila: al rellenarla, se abre la siguiente.', {
    font: { size: 9, color: { argb: GRIS } },
    alignment: { wrapText: true, vertical: 'top' },
  })
  ws.getRow(2).height = 18
  ws.getRow(3).height = 26

  const caja = (c1: number, c2: number, texto: string) => {
    poner(2, c1, texto, {
      font: { bold: true, size: 10, color: { argb: AZUL } },
      fill: relleno('FFEFF6FF'),
      alignment: { horizontal: 'center', vertical: 'middle' },
    })
    if (c2 !== c1) ws.mergeCells(2, c1, 2, c2)
  }
  caja(COL.nombre, COL.nombre, 'Capital aportado')
  poner(2, COL.titular, '+', { font: { bold: true, size: 11, color: { argb: GRIS } }, alignment: { horizontal: 'center' } })
  caja(COL.aportado, COL.pct, 'Rentabilidad')
  poner(2, COL.euros, '=', { font: { bold: true, size: 11, color: { argb: GRIS } }, alignment: { horizontal: 'center' } })
  caja(COL.saldo, COL.saldo, 'Saldo')

  ws.mergeCells(3, COL.nombre, 3, COL.saldo)
  poner(3, COL.nombre, 'Resumen de cada cuenta, con lo invertido en cada inversión debajo; después, el total de cada cuenta, el de cada titular y el TOTAL.', {
    font: { size: 9, italic: true, color: { argb: GRIS } },
    alignment: { vertical: 'middle' },
  })

  // ── Cabeceras ────────────────────────────────────────────────────────────
  const bloque = (c1: number, c2: number, texto: string) => {
    for (let c = c1; c <= c2; c++) {
      poner(4, c, c === c1 ? texto : null, {
        fill: relleno(AZUL),
        font: { bold: true, size: 11, color: { argb: 'FFFFFFFF' } },
        alignment: { horizontal: c === c1 ? 'left' : 'center', vertical: 'middle' },
      })
    }
    ws.mergeCells(4, c1, 4, c2)
  }
  bloque(1, COL.importe, 'MOVIMIENTOS')
  bloque(COL.nombre, COL.saldo, 'RESUMEN')
  ws.getRow(4).height = 18

  const cabeceras: [number, string][] = [
    [COL.fecha, 'Fecha'],
    [COL.de, 'De  (de dónde sale)'],
    [COL.a, 'A  (a dónde va)'],
    [COL.importe, 'Importe'],
    [COL.nombre, 'Cuenta e inversiones'],
    [COL.titular, 'Titular'],
    [COL.aportado, 'Capital aportado'],
    [COL.pct, 'Rentab. %'],
    [COL.euros, 'Rentab. €'],
    [COL.saldo, 'Saldo'],
  ]
  for (const [c, texto] of cabeceras) {
    poner(FILA_CABECERAS, c, texto, {
      fill: relleno(CABECERA_FILL),
      font: { bold: true, size: 10, color: { argb: 'FF334155' } },
      alignment: { horizontal: c >= COL.aportado ? 'right' : 'left', vertical: 'middle' },
      border: bordeFino,
    })
  }
  ws.getRow(FILA_CABECERAS).height = 16

  // ── Movimientos ──────────────────────────────────────────────────────────
  const fechaHoy = (() => {
    const [y, m, d] = entrada.hoy.split('-').map(Number)
    return new Date(Date.UTC(y, (m || 1) - 1, d || 1))
  })()
  for (let f = RES_1; f <= FILA_MOV_N; f++) {
    poner(f, COL.fecha, fechaHoy, { numFmt: FECHA, font: { size: 10, color: { argb: TINTA } } })
    poner(f, COL.de, null, { font: { size: 10, color: { argb: TINTA } } })
    poner(f, COL.a, null, { font: { size: 10, color: { argb: TINTA } } })
    poner(f, COL.importe, null, { numFmt: MONEDA, font: { size: 10, color: { argb: TINTA } } })
  }
  for (const [i, m] of entrada.movimientos.entries()) {
    const f = RES_1 + i
    celda(f, COL.de).value = m.de
    celda(f, COL.a).value = m.a
    celda(f, COL.importe).value = m.importe
    const [y, mo, d] = m.fecha.split('-').map(Number)
    celda(f, COL.fecha).value = new Date(Date.UTC(y, (mo || 1) - 1, d || 1))
  }

  // Solo se ve la fila que toca: la siguiente se destapa cuando se rellena esta.
  ws.addConditionalFormatting({
    ref: `${L.fecha}${RES_1}:${L.importe}${FILA_MOV_N}`,
    rules: [
      {
        type: 'expression',
        formulae: [`AND($${L.importe}${RES_1 - 1}<>"",$${L.importe}${RES_1}="")`],
        priority: 1,
        style: { fill: relleno(AMARILLO_FUERTE), font: { size: 10, color: { argb: TINTA } }, border: bordeFino },
      },
      {
        type: 'expression',
        formulae: [`$${L.importe}${RES_1 - 1}<>""`],
        priority: 2,
        style: { font: { size: 10, color: { argb: TINTA } }, border: bordeFino },
      },
      {
        type: 'expression',
        formulae: [`$${L.importe}${RES_1 - 1}=""`],
        priority: 3,
        style: { font: { size: 10, color: { argb: 'FFFFFFFF' } } },
      },
    ],
  })

  // ── Fórmulas del resumen ─────────────────────────────────────────────────
  const IMP = `$${L.importe}$${RES_1}:$${L.importe}$${FILA_MOV_N}`
  const DE = `$${L.de}$${RES_1}:$${L.de}$${FILA_MOV_N}`
  const A = `$${L.a}$${RES_1}:$${L.a}$${FILA_MOV_N}`
  const INTERES_LIT = `"${INTERES}"`
  const siError = (formula: string) => `IFERROR(${formula},"")`

  /** Capital aportado: lo que entra menos lo que sale, sin contar el interés (que es rentabilidad). */
  const fAportado = (f: number) =>
    siError(
      `IF($${L.nombre}${f}="","",SUMIFS(${IMP},${A},$${L.nombre}${f})` +
        `-SUMIFS(${IMP},${DE},$${L.nombre}${f})` +
        `-SUMIFS(${IMP},${A},$${L.nombre}${f},${DE},${INTERES_LIT})` +
        `+SUMIFS(${IMP},${DE},$${L.nombre}${f},${A},${INTERES_LIT}))`,
    )
  /** Saldo de una cuenta: lo que entra menos lo que sale. */
  const fSaldoCuenta = (f: number) =>
    siError(`IF($${L.nombre}${f}="","",SUMIFS(${IMP},${A},$${L.nombre}${f})-SUMIFS(${IMP},${DE},$${L.nombre}${f}))`)
  /** Saldo de una inversión: su capital por lo que suba o baje el % que escribas. */
  const fSaldoInversion = (f: number) =>
    siError(
      `IF($${L.nombre}${f}="","",IF($${L.aportado}${f}=0,"",IF($${L.pct}${f}="",$${L.aportado}${f},$${L.aportado}${f}*(1+$${L.pct}${f}))))`,
    )
  const fEuros = (f: number) => siError(`IF($${L.nombre}${f}="","",$${L.saldo}${f}-$${L.aportado}${f})`)
  const fPct = (f: number) =>
    siError(`IF($${L.nombre}${f}="","",IF($${L.aportado}${f}=0,"",$${L.euros}${f}/$${L.aportado}${f}))`)

  // ── Resumen ──────────────────────────────────────────────────────────────
  const nombreDe = nombresUnicos(entrada)
  let fila = RES_1
  let numeroConcepto = 0

  const especial = (nombre: string) => {
    poner(fila, COL.nombre, nombre, { font: { italic: true, bold: true, size: 10, color: { argb: TINTA } } })
    for (let c = COL.titular; c <= COL.saldo; c++) celda(fila, c).fill = relleno(GRIS_CLARO)
    numeroConcepto++
    fila++
  }
  especial(EXTERIOR)
  especial(INTERES)

  const filaResumen = (op: { nombre: string | null; titular: string; clase: 'cuenta' | 'inversion' | 'libre'; pct?: number | null; sangria?: number }) => {
    const color = numeroConcepto < 3 || op.clase === 'libre' ? TINTA : hexArgb(colorDe(op.titular))
    const esLibre = op.clase === 'libre'
    poner(fila, COL.nombre, op.nombre, {
      font: { size: 10, bold: op.clase === 'cuenta', color: { argb: color } },
      alignment: { indent: op.sangria ?? 0 },
      fill: esLibre ? relleno(AMARILLO) : undefined,
    })
    poner(fila, COL.titular, esLibre ? null : op.titular, {
      font: { size: 9, color: { argb: GRIS } },
      alignment: { horizontal: 'center' },
      fill: esLibre ? relleno(AMARILLO) : undefined,
    })
    poner(fila, COL.aportado, { formula: fAportado(fila) }, { numFmt: MONEDA, font: { size: 10 } })
    if (op.clase === 'inversion' || esLibre) {
      // El % lo escribes tú (el de la app); de ahí salen los euros y el saldo.
      poner(fila, COL.pct, op.pct ?? null, {
        numFmt: PORCENTAJE,
        font: { size: 10 },
        fill: relleno(AMARILLO),
      })
      poner(fila, COL.euros, { formula: fEuros(fila) }, { numFmt: MONEDA, font: { size: 10 } })
      poner(fila, COL.saldo, { formula: fSaldoInversion(fila) }, { numFmt: MONEDA, font: { size: 10 } })
    } else {
      poner(fila, COL.pct, { formula: fPct(fila) }, { numFmt: PORCENTAJE, font: { size: 10 } })
      poner(fila, COL.euros, { formula: fEuros(fila) }, { numFmt: MONEDA, font: { size: 10 } })
      poner(fila, COL.saldo, { formula: fSaldoCuenta(fila) }, { numFmt: MONEDA, font: { size: 10 } })
    }
    for (let c = COL.nombre; c <= COL.saldo; c++) celda(fila, c).border = bordeFino
    if (op.nombre) numeroConcepto++
    fila++
  }

  const colorDe = (titular: string) =>
    entrada.titulares.find((t) => t.nombre === titular)?.color ?? '#2447B8'

  const grupos: { nombre: string; titular: string; desde: number; hasta: number }[] = []
  for (const t of entrada.titulares) {
    // Primero las cuentas con inversiones, después las que no tienen.
    const ordenados = [...t.grupos].sort((a, b) => b.inversiones.length - a.inversiones.length)
    for (const g of ordenados) {
      const desde = fila
      const titular = t.nombre
      if (g.cuenta) filaResumen({ nombre: nombreDe(g.cuenta, titular), titular, clase: 'cuenta' })
      for (const inv of g.inversiones)
        filaResumen({
          nombre: nombreDe(inv.nombre, titular),
          titular,
          clase: 'inversion',
          pct: inv.rentabilidad,
          sangria: g.cuenta ? 1 : 0,
        })
      if (g.inversiones.length)
        grupos.push({ nombre: g.cuenta ? nombreDe(g.cuenta, titular) : titular, titular, desde, hasta: fila - 1 })
    }
  }
  // Filas libres al final: escribe aquí una inversión nueva y entra en los desplegables.
  for (let i = 0; i < libres; i++) filaResumen({ nombre: null, titular: '', clase: 'libre', sangria: 1 })

  const RES_N = fila - 1
  const rango = (c: Col) => `$${L[c]}$${RES_1}:$${L[c]}$${RES_N}`

  // El color de cada fila lo marca su titular: así quedan también las inversiones que añadas.
  ws.addConditionalFormatting({
    ref: `${L.nombre}${RES_1 + 3}:${L.nombre}${RES_N}`,
    rules: entrada.titulares.map((t, i) => ({
      type: 'expression' as const,
      formulae: [`AND($${L.nombre}${RES_1 + 3}<>"",$${L.titular}${RES_1 + 3}="${t.nombre}")`],
      priority: 6 + i,
      style: { font: { color: { argb: hexArgb(t.color) } } },
    })),
  })

  // Rentabilidad en verde si se gana y en rojo si se pierde.
  ws.addConditionalFormatting({
    ref: `${L.pct}${RES_1}:${L.euros}${RES_N}`,
    rules: [
      { type: 'cellIs', operator: 'greaterThan', formulae: ['0'], priority: 4, style: { font: { color: { argb: 'FF047857' } } } },
      { type: 'cellIs', operator: 'lessThan', formulae: ['0'], priority: 5, style: { font: { color: { argb: 'FFB91C1C' } } } },
    ],
  })

  // ── Totales ──────────────────────────────────────────────────────────────
  const filaTotal = (
    nombre: string,
    titular: string | null,
    f: { aportado: string; euros: string; saldo: string },
    fuerte = false,
  ) => {
    const ocultar = (formula: string) => siError(`IF(${formula}=0,"",${formula})`)
    poner(fila, COL.nombre, nombre, { font: { bold: true, size: fuerte ? 11 : 10, color: { argb: TINTA } } })
    if (titular) poner(fila, COL.titular, titular, { font: { size: 9, color: { argb: GRIS } }, alignment: { horizontal: 'center' } })
    poner(fila, COL.aportado, { formula: ocultar(f.aportado) }, { numFmt: MONEDA, font: { bold: true, size: fuerte ? 11 : 10 } })
    poner(fila, COL.pct, { formula: siError(`IF($${L.aportado}${fila}=0,"",$${L.euros}${fila}/$${L.aportado}${fila})`) }, { numFmt: PORCENTAJE, font: { bold: true, size: fuerte ? 11 : 10 } })
    poner(fila, COL.euros, { formula: ocultar(f.euros) }, { numFmt: MONEDA, font: { bold: true, size: fuerte ? 11 : 10 } })
    poner(fila, COL.saldo, { formula: ocultar(f.saldo) }, { numFmt: MONEDA, font: { bold: true, size: fuerte ? 11 : 10 } })
    for (let c = COL.nombre; c <= COL.saldo; c++) {
      const x = celda(fila, c)
      x.fill = relleno(fuerte ? AZUL : CABECERA_FILL)
      if (fuerte) x.font = { bold: true, size: 11, color: { argb: 'FFFFFFFF' } }
      if (c >= COL.aportado) x.alignment = { horizontal: 'right' }
    }
    fila++
  }

  fila++ // línea en blanco
  const suma = (c: Col, desde: number, hasta: number) => `SUM($${L[c]}$${desde}:$${L[c]}$${hasta})`
  const sumaTitular = (c: Col, titular: string) => `SUMIFS(${rango(c)},${rango('titular')},"${titular}")`
  // Cada cuenta con sus inversiones (solo si el titular tiene más de una: si no, basta con su total).
  for (const g of grupos) {
    const t = entrada.titulares.find((x) => x.nombre === g.titular)
    if (!t || t.grupos.length < 2) continue
    filaTotal(
      `Total ${g.nombre}`,
      null,
      { aportado: suma('aportado', g.desde, g.hasta), euros: suma('euros', g.desde, g.hasta), saldo: suma('saldo', g.desde, g.hasta) },
    )
  }
  // Un renglón por titular, seguidos y en orden: son las del gráfico.
  const filasGrafico: number[] = []
  const nombresGrafico: string[] = []
  for (const t of entrada.titulares) {
    if (t.grupos.length < 1) continue
    filasGrafico.push(fila)
    nombresGrafico.push(t.nombre)
    filaTotal(`Total ${t.nombre}`, t.nombre, {
      aportado: sumaTitular('aportado', t.nombre),
      euros: sumaTitular('euros', t.nombre),
      saldo: sumaTitular('saldo', t.nombre),
    })
  }
  // Y todo junto.
  const FILA_TOTAL = fila
  filaTotal('TOTAL', null, { aportado: suma('aportado', RES_1, RES_N), euros: suma('euros', RES_1, RES_N), saldo: suma('saldo', RES_1, RES_N) }, true)
  ws.getRow(FILA_TOTAL).height = 18

  // Notas.
  const nota = (f: number, texto: string) => {
    ws.mergeCells(f, 1, f, COL.saldo)
    poner(f, 1, texto, { font: { size: 9, italic: true, color: { argb: GRIS } } })
  }
  nota(FILA_TOTAL + 2, 'Para añadir una inversión: escribe su nombre (y su titular) en una fila libre del final. Para quitarla: borra su fila. Entra al momento en los desplegables.')
  nota(FILA_TOTAL + 3, 'En las inversiones se escribe la rentabilidad en % (la celda amarilla, como en la app) y el saldo se calcula solo. «Exterior» es el dinero que entra o sale de fuera; «Interés», lo que paga el banco (rentabilidad, no dinero aportado).')

  // ── Desplegables ─────────────────────────────────────────────────────────
  const NOMBRES = 'ListaNombres'
  for (const c of ['de', 'a'] as Col[]) {
    ws.dataValidations.add(`${L[c]}${RES_1}:${L[c]}${FILA_MOV_N}`, {
      type: 'list',
      formulae: [NOMBRES],
      allowBlank: true,
      showErrorMessage: false,
    })
  }
  ws.dataValidations.add(`${L.importe}${RES_1}:${L.importe}${FILA_MOV_N}`, {
    type: 'decimal',
    operator: 'greaterThan',
    formulae: ['0'],
    allowBlank: true,
    showErrorMessage: false,
  })


  // ── Impresión: una página ────────────────────────────────────────────────
  const FILA_GRAFICO = FILA_TOTAL + 4
  const ALTO_GRAFICO = 15
  ws.pageSetup.printArea = `A1:${L.saldo}${FILA_GRAFICO + ALTO_GRAFICO}`
  ws.pageSetup.printTitlesRow = `1:${FILA_CABECERAS}`

  const buffer = (await libro.xlsx.writeBuffer()) as ArrayBuffer

  // El nombre definido de los desplegables y el gráfico hay que añadirlos a mano.
  const ultima = (lista: number[]) => lista[lista.length - 1]
  return terminar(buffer, {
    nombre: { nombre: NOMBRES, formula: nombreDefinido(HOJA, RES_1, RES_N) },
    grafico: filasGrafico.length
      ? {
          hoja: HOJA,
          titulo: 'Aportado neto y beneficio / pérdida por titular',
          categorias: nombresGrafico,
          series: [
            // Lo que has puesto (azul) y lo que has ganado o perdido (naranja), como en el modelo.
            { nombre: 'Aportado neto', valores: `$${L.aportado}$${filasGrafico[0]}:$${L.aportado}$${ultima(filasGrafico)}`, color: '2563EB' },
            { nombre: 'Beneficio-pérdida', valores: `$${L.euros}$${filasGrafico[0]}:$${L.euros}$${ultima(filasGrafico)}`, color: 'E67E22' },
          ],
          desde: { col: 0, fila: FILA_GRAFICO },
          hasta: { col: 9, fila: FILA_GRAFICO + ALTO_GRAFICO },
        }
      : null,
  })
}

// ── El gráfico, a mano ─────────────────────────────────────────────────────

interface SerieGrafico {
  nombre: string
  /** Rango de los valores, p. ej. «$H$24:$H$26». */
  valores: string
  /** Color de las columnas (RRGGBB). */
  color: string
}

interface OpcionesGrafico {
  hoja: string
  titulo: string
  /** Nombre de cada grupo de barras, en orden (p. ej. los titulares). */
  categorias: string[]
  series: SerieGrafico[]
  desde: { col: number; fila: number }
  hasta: { col: number; fila: number }
}

/** Texto seguro para el XML del gráfico. */
function xml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function xmlChart(op: OpcionesGrafico): string {
  const categorias =
    `<c:cat><c:strLit><c:ptCount val="${op.categorias.length}"/>` +
    op.categorias.map((c, i) => `<c:pt idx="${i}"><c:v>${xml(c)}</c:v></c:pt>`).join('') +
    `</c:strLit></c:cat>`
  // El importe encima de cada barra, como en el modelo.
  const etiquetas = `
            <c:dLbls>
              <c:numFmt formatCode="#,##0.00 &quot;€&quot;" sourceLinked="0"/>
              <c:dLblPos val="outEnd"/>
              <c:showLegendKey val="0"/><c:showVal val="1"/><c:showCatName val="0"/><c:showSerName val="0"/>
              <c:showPercent val="0"/><c:showBubbleSize val="0"/>
            </c:dLbls>`
  const serie = (s: SerieGrafico, i: number) => `
        <c:ser>
          <c:idx val="${i}"/>
          <c:order val="${i}"/>
          <c:tx><c:v>${xml(s.nombre)}</c:v></c:tx>
          <c:spPr><a:solidFill><a:srgbClr val="${s.color}"/></a:solidFill><a:ln><a:noFill/></a:ln></c:spPr>
          <c:invertIfNegative val="0"/>${etiquetas}
          ${categorias}
          <c:val><c:numRef><c:f>${op.hoja}!${s.valores}</c:f></c:numRef></c:val>
        </c:ser>`
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <c:roundedCorners val="0"/>
  <c:chart>
    <c:title>
      <c:tx><c:v>${xml(op.titulo)}</c:v></c:tx>
      <c:overlay val="0"/>
      <c:txPr>
        <a:bodyPr/>
        <a:lstStyle/>
        <a:p><a:pPr><a:defRPr sz="1000" b="0"><a:solidFill><a:srgbClr val="334155"/></a:solidFill></a:defRPr></a:pPr><a:endParaRPr/></a:p>
      </c:txPr>
    </c:title>
    <c:autoTitleDeleted val="0"/>
    <c:plotArea>
      <c:layout/>
      <c:barChart>
        <c:barDir val="col"/>
        <c:grouping val="clustered"/>
        <c:varyColors val="0"/>${op.series.map(serie).join('')}
        <c:gapWidth val="60"/>
        <c:overlap val="-80"/>
        <c:axId val="100000001"/>
        <c:axId val="100000002"/>
      </c:barChart>
      <c:catAx>
        <c:axId val="100000001"/>
        <c:scaling><c:orientation val="minMax"/></c:scaling>
        <c:delete val="0"/>
        <c:axPos val="b"/>
        <c:majorTickMark val="none"/>
        <c:minorTickMark val="none"/>
        <c:tickLblPos val="nextTo"/>
        <c:crossAx val="100000002"/>
        <c:crosses val="autoZero"/>
        <c:auto val="1"/>
        <c:lblAlgn val="ctr"/>
        <c:lblOffset val="100"/>
        <c:noMultiLvlLbl val="0"/>
      </c:catAx>
      <c:valAx>
        <c:axId val="100000002"/>
        <c:scaling><c:orientation val="minMax"/></c:scaling>
        <c:delete val="0"/>
        <c:axPos val="l"/>
        <c:majorGridlines/>
        <c:numFmt formatCode="#,##0" sourceLinked="0"/>
        <c:majorTickMark val="none"/>
        <c:minorTickMark val="none"/>
        <c:tickLblPos val="nextTo"/>
        <c:crossAx val="100000001"/>
        <c:crosses val="autoZero"/>
        <c:crossBetween val="between"/>
      </c:valAx>
    </c:plotArea>
    <c:legend>
      <c:legendPos val="t"/>
      <c:overlay val="0"/>
      <c:txPr>
        <a:bodyPr/>
        <a:lstStyle/>
        <a:p><a:pPr><a:defRPr sz="900" b="0"><a:solidFill><a:srgbClr val="334155"/></a:solidFill></a:defRPr></a:pPr><a:endParaRPr/></a:p>
      </c:txPr>
    </c:legend>
    <c:plotVisOnly val="1"/>
    <c:dispBlanksAs val="gap"/>
  </c:chart>
  <c:spPr>
    <a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill>
    <a:ln><a:solidFill><a:srgbClr val="D8DEE9"/></a:solidFill></a:ln>
  </c:spPr>
</c:chartSpace>`
}

function xmlDrawing(op: OpcionesGrafico): string {
  const desde = { col: op.desde.col, row: op.desde.fila - 1 }
  const hasta = { col: op.hasta.col, row: op.hasta.fila - 1 }
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
  <xdr:twoCellAnchor>
    <xdr:from>
      <xdr:col>${desde.col}</xdr:col>
      <xdr:colOff>0</xdr:colOff>
      <xdr:row>${desde.row}</xdr:row>
      <xdr:rowOff>0</xdr:rowOff>
    </xdr:from>
    <xdr:to>
      <xdr:col>${hasta.col}</xdr:col>
      <xdr:colOff>0</xdr:colOff>
      <xdr:row>${hasta.row}</xdr:row>
      <xdr:rowOff>0</xdr:rowOff>
    </xdr:to>
    <xdr:graphicFrame macro="">
      <xdr:nvGraphicFramePr>
        <xdr:cNvPr id="2" name="Grafico"/>
        <xdr:cNvGraphicFramePr/>
      </xdr:nvGraphicFramePr>
      <xdr:xfrm>
        <a:off x="0" y="0"/>
        <a:ext cx="0" cy="0"/>
      </xdr:xfrm>
      <a:graphic>
        <a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart">
          <c:chart xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:id="rId1"/>
        </a:graphicData>
      </a:graphic>
    </xdr:graphicFrame>
    <xdr:clientData/>
  </xdr:twoCellAnchor>
</xdr:wsDr>`
}

/**
 * Remata el archivo: le mete el nombre definido de los desplegables (exceljs solo escribe rangos
 * fijos) y, si hay titulares, el gráfico de dos barras por titular.
 */
async function terminar(
  buffer: ArrayBuffer,
  op: { nombre: { nombre: string; formula: string }; grafico: OpcionesGrafico | null },
): Promise<ArrayBuffer> {
  const JSZip = await cargarJSZip()
  const zip = await new JSZip().loadAsync(buffer)
  const REL_DIBUJO = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing'
  const REL_CHART = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart'

  // Nombre definido: la lista de los desplegables, sin huecos.
  const libroXml = await zip.file('xl/workbook.xml')!.async('string')
  const definido = `<definedName name="${op.nombre.nombre}">${op.nombre.formula}</definedName>`
  zip.file(
    'xl/workbook.xml',
    libroXml.includes('<definedNames>')
      ? libroXml.replace('<definedNames>', `<definedNames>${definido}`)
      : libroXml.replace('</workbook>', `<definedNames>${definido}</definedNames></workbook>`),
  )

  if (!op.grafico) return zip.generateAsync({ type: 'arraybuffer', compression: 'DEFLATE' })

  zip.file('xl/charts/chart1.xml', xmlChart(op.grafico))
  zip.file('xl/drawings/drawing1.xml', xmlDrawing(op.grafico))
  zip.file(
    'xl/drawings/_rels/drawing1.xml.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${REL_CHART}" Target="../charts/chart1.xml"/></Relationships>`,
  )

  // La hoja apunta al dibujo (si la hoja no tenía relaciones todavía, se crean).
  const RELS = 'xl/worksheets/_rels/sheet1.xml.rels'
  const parte = zip.file(RELS)
  const relsHoja = parte
    ? await parte.async('string')
    : '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>'
  const ids = [...relsHoja.matchAll(/Id="rId(\d+)"/g)].map((m) => Number(m[1]))
  const id = Math.max(0, ...ids) + 1
  zip.file(
    'xl/worksheets/_rels/sheet1.xml.rels',
    relsHoja.replace('</Relationships>', `<Relationship Id="rId${id}" Type="${REL_DIBUJO}" Target="../drawings/drawing1.xml"/></Relationships>`),
  )

  const hoja = await zip.file('xl/worksheets/sheet1.xml')!.async('string')
  zip.file('xl/worksheets/sheet1.xml', hoja.replace('</worksheet>', `<drawing r:id="rId${id}"/></worksheet>`))

  // Y los tipos de contenido de las partes nuevas.
  const tipos = await zip.file('[Content_Types].xml')!.async('string')
  zip.file(
    '[Content_Types].xml',
    tipos.replace(
      '</Types>',
      '<Override PartName="/xl/drawings/drawing1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>' +
        '<Override PartName="/xl/charts/chart1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/></Types>',
    ),
  )

  return zip.generateAsync({ type: 'arraybuffer', compression: 'DEFLATE' })
}
