/**
 * Libro de movimientos: resumen y movimientos en una hoja, y gráficos de cuentas en otra.
 *
 * A la izquierda, los movimientos (Fecha · De · A · Importe), con desplegable para el origen y el
 * destino. Solo se ve una fila vacía (con la fecha de hoy, que se puede cambiar): en cuanto la
 * rellenas, aparece la siguiente.
 *
 * A la derecha, el resumen de cada cuenta y, debajo de ella, las inversiones que se pagan desde
 * esa cuenta: Capital aportado, Rentabilidad (se escribe el %, y de ahí salen los euros), y Saldo.
 * Después, el total de cada cuenta, el de cada titular y el TOTAL.
 *
 * El dinero que llega de fuera («Exterior») entra en la cuenta principal; lo que de ahí se va a
 * otro titular (p. ej. al «Fondo ahorro») no cuenta en esa cuenta: si traes 1.000 € y se van 400,
 * la cuenta principal marca 600 y el «Fondo ahorro» 400.
 *
 * Todo son fórmulas (SUMIFS) sobre la tabla de movimientos, envueltas en SI.ERROR para que una
 * celda sin datos salga en blanco y no con «#¡VALOR!». Los nombres del resumen alimentan los
 * desplegables (con un nombre definido que crece solo, sin huecos). Los nombres nuevos escritos
 * en De/A alimentan las filas libres del resumen; al borrar sus referencias desaparecen.
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
  /** Rentabilidad de la cuenta (tanto por uno), si la app la sabe; si no, la escribes tú. */
  pct?: number | null
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
  /** Filas libres al final del resumen para añadir inversiones desde De/A. */
  libres?: number
  /** Productos y cuentas históricos, incluso cerrados: no son altas nuevas. */
  nombresConocidos?: string[]
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
/** Ancho de cada columna (A hasta O), en caracteres. */
const ANCHO_COL = [11, 21, 21, 12, 2, 29, 11, 15, 10, 12, 13, 15, 15, 15, 15]
const FILA_CABECERAS = 5
const RES_1 = 6 // Primera fila del resumen (y de los movimientos).
const EXTERIOR = 'Exterior'
const NADA = 0.005 // Umbral para omitir del resumen las cuentas sin saldo.
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
export function acortarNombreExcel(nombre: string): string {
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
      if (g.cuenta) cuenta(acortarNombreExcel(g.cuenta))
      for (const i of g.inversiones) cuenta(acortarNombreExcel(i.nombre))
    }
  const visto = new Map<string, number>()
  const asignar = (nombre: string) => {
    const corto = acortarNombreExcel(nombre)
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

/** RANGO del desplegable: COUNTIF no cuenta las fórmulas que devuelven "" en filas libres. */
function nombreDefinido(hoja: string, desde: number, hasta: number) {
  return `OFFSET('${hoja}'!$${L.nombre}$${desde},0,0,MAX(COUNTIF('${hoja}'!$${L.nombre}$${desde}:$${L.nombre}$${hasta},"?*"),1),1)`
}

/* eslint-disable @typescript-eslint/no-explicit-any */
/** Carga exceljs (navegador y Node: el módulo llega de las dos maneras). */
async function cargarExcelJS(): Promise<any> {
  const mod: any = await import('exceljs')
  return mod.Workbook ? mod : mod.default
}

/** Carga JSZip para añadir el nombre definido y proteger las celdas. */
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
  // Siete filas libres: una a la vista y seis para nombres nuevos escritos en De/A.
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
  poner(2, 1, 'Escribe fecha, De, A e importe. Para crear un fondo o cartera, escribe su nombre nuevo en De o A; aparecerá en el resumen. Para quitarlo, borra todas sus referencias en De/A.', {
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
  // Una cuenta que está a cero y sin inversiones ya no ocupa fila aunque sí aparezca en los
  // movimientos históricos. Las cuentas de las que dependen inversiones siguen arriba de ellas.
  const saldoCuentas = new Map<string, number>()
  for (const m of entrada.movimientos) {
    if (!(m.importe > 0)) continue
    saldoCuentas.set(m.de, (saldoCuentas.get(m.de) ?? 0) - m.importe)
    saldoCuentas.set(m.a, (saldoCuentas.get(m.a) ?? 0) + m.importe)
  }
  const titulares = entrada.titulares
    .map((t) => ({ ...t, grupos: t.grupos.filter((g) => !g.cuenta || g.inversiones.length > 0 || Math.abs(saldoCuentas.get(g.cuenta) ?? 0) > NADA) }))
    .filter((t) => t.grupos.length)
  const nombres = nombresCortos({ ...entrada, titulares })
  /**
   * Los movimientos se escriben con el mismo nombre que la fila del resumen (en corto, si lo lleva):
   * si una inversión se llama «iShares Developed World Index (IE) Acc EUR clase s» y en el resumen sale en
   * corto, el dinero va al nombre corto; si no, la fila se quedaría a cero sin cuadrar.
   */
  // Siempre por fecha: así se lee de arriba abajo y el saldo de cada fila cuadra con el de antes.
  const movimientos = entrada.movimientos
    .map((m) => ({ ...m, de: nombres.corto(m.de), a: nombres.corto(m.a) }))
    .sort((x, y) => (x.fecha === y.fecha ? 0 : x.fecha < y.fecha ? -1 : 1))
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

  // Una fila que ya estaba a cero no se elimina ni se oculta al descargar. El cambio posterior
  // de positivo a cero requiere la macro opcional: un .xlsx no tiene eventos de cambio.
  ws.addConditionalFormatting({
    ref: `${L.fecha}${RES_1}:${L.importe}${FILA_MOV_N}`,
    rules: [
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
  /** Saldo de una inversión: su capital por lo que suba o baje el % que escribas. */
  const fSaldoInversion = (f: number, cierra: string) =>
    siError(
      `IF($${L.nombre}${f}="","",IF(${cierra},"",IF(OR(${H(f)}="",${H(f)}=0),"",IF($${L.pct}${f}="",${H(f)},${H(f)}*(1+$${L.pct}${f})))))`,
    )
  const fEuros = (f: number, cierra: string) =>
    siError(
      `IF($${L.nombre}${f}="","",IF(${cierra},"",IF(OR(${H(f)}="",$${L.saldo}${f}=""),"",$${L.saldo}${f}-${H(f)})))`,
    )

  // ── Resumen ──────────────────────────────────────────────────────────────
  const nombreDe = nombres.siguiente
  let fila = RES_1
  let numeroConcepto = 0
  // Catálogo estable para el .xlsm: el titular y el porcentaje viajan con el nombre
  // aunque una edición desplace las filas visibles del resumen.
  const catalogo: { nombre: string; titular: string; pct: number | null; clase: string }[] = []

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
    // El % lo escribes tú, lo mismo en una cuenta que en una inversión: de ahí salen los euros y el
    // saldo (lo aportado por lo que suba o baje ese %).
    poner(fila, COL.pct, op.pct ?? null, { numFmt: PORCENTAJE, font: letra() })
    poner(fila, COL.euros, { formula: fEuros(fila, cierra) }, { numFmt: MONEDA, font: letra() })
    poner(fila, COL.saldo, { formula: fSaldoInversion(fila, cierra) }, { numFmt: MONEDA, font: letra() })
    if (!esLibre) for (let c = COL.nombre; c <= COL.saldo; c++) celda(fila, c).border = bordeFino
    // El nombre automático y los cálculos siguen protegidos. El titular (también en filas
    // desplazadas por la macro) y el porcentaje pueden corregirse para cualquier inversión.
    celda(fila, COL.titular).protection = { locked: false }
    celda(fila, COL.pct).protection = { locked: false }
    if (op.nombre) {
      numeroConcepto++
      catalogo.push({ nombre: op.nombre, titular: op.titular, pct: op.pct ?? null, clase: op.clase })
    }
    fila++
  }

  const colorDe = (titular: string) => titulares.find((t) => t.nombre === titular)?.color ?? '#2447B8'

  const grupos: { nombre: string; titular: string; desde: number; hasta: number }[] = []
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
          pct: g.pct ?? null,
          filasInv: cuantas ? [f + 1, f + cuantas] : null,
        })
      }
      for (const inv of g.inversiones) {
        filaResumen({ nombre: nombreDe(), titular, clase: 'inversion', pct: inv.rentabilidad, sangria: g.cuenta ? 1 : 0 })
      }
      if (g.inversiones.length)
        grupos.push({ nombre: g.cuenta ? nombreCuenta : titular, titular, desde, hasta: fila - 1 })
    }
  }
  // Filas libres: cada nombre distinto introducido en De/A ocupa una de estas siete plazas.
  // P/Q/R son columnas auxiliares ocultas. R contiene el catálogo original (incluidos productos
  // históricos ya cerrados): así un movimiento antiguo no se interpreta como alta nueva.
  const LIBRE_1 = fila
  const LIBRE_N = LIBRE_1 + libres - 1
  for (let i = 0; i < libres; i++) filaResumen({ nombre: null, titular: '', clase: 'libre', sangria: 1 })
  for (const c of [16, 17, 18]) ws.getColumn(c).hidden = true
  const conocidos = [...new Set([
    EXTERIOR,
    ...titulares.flatMap((t) => t.grupos.flatMap((g) => [g.cuenta, ...g.inversiones.map((i) => i.nombre)])),
    ...(entrada.nombresConocidos ?? []),
    ...movimientos.flatMap((m) => [m.de, m.a]),
  ].filter((n): n is string => !!n).map((n) => nombres.corto(n)))]
  conocidos.forEach((n, i) => poner(RES_1 + i, 18, n))
  const CATALOG = `$R$${RES_1}:$R$${RES_1 + conocidos.length - 1}`
  const fuente = (c: 'B' | 'C', f: number) => {
    const item = `$${c}${f}`
    const primera = `COUNTIF($${c}$${RES_1}:${c}${f},${item})=1`
    return siError(`IF(AND(${item}<>"",${item}<>"${EXTERIOR}",${primera},COUNTIF(${CATALOG},${item})=0` +
      (c === 'C' ? `,COUNTIF(${DE},${item})=0` : '') + `),${item},"")`)
  }
  for (let f = RES_1; f <= FILA_MOV_N; f++) {
    poner(f, 16, { formula: fuente('B', f) })
    poner(f, 17, { formula: fuente('C', f) })
  }
  const seleccionar = (col: 'P' | 'Q', n: string) => {
    const rango = `$${col}$${RES_1}:$${col}$${FILA_MOV_N}`
    return `INDEX(${rango},AGGREGATE(15,6,(ROW(${rango})-ROW($${col}$${RES_1})+1)/(${rango}<>""),${n}))`
  }
  const cuantosDe = `COUNTIF($P$${RES_1}:$P$${FILA_MOV_N},"?*")`
  const primeraTitular = titulares[0]?.nombre ?? ''
  for (let i = 0; i < libres; i++) {
    const f = LIBRE_1 + i
    const orden = i + 1
    poner(f, COL.nombre, {
      formula: siError(`IF(${orden}<=${cuantosDe},${seleccionar('P', String(orden))},${seleccionar('Q', `${orden}-${cuantosDe}`)})`),
    }, { font: { size: 10, color: { argb: 'FFFFFFFF' } }, alignment: { indent: 1 } })
    // Tomar el titular de la cuenta/fondo que lo financia; si no consta, usar el primer titular.
    // No consultar las otras filas libres: así no hay referencia circular y G sigue siendo editable.
    const titularOrigen = `INDEX($B$${RES_1}:$B$${FILA_MOV_N},MATCH($F${f},$C$${RES_1}:$C$${FILA_MOV_N},0))`
    const titularEnResumen = `INDEX($G$${RES_1}:$G$${LIBRE_1 - 1},MATCH(${titularOrigen},$F$${RES_1}:$F$${LIBRE_1 - 1},0))`
    poner(f, COL.titular, { formula: siError(`IF($F${f}="","",IFERROR(${titularEnResumen},${literal(primeraTitular)}))`) },
      { font: { size: 9, color: { argb: 'FFFFFFFF' } }, alignment: { horizontal: 'center' } })
  }
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
  // La casilla amarilla indica que el % de CUALQUIER cuenta o inversión se puede escribir.
  if (LIBRE_1 > RES_1 + 1)
    ws.addConditionalFormatting({
      ref: `${L.pct}${RES_1 + 1}:${L.pct}${LIBRE_1 - 1}`,
      rules: [{
        type: 'expression',
        formulae: [`AND($${L.nombre}${RES_1 + 1}<>"",$${L.aportado}${RES_1 + 1}<>"")`],
        priority: 4,
        style: { fill: relleno(AMARILLO) },
      }],
    })
  // La casilla del % de las filas libres se pinta solo cuando la fila se ve.
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
  for (const c of [19, 20, 21, 22, 23]) ws.getColumn(c).hidden = true
  for (const [i, item] of catalogo.entries()) {
    const f = RES_1 + i
    poner(f, 19, item.nombre)
    poner(f, 20, item.titular)
    if (item.pct !== null) poner(f, 21, item.pct)
    poner(f, 22, item.clase)
  }
  poner(RES_1, 23, RES_N) // W6: final del bloque del resumen, sin los totales.
  poner(RES_1 + 2, 23, titulares[0]?.nombre ?? '') // W8: titular por defecto.
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
  const filaTotalTitular = new Map<string, number>()
  // Un renglón por titular, seguidos y en orden. Si el titular tiene una sola
  // cuenta, el renglón lleva cuenta y titular (sin repetir «Luis» en «Total Cuenta Luis»).
  for (const t of titulares) {
    if (t.grupos.length < 1) continue
    filaTotalTitular.set(t.nombre, fila)
    const conInversiones = t.grupos.filter((g) => g.cuenta && g.inversiones.length)
    const cuenta = conInversiones[0]?.cuenta
    const nombre = conInversiones.length === 1 && cuenta && cuenta !== t.nombre
      ? `Total ${cuenta}${cuenta === `Cuenta ${t.nombre}` ? '' : `-${t.nombre}`}`
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
  nota(FILA_TOTAL + 2, 'Para añadir un fondo o cartera: escribe un nombre nuevo en De/A (hasta siete). Se refleja en el resumen; para quitarlo, elimina todas sus referencias De/A. Revisa el titular y % al borrar nombres anteriores.')
  nota(FILA_TOTAL + 3, 'En el .xlsm, habilita macros en Excel de escritorio: al pasar un importe positivo a 0, De/A se limpian y los movimientos restantes suben. En el .xlsx sin macros hay que hacerlo a mano. Un movimiento que ya venía a 0 se conserva.')

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
  // De una cuenta o inversión no puede salir más dinero del que hay: se mira lo que le queda en esa
  // fila (lo que le ha entrado menos lo que ha salido ANTES de este movimiento, más su rentabilidad). Del
  // «Exterior» puede salir lo que sea, porque es el dinero de fuera.
  const HASTA_AQUI = (c: Col) => `$${L[c]}$${RES_1}:$${L[c]}${RES_1}`
  const aportadoHastaAhora = `SUMIFS(${HASTA_AQUI('importe')},${HASTA_AQUI('a')},$${L.de}${RES_1})` +
    `-SUMIFS(${HASTA_AQUI('importe')},${HASTA_AQUI('de')},$${L.de}${RES_1})+$${L.importe}${RES_1}`
  // Usa el % editable, pero solo sobre lo ingresado hasta este movimiento (sin dinero futuro).
  const pctOrigen = `IFERROR(VLOOKUP($${L.de}${RES_1},$${L.nombre}$${RES_1}:$${L.pct}$${RES_N},4,FALSE),0)`
  const disponible = `MAX(0,(${aportadoHastaAhora})*(1+${pctOrigen}))`
  ws.dataValidations.add(`${L.importe}${RES_1}:${L.importe}${FILA_MOV_N}`, {
    type: 'custom',
    formulae: [`OR($${L.importe}${RES_1}=0,AND($${L.importe}${RES_1}>0,OR($${L.de}${RES_1}="${EXTERIOR}",$${L.importe}${RES_1}<=${disponible})))`],
    allowBlank: true,
    showErrorMessage: true,
    errorStyle: 'stop',
    errorTitle: 'No hay tanto dinero',
    error: 'En la cuenta o inversión de la que sale el dinero no queda tanto. Escribe un importe más pequeño o mete antes el dinero desde el Exterior.',
  })


  // La hoja «Movimientos» se imprime en una página.
  ws.pageSetup.printArea = `A1:O${FILA_TOTAL + 4}`
  ws.pageSetup.printTitlesRow = `1:${FILA_CABECERAS}`

  // ── Gráficos por titular: la mitad de ancho y un 20 % más de alto que los anteriores. ───
  const HOJA_GRAFICOS = 'Gráficos'
  const COLS_GRAFICOS = 15
  const FILA_1_G = 4
  const ALTO_GRAFICO = 13 * 1.2 // 15,6 filas; el sobrante va en rowOff del ancla.
  const FILAS_OCUPADAS = Math.ceil(ALTO_GRAFICO)
  const SALTO_GRAFICO = FILAS_OCUPADAS + 5 // Tres filas de leyenda y dos de aire.
  const ANCHO_ANTERIOR = 4.8 // Ya era un 20 % más estrecho que las 6 columnas originales.
  const ANCHO_GRAFICO = ANCHO_ANTERIOR * 0.5 // 2,4 columnas, centradas en cada mitad de la hoja.
  const EMU_POR_COLUMNA = 110 * 9525
  const EMU_POR_FILA = 20 * 12700 // 20 puntos, el alto fijado por aMedida().
  const MEDIAS = [1, 9] // Mismos centros que antes: una mitad por titular.
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
    const arriba = FILA_1_G + Math.floor(i / 2) * SALTO_GRAFICO
    const inicio = media + (ANCHO_ANTERIOR - ANCHO_GRAFICO) / 2
    const fin = inicio + ANCHO_GRAFICO
    dibujos.push({
      grafico,
      desde: { col: Math.floor(inicio), offX: Math.round((inicio % 1) * EMU_POR_COLUMNA), fila: arriba },
      hasta: {
        col: Math.floor(fin), offX: Math.round((fin % 1) * EMU_POR_COLUMNA),
        fila: arriba + Math.floor(ALTO_GRAFICO), offY: Math.round((ALTO_GRAFICO % 1) * EMU_POR_FILA),
      },
    })
  })

  // La hoja de los gráficos: títulos y medidas.
  const ultimaGraficos = FILA_1_G + Math.ceil(puestos / 2) * SALTO_GRAFICO
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
  // Etiquetas en celdas, no en la leyenda flotante de Excel: cada una ocupa su fila, así nunca
  // se montan sobre el dibujo ni sobre los importes pese a su menor anchura.
  for (let i = 0; i < puestos; i++) {
    const col = i % 2 === 0 ? 2 : 10
    const base = FILA_1_G + Math.floor(i / 2) * SALTO_GRAFICO + FILAS_OCUPADAS
    for (const [j, item] of [
      ['Aportado', 'FF2563EB'],
      ['Rentabilidad', 'FFE67E22'],
      ['Aportado + rentabilidad', 'FF0F766E'],
    ].entries()) {
      hojaG.mergeCells(base + j, col, base + j, col + 4)
      const celda = hojaG.getCell(base + j, col)
      celda.value = `■ ${item[0]}`
      celda.font = { bold: true, size: 10, color: { argb: item[1] } }
      celda.alignment = { vertical: 'middle' }
      hojaG.getRow(base + j).height = 20
    }
  }
  hojaG.pageSetup.printArea = `A1:O${ultimaGraficos}`

  // Protegida: editar movimientos, el titular/% de filas nuevas y el % de cada cuenta o inversión.
  // Los nombres automáticos y las fórmulas del resumen siguen bloqueados.
  // Sin contraseña: «Revisar → Desproteger hoja».
  // (Los permisos concretos se escriben a mano en terminar(): exceljs no saca todas las opciones.)
  await ws.protect('')

  const buffer = (await libro.xlsx.writeBuffer()) as ArrayBuffer

  // El nombre definido de los desplegables y la protección se añaden a mano.
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

/** Un gráfico de barras anclado a la hoja «Gráficos». */
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
  // Cifras sin decimales y letra pequeña: no se pisan entre sí.
  const etiquetas = `
            <c:dLbls>
              <c:numFmt formatCode="#,##0 &quot;€&quot;" sourceLinked="0"/>
              <c:txPr><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="750" b="1"/></a:pPr><a:endParaRPr/></a:p></c:txPr>
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
      <c:layout><c:manualLayout>
        <c:layoutTarget val="inner"/><c:xMode val="edge"/><c:yMode val="edge"/>
        <c:x val="0.07"/><c:y val="0.14"/><c:w val="0.86"/><c:h val="0.75"/>
      </c:manualLayout></c:layout>
      <c:barChart>
        <c:barDir val="col"/>
        <c:grouping val="clustered"/>
        <c:varyColors val="0"/>${op.series.map(serie).join('')}
        <c:gapWidth val="60"/>
        <c:overlap val="-20"/>
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
        <c:tickLblPos val="none"/>
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
        <c:numFmt formatCode="#,##0" sourceLinked="0"/>
        <c:majorTickMark val="none"/>
        <c:minorTickMark val="none"/>
        <c:tickLblPos val="none"/>
        <c:crossAx val="100000001"/>
        <c:crosses val="autoZero"/>
        <c:crossBetween val="between"/>
      </c:valAx>
    </c:plotArea>
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
 * fijos), la protección de la hoja de movimientos y los gráficos de titulares.
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
