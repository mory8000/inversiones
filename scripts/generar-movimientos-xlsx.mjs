/**
 * Genera «Movimientos.xlsx»: UNA sola hoja con los movimientos y su resumen.
 *
 * Cómo se usa la hoja:
 *   · A la izquierda se escriben los movimientos: Fecha · De · A · Importe. Solo se ve una fila
 *     (con la fecha de hoy, que se puede cambiar): en cuanto la rellenas, aparece la siguiente.
 *   · «De» es de dónde sale el dinero y «A» a dónde va. Los dos son desplegables con los nombres
 *     del resumen de la derecha, así que para añadir un producto basta con escribir su nombre en
 *     una fila libre (y para quitarlo, borrar la fila).
 *   · «Exterior» es el dinero que entra desde fuera (o que sale). «Interés» es lo que paga el banco
 *     o la inversión: no cuenta como dinero aportado, sino como rentabilidad.
 *   · A la derecha, el resumen de cada cuenta: cuánto dinero ha entrado de fuera (Capital aportado),
 *     lo invertido en cada inversión (las filas que van debajo de la cuenta), la Rentabilidad
 *     (en % y en €) y el Saldo. Después, el total de cada cuenta, el de cada titular y el TOTAL.
 *   · Todo se calcula con fórmulas (SUMIFS) a partir de la tabla de movimientos.
 *
 * Para regenerar el archivo (los nombres se cambian aquí arriba):
 *   npm i --no-save exceljs && node scripts/generar-movimientos-xlsx.mjs
 */

import { writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const aqui = dirname(fileURLToPath(import.meta.url))
const SALIDA = resolve(aqui, '..', 'Movimientos.xlsx')

// ── Lo que lleva la hoja ───────────────────────────────────────────────────
// Es lo único que hay que tocar: titulares, sus cuentas y las inversiones que
// se pagan desde cada cuenta (`libres` son las filas vacías que se dejan para
// añadir productos nuevos debajo de esa cuenta).
const HOY = '2026-10-22'

const TITULARES = [
  {
    nombre: 'Marta',
    cuentas: [
      {
        nombre: 'MyInvestor',
        inversiones: [
          'Vanguard Global Stock Index',
          'Fidelity MSCI World Index',
          'Cartera indexada Metal',
          'Depósito 12 meses',
          'Plan de pensiones indexado global',
        ],
        libres: 3,
      },
      { nombre: 'Cuenta nómina · BBVA', inversiones: [], libres: 0 },
      { nombre: 'Cuenta ahorro · ING', inversiones: [], libres: 0 },
    ],
  },
  {
    nombre: 'Fondo ahorro',
    cuentas: [
      {
        nombre: null, // El «Fondo ahorro» no tiene cuenta: el dinero va directo a sus productos.
        inversiones: ['Fondo indexado', 'Depósito ahorro'],
        libres: 2,
      },
    ],
  },
]

/** Filas para escribir movimientos (solo se ve una; el resto aparecen al rellenar). */
const FILAS_MOV = 200

// ── Columnas ───────────────────────────────────────────────────────────────
const COL = { fecha: 1, de: 2, a: 3, importe: 4, nombre: 6, titular: 7, aportado: 8, rentabPct: 9, rentabEur: 10, saldo: 11 }
const letra = (n) => {
  let s = ''
  for (let x = n; x > 0; x = Math.floor((x - 1) / 26)) s = String.fromCharCode(65 + ((x - 1) % 26)) + s
  return s
}
const L = Object.fromEntries(Object.entries(COL).map(([k, v]) => [k, letra(v)]))

const FILA_MOV_1 = 6
const FILA_MOV_N = FILA_MOV_1 + FILAS_MOV - 1
const RES_1 = 6
const ESPECIALES = ['Exterior', 'Interés']

// ── Estilos ────────────────────────────────────────────────────────────────
const AZUL = 'FF1D4ED8'
const TINTA = 'FF0F172A'
const GRIS = 'FF64748B'
const CABECERA_FILL = 'FFF1F5F9'
const AMARILLO = 'FFFFFBEB'
const AMARILLO_FUERTE = 'FFFEF3C7'
const GRIS_CLARO = 'FFF8FAFC'
const BORDE = 'FFD8DEE9'
const VERDE = 'FF047857'
const ROJO = 'FFB91C1C'

const MONEDA = '#,##0.00 "€"'
const PORCENTAJE = '0.00 %'
const FECHA = 'dd/mm/yyyy'

const ExcelJS = (await import('exceljs')).default

const wb = new ExcelJS.Workbook()
wb.creator = 'Mis Inversiones'
wb.created = new Date()
// Que Excel recalcule todas las fórmulas al abrirlo (el libro no guarda resultados).
wb.calcProperties = { fullCalcOnLoad: true }
const ws = wb.addWorksheet('Movimientos', {
  views: [{ state: 'frozen', ySplit: 5, showGridLines: false }],
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
ws.getColumn(5).width = 2 // separación
ws.getColumn(COL.nombre).width = 29
ws.getColumn(COL.titular).width = 11
ws.getColumn(COL.aportado).width = 15
ws.getColumn(COL.rentabPct).width = 10
ws.getColumn(COL.rentabEur).width = 12
ws.getColumn(COL.saldo).width = 13

const celda = (f, c) => ws.getCell(f, c)
const poner = (f, c, valor, estilo = {}) => {
  const x = celda(f, c)
  x.value = valor
  if (estilo.numFmt) x.numFmt = estilo.numFmt
  if (estilo.font) x.font = estilo.font
  if (estilo.fill) x.fill = estilo.fill
  if (estilo.alignment) x.alignment = estilo.alignment
  if (estilo.border) x.border = estilo.border
  return x
}
const relleno = (argb) => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } })
const bordeFino = { bottom: { style: 'thin', color: { argb: BORDE } } }

// ── Títulos y esquema ──────────────────────────────────────────────────────
ws.mergeCells(1, 1, 1, COL.saldo)
poner(1, 1, 'MIS INVERSIONES · MOVIMIENTOS: DE DÓNDE VIENE EL DINERO', {
  font: { bold: true, size: 14, color: { argb: TINTA } },
  alignment: { vertical: 'middle' },
})
ws.getRow(1).height = 22

ws.mergeCells(2, 1, 3, COL.importe)
poner(2, 1, 'Escribe cada movimiento: fecha, de dónde sale (De), a dónde va (A) e importe. Solo se ve una fila: al rellenarla, se abre la siguiente.', {
  font: { size: 9, color: { argb: GRIS } },
  alignment: { wrapText: true, vertical: 'top' },
})
ws.getRow(2).height = 18
ws.getRow(3).height = 26

// Pequeño esquema: Capital aportado + Rentabilidad = Saldo
const caja = (c1, c2, texto) => {
  poner(2, c1, texto, {
    font: { bold: true, size: 10, color: { argb: AZUL } },
    fill: relleno('FFEFF6FF'),
    alignment: { horizontal: 'center', vertical: 'middle' },
  })
  if (c2 !== c1) ws.mergeCells(2, c1, 2, c2)
}
caja(COL.nombre, COL.nombre, 'Capital aportado')
poner(2, COL.titular, '+', { font: { bold: true, size: 11, color: { argb: GRIS } }, alignment: { horizontal: 'center' } })
caja(COL.aportado, COL.rentabPct, 'Rentabilidad')
poner(2, COL.rentabEur, '=', { font: { bold: true, size: 11, color: { argb: GRIS } }, alignment: { horizontal: 'center' } })
caja(COL.saldo, COL.saldo, 'Saldo')

ws.mergeCells(3, COL.nombre, 3, COL.saldo)
poner(3, COL.nombre, 'Resumen de cada cuenta, con lo invertido en cada inversión debajo; después, el total de cada cuenta, el de cada titular y el TOTAL.', {
  font: { size: 9, italic: true, color: { argb: GRIS } },
  alignment: { vertical: 'middle' },
})

// ── Cabeceras de los dos bloques ───────────────────────────────────────────
const bloque = (fila, c1, c2, texto) => {
  for (let c = c1; c <= c2; c++) {
    poner(fila, c, c === c1 ? texto : null, {
      fill: relleno(AZUL),
      font: { bold: true, size: 11, color: { argb: 'FFFFFFFF' } },
      alignment: { horizontal: c === c1 ? 'left' : 'center', vertical: 'middle' },
    })
  }
  ws.mergeCells(fila, c1, fila, c2)
  ws.getRow(fila).height = 18
}
bloque(4, 1, COL.importe, 'MOVIMIENTOS')
bloque(4, COL.nombre, COL.saldo, 'RESUMEN')

const cabeceras = (fila, pares) => {
  for (const [c, texto] of pares) {
    poner(fila, c, texto, {
      fill: relleno(CABECERA_FILL),
      font: { bold: true, size: 10, color: { argb: 'FF334155' } },
      alignment: { horizontal: c >= COL.aportado ? 'right' : 'left', vertical: 'middle' },
      border: bordeFino,
    })
  }
  ws.getRow(fila).height = 16
}
cabeceras(5, [
  [COL.fecha, 'Fecha'],
  [COL.de, 'De  (de dónde sale)'],
  [COL.a, 'A  (a dónde va)'],
  [COL.importe, 'Importe'],
  [COL.nombre, 'Cuenta e inversiones'],
  [COL.titular, 'Titular'],
  [COL.aportado, 'Capital aportado'],
  [COL.rentabPct, 'Rentab. %'],
  [COL.rentabEur, 'Rentab. €'],
  [COL.saldo, 'Saldo'],
])

// ── Movimientos ────────────────────────────────────────────────────────────
const fechaHoy = (() => {
  const [y, m, d] = HOY.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d))
})()

for (let f = FILA_MOV_1; f <= FILA_MOV_N; f++) {
  poner(f, COL.fecha, fechaHoy, { numFmt: FECHA, font: { size: 10, color: { argb: TINTA } } })
  poner(f, COL.de, null, { font: { size: 10, color: { argb: TINTA } } })
  poner(f, COL.a, null, { font: { size: 10, color: { argb: TINTA } } })
  poner(f, COL.importe, null, { numFmt: MONEDA, font: { size: 10, color: { argb: TINTA } } })
}

// Solo se ve la fila que toca: la siguiente se destapa cuando se rellena esta.
ws.addConditionalFormatting({
  ref: `${L.fecha}${FILA_MOV_1}:${L.importe}${FILA_MOV_N}`,
  rules: [
    {
      // La fila que hay que rellenar ahora: la anterior ya está escrita y esta está vacía.
      type: 'expression',
      formulae: [`AND($${L.importe}${FILA_MOV_1 - 1}<>"",$${L.importe}${FILA_MOV_1}="")`],
      priority: 1,
      style: {
        fill: relleno(AMARILLO_FUERTE),
        font: { size: 10, color: { argb: TINTA } },
        border: bordeFino,
      },
    },
    {
      // Filas ya escritas (o la que toca): se ven normales.
      type: 'expression',
      formulae: [`$${L.importe}${FILA_MOV_1 - 1}<>""`],
      priority: 2,
      style: { font: { size: 10, color: { argb: TINTA } }, border: bordeFino },
    },
    {
      // El resto: letra blanca, como si no existieran, hasta que llegue su turno.
      type: 'expression',
      formulae: [`$${L.importe}${FILA_MOV_1 - 1}=""`],
      priority: 3,
      style: { font: { size: 10, color: { argb: 'FFFFFFFF' } } },
    },
  ],
})

// ── Resumen ────────────────────────────────────────────────────────────────
const IMPORTE = `$${L.importe}$${FILA_MOV_1}:$${L.importe}$${FILA_MOV_N}`
const DE = `$${L.de}$${FILA_MOV_1}:$${L.de}$${FILA_MOV_N}`
const A = `$${L.a}$${FILA_MOV_1}:$${L.a}$${FILA_MOV_N}`
const INTERES = '"Interés"'

/**
 * Capital aportado de la fila `f`: lo que ha entrado menos lo que ha salido, sin contar el
 * interés (que es rentabilidad, no dinero tuyo). En una cuenta es el dinero que has traído de
 * fuera y sigue ahí (lo que se vaya a otra cuenta o a un producto de otro titular no cuenta:
 * si traes 1.000 € y se van 400 al Fondo ahorro, aquí marcan 600); en una inversión, el capital
 * que le has puesto.
 */
const fAportado = (f) =>
  `IF($${L.nombre}${f}="","",SUMIFS(${IMPORTE},${A},$${L.nombre}${f})` +
  `-SUMIFS(${IMPORTE},${DE},$${L.nombre}${f})` +
  `-SUMIFS(${IMPORTE},${A},$${L.nombre}${f},${DE},${INTERES})` +
  `+SUMIFS(${IMPORTE},${DE},$${L.nombre}${f},${A},${INTERES}))`

/** Saldo de una cuenta: lo que ha entrado menos lo que ha salido. */
const fSaldoCuenta = (f) =>
  `IF($${L.nombre}${f}="","",SUMIFS(${IMPORTE},${A},$${L.nombre}${f})-SUMIFS(${IMPORTE},${DE},$${L.nombre}${f}))`

const fRentabEur = (f) =>
  `IF($${L.nombre}${f}="","",IF(AND($${L.aportado}${f}=0,$${L.saldo}${f}=0),"",$${L.saldo}${f}-$${L.aportado}${f}))`
const fRentabPct = (f) => `IF($${L.nombre}${f}="","",IF($${L.aportado}${f}=0,"",$${L.rentabEur}${f}/$${L.aportado}${f}))`

let fila = RES_1
const grupos = [] // {nombre, desde, hasta}: para el total de cada cuenta

const filaEspecial = (nombre) => {
  poner(fila, COL.nombre, nombre, {
    font: { italic: true, bold: true, size: 10, color: { argb: GRIS } },
    fill: relleno(GRIS_CLARO),
  })
  for (let c = COL.titular; c <= COL.saldo; c++) celda(fila, c).fill = relleno(GRIS_CLARO)
  fila++
}
ESPECIALES.forEach(filaEspecial)

/** Una fila del resumen: cuenta, inversión (sangrada, debajo de su cuenta) o libre. */
const filaResumen = ({ nombre, titular, clase, sangria = 0 }) => {
  poner(fila, COL.nombre, nombre, {
    font: { size: 10, bold: clase === 'cuenta', color: { argb: TINTA } },
    alignment: { indent: sangria },
    fill: clase === 'libre' ? relleno(AMARILLO) : undefined,
  })
  poner(fila, COL.titular, titular, {
    font: { size: 9, color: { argb: GRIS } },
    alignment: { horizontal: 'center' },
    fill: clase === 'libre' ? relleno(AMARILLO) : undefined,
  })
  poner(fila, COL.aportado, { formula: fAportado(fila) }, { numFmt: MONEDA, font: { size: 10 } })
  poner(fila, COL.rentabPct, { formula: fRentabPct(fila) }, { numFmt: PORCENTAJE, font: { size: 10 } })
  poner(fila, COL.rentabEur, { formula: fRentabEur(fila) }, { numFmt: MONEDA, font: { size: 10 } })
  if (clase === 'cuenta') {
    poner(fila, COL.saldo, { formula: fSaldoCuenta(fila) }, { numFmt: MONEDA, font: { size: 10 } })
  } else {
    // El saldo de una inversión es su valor de hoy: lo escribes tú.
    poner(fila, COL.saldo, null, { numFmt: MONEDA, font: { size: 10 }, fill: relleno(AMARILLO) })
  }
  for (let c = COL.nombre; c <= COL.saldo; c++) celda(fila, c).border = bordeFino
  fila++
}

for (const t of TITULARES) {
  for (const cuenta of t.cuentas) {
    const desde = fila
    if (cuenta.nombre) filaResumen({ nombre: cuenta.nombre, titular: t.nombre, clase: 'cuenta' })
    for (const inv of cuenta.inversiones) filaResumen({ nombre: inv, titular: t.nombre, clase: 'inversion', sangria: 1 })
    for (let i = 0; i < (cuenta.libres ?? 0); i++) filaResumen({ nombre: null, titular: null, clase: 'libre', sangria: 1 })
    // Total de la cuenta con lo que tiene puesto en sus inversiones (si la cuenta tiene nombre).
    if (cuenta.nombre && cuenta.inversiones.length) grupos.push({ nombre: cuenta.nombre, desde, hasta: fila - 1 })
  }
}
const RES_N = fila - 1
const RANGO_RES = (c) => `$${letra(c)}$${RES_1}:$${letra(c)}$${RES_N}`

// Verdes y rojos en la rentabilidad.
ws.addConditionalFormatting({
  ref: `${L.rentabPct}${RES_1}:${L.rentabEur}${RES_N}`,
  rules: [
    { type: 'cellIs', operator: 'greaterThan', formulae: ['0'], priority: 4, style: { font: { color: { argb: VERDE } } } },
    { type: 'cellIs', operator: 'lessThan', formulae: ['0'], priority: 5, style: { font: { color: { argb: ROJO } } } },
  ],
})

// ── Totales: por cuenta, por titular y todo junto ──────────────────────────
const filaTotal = (nombre, titular, formulas, fuerte = false) => {
  poner(fila, COL.nombre, nombre, { font: { bold: true, size: fuerte ? 11 : 10, color: { argb: TINTA } } })
  poner(fila, COL.titular, titular, { font: { size: 9, color: { argb: GRIS } }, alignment: { horizontal: 'center' } })
  poner(fila, COL.aportado, { formula: `IF(${formulas.aportado}=0,"",${formulas.aportado})` }, { numFmt: MONEDA, font: { bold: true, size: fuerte ? 11 : 10 } })
  poner(fila, COL.rentabPct, { formula: `IF($${L.aportado}${fila}=0,"",$${L.rentabEur}${fila}/$${L.aportado}${fila})` }, { numFmt: PORCENTAJE, font: { bold: true, size: fuerte ? 11 : 10 } })
  poner(fila, COL.rentabEur, { formula: `IF(${formulas.rentab}=0,"",${formulas.rentab})` }, { numFmt: MONEDA, font: { bold: true, size: fuerte ? 11 : 10 } })
  poner(fila, COL.saldo, { formula: `IF(${formulas.saldo}=0,"",${formulas.saldo})` }, { numFmt: MONEDA, font: { bold: true, size: fuerte ? 11 : 10 } })
  for (let c = COL.nombre; c <= COL.saldo; c++) {
    const x = celda(fila, c)
    x.fill = relleno(fuerte ? AZUL : CABECERA_FILL)
    if (fuerte) x.font = { bold: true, size: 11, color: { argb: 'FFFFFFFF' }, name: x.font?.name }
    if (c >= COL.aportado) x.alignment = { horizontal: 'right' }
  }
  fila++
}

fila += 1 // línea en blanco antes de los totales
const suma = (c, desde, hasta) => `SUM($${letra(c)}$${desde}:$${letra(c)}$${hasta})`
// Cada cuenta con sus inversiones: lo aportado, lo que vale hoy y lo ganado.
for (const g of grupos) {
  filaTotal(`Total ${g.nombre}`, null, {
    aportado: suma(COL.aportado, g.desde, g.hasta),
    rentab: suma(COL.rentabEur, g.desde, g.hasta),
    saldo: suma(COL.saldo, g.desde, g.hasta),
  })
}
// Cada titular.
const filasTitulares = []
for (const t of TITULARES) {
  filasTitulares.push(fila)
  const sumaSi = (c) => `SUMIFS(${RANGO_RES(c)},${RANGO_RES(COL.titular)},$${L.titular}${fila})`
  filaTotal(`Total ${t.nombre}`, t.nombre, {
    aportado: sumaSi(COL.aportado),
    rentab: sumaSi(COL.rentabEur),
    saldo: sumaSi(COL.saldo),
  })
}
// Y todo junto.
const FILA_TOTAL = fila
filaTotal('TOTAL', null, {
  aportado: suma(COL.aportado, RES_1, RES_N),
  rentab: suma(COL.rentabEur, RES_1, RES_N),
  saldo: suma(COL.saldo, RES_1, RES_N),
}, true)
ws.getRow(FILA_TOTAL).height = 18

// Notas finales.
const nota = (f, texto) => {
  ws.mergeCells(f, 1, f, COL.saldo)
  poner(f, 1, texto, { font: { size: 9, italic: true, color: { argb: GRIS } } })
}
const ULTIMA = FILA_TOTAL + 3
nota(FILA_TOTAL + 2, 'Para añadir un producto: escribe su nombre (y su titular) en una fila libre, debajo de la cuenta desde la que lo pagas. Para quitarlo: borra su fila.')
nota(ULTIMA, 'El saldo de las inversiones es su valor de hoy: escríbelo tú en la celda amarilla. «Exterior» es el dinero que entra o sale de fuera; «Interés», lo que paga el banco o la inversión (rentabilidad, no dinero aportado).')

// ── Desplegables ───────────────────────────────────────────────────────────
const RANGO_NOMBRES = `$${L.nombre}$${RES_1}:$${L.nombre}$${RES_N}`
for (const c of [COL.de, COL.a]) {
  ws.dataValidations.add(`${letra(c)}${FILA_MOV_1}:${letra(c)}${FILA_MOV_N}`, {
    type: 'list',
    formulae: [RANGO_NOMBRES],
    allowBlank: true,
    showErrorMessage: false,
  })
}
ws.dataValidations.add(`${L.importe}${FILA_MOV_1}:${L.importe}${FILA_MOV_N}`, {
  type: 'decimal',
  operator: 'greaterThan',
  formulae: ['0'],
  allowBlank: true,
  showErrorMessage: false,
})

// ── Impresión: una página ──────────────────────────────────────────────────
ws.pageSetup.printArea = `A1:${L.saldo}${ULTIMA}`
ws.pageSetup.printTitlesRow = '1:5'

// ── Escribir ───────────────────────────────────────────────────────────────
const buf = await wb.xlsx.writeBuffer()
writeFileSync(SALIDA, Buffer.from(buf))
console.log(`✅ ${SALIDA}`)
console.log(`   resumen: filas ${RES_1}-${RES_N} · grupos: ${grupos.map((g) => `${g.nombre} (${g.desde}-${g.hasta})`).join(', ')}`)
console.log(`   titulares: ${filasTitulares.join(', ')} · TOTAL: ${FILA_TOTAL} · movimientos: ${FILA_MOV_1}-${FILA_MOV_N}`)
