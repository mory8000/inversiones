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
  const enOrden: [string, string][] = []
  for (const t of entrada.titulares)
    for (const g of [...t.grupos].sort((a, b) => b.inversiones.length - a.inversiones.length)) {
      if (g.cuenta) enOrden.push([g.cuenta, asignar(g.cuenta)])
      for (const i of g.inversiones) enOrden.push([i.nombre, asignar(i.nombre)])
    }
  let siguiente = 0
  /**
   * El nombre tal y como sale en la fila. Los movimientos se escriben con él: si una inversión se
   * llama «iShares Developed World Index (IE) Acc EUR clase s» y en el resumen sale en corto, el
   * dinero tiene que ir al nombre corto (si no, la fila se queda a cero y no cuadra).
   */
  const corto = new Map(enOrden)
  return {
    siguiente: () => enOrden[siguiente++]?.[1] ?? '',
    corto: (nombre: string) => corto.get(nombre) ?? nombre,
  }
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
      fitToHeight: 1,
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
  // Una cuenta sin dinero y sin inversiones no pinta nada en el resumen: se va, y lo que había
  // debajo sube una fila. (Las inversiones que quedan a cero ya no llegan: la app no las manda.)
  const conDinero = new Set<string>()
  for (const m of entrada.movimientos) {
    conDinero.add(m.de)
    conDinero.add(m.a)
  }
  const titulares = entrada.titulares
    .map((t) => ({ ...t, grupos: t.grupos.filter((g) => !g.cuenta || g.inversiones.length > 0 || conDinero.has(g.cuenta)) }))
    .filter((t) => t.grupos.length)
  const nombres = nombresCortos({ ...entrada, titulares })
  /**
   * Los movimientos se escriben con el mismo nombre que la fila del resumen (en corto, si lo lleva):
   * si una inversión se llama «iShares Developed World Index (IE) Acc EUR clase s» y en el resumen sale en
   * corto, el dinero va al nombre corto; si no, la fila se quedaría a cero sin cuadrar.
   */
  const movimientos = entrada.movimientos.map((m) => ({ ...m, de: nombres.corto(m.de), a: nombres.corto(m.a) }))
  for (const m of movimientos) {
    conDinero.add(m.de)
    conDinero.add(m.a)
  }
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
  for (const [i, m] of movimientos.entries()) {
    const f = RES_1 + i
    celda(f, COL.de).value = m.de
    celda(f, COL.a).value = m.a
    celda(f, COL.importe).value = m.importe
    const [y, mo, d] = m.fecha.split('-').map(Number)
    celda(f, COL.fecha).value = new Date(Date.UTC(y, (mo || 1) - 1, d || 1))
  }

  // Solo se ve la fila que toca: la siguiente se destapa cuando se rellena esta. Y una fila que se
  // pone a cero se borra del todo: se queda en blanco, como si no se hubiera escrito nada.
  ws.addConditionalFormatting({
    ref: `${L.fecha}${RES_1}:${L.importe}${FILA_MOV_N}`,
    rules: [
      {
        type: 'expression',
        formulae: [`AND($${L.importe}${RES_1}<>"",$${L.importe}${RES_1}=0)`],
        priority: 1,
        style: { font: { size: 10, color: { argb: 'FFFFFFFF' } } },
      },
      {
        type: 'expression',
        formulae: [`AND($${L.importe}${RES_1 - 1}<>"",$${L.importe}${RES_1}="")`],
        priority: 2,
        style: { fill: relleno(AMARILLO_FUERTE), font: { size: 10, color: { argb: TINTA } }, border: bordeFino },
      },
      {
        type: 'expression',
        formulae: [`$${L.importe}${RES_1 - 1}<>""`],
        priority: 3,
        style: { font: { size: 10, color: { argb: TINTA } }, border: bordeFino },
      },
      {
        type: 'expression',
        formulae: [`$${L.importe}${RES_1 - 1}=""`],
        priority: 4,
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
  // Un movimiento a cero es como si no existiera: por eso solo cuentan los que llevan dinero.
  const seMueve = (nombre: string) => `COUNTIFS(${A},${nombre},${IMP},">0")+COUNTIFS(${DE},${nombre},${IMP},">0")`
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
  const nombreDe = nombres.siguiente
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

  const colorDe = (titular: string) => titulares.find((t) => t.nombre === titular)?.color ?? '#2447B8'

  const grupos: { nombre: string; titular: string; desde: number; hasta: number }[] = []
  // Cada fila escrita: para el gráfico de las inversiones de cada titular y para el flujo.
  const hechas: { clase: 'cuenta' | 'inversion'; corto: string; titular: string; fila: number }[] = []
  // Los caminos del dinero que existen aunque no haya movimientos: así se ve también la plantilla.
  const caminos: { de: string; a: string }[] = []
  for (const t of titulares) {
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
    rules: titulares.map((t, i) => ({
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
  const filaTotalTitular = new Map<string, number>()
  for (const t of titulares) {
    if (t.grupos.length < 1) continue
    filaTotalTitular.set(t.nombre, fila)
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


  // La hoja «Movimientos» se imprime en una página.
  ws.pageSetup.printArea = `A1:O${FILA_TOTAL + 4}`
  ws.pageSetup.printTitlesRow = `1:${FILA_CABECERAS}`

  // ── Los gráficos: una hoja aparte, uno por titular ────────────────────────
  const HOJA_GRAFICOS = 'Gráficos'
  const COLS_GRAFICOS = 15
  const FILA_1_G = 4
  // Mitad de tamaño que antes: 11 filas de alto y 5 columnas de ancho.
  const ALTO_GRAFICO = 11
  const MEDIAS = [
    { desde: 0, hasta: 4 },
    { desde: 6, hasta: 10 },
  ]
  const dibujos: Dibujo[] = []
  const graficos: Omit<OpcionesGrafico, 'desde' | 'hasta'>[] = []

  // Uno por titular (Luis, y el «Fondo ahorro»): todo junto —la cuenta y las inversiones— en tres
  // barras: lo aportado, la rentabilidad y las dos cosas sumadas.
  for (const t of titulares) {
    const total = filaTotalTitular.get(t.nombre)
    if (total === undefined) continue
    graficos.push({
      hoja: HOJA,
      titulo: t.nombre,
      categorias: [t.nombre],
      series: [
        { nombre: 'Aportado', valores: `$${L.aportado}$${total}`, color: '2563EB' },
        { nombre: 'Rentabilidad', valores: `$${L.euros}$${total}`, color: 'E67E22' },
        { nombre: 'Aportado + rentabilidad', valores: `$${L.saldo}$${total}`, color: '0F766E' },
      ],
    })
  }
  const puestos = Math.min(graficos.length, 4)
  graficos.slice(0, 4).forEach((grafico, i) => {
    const media = MEDIAS[i % 2]
    const arriba = FILA_1_G + Math.floor(i / 2) * (ALTO_GRAFICO + 2)
    dibujos.push({
      grafico,
      desde: { col: media.desde, fila: arriba },
      hasta: { col: media.hasta, fila: arriba + ALTO_GRAFICO },
    })
  })

  // La hoja de los gráficos: títulos y medidas.
  const ultimaGraficos = FILA_1_G + Math.ceil(puestos / 2) * (ALTO_GRAFICO + 2)
  const hojaG = libro.addWorksheet(HOJA_GRAFICOS, {
    views: [{ showGridLines: false }],
    pageSetup: {
      orientation: 'landscape',
      paperSize: 9,
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 1,
      margins: { left: 0.3, right: 0.3, top: 0.4, bottom: 0.4, header: 0, footer: 0 },
    },
  })
  hojaG.properties.tabColor = { argb: AZUL }
  /** Deja la hoja a medida: columnas de 15 y filas de 20 puntos. */
  const aMedida = (hojaNueva: any, hasta: number) => {
    for (let c = 1; c <= COLS_GRAFICOS; c++) hojaNueva.getColumn(c).width = 15
    for (let f = 1; f <= hasta; f++) hojaNueva.getRow(f).height = 20
  }
  /** Un título que ocupa todo el ancho. */
  const rotulo = (hojaNueva: any, f: number, texto: string, tamano: number, gris = false) => {
    hojaNueva.mergeCells(f, 1, f, COLS_GRAFICOS)
    const celda = hojaNueva.getCell(f, 1)
    celda.value = texto
    celda.font = gris
      ? { size: 9, italic: true, color: { argb: GRIS } }
      : { bold: true, size: tamano, color: { argb: TINTA } }
    celda.alignment = { vertical: 'middle' }
  }
  aMedida(hojaG, ultimaGraficos)
  rotulo(hojaG, 1, 'Gráficos', 16)
  rotulo(hojaG, 2, 'Todo sale de la hoja «Movimientos»: lo que cambies allí, cambia aquí.', 9, true)
  hojaG.pageSetup.printArea = `A1:O${ultimaGraficos}`

  // ── El flujo del dinero, en otra hoja: celdas pintadas (una caja por nombre y una flecha con el
  // dinero que va de una a otra) y, debajo, los movimientos uno a uno. Se hace con celdas porque
  // las formas a veces no se ven. ───────────────────────────────────────────────────────────────
  const HOJA_FLUJO = 'Flujo'
  // Tres pisos: lo que llega, por donde pasa y donde se queda. Entre ellos, la flecha.
  const CAJAS = [
    [1, 4],
    [6, 9],
    [11, 14],
  ]
  const papelesFlujo = new Map(hechas.map((h) => [h.corto, h.clase]))
  const pisoDe = (nombre: string) => (nombre === EXTERIOR ? 0 : papelesFlujo.get(nombre) === 'inversion' ? 2 : 1)
  const flujo = viajesDelFlujo({ ...entrada, movimientos }, caminos, papelesFlujo)
  const listaMovimientos = movimientos.slice(0, 40)
  // Arriba el resumen, luego un renglón por viaje (dos filas de alto) y, al final, los movimientos.
  const FILA_1_VIAJE = 8
  const PASO_VIAJE = 3
  const FILA_MOVS = FILA_1_VIAJE + flujo.viajes.length * PASO_VIAJE + 2
  const ultimaFlujo = FILA_MOVS + listaMovimientos.length + 1

  const hojaF = libro.addWorksheet(HOJA_FLUJO, {
    views: [{ showGridLines: false }],
    pageSetup: {
      orientation: 'landscape',
      paperSize: 9,
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      margins: { left: 0.3, right: 0.3, top: 0.4, bottom: 0.4, header: 0, footer: 0 },
    },
  })
  hojaF.properties.tabColor = { argb: AZUL }
  for (let c = 1; c <= 15; c++) hojaF.getColumn(c).width = c === 15 ? 3 : c % 5 === 0 ? 13 : 22
  for (let f = 1; f <= ultimaFlujo; f++) hojaF.getRow(f).height = 20
  rotulo(hojaF, 1, 'Flujo del dinero', 16)
  rotulo(hojaF, 2, 'Cada línea es el viaje del dinero: de dónde sale, por dónde pasa y dónde acaba. Se dibuja con los movimientos de hoy: vuelve a descargar el Excel para tenerlo al día.', 9, true)

  /** Escribe un trozo de la hoja del flujo (y lo centra si ocupa varias columnas). */
  const trozo = (
    f: number,
    c1: number,
    c2: number,
    valor: unknown,
    op: {
      relleno?: string
      tinta?: string
      tamano?: number
      negrita?: boolean
      alinear?: 'left' | 'center' | 'right'
      formato?: string
      /** Filas que ocupa (1 por defecto): las cajas del viaje ocupan 2. */
      alto?: number
      /** Para escribir en dos líneas (la cifra y su importe). */
      envuelve?: boolean
    } = {},
  ) => {
    const hasta = f + (op.alto ?? 1) - 1
    if (c2 > c1 || hasta > f) hojaF.mergeCells(f, c1, hasta, c2)
    const celda = hojaF.getCell(f, c1)
    celda.value = valor as never
    celda.font = { size: op.tamano ?? 10, bold: op.negrita ?? false, color: { argb: op.tinta ?? TINTA } }
    celda.alignment = { horizontal: op.alinear ?? 'center', vertical: 'middle', wrapText: op.envuelve ?? false }
    if (op.relleno) celda.fill = relleno(op.relleno)
    if (op.formato) celda.numFmt = op.formato
    return celda
  }

  // Arriba, de un vistazo: lo que ha entrado de fuera, lo que sigue en las cuentas y lo invertido.
  const cifras: [string, number][] = [
    ['Entra de fuera', flujo.entra],
    ['Sigue en las cuentas', flujo.enCuentas],
    ['Invertido', flujo.invertido],
  ]
  for (const [i, [texto, valor]] of cifras.entries())
    trozo(4, CAJAS[i][0], CAJAS[i][1], `${texto}\n${euros(valor)}`, {
      relleno: `FF${colorDePiso(i)}`,
      tinta: 'FFFFFFFF',
      tamano: 11,
      negrita: true,
      alto: 2,
      envuelve: true,
    })
  for (const f of [3, 6]) hojaF.getRow(f).height = 8

  // Encima de los viajes, a qué corresponde cada piso.
  for (const [i, texto] of ['DE DÓNDE LLEGA', 'POR DÓNDE PASA', 'A DÓNDE VA'].entries())
    trozo(FILA_1_VIAJE - 1, CAJAS[i][0], CAJAS[i][1], texto, { tinta: GRIS, negrita: true, tamano: 10 })

  // Un renglón por viaje: la caja de donde sale, la flecha con el dinero y la caja donde acaba.
  flujo.viajes.forEach((v, i) => {
    const f = FILA_1_VIAJE + i * PASO_VIAJE
    const pisos = pisosDelViaje(v.pasos, pisoDe)
    v.pasos.forEach((nombre, j) => {
      trozo(f, CAJAS[pisos[j]][0], CAJAS[pisos[j]][1], nombre, {
        relleno: `FF${colorDePiso(pisos[j])}`,
        tinta: 'FFFFFFFF',
        tamano: 11,
        negrita: true,
        alto: 2,
      })
      if (j === 0) return
      const c1 = CAJAS[pisos[j - 1]][1] + 1
      const c2 = CAJAS[pisos[j]][0] - 1
      const flecha = c2 - c1 >= 3 ? '\u25b6\u25b6\u25b6' : '\u25b6'
      trozo(f, c1, c2, v.importe > 0 ? `${euros(v.importe)}   ${flecha}` : flecha, {
        relleno: v.importe > 0 ? 'FFEFF6FF' : 'FFF8FAFC',
        tinta: v.importe > 0 ? 'FF1D4ED8' : 'FF94A3B8',
        tamano: 12,
        negrita: true,
        alto: 2,
      })
    })
    // El dinero que no llega a ninguna inversión: se queda donde está, en la cuenta.
    if (v.seQueda && pisos[pisos.length - 1] < 2)
      trozo(f, CAJAS[2][0], CAJAS[2][1], 'Sigue en la cuenta', {
        relleno: 'FFF1F5F9',
        tinta: GRIS,
        tamano: 10,
        alto: 2,
      })
    hojaF.getRow(f + 2).height = 7
  })

  // Y los movimientos, uno a uno: es el dinero moviéndose, con su fecha y su importe.
  rotulo(hojaF, FILA_MOVS - 1, 'Movimientos, uno a uno', 12)
  const COLS_MOV = [
    [1, 2],
    [3, 6],
    [7, 10],
    [11, 14],
  ]
  for (const [i, texto] of ['Fecha', 'De', 'A', 'Importe'].entries())
    trozo(FILA_MOVS, COLS_MOV[i][0], COLS_MOV[i][1], texto, {
      relleno: CABECERA_FILL,
      tinta: 'FF334155',
      negrita: true,
    })
  listaMovimientos.forEach((m, i) => {
    const f = FILA_MOVS + 1 + i
    const [y, mes, d] = m.fecha.split('-').map(Number)
    trozo(f, 1, 2, new Date(Date.UTC(y, (mes || 1) - 1, d || 1)), { formato: FECHA })
    trozo(f, 3, 6, m.de, { alinear: 'left' })
    trozo(f, 7, 10, m.a, { alinear: 'left' })
    trozo(f, 11, 14, m.importe, { formato: MONEDA, alinear: 'right', negrita: true })
    for (const [c1, c2] of COLS_MOV) {
      const celda = hojaF.getCell(f, c1)
      celda.border = bordeFino
      if (c2 > c1) for (let c = c1 + 1; c <= c2; c++) hojaF.getCell(f, c).border = bordeFino
    }
  })
  const totalMovido = listaMovimientos.reduce((t, m) => t + m.importe, 0)
  if (listaMovimientos.length) {
    const f = FILA_MOVS + 1 + listaMovimientos.length
    trozo(f, 1, 10, `Total de los ${listaMovimientos.length} movimientos`, { negrita: true, alinear: 'right' })
    trozo(f, 11, 14, totalMovido, { formato: MONEDA, alinear: 'right', negrita: true, relleno: CABECERA_FILL })
  }
  hojaF.pageSetup.printArea = `A1:O${ultimaFlujo}`

  // Protegida: solo se puede escribir en los movimientos, en las filas nuevas y en el % de cada
  // inversión. Se puede elegir cualquier celda y borrar o añadir filas (para quitar una inversión
  // que quede a cero o para meter una nueva). Sin contraseña: «Revisar → Desproteger hoja».
  // (Los permisos concretos se escriben a mano en terminar(): exceljs no saca todas las opciones.)
  await ws.protect('')

  const buffer = (await libro.xlsx.writeBuffer()) as ArrayBuffer

  // El nombre definido de los desplegables, los gráficos y el flujo hay que añadirlos a mano.
  return terminar(buffer, {
    nombre: { nombre: NOMBRES, formula: nombreDefinido(HOJA, RES_1, RES_N) },
    hojas: [{ hoja: 'xl/worksheets/sheet2.xml', dibujo: 'xl/drawings/drawing1.xml', dibujos, saltos: [] }],
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
  desde: Esquina
  /** Esquina de abajo a la derecha. */
  hasta: Esquina
  /** Un gráfico de barras. */
  grafico?: Omit<OpcionesGrafico, 'desde' | 'hasta'>
}

/** Una esquina del ancla: celda y lo que se desplaza dentro de ella, en EMU. */
interface Esquina {
  col: number
  fila: number
  offX?: number
  offY?: number
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
  const esquina = (e: Esquina, nombre: string) =>
    `<xdr:${nombre}><xdr:col>${e.col}</xdr:col><xdr:colOff>${Math.round(e.offX ?? 0)}</xdr:colOff>` +
    `<xdr:row>${e.fila - 1}</xdr:row><xdr:rowOff>${Math.round(e.offY ?? 0)}</xdr:rowOff></xdr:${nombre}>`
  return `
  <xdr:twoCellAnchor>
    ${esquina(d.desde, 'from')}
    ${esquina(d.hasta, 'to')}${cuerpo}
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

// ── El flujo del dinero: el viaje que hace, de dónde sale a dónde acaba ─────

/** Un viaje del dinero: los nombres por los que pasa, en orden, y cuánto dinero es. */
interface ViajeFlujo {
  /** De dónde sale el dinero hasta dónde acaba: 2 o 3 nombres (Exterior → cuenta → inversión). */
  pasos: string[]
  importe: number
  /** `true` si el dinero se queda en la cuenta, sin llegar a ninguna inversión. */
  seQueda: boolean
}

/** Lo que se ve arriba de todo: cuánto ha entrado de fuera, cuánto sigue en las cuentas y cuánto está invertido. */
interface Flujo {
  viajes: ViajeFlujo[]
  entra: number
  enCuentas: number
  invertido: number
}

const euros = (n: number) =>
  `${new Intl.NumberFormat('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)} €`

const NADA = 0.005

/**
 * Los viajes del dinero: uno por cada sitio donde el dinero está ahora mismo, contado desde el
 * principio («Exterior → la cuenta por la que pasa → la inversión donde acaba»). Si no hay
 * movimientos, se dibuja el camino que marca la estructura para que la plantilla también se vea.
 */
function viajesDelFlujo(
  entrada: EntradaExcel,
  caminos: { de: string; a: string }[],
  papeles: Map<string, 'cuenta' | 'inversion'>,
): Flujo {
  const clave = (de: string, a: string) => `${de}\u0000${a}`
  const entra = new Map<string, number>()
  const sale = new Map<string, number>()
  const tramos = new Map<string, number>()
  for (const m of entrada.movimientos) {
    if (!m.de || !m.a || m.de === m.a || !(m.importe > 0)) continue
    entra.set(m.a, (entra.get(m.a) ?? 0) + m.importe)
    sale.set(m.de, (sale.get(m.de) ?? 0) + m.importe)
    tramos.set(clave(m.de, m.a), (tramos.get(clave(m.de, m.a)) ?? 0) + m.importe)
  }
  const piso = (nombre: string) => (nombre === EXTERIOR ? 0 : papeles.get(nombre) === 'inversion' ? 2 : 1)
  const neto = (nombre: string) => (entra.get(nombre) ?? 0) - (sale.get(nombre) ?? 0)
  const todos = new Set([...entra.keys(), ...sale.keys()])

  // Quién le manda dinero a cada nombre, de más a menos: por ahí se sube hasta el principio.
  const quienLeManda = new Map<string, { de: string; importe: number }[]>()
  for (const [k, importe] of tramos) {
    const [de, a] = k.split('\u0000')
    const lista = quienLeManda.get(a) ?? []
    lista.push({ de, importe })
    quienLeManda.set(a, lista)
  }
  for (const lista of quienLeManda.values()) lista.sort((x, y) => y.importe - x.importe)

  const viajes: ViajeFlujo[] = []
  for (const nombre of todos) {
    const cuanto = neto(nombre)
    if (cuanto <= NADA) continue
    const pasos = [nombre]
    const vistos = new Set([nombre])
    let actual = nombre
    // Se sube por el camino del dinero (siempre hacia fuera) hasta llegar al principio.
    for (let guarda = 0; guarda < 6; guarda++) {
      const padre = (quienLeManda.get(actual) ?? []).find((x) => !vistos.has(x.de) && piso(x.de) < piso(actual))
      if (!padre) break
      pasos.unshift(padre.de)
      vistos.add(padre.de)
      actual = padre.de
      if (piso(actual) === 0) break
    }
    // Si el viaje no arranca en «Exterior», se le pone: todo el dinero viene de fuera.
    if (!pasos.includes(EXTERIOR)) pasos.unshift(EXTERIOR)
    viajes.push({ pasos: pasos.slice(-3), importe: cuanto, seQueda: piso(nombre) === 1 })
  }
  viajes.sort((x, y) => y.importe - x.importe || x.pasos.length - y.pasos.length || x.pasos[0].localeCompare(y.pasos[0], 'es'))

  // Sin movimientos, el dibujo lo marca la estructura: se ve el camino, todavía sin dinero.
  if (!viajes.length)
    for (const c of caminos) viajes.push({ pasos: [c.de, c.a], importe: 0, seQueda: false })

  const sumaNeto = (p: number) =>
    [...todos].reduce((t, n) => (piso(n) === p ? t + Math.max(neto(n), 0) : t), 0)
  return {
    viajes: viajes.slice(0, 12),
    entra: [...todos].reduce((t, n) => t + (n === EXTERIOR ? sale.get(n) ?? 0 : 0), 0),
    enCuentas: sumaNeto(1),
    invertido: sumaNeto(2),
  }
}

/**
 * A qué altura va cada nombre del viaje: 0 llega de fuera, 1 pasa por la cuenta, 2 se queda. Si
 * dos nombres seguidos van al mismo sitio (un traspaso entre dos inversiones), el segundo baja uno.
 */
function pisosDelViaje(pasos: string[], piso: (nombre: string) => number): number[] {
  const pisos: number[] = []
  let anterior = -1
  for (const paso of pasos) {
    let p = piso(paso)
    if (p <= anterior) p = Math.min(anterior + 1, 2)
    pisos.push(p)
    anterior = p
  }
  return pisos
}

const colorDePiso = (piso: number) => (piso === 0 ? '64748B' : piso === 1 ? '1D4ED8' : '0F766E')

/** Una hoja con su dibujo (los gráficos) colgado. */
interface HojaConDibujo {
  /** Parte de la hoja, p. ej. «xl/worksheets/sheet2.xml». */
  hoja: string
  /** Parte del dibujo, p. ej. «xl/drawings/drawing1.xml». */
  dibujo: string
  dibujos: Dibujo[]
  /** Filas por las que se parte la hoja al imprimir (1-based). */
  saltos: number[]
}

/**
 * Remata el archivo: le mete el nombre definido de los desplegables (exceljs solo escribe rangos
 * fijos), la protección de la hoja de movimientos y los dibujos de las hojas de gráficos y flujo.
 */
async function terminar(
  buffer: ArrayBuffer,
  op: { nombre: { nombre: string; formula: string }; hojas: HojaConDibujo[] },
): Promise<ArrayBuffer> {
  const JSZip = await cargarJSZip()
  const zip = await new JSZip().loadAsync(buffer)
  const REL_DIBUJO = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing'
  const REL_CHART = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart'
  const DIBUJO_XML = 'application/vnd.openxmlformats-officedocument.drawing+xml'
  const GRAFICO_XML = 'application/vnd.openxmlformats-officedocument.drawingml.chart+xml'
  const HOJA_XML = 'application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml'

  // Protección, escrita a mano: el «0» es lo que se PERMITE (o sea, lo que no se prohíbe).
  // Se puede elegir cualquier celda, dar formato y borrar o añadir filas; lo demás, no.
  const PROTECCION =
    '<sheetProtection sheet="1" objects="0" scenarios="0" selectLockedCells="0" ' +
    'selectUnlockedCells="0" formatCells="0" formatRows="0" insertRows="0" deleteRows="0"/>'
  const rutaHoja = 'xl/worksheets/sheet1.xml'
  const hoja0 = await zip.file(rutaHoja)!.async('string')
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

  const tipos: string[] = []
  let cuantosGraficos = 0
  for (const h of op.hojas) {
    if (!h.dibujos.length) continue
    const nombreDibujo = h.dibujo.split('/').pop()!
    const relaciones: string[] = []
    const anclas = h.dibujos.map((d, i) => {
      if (d.grafico) {
        cuantosGraficos++
        zip.file(`xl/charts/chart${cuantosGraficos}.xml`, xmlChart(d.grafico))
        tipos.push(`<Override PartName="/xl/charts/chart${cuantosGraficos}.xml" ContentType="${GRAFICO_XML}"/>`)
        relaciones.push(
          `<Relationship Id="rId${relaciones.length + 1}" Type="${REL_CHART}" Target="../charts/chart${cuantosGraficos}.xml"/>`,
        )
        return xmlAncla(d, xmlGrafico(relaciones.length, `Grafico ${i + 1}`))
      }
      return xmlAncla(d, '')
    })
    zip.file(
      h.dibujo,
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" ' +
        'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">' +
        anclas.join('') +
        '</xdr:wsDr>',
    )
    zip.file(
      `xl/drawings/_rels/${nombreDibujo}.rels`,
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${relaciones.join('')}</Relationships>`,
    )
    tipos.push(`<Override PartName="/xl/drawings/${nombreDibujo}" ContentType="${DIBUJO_XML}"/>`)

    // La hoja apunta al dibujo (si no tenía relaciones todavía, se crean).
    const nombreHoja = h.hoja.split('/').pop()!
    const rutaRels = `xl/worksheets/_rels/${nombreHoja}.rels`
    const parte = zip.file(rutaRels)
    const relsHoja = parte
      ? await parte.async('string')
      : '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>'
    const ids = [...relsHoja.matchAll(/Id="rId(\d+)"/g)].map((m) => Number(m[1]))
    const id = Math.max(0, ...ids) + 1
    zip.file(
      rutaRels,
      relsHoja.replace(
        '</Relationships>',
        `<Relationship Id="rId${id}" Type="${REL_DIBUJO}" Target="../drawings/${nombreDibujo}"/></Relationships>`,
      ),
    )
    const saltos = h.saltos.length
      ? `<rowBreaks count="${h.saltos.length}" manualBreakCount="${h.saltos.length}">` +
        h.saltos.map((f) => `<brk id="${f - 1}" min="0" max="16383" man="1"/>`).join('') +
        '</rowBreaks>'
      : ''
    const hoja = await zip.file(h.hoja)!.async('string')
    zip.file(
      h.hoja,
      hoja.includes('<drawing')
        ? hoja.replace('<drawing', `${saltos}<drawing`)
        : hoja.replace('</worksheet>', `${saltos}<drawing r:id="rId${id}"/></worksheet>`),
    )
  }

  // Y los tipos de contenido de las partes nuevas (exceljs ya escribe el de sus hojas).
  const tiposXml = await zip.file('[Content_Types].xml')!.async('string')
  for (const h of op.hojas)
    if (!tiposXml.includes(`/${h.hoja}"`))
      tipos.push(`<Override PartName="/${h.hoja}" ContentType="${HOJA_XML}"/>`)
  zip.file('[Content_Types].xml', tiposXml.replace('</Types>', tipos.join('') + '</Types>'))

  return zip.generateAsync({ type: 'arraybuffer', compression: 'DEFLATE' })
}
