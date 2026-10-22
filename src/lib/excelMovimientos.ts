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
/** Ancho de cada columna (A hasta O), en caracteres: lo usa la hoja y el dibujo del flujo. */
const ANCHO_COL = [11, 21, 21, 12, 2, 29, 11, 15, 10, 12, 13, 15, 15, 15, 15]
/** Lo que mide la hoja de ancho, en píxeles. */
const ANCHO_HOJA = ANCHO_COL.reduce((total, ancho) => total + Math.round(ancho * 7) + 5, 0)
const FILA_CABECERAS = 5
const RES_1 = 6 // Primera fila del resumen (y de los movimientos).
const EXTERIOR = 'Exterior'
/** Cuántas filas de movimientos hay: se van destapando según se escriben. */
const FILAS_MOV_TOTAL = 500

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

/** Deja el nombre en corto: fuera lo que va entre paréntesis y lo que sobre de 30 letras. */
function acortar(nombre: string): string {
  let s = nombre
    .replace(/\s*\([^)]*\)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (s.length > 30) {
    const corte = s.slice(0, 30)
    const espacio = corte.lastIndexOf(' ')
    s = espacio > 14 ? corte.slice(0, espacio) : corte
  }
  return s || nombre
}

/**
 * Nombres cortos y distintos: si dos inversiones se llaman igual («iShares Developed World Index (IE)
 * Acc EUR clase s» en dos cuentas), salen las dos en corto y la segunda con un número al final.
 */
function nombresCortos(entrada: EntradaExcel) {
  const conteo = new Map<string, number>()
  const cuenta = (nombre: string) => conteo.set(nombre, (conteo.get(nombre) ?? 0) + 1)
  for (const t of entrada.titulares)
    for (const g of t.grupos) {
      if (g.cuenta) cuenta(acortar(g.cuenta))
      for (const i of g.inversiones) cuenta(acortar(i.nombre))
    }
  const visto = new Map<string, number>()
  const asignar = (nombre: string) => {
    const corto = acortar(nombre)
    if ((conteo.get(corto) ?? 0) <= 1) return corto
    const n = (visto.get(corto) ?? 0) + 1
    visto.set(corto, n)
    return n === 1 ? corto : `${corto} ${n}`
  }
  // Se reparten una sola vez y en el orden en que salen las filas.
  const enOrden: string[] = []
  for (const t of entrada.titulares)
    for (const g of [...t.grupos].sort((a, b) => b.inversiones.length - a.inversiones.length)) {
      if (g.cuenta) enOrden.push(asignar(g.cuenta))
      for (const i of g.inversiones) enOrden.push(asignar(i.nombre))
    }
  let siguiente = 0
  return () => enOrden[siguiente++] ?? ''
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
  // Siete filas libres: una a la vista y seis listas para cuando rellenes la primera.
  const libres = entrada.libres ?? 7
  const FILAS_MOV = Math.max(FILAS_MOV_TOTAL, entrada.movimientos.length + 1)
  const FILA_MOV_N = RES_1 + FILAS_MOV - 1

  const ws = libro.addWorksheet(HOJA, {
    views: [{ state: 'frozen', ySplit: FILA_CABECERAS, showGridLines: false }],
    pageSetup: {
      orientation: 'landscape',
      paperSize: 9, // A4
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      margins: { left: 0.3, right: 0.3, top: 0.4, bottom: 0.4, header: 0, footer: 0 },
    },
  })
  ws.properties.tabColor = { argb: AZUL }

  ANCHO_COL.forEach((ancho, i) => (ws.getColumn(i + 1).width = ancho))

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
  poner(FILA_TITULO, 1, 'Myinvestor', {
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
    [COL.nombre, 'Inversiones'],
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
    // Los movimientos son lo único que se escribe a mano: fecha, de, a e importe.
    for (const c of [COL.fecha, COL.de, COL.a, COL.importe]) celda(f, c).protection = { locked: false }
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
  const siError = (formula: string) => `IFERROR(${formula},"")`

  const literal = (s: string) => `"${s.replace(/"/g, '""')}"`
  /** Lo que ha entrado en un nombre (o en la celda que se le pase, p. ej. «$F7»). */
  const entra = (nombre: string) => `SUMIFS(${IMP},${A},${nombre})`
  const sale = (nombre: string) => `SUMIFS(${IMP},${DE},${nombre})`
  const seMueve = (nombre: string) => `COUNTIF(${A},${nombre})+COUNTIF(${DE},${nombre})`
  const H = (f: number) => `$${L.aportado}${f}`
  /**
   * «Cerrado»: el dinero que entró ya se ha ido. Lo que sale de una inversión es su saldo (lo
   * aportado más la rentabilidad), así que al sacarlo todo el capital queda a cero y la fila
   * desaparece del resumen. Una cuenta solo desaparece si, además, no le queda ninguna inversión
   * a la vista (si el dinero está invertido, la cuenta sigue ahí aunque marque cero).
   */
  const cerrado = (nombre: string, clase: string, filasInv: [number, number] | null) => {
    const vacias = filasInv ? `SUMPRODUCT(--(${H(filasInv[0])}:${H(filasInv[1])}<>""))=0` : null
    const condiciones =
      clase === 'cuenta'
        ? [`${seMueve(nombre)}>0`, `${entra(nombre)}-${sale(nombre)}<=0`, ...(vacias ? [vacias] : [])]
        : [`${entra(nombre)}>0`, `${entra(nombre)}-${sale(nombre)}<=0`]
    return `AND(${condiciones.join(',')})`
  }
  /** Capital aportado: lo que entra menos lo que sale. */
  const fAportado = (f: number, nombre: string, cierra: string) =>
    siError(`IF($${L.nombre}${f}="","",IF(${cierra},"",${entra(nombre)}-${sale(nombre)}))`)
  /** Saldo de una cuenta: lo que entra menos lo que sale. */
  const fSaldoCuenta = (f: number, nombre: string, cierra: string) =>
    siError(`IF($${L.nombre}${f}="","",IF(${cierra},"",${entra(nombre)}-${sale(nombre)}))`)
  /** Saldo de una inversión: su capital por lo que suba o baje el % que escribas. */
  const fSaldoInversion = (f: number, cierra: string) =>
    siError(
      `IF($${L.nombre}${f}="","",IF(${cierra},"",IF(OR(${H(f)}="",${H(f)}=0),"",IF($${L.pct}${f}="",${H(f)},${H(f)}*(1+$${L.pct}${f})))))`,
    )
  const fEuros = (f: number, cierra: string) =>
    siError(
      `IF($${L.nombre}${f}="","",IF(${cierra},"",IF(OR(${H(f)}="",$${L.saldo}${f}=""),"",$${L.saldo}${f}-${H(f)})))`,
    )
  const fPct = (f: number, cierra: string) =>
    siError(`IF($${L.nombre}${f}="","",IF(${cierra},"",IF(OR(${H(f)}=0,${H(f)}=""),"",$${L.euros}${f}/${H(f)})))`)

  // ── Resumen ──────────────────────────────────────────────────────────────
  const nombreDe = nombresCortos(entrada)
  let fila = RES_1
  let numeroConcepto = 0

  const especial = (nombre: string) => {
    poner(fila, COL.nombre, nombre, { font: { italic: true, bold: true, size: 10, color: { argb: TINTA } } })
    for (let c = COL.titular; c <= COL.saldo; c++) celda(fila, c).fill = relleno(GRIS_CLARO)
    numeroConcepto++
    fila++
  }
  especial(EXTERIOR)

  const filaResumen = (op: {
    nombre: string | null
    titular: string
    clase: 'cuenta' | 'inversion' | 'libre'
    pct?: number | null
    sangria?: number
    /** Filas de las inversiones de esta cuenta (para que la cuenta no desaparezca antes). */
    filasInv?: [number, number] | null
  }) => {
    const esLibre = op.clase === 'libre'
    const nombre = op.nombre ? literal(op.nombre) : `$${L.nombre}${fila}`
    const cierra = cerrado(nombre, op.clase, op.filasInv ?? null)
    // Las filas libres empiezan escondidas (letra blanca): el formato condicional las destapa.
    const color = esLibre ? 'FFFFFFFF' : numeroConcepto < 3 ? TINTA : hexArgb(colorDe(op.titular))
    const letra = (size = 10) => ({ size, color: { argb: color } })
    poner(fila, COL.nombre, op.nombre, {
      font: { ...letra(), bold: op.clase === 'cuenta' },
      alignment: { indent: op.sangria ?? 0 },
    })
    poner(fila, COL.titular, esLibre ? null : op.titular, {
      font: { size: 9, color: { argb: esLibre ? 'FFFFFFFF' : GRIS } },
      alignment: { horizontal: 'center' },
    })
    poner(fila, COL.aportado, { formula: fAportado(fila, nombre, cierra) }, { numFmt: MONEDA, font: letra() })
    if (op.clase === 'inversion' || esLibre) {
      // El % lo escribes tú (el de la app); de ahí salen los euros y el saldo.
      poner(fila, COL.pct, op.pct ?? null, { numFmt: PORCENTAJE, font: letra() })
      poner(fila, COL.euros, { formula: fEuros(fila, cierra) }, { numFmt: MONEDA, font: letra() })
      poner(fila, COL.saldo, { formula: fSaldoInversion(fila, cierra) }, { numFmt: MONEDA, font: letra() })
    } else {
      poner(fila, COL.pct, { formula: fPct(fila, cierra) }, { numFmt: PORCENTAJE, font: letra() })
      poner(fila, COL.euros, { formula: fEuros(fila, cierra) }, { numFmt: MONEDA, font: letra() })
      poner(fila, COL.saldo, { formula: fSaldoCuenta(fila, nombre, cierra) }, { numFmt: MONEDA, font: letra() })
    }
    if (!esLibre) for (let c = COL.nombre; c <= COL.saldo; c++) celda(fila, c).border = bordeFino
    // Lo único que se puede escribir: el nombre y el titular de las filas libres, y el % de cada
    // inversión (que es la rentabilidad).
    if (esLibre)
      for (const c of [COL.nombre, COL.titular, COL.pct]) celda(fila, c).protection = { locked: false }
    if (op.clase === 'inversion' || esLibre) celda(fila, COL.pct).protection = { locked: false }
    if (op.nombre) numeroConcepto++
    fila++
  }

  const colorDe = (titular: string) =>
    entrada.titulares.find((t) => t.nombre === titular)?.color ?? '#2447B8'

  const grupos: { nombre: string; titular: string; desde: number; hasta: number }[] = []
  // Cada fila escrita: para el gráfico de las inversiones de cada titular y para el flujo.
  const hechas: { clase: 'cuenta' | 'inversion'; corto: string; titular: string; fila: number }[] = []
  // Los caminos del dinero que existen aunque no haya movimientos: así se ve también la plantilla.
  const caminos: { de: string; a: string }[] = []
  for (const t of entrada.titulares) {
    // Primero las cuentas con inversiones, después las que no tienen.
    const ordenados = [...t.grupos].sort((a, b) => b.inversiones.length - a.inversiones.length)
    for (const g of ordenados) {
      const desde = fila
      const titular = t.nombre
      const nombreCuenta = g.cuenta ? nombreDe() : ''
      const cuantas = g.inversiones.length
      if (g.cuenta) {
        const f = fila
        filaResumen({
          nombre: nombreCuenta,
          titular,
          clase: 'cuenta',
          filasInv: cuantas ? [f + 1, f + cuantas] : null,
        })
        hechas.push({ clase: 'cuenta', corto: nombreCuenta, titular, fila: f })
        if (cuantas) caminos.push({ de: EXTERIOR, a: nombreCuenta })
      }
      for (const inv of g.inversiones) {
        const f = fila
        const corto = nombreDe()
        filaResumen({ nombre: corto, titular, clase: 'inversion', pct: inv.rentabilidad, sangria: g.cuenta ? 1 : 0 })
        hechas.push({ clase: 'inversion', corto, titular, fila: f })
        caminos.push({ de: g.cuenta ? nombreCuenta : EXTERIOR, a: corto })
      }
      if (g.inversiones.length)
        grupos.push({ nombre: g.cuenta ? nombreCuenta : titular, titular, desde, hasta: fila - 1 })
    }
  }
  // Filas libres al final: solo se ve una. Al escribir el nombre sale la siguiente; al borrarlo,
  // desaparece. Escribe aquí una inversión nueva y entra al momento en los desplegables.
  const LIBRE_1 = fila
  const LIBRE_N = LIBRE_1 + libres - 1
  for (let i = 0; i < libres; i++) filaResumen({ nombre: null, titular: '', clase: 'libre', sangria: 1 })
  const estilo = { font: { size: 10, color: { argb: TINTA } }, border: bordeFino }
  ws.addConditionalFormatting({
    ref: `${L.nombre}${LIBRE_1}:${L.saldo}${LIBRE_N}`,
    rules: [
      // La fila escrita se ve normal…
      {
        type: 'expression',
        formulae: [`$${L.nombre}${LIBRE_1}<>""`],
        priority: 1,
        style: estilo,
      },
      // …y la que toca (la primera vacía) se ve en amarillo, lista para escribir.
      {
        type: 'expression',
        formulae: [`AND($${L.nombre}${LIBRE_1 - 1}<>"",$${L.nombre}${LIBRE_1}="")`],
        priority: 2,
        style: { ...estilo, fill: relleno(AMARILLO) },
      },
      // Las demás van en blanco: no estorban.
      {
        type: 'expression',
        formulae: [`$${L.nombre}${LIBRE_1 - 1}=""`],
        priority: 3,
        style: { font: { size: 10, color: { argb: 'FFFFFFFF' } } },
      },
    ],
  })
  // La casilla del % se pinta de amarillo solo cuando la fila se ve.
  ws.addConditionalFormatting({
    ref: `${L.pct}${LIBRE_1}:${L.pct}${LIBRE_N}`,
    rules: [
      {
        type: 'expression',
        formulae: [`$${L.nombre}${LIBRE_1}<>""`],
        priority: 4,
        style: { fill: relleno(AMARILLO) },
      },
      {
        type: 'expression',
        formulae: [`AND($${L.nombre}${LIBRE_1 - 1}<>"",$${L.nombre}${LIBRE_1}="")`],
        priority: 5,
        style: { fill: relleno(AMARILLO) },
      },
    ],
  })

  // Lo que se queda a cero desaparece: las fórmulas se vacían y lo que quede se va en blanco.
  if (LIBRE_1 - 1 > RES_1)
    ws.addConditionalFormatting({
      ref: `${L.nombre}${RES_1 + 1}:${L.saldo}${LIBRE_1 - 1}`,
      rules: [
        {
          type: 'expression',
          formulae: [`$${L.aportado}${RES_1 + 1}=""`],
          priority: 1,
          style: { font: { size: 10, color: { argb: 'FFFFFFFF' } } },
        },
      ],
    })

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
  // Cada cuenta con sus inversiones, pero solo si el titular tiene más de una cuenta con
  // inversiones: si solo tiene una, su total y el de la cuenta son el mismo y no se repite.
  for (const g of grupos) {
    const cuantas = grupos.filter((x) => x.titular === g.titular).length
    if (cuantas < 2) continue
    filaTotal(
      `Total ${g.nombre}`,
      null,
      { aportado: suma('aportado', g.desde, g.hasta), euros: suma('euros', g.desde, g.hasta), saldo: suma('saldo', g.desde, g.hasta) },
    )
  }
  // Un renglón por titular, seguidos y en orden: son las del gráfico. Si el titular tiene una sola
  // cuenta, el renglón lleva los dos nombres («Total Cuenta Myinvestor-Luis»).
  const filasGrafico: number[] = []
  const nombresGrafico: string[] = []
  for (const t of entrada.titulares) {
    if (t.grupos.length < 1) continue
    filasGrafico.push(fila)
    nombresGrafico.push(t.nombre)
    const conInversiones = t.grupos.filter((g) => g.cuenta && g.inversiones.length)
    const nombre =
      conInversiones.length === 1 && conInversiones[0].cuenta !== t.nombre
        ? `Total ${conInversiones[0].cuenta}-${t.nombre}`
        : `Total ${t.nombre}`
    filaTotal(nombre, t.nombre, {
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
  nota(FILA_TOTAL + 2, 'Para añadir una inversión: escribe su nombre (y su titular) en la fila amarilla; al rellenarla sale la siguiente. Para quitarla: borra su nombre y desaparece. Entra al momento en los desplegables.')
  nota(FILA_TOTAL + 3, 'En las inversiones se escribe la rentabilidad en % (la celda amarilla, como en la app) y el saldo se calcula solo. «Exterior» es el dinero que entra o sale de fuera. La hoja está protegida: solo se puede escribir en los movimientos, en las filas nuevas y en el %.')

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


  // ── Impresión: el resumen en la página 1, los gráficos en la 2 y el flujo en la 3 ─────────
  const FILA_GRAFICOS = FILA_TOTAL + 6
  const ALTO_GRAFICO = 30
  // Medias hojas: el primer gráfico a la izquierda y el segundo a la derecha.
  const MEDIAS = [
    { desde: 0, hasta: 6 },
    { desde: 8, hasta: 14 },
  ]
  const dibujos: Dibujo[] = []
  const graficos: Omit<OpcionesGrafico, 'desde' | 'hasta'>[] = []

  // El de siempre: dos barras por titular (lo puesto y lo ganado o perdido).
  if (filasGrafico.length)
    graficos.push({
      hoja: HOJA,
      titulo: 'Aportado neto y beneficio / pérdida por titular',
      categorias: nombresGrafico,
      series: [
        // Lo que has puesto (azul) y lo que has ganado o perdido (naranja), como en el modelo.
        {
          nombre: 'Aportado neto',
          valores: `$${L.aportado}$${filasGrafico[0]}:$${L.aportado}$${filasGrafico[filasGrafico.length - 1]}`,
          color: '2563EB',
        },
        {
          nombre: 'Beneficio-pérdida',
          valores: `$${L.euros}$${filasGrafico[0]}:$${L.euros}$${filasGrafico[filasGrafico.length - 1]}`,
          color: 'E67E22',
        },
      ],
    })
  // Y uno por titular con sus inversiones: es el del «Fondo ahorro» (inversión por inversión).
  for (const t of entrada.titulares) {
    const filas = hechas.filter((h) => h.clase === 'inversion' && h.titular === t.nombre).map((h) => h.fila)
    if (!filas.length) continue
    const desde = filas[0]
    const hasta = filas[filas.length - 1]
    graficos.push({
      hoja: HOJA,
      titulo: `${t.nombre}: inversión por inversión`,
      categorias: hechas.filter((h) => h.clase === 'inversion' && h.titular === t.nombre).map((h) => h.corto),
      series: [
        { nombre: 'Aportado neto', valores: `$${L.aportado}$${desde}:$${L.aportado}$${hasta}`, color: '2563EB' },
        { nombre: 'Beneficio-pérdida', valores: `$${L.euros}$${desde}:$${L.euros}$${hasta}`, color: 'E67E22' },
      ],
    })
  }
  graficos.slice(0, 4).forEach((g, i) => {
    const media = MEDIAS[i % 2]
    const arriba = FILA_GRAFICOS + Math.floor(i / 2) * (ALTO_GRAFICO + 2)
    dibujos.push({
      grafico: g,
      desde: { col: media.desde, fila: arriba },
      hasta: { col: media.hasta, fila: arriba + ALTO_GRAFICO },
    })
  })

  // El flujo del dinero, en su página.
  const FILA_FLUJO =
    FILA_GRAFICOS + Math.ceil(Math.min(graficos.length, 4) / 2) * (ALTO_GRAFICO + 2) + 2
  const rutas = rutasDelFlujo(entrada, caminos)
  const altoFlujo = rutas.length ? Math.ceil((40 + rutas.length * PASO_FLUJO) / 20) + 2 : 0
  if (rutas.length)
    dibujos.push({
      formas: xmlFlujo(rutas, altoFlujo),
      desde: { col: 0, fila: FILA_FLUJO },
      hasta: { col: 14, fila: FILA_FLUJO + altoFlujo },
    })

  ws.pageSetup.printArea = `A1:O${FILA_FLUJO + Math.max(altoFlujo, 4)}`
  ws.pageSetup.printTitlesRow = `1:${FILA_CABECERAS}`
  const saltos = [FILA_GRAFICOS, ...(rutas.length ? [FILA_FLUJO] : [])]

  // Protegida: solo se puede escribir en los movimientos, en las filas nuevas y en el % de cada
  // inversión. Se puede elegir cualquier celda y borrar o añadir filas (para quitar una inversión
  // que quede a cero o para meter una nueva). Sin contraseña: «Revisar → Desproteger hoja».
  // (Los permisos concretos se escriben a mano en terminar(): exceljs no saca todas las opciones.)
  await ws.protect('')

  const buffer = (await libro.xlsx.writeBuffer()) as ArrayBuffer

  // El nombre definido de los desplegables, los gráficos y el flujo hay que añadirlos a mano.
  return terminar(buffer, {
    nombre: { nombre: NOMBRES, formula: nombreDefinido(HOJA, RES_1, RES_N) },
    dibujos,
    saltos,
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

/** Algo que se dibuja encima de la hoja: un gráfico de barras o las formas del flujo. */
interface Dibujo {
  /** Esquina de arriba a la izquierda (las columnas y las filas se cuentan desde cero). */
  desde: { col: number; fila: number }
  /** Esquina de abajo a la derecha. */
  hasta: { col: number; fila: number }
  /** Un gráfico de barras. */
  grafico?: Omit<OpcionesGrafico, 'desde' | 'hasta'>
  /** Las formas del flujo del dinero, ya en XML. */
  formas?: string
}

/** Texto seguro para el XML del gráfico. */
function xml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function xmlChart(op: Omit<OpcionesGrafico, 'desde' | 'hasta'>): string {
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
      <c:tx>
        <c:rich>
          <a:bodyPr/>
          <a:lstStyle/>
          <a:p>
            <a:pPr><a:defRPr sz="1000" b="0"><a:solidFill><a:srgbClr val="334155"/></a:solidFill></a:defRPr></a:pPr>
            <a:r><a:rPr lang="es-ES" sz="1000"/><a:t>${xml(op.titulo)}</a:t></a:r>
            <a:endParaRPr/>
          </a:p>
        </c:rich>
      </c:tx>
      <c:overlay val="0"/>
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

/** Un ancla: lo que se dibuja va dentro, entre la celda de arriba y la de abajo. */
function xmlAncla(d: Dibujo, cuerpo: string): string {
  return `
  <xdr:twoCellAnchor>
    <xdr:from>
      <xdr:col>${d.desde.col}</xdr:col>
      <xdr:colOff>0</xdr:colOff>
      <xdr:row>${d.desde.fila - 1}</xdr:row>
      <xdr:rowOff>0</xdr:rowOff>
    </xdr:from>
    <xdr:to>
      <xdr:col>${d.hasta.col}</xdr:col>
      <xdr:colOff>0</xdr:colOff>
      <xdr:row>${d.hasta.fila - 1}</xdr:row>
      <xdr:rowOff>0</xdr:rowOff>
    </xdr:to>${cuerpo}
    <xdr:clientData/>
  </xdr:twoCellAnchor>`
}

/** Un gráfico colgado de una relación del dibujo (rId1, rId2…). */
function xmlGrafico(id: number, nombre: string): string {
  return `
    <xdr:graphicFrame macro="">
      <xdr:nvGraphicFramePr>
        <xdr:cNvPr id="${id + 1}" name="${nombre}"/>
        <xdr:cNvGraphicFramePr/>
      </xdr:nvGraphicFramePr>
      <xdr:xfrm>
        <a:off x="0" y="0"/>
        <a:ext cx="0" cy="0"/>
      </xdr:xfrm>
      <a:graphic>
        <a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart">
          <c:chart xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:id="rId${id}"/>
        </a:graphicData>
      </a:graphic>
    </xdr:graphicFrame>`
}

// ── El flujo del dinero: de dónde llega, por dónde pasa y a dónde va ────────

/** Un píxel, en EMU (lo que usa el XML para medir). */
const PX = 9525
/** Alto de cada línea del flujo, en píxeles. */
const PASO_FLUJO = 76
/** Ancho de cada una de las tres columnas del flujo: llega · pasa · se queda. */
const COL_FLUJO = 520
const ANCHO_CAJA = 300
const ALTO_CAJA = 46

interface RutaFlujo {
  de: string
  a: string
  importe: number
  /** Columna en la que se dibuja cada nombre: 0 llega, 1 pasa, 2 se queda. */
  deCol: number
  aCol: number
}

const euros = (n: number) =>
  `${new Intl.NumberFormat('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)} €`

/**
 * Los caminos del dinero: los de los movimientos (con su importe) y, si no hay movimientos, los
 * que marca la estructura («Exterior → cuenta → inversión») para que la plantilla también se vea.
 */
function rutasDelFlujo(entrada: EntradaExcel, caminos: { de: string; a: string }[]): RutaFlujo[] {
  const importes = new Map<string, number>()
  const clave = (de: string, a: string) => `${de}\u0000${a}`
  const anotar = (de: string, a: string, importe: number) => {
    if (!de || !a || de === a) return
    importes.set(clave(de, a), (importes.get(clave(de, a)) ?? 0) + importe)
  }
  for (const m of entrada.movimientos) anotar(m.de, m.a, m.importe)
  for (const c of caminos) if (!importes.has(clave(c.de, c.a))) anotar(c.de, c.a, 0)

  const rutas = [...importes].map(([k, importe]) => {
    const [de, a] = k.split('\u0000')
    return { de, a, importe }
  })
  // El piso de cada nombre: 0 si el dinero llega de fuera, 1 si pasa por una cuenta y 2 si es
  // donde se queda. El «Exterior» siempre es el principio del camino.
  const nivel = new Map<string, number>([[EXTERIOR, 0]])
  for (const r of rutas) {
    nivel.set(r.de, nivel.get(r.de) ?? 0)
    nivel.set(r.a, nivel.get(r.a) ?? 0)
  }
  for (let vez = 0; vez < 6; vez++)
    for (const r of rutas) {
      if (r.a === EXTERIOR) continue
      const nuevo = Math.min(2, (nivel.get(r.de) ?? 0) + 1)
      if (nuevo > (nivel.get(r.a) ?? 0)) nivel.set(r.a, nuevo)
    }
  return rutas
    .map((r) => ({ ...r, deCol: nivel.get(r.de) ?? 0, aCol: nivel.get(r.a) ?? 1 }))
    .filter((r) => r.aCol > r.deCol && r.aCol <= 2)
    .sort(
      (x, y) =>
        x.deCol - y.deCol ||
        Number(y.importe > 0) - Number(x.importe > 0) ||
        y.importe - x.importe ||
        x.de.localeCompare(y.de, 'es'),
    )
    .slice(0, 14)
}

const colorDePiso = (piso: number) => (piso === 0 ? '64748B' : piso === 1 ? '1D4ED8' : '0F766E')

interface Forma {
  id: number
  nombre: string
  x: number
  y: number
  ancho: number
  alto: number
  texto: string
  /** Relleno: `null` si la caja va sin pintar. */
  relleno: string | null
  linea: string | null
  tinta: string
  tamano?: number
  negrita?: boolean
  /** Una flecha en vez de una caja. */
  flecha?: boolean
}

function xmlForma(op: Forma): string {
  const emu = (n: number) => Math.round(n * PX)
  const sz = (op.tamano ?? 10) * 100
  const b = op.negrita ? '1' : '0'
  const geom = op.flecha
    ? '<a:prstGeom prst="rightArrow"><a:avLst><a:gd name="adj1" fmla="50000"/><a:gd name="adj2" fmla="50000"/></a:avLst></a:prstGeom>'
    : '<a:prstGeom prst="roundRect"><a:avLst><a:gd name="adj" fmla="16667"/></a:avLst></a:prstGeom>'
  const relleno = op.relleno ? `<a:solidFill><a:srgbClr val="${op.relleno}"/></a:solidFill>` : '<a:noFill/>'
  const linea = op.linea
    ? `<a:ln w="9525"><a:solidFill><a:srgbClr val="${op.linea}"/></a:solidFill></a:ln>`
    : '<a:ln><a:noFill/></a:ln>'
  return `
    <xdr:sp>
      <xdr:nvSpPr><xdr:cNvPr id="${op.id}" name="${xml(op.nombre)}"/><xdr:cNvSpPr/></xdr:nvSpPr>
      <xdr:spPr>
        <a:xfrm><a:off x="${emu(op.x)}" y="${emu(op.y)}"/><a:ext cx="${emu(op.ancho)}" cy="${emu(op.alto)}"/></a:xfrm>
        ${geom}${relleno}${linea}
      </xdr:spPr>
      <xdr:txBody>
        <a:bodyPr wrap="square" lIns="27432" tIns="18288" rIns="27432" bIns="18288" anchor="ctr"><a:noAutofit/></a:bodyPr>
        <a:lstStyle/>
        <a:p>
          <a:pPr algn="ctr"><a:defRPr sz="${sz}" b="${b}"><a:solidFill><a:srgbClr val="${op.tinta}"/></a:solidFill></a:defRPr></a:pPr>
          <a:r><a:rPr lang="es-ES" sz="${sz}" b="${b}"><a:solidFill><a:srgbClr val="${op.tinta}"/></a:solidFill></a:rPr><a:t>${xml(op.texto)}</a:t></a:r>
          <a:endParaRPr/>
        </a:p>
      </xdr:txBody>
    </xdr:sp>`
}

/**
 * El dibujo del flujo: una caja por nombre y una flecha con el dinero que va de una a otra. Va
 * dentro de un grupo (el ancla del dibujo solo admite una forma).
 */
function xmlFlujo(rutas: RutaFlujo[], altoFilas: number): string {
  const formas: string[] = [
    xmlForma({
      id: 1,
      nombre: 'Titulo del flujo',
      x: 0,
      y: 0,
      ancho: COL_FLUJO * 3,
      alto: 32,
      texto: 'Flujo del dinero: de dónde llega, por dónde pasa y a dónde va',
      relleno: null,
      linea: null,
      tinta: '0F172A',
      tamano: 12,
      negrita: true,
    }),
  ]
  const ancho = ANCHO_HOJA * PX
  const alto = altoFilas * 20 * PX
  rutas.forEach((r, i) => {
    const y = 40 + i * PASO_FLUJO
    const xDe = 110 + r.deCol * COL_FLUJO
    const xA = 110 + r.aCol * COL_FLUJO
    formas.push(
      xmlForma({
        id: 2 + i * 3,
        nombre: `De ${i + 1}`,
        x: xDe,
        y,
        ancho: ANCHO_CAJA,
        alto: ALTO_CAJA,
        texto: r.de,
        relleno: colorDePiso(r.deCol),
        linea: null,
        tinta: 'FFFFFF',
      }),
    )
    const x = xDe + ANCHO_CAJA + 8
    formas.push(
      xmlForma({
        id: 3 + i * 3,
        nombre: `Flecha ${i + 1}`,
        x,
        y: y + 8,
        ancho: xA - 8 - x,
        alto: 30,
        texto: r.importe > 0 ? euros(r.importe) : '',
        relleno: r.importe > 0 ? 'EFF6FF' : 'F1F5F9',
        linea: r.importe > 0 ? '93C5FD' : 'CBD5E1',
        tinta: '1D4ED8',
        tamano: 9,
        flecha: true,
      }),
    )
    formas.push(
      xmlForma({
        id: 4 + i * 3,
        nombre: `A ${i + 1}`,
        x: xA,
        y,
        ancho: ANCHO_CAJA,
        alto: ALTO_CAJA,
        texto: r.a,
        relleno: colorDePiso(r.aCol),
        linea: null,
        tinta: 'FFFFFF',
      }),
    )
  })
  return `
    <xdr:grpSp>
      <xdr:nvGrpSpPr><xdr:cNvPr id="1" name="Flujo del dinero"/><xdr:cNvGrpSpPr/></xdr:nvGrpSpPr>
      <xdr:grpSpPr>
        <a:xfrm>
          <a:off x="0" y="0"/>
          <a:ext cx="${ancho}" cy="${alto}"/>
          <a:chOff x="0" y="0"/>
          <a:chExt cx="${ancho}" cy="${alto}"/>
        </a:xfrm>
      </xdr:grpSpPr>${formas.join('')}
    </xdr:grpSp>`
}

/**
 * Remata el archivo: le mete el nombre definido de los desplegables (exceljs solo escribe rangos
 * fijos) y, si hay titulares, el gráfico de dos barras por titular.
 */
/**
 * Remata el archivo: le mete el nombre definido de los desplegables (exceljs solo escribe rangos
 * fijos), los gráficos y el flujo del dinero, y los saltos de página.
 */
async function terminar(
  buffer: ArrayBuffer,
  op: {
    nombre: { nombre: string; formula: string }
    dibujos: Dibujo[]
    /** Filas por las que se parte la hoja al imprimir (1-based). */
    saltos: number[]
  },
): Promise<ArrayBuffer> {
  const JSZip = await cargarJSZip()
  const zip = await new JSZip().loadAsync(buffer)
  const REL_DIBUJO = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing'
  const REL_CHART = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart'

  // Protección, escrita a mano: el «0» es lo que se PERMITE (o sea, lo que no se prohíbe).
  // Se puede elegir cualquier celda, dar formato y borrar o añadir filas; lo demás, no.
  const PROTECCION =
    '<sheetProtection sheet="1" objects="0" scenarios="0" selectLockedCells="0" ' +
    'selectUnlockedCells="0" formatCells="0" formatRows="0" insertRows="0" deleteRows="0"/>'
  const rutaHoja = 'xl/worksheets/sheet1.xml'
  const hoja0 = await zip.file(rutaHoja)!.async('string')

  // Saltos de página: el resumen en la primera, los gráficos en la segunda y el flujo en la tercera.
  const saltos = op.saltos.length
    ? `<rowBreaks count="${op.saltos.length}" manualBreakCount="${op.saltos.length}">` +
      op.saltos.map((f) => `<brk id="${f - 1}" min="0" max="16383" man="1"/>`).join('') +
      '</rowBreaks>'
    : ''

  zip.file(
    rutaHoja,
    hoja0.includes('<sheetProtection')
      ? hoja0.replace(/<sheetProtection[^>]*\/>/, PROTECCION)
      : hoja0.replace('</worksheet>', `${PROTECCION}</worksheet>`),
  )

  // Nombre definido: la lista de los desplegables, sin huecos.
  const libroXml = await zip.file('xl/workbook.xml')!.async('string')
  const definido = `<definedName name="${op.nombre.nombre}">${op.nombre.formula}</definedName>`
  zip.file(
    'xl/workbook.xml',
    libroXml.includes('<definedNames>')
      ? libroXml.replace('<definedNames>', `<definedNames>${definido}`)
      : libroXml.replace('</workbook>', `<definedNames>${definido}</definedNames></workbook>`),
  )

  if (!op.dibujos.length) {
    const hojaSinDibujo = await zip.file(rutaHoja)!.async('string')
    zip.file(rutaHoja, hojaSinDibujo.replace('<drawing', `${saltos}<drawing`))
    return zip.generateAsync({ type: 'arraybuffer', compression: 'DEFLATE' })
  }

  // Cada gráfico va en su parte; las formas del flujo van dentro del mismo dibujo.
  const relaciones: string[] = []
  const tipos = [
    '<Override PartName="/xl/drawings/drawing1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>',
  ]
  let cuantosGraficos = 0
  const anclas = op.dibujos.map((d, i) => {
    if (d.grafico) {
      cuantosGraficos++
      zip.file(`xl/charts/chart${cuantosGraficos}.xml`, xmlChart(d.grafico))
      relaciones.push(
        `<Relationship Id="rId${cuantosGraficos}" Type="${REL_CHART}" Target="../charts/chart${cuantosGraficos}.xml"/>`,
      )
      tipos.push(
        `<Override PartName="/xl/charts/chart${cuantosGraficos}.xml" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/>`,
      )
      return xmlAncla(d, xmlGrafico(cuantosGraficos, `Grafico ${i + 1}`))
    }
    return xmlAncla(d, d.formas ?? '')
  })
  zip.file(
    'xl/drawings/drawing1.xml',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" ' +
      'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">' +
      anclas.join('') +
      '</xdr:wsDr>',
  )
  zip.file(
    'xl/drawings/_rels/drawing1.xml.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${relaciones.join('')}</Relationships>`,
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
    RELS,
    relsHoja.replace('</Relationships>', `<Relationship Id="rId${id}" Type="${REL_DIBUJO}" Target="../drawings/drawing1.xml"/></Relationships>`),
  )

  const hoja = await zip.file(rutaHoja)!.async('string')
  zip.file(
    rutaHoja,
    hoja.includes('<drawing')
      ? hoja.replace('<drawing', `${saltos}<drawing`)
      : hoja.replace('</worksheet>', `${saltos}<drawing r:id="rId${id}"/></worksheet>`),
  )

  // Y los tipos de contenido de las partes nuevas.
  const tiposXml = await zip.file('[Content_Types].xml')!.async('string')
  zip.file('[Content_Types].xml', tiposXml.replace('</Types>', tipos.join('') + '</Types>'))

  return zip.generateAsync({ type: 'arraybuffer', compression: 'DEFLATE' })
}
