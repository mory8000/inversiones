// Un Excel como la app: mismas cifras, mismas pestañas y el mismo aspecto (el color
// de cada titular, los encabezados, el dinero en € y en %), con fórmulas donde la app
// calcula (totales, capital, ganancia, saldo en %…), para que se pueda usar igual.
// Se genera en el navegador y se descarga; no hace falta nada más.
//
// Escritor XLSX mínimo y sin dependencias: las hojas son XML dentro de un zip (entradas
// almacenadas, sin comprimir, que Excel abre igual). Los textos van «inline».

import type { FinanceData } from '../store/useFinance'
import { buildFlowGraph, type FlowGraph } from './flow'
import { buildTimelineMulti, recortarDesde } from './finance'
import { entityName, movementKind, ownerOf, sortMovementsDesc } from './movements'
import { PRODUCT_META, kindMeta } from './meta'
import { fmtDate, fmtEUR } from './format'
import type { EntityRef } from '../types'

// ── ZIP (entradas almacenadas, sin comprimir) ──────────────────────

const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c
  }
  return t
})()

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

const utf8 = (s: string): Uint8Array => new TextEncoder().encode(s)

interface ZipEntry {
  name: string
  data: Uint8Array
}

/** Zip con las entradas «store» (sin comprimir): válido y más simple. */
function zip(entries: ZipEntry[]): Uint8Array {
  const enc = new TextEncoder()
  const local: Uint8Array[] = []
  const central: Uint8Array[] = []
  let offset = 0
  const DOS_TIME = 0x3021 // 12:00:00
  const DOS_DATE = ((2026 - 1980) << 9) | (10 << 5) | 17 // 17 oct 2026
  for (const e of entries) {
    const name = enc.encode(e.name)
    const data = e.data
    const crc = crc32(data)
    // Cabecera local (30 bytes) + nombre + datos.
    const head = new Uint8Array(30)
    const dv = new DataView(head.buffer)
    dv.setUint32(0, 0x04034b50, true)
    dv.setUint16(4, 20, true) // versión necesaria
    dv.setUint16(6, 0x0800, true) // nombres en UTF-8
    dv.setUint16(8, 0, true) // almacenada
    dv.setUint16(10, DOS_TIME, true)
    dv.setUint16(12, DOS_DATE, true)
    dv.setUint32(14, crc, true)
    dv.setUint32(18, data.length, true)
    dv.setUint32(22, data.length, true)
    dv.setUint16(26, name.length, true)
    dv.setUint16(28, 0, true) // extra
    local.push(head, name, data)
    // Entrada del directorio central (46 bytes) + nombre.
    const cd = new Uint8Array(46)
    const cv = new DataView(cd.buffer)
    cv.setUint32(0, 0x02014b50, true)
    cv.setUint16(4, 0x0014, true) // versión con la que se hizo
    cv.setUint16(6, 20, true) // versión necesaria
    cv.setUint16(8, 0x0800, true)
    cv.setUint16(10, 0, true)
    cv.setUint16(12, DOS_TIME, true)
    cv.setUint16(14, DOS_DATE, true)
    cv.setUint32(16, crc, true)
    cv.setUint32(20, data.length, true)
    cv.setUint32(24, data.length, true)
    cv.setUint16(28, name.length, true)
    cv.setUint16(30, 0, true) // extra
    cv.setUint16(32, 0, true) // comentario
    cv.setUint16(34, 0, true) // disco
    cv.setUint16(36, 0, true) // atributos internos
    cv.setUint32(38, 0, true) // atributos externos
    cv.setUint32(42, offset, true)
    central.push(cd, name)
    offset += head.length + name.length + data.length
  }
  const cdStart = offset
  const cdSize = central.reduce((n, p) => n + p.length, 0)
  const end = new Uint8Array(22)
  const ev = new DataView(end.buffer)
  ev.setUint32(0, 0x06054b50, true)
  ev.setUint16(4, 0, true)
  ev.setUint16(6, 0, true)
  ev.setUint16(8, entries.length, true)
  ev.setUint16(10, entries.length, true)
  ev.setUint32(12, cdSize, true)
  ev.setUint32(16, cdStart, true)
  ev.setUint16(20, 0, true)
  const all = [...local, ...central, end]
  const total = all.reduce((n, p) => n + p.length, 0)
  const out = new Uint8Array(new ArrayBuffer(total))
  let at = 0
  for (const p of all) {
    out.set(p, at)
    at += p.length
  }
  return out
}

// ── XML ─────────────────────────────────────────────────────────────

/** Céntimos: los cálculos dejan polvo de coma flotante (98,09999… → 98,10). */
const r2 = (n: number) => Math.round(n * 100) / 100

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const colName = (i: number): string =>
  i < 26 ? String.fromCharCode(65 + i) : String.fromCharCode(64 + ((i / 26) | 0)) + String.fromCharCode(65 + (i % 26))

/** Una celda: texto, número, o fórmula (con su valor calculado, para quien no recalcula). */
export type XCell = string | number | null | undefined | { v?: string | number; f?: string; s?: string }

type Row = XCell[]

/** Hoja en construcción. */
class Sheet {
  rows: { cells: Row; h?: number }[] = []
  widths: number[] = []
  freeze = ''
  filter = ''

  add(cells: Row, h?: number) {
    this.rows.push({ cells, h })
    return this
  }
  col(i: number, w: number) {
    this.widths[i] = w
    return this
  }
  freezeAt(cell: string) {
    this.freeze = cell
    return this
  }
  autoFilter(ref: string) {
    this.filter = ref
    return this
  }
  /** Número de fila que se escribiría ahora (1 = la primera). */
  get next(): number {
    return this.rows.length + 1
  }
}

// ── Estilos (la paleta de la app) ──────────────────────────────────

const INK = '#0F172A'
const SLATE = '#64748B'
const SOFT = '#F1F5F9'
const LINE = '#CBD5E1'

/** Mezcla un color con blanco (fondos suaves). */
const tint = (hex: string, k: number) => {
  const n = parseInt(hex.slice(1), 16)
  const m = (c: number) => Math.round(c + (255 - c) * k)
  return `FF${[m((n >> 16) & 255), m((n >> 8) & 255), m(n & 255)].map((c) => c.toString(16).padStart(2, '0')).join('')}`
}

/** aRGB: Excel quiere el alfa delante (FF = opaco). */
const argb = (hex: string) => (hex.startsWith('#') ? `FF${hex.slice(1)}` : hex)

interface StyleSpec {
  font?: { b?: boolean; color?: string; sz?: number }
  fill?: string
  numFmt?: string
  align?: 'right' | 'center'
  border?: 'bottom' | 'top' | 'box'
}

const MONEY = '#,##0.00 "€";[Red]-#,##0.00 "€"'
const PCT = '0.0%;[Red]-0.0%'

/** Estilos por nombre: los fijos + uno por titular (su color). */
function styleSpecs(colors: string[]): Record<string, StyleSpec> {
  const out: Record<string, StyleSpec> = {
    title: { font: { b: true, sz: 20, color: INK } },
    sub: { font: { sz: 11, color: SLATE } },
    h: { font: { b: true, color: SLATE }, fill: SOFT, border: 'bottom' },
    hMoney: { font: { b: true, color: SLATE }, fill: SOFT, border: 'bottom', align: 'right' },
    b: { font: { b: true } },
    money: { numFmt: MONEY, align: 'right' },
    moneyB: { font: { b: true }, numFmt: MONEY, align: 'right' },
    moneyT: { font: { b: true }, numFmt: MONEY, align: 'right', border: 'top' },
    pct: { numFmt: PCT, align: 'right' },
    note: { font: { sz: 10, color: SLATE } },
    total: { font: { b: true }, fill: SOFT, border: 'top' },
    totalMoney: { font: { b: true }, fill: SOFT, border: 'top', numFmt: MONEY, align: 'right' },
    box: { border: 'box' },
    center: { align: 'center' },
  }
  colors.forEach((color, i) => {
    out[`head${i}`] = { font: { b: true, color: '#FFFFFF', sz: 12 }, fill: color }
    out[`soft${i}`] = { font: { b: true, color: INK }, fill: tint(color, 0.88) }
  })
  return out
}

/** La tabla de estilos: una fuente, un relleno y un borde por combinación usada. */
function stylesXml(specs: Record<string, StyleSpec>): string {
  const fonts: string[] = ['<font><sz val="11"/><name val="Calibri"/></font>']
  const fills: string[] = ['<fill><patternFill patternType="none"/></fill>', '<fill><patternFill patternType="gray125"/></fill>']
  const borders: string[] = ['<border/>']
  const numFmts = [MONEY, PCT]
  const fmtId = (f: string) => 164 + numFmts.indexOf(f) // los formatos propios empiezan en 164

  const index = (arr: string[], xml: string) => {
    const at = arr.indexOf(xml)
    if (at >= 0) return at
    arr.push(xml)
    return arr.length - 1
  }
  const fontId = (f?: StyleSpec['font']) =>
    index(fonts, `<font>${f?.b ? '<b/>' : ''}<sz val="${f?.sz ?? 11}"/><color rgb="${argb(f?.color ?? INK)}"/><name val="Calibri"/></font>`)
  const fillId = (fill?: string) =>
    fill ? index(fills, `<fill><patternFill patternType="solid"><fgColor rgb="${argb(fill)}"/><bgColor rgb="${argb(fill)}"/></patternFill></fill>`) : 0
  const borderId = (b?: StyleSpec['border']) =>
    b === 'bottom'
      ? index(borders, `<border><bottom style="thin"><color rgb="${argb(LINE)}"/></bottom></border>`)
      : b === 'top'
        ? index(borders, `<border><top style="thin"><color rgb="${argb(LINE)}"/></top></border>`)
        : b === 'box'
          ? index(borders, `<border><left style="thin"><color rgb="${argb(LINE)}"/></left><right style="thin"><color rgb="${argb(LINE)}"/></right><top style="thin"><color rgb="${argb(LINE)}"/></top><bottom style="thin"><color rgb="${argb(LINE)}"/></bottom></border>`)
          : 0

  const xfs = Object.values(specs).map((s) => {
    const f = fontId(s.font)
    const fl = fillId(s.fill)
    const b = borderId(s.border)
    const nf = s.numFmt ? fmtId(s.numFmt) : 0
    return `<xf numFmtId="${nf}" fontId="${f}" fillId="${fl}" borderId="${b}" xfId="0"` +
      `${nf ? ' applyNumberFormat="1"' : ''}${f ? ' applyFont="1"' : ''}${fl ? ' applyFill="1"' : ''}` +
      `${s.align ? ` applyAlignment="1"><alignment horizontal="${s.align}"/></xf>` : '/>'}`
  })
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
    `<numFmts count="${numFmts.length}">${numFmts.map((f, i) => `<numFmt numFmtId="${164 + i}" formatCode="${esc(f)}"/>`).join('')}</numFmts>` +
    `<fonts count="${fonts.length}">${fonts.join('')}</fonts>` +
    `<fills count="${fills.length}">${fills.join('')}</fills>` +
    `<borders count="${borders.length}">${borders.join('')}</borders>` +
    `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>` +
    `<cellXfs count="${xfs.length}">${xfs.join('')}</cellXfs>` +
    `<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>` +
    `</styleSheet>`
}

// ── Hoja → XML ─────────────────────────────────────────────────────

function sheetXml(sheet: Sheet, styles: Record<string, number>): string {
  const cols = sheet.widths.map((w, i) => (w ? `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>` : '')).join('')
  const rows = sheet.rows
    .map((r, ri) => {
      const cells = r.cells
        .map((c, ci) => {
          if (c === null || c === undefined || c === '') return ''
          const ref = `${colName(ci)}${ri + 1}`
          const s = typeof c === 'object' ? styles[c.s ?? ''] ?? 0 : 0
          if (typeof c === 'object' && c.f !== undefined) return `<c r="${ref}" s="${s}"><f>${esc(c.f.replace(/^=/, ''))}</f><v>${c.v}</v></c>`
          const v = typeof c === 'object' ? c.v : c
          if (v === '' || v === null || v === undefined) return s ? `<c r="${ref}" s="${s}"/>` : ''
          if (typeof v === 'number') return `<c r="${ref}" s="${s}"><v>${v}</v></c>`
          return `<c r="${ref}" s="${s}" t="inlineStr"><is><t xml:space="preserve">${esc(String(v))}</t></is></c>`
        })
        .join('')
      return `<row r="${ri + 1}"${r.h ? ` ht="${r.h}" customHeight="1"` : ''}>${cells}</row>`
    })
    .join('')
  const pane = sheet.freeze
    ? `<pane ySplit="${parseInt(sheet.freeze.slice(1), 10) - 1}" topLeftCell="${sheet.freeze}" activePane="bottomLeft" state="frozen"/>`
    : ''
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
    `<sheetViews><sheetView workbookViewId="0">${pane}</sheetView></sheetViews>` +
    `<cols>${cols}</cols>` +
    `<sheetData>${rows}</sheetData>` +
    `${sheet.filter ? `<autoFilter ref="${sheet.filter}"/>` : ''}` +
    `</worksheet>`
}

// ── El libro ───────────────────────────────────────────────────────

/** El libro de Excel, como bytes (un .xlsx). */
export function buildExcel(fin: FinanceData): Uint8Array {
  const { ds, today, lookup, titulares, positions, accounts } = fin
  const sheets: { name: string; sheet: Sheet }[] = []

  // ── Inicio: la tarjeta de cada titular y el total ──
  const ini = new Sheet()
  ini.col(0, 30).col(1, 18).col(2, 52)
  ini.add([{ v: 'Mis inversiones', s: 'title' }], 28)
  ini.add([{ v: `Copia de la app · ${fmtDate(today)}`, s: 'sub' }])
  ini.add([])
  const patrimonioRows: number[] = []
  const aportadoRows: number[] = []
  const gananciaRows: number[] = []
  for (const tf of titulares) {
    const i = titulares.indexOf(tf)
    ini.add([
      { v: tf.titular.nombre, s: `head${i}` },
      { v: tf.titular.codigo ? `Código ${tf.titular.codigo}` : '', s: `head${i}` },
      { v: i === 0 ? 'Principal' : '', s: `head${i}` },
    ], 22)
    const linea = (label: string, value: XCell, note = '') => {
      ini.add([{ v: label, s: 'b' }, value, { v: note, s: 'note' }])
      return ini.rows.length
    }
    const rInvertido = linea('Invertido', { v: r2(tf.totals.invertidoValor), s: 'money' }, 'Fondos, carteras, depósitos…')
    const rCuentas = linea('En cuentas', { v: r2(tf.totals.efectivo), s: 'money' }, 'Dinero sin invertir (MyInvestor)')
    const rPatrimonio = linea('Patrimonio', { v: r2(tf.totals.patrimonio), f: `=B${rInvertido}+B${rCuentas}`, s: 'moneyB' }, 'Inversiones + el dinero en cuentas')
    linea('Rentabilidad', tf.totals.rentabilidad === null ? { v: '—' } : { v: tf.totals.rentabilidad, s: 'pct' }, 'Lo que ha ganado (o perdido)')
    const rGanancia = linea('Ganancia', { v: r2(tf.totals.ganancia), s: 'money' }, 'Lo que han ganado las inversiones')
    linea('Capital', { v: r2(tf.totals.capital), s: 'money' }, 'Lo puesto, menos lo reembolsado')
    const rAportado = linea('Aportado', { v: r2(tf.totals.aportadoTotal), s: 'money' }, 'Lo que ha entrado desde fuera')
    linea('Retirado', { v: r2(tf.totals.retiradoTotal), s: 'money' }, 'Lo que ha salido a sus bancos')
    patrimonioRows.push(rPatrimonio)
    aportadoRows.push(rAportado)
    gananciaRows.push(rGanancia)
    ini.add([])
  }
  const suma = (rows: number[]) => rows.map((r) => `B${r}`).join('+')
  ini.add([{ v: 'Total de todos', s: 'total' }, { v: '', s: 'total' }, { v: '', s: 'total' }], 22)
  ini.add([{ v: 'Patrimonio', s: 'b' }, { v: r2(totales(titulares).patrimonio), f: `=${suma(patrimonioRows)}`, s: 'moneyT' }, { v: 'Lo de todos, juntado', s: 'note' }])
  ini.add([{ v: 'Aportado', s: 'b' }, { v: r2(totales(titulares).aportado), f: `=${suma(aportadoRows)}`, s: 'moneyT' }, { v: 'Lo que ha entrado desde fuera', s: 'note' }])
  ini.add([{ v: 'Ganancia', s: 'b' }, { v: r2(totales(titulares).ganancia), f: `=${suma(gananciaRows)}`, s: 'moneyT' }, { v: 'Lo que han ganado las inversiones', s: 'note' }])
  sheets.push({ name: 'Inicio', sheet: ini })

  // ── Evolución: los datos del gráfico (empiezan ayer, como en la app) ──
  const evo = new Sheet()
  evo.col(0, 14)
  titulares.forEach(() => {
    evo.col(evo.widths.length, 20).col(evo.widths.length, 20)
  })
  evo.add([{ v: 'Evolución', s: 'title' }], 28)
  evo.add([{ v: 'Patrimonio (línea continua) y lo aportado (discontinua) de cada titular', s: 'sub' }])
  evo.add([])
  const head: XCell[] = ['Fecha']
  for (const tf of titulares) {
    head.push({ v: `${tf.titular.nombre} · patrimonio`, s: 'hMoney' })
    head.push({ v: `${tf.titular.nombre} · aportado`, s: 'hMoney' })
  }
  evo.add(head).freezeAt('A5')
  const visibles = titulares.filter((tf) => tf.ws.movimientos.length > 0)
  const puntos = buildTimelineMulti(
    visibles.map((tf) => ({ id: tf.titular.id, ws: tf.ws })),
    fin.ws.movimientos,
    today,
    lookup,
  )
  const desde = ds.lineaDesde ?? today
  const recortados = recortarDesde(puntos, desde, visibles.map((tf) => ({ id: tf.titular.id, ws: tf.ws })), fin.ws.movimientos, lookup)
  for (const p of recortados) {
    const row: XCell[] = [fmtDate(p.fecha)]
    for (const tf of titulares) {
      const pv = p[`${tf.titular.id}:p`]
      const cv = p[`${tf.titular.id}:c`]
      row.push(pv === undefined ? '—' : { v: r2(Number(pv)), s: 'money' })
      row.push(cv === undefined ? '—' : { v: r2(Number(cv)), s: 'money' })
    }
    evo.add(row)
  }
  sheets.push({ name: 'Evolución', sheet: evo })

  // ── Inversiones: como el Excel de siempre (Invertido/Reembolso/Traspaso/%/€/Saldo) ──
  const inv = new Sheet()
  ;['Titular', 'Código', 'Producto', 'Tipo', 'Entidad', 'Invertido', 'Reembolso', 'Traspaso', 'Capital', '%', '€', 'Saldo'].forEach(
    (_, i) => inv.col(i, i === 2 ? 34 : i === 0 ? 20 : i >= 5 ? 15 : 12),
  )
  inv.add([{ v: 'Inversiones', s: 'title' }], 28)
  inv.add([{ v: 'El dinero que has puesto, lo que ha vuelto, lo que ha ganado y lo que vale hoy', s: 'sub' }])
  inv.add([])
  inv.add(['Titular', 'Código', 'Producto', 'Tipo', 'Entidad', 'Invertido', 'Reembolso', 'Traspaso', 'Capital', '%', '€', 'Saldo'].map((h, i) => ({ v: h, s: i >= 5 ? 'hMoney' : 'h' })))
    .freezeAt('A5')
  const subtotalRows: number[] = []
  for (const tf of titulares) {
    const i = titulares.indexOf(tf)
    inv.add([
      { v: tf.titular.nombre, s: `head${i}` },
      { v: tf.titular.codigo, s: `head${i}` },
      ...Array(10).fill({ v: '', s: `head${i}` }),
    ], 20)
    const start = inv.next
    for (const p of tf.ws.productos) {
      const pos = positions.get(p.id)
      if (!pos) continue
      const r = inv.next
      // El saldo se calcula solo cuando se sabe en % (como en la app: Saldo = Capital × (1 + %)).
      const enPct = pos.metodo === 'porcentaje' && pos.rentabilidad !== null
      inv.add([
        tf.titular.nombre,
        tf.titular.codigo,
        p.nombre,
        PRODUCT_META[p.tipo].label,
        p.entidad || '—',
        { v: r2(pos.invertido), s: 'money' },
        { v: r2(pos.reembolsado), s: 'money' },
        { v: r2(pos.traspasoEntrada - pos.traspasoSalida), s: 'money' },
        { v: r2(pos.capital), f: `=F${r}-G${r}+H${r}`, s: 'money' },
        pos.rentabilidad === null ? { v: '—' } : { v: pos.rentabilidad, s: 'pct' },
        enPct ? { v: r2(pos.ganancia), f: `=L${r}-I${r}`, s: 'money' } : { v: r2(pos.ganancia), s: 'money' },
        enPct ? { v: r2(pos.saldo), f: `=I${r}*(1+J${r})`, s: 'moneyB' } : { v: r2(pos.saldo), s: 'moneyB' },
      ])
    }
    const end = inv.rows.length
    inv.add([
      { v: `Total · ${tf.titular.nombre}`, s: 'total' },
      { v: '', s: 'total' },
      { v: '', s: 'total' },
      { v: '', s: 'total' },
      { v: '', s: 'total' },
      { v: '', f: `=SUM(F${start}:F${end})`, s: 'totalMoney' },
      { v: '', f: `=SUM(G${start}:G${end})`, s: 'totalMoney' },
      { v: '', f: `=SUM(H${start}:H${end})`, s: 'totalMoney' },
      { v: '', f: `=SUM(I${start}:I${end})`, s: 'totalMoney' },
      { v: '', s: 'total' },
      { v: '', f: `=SUM(K${start}:K${end})`, s: 'totalMoney' },
      { v: '', f: `=SUM(L${start}:L${end})`, s: 'totalMoney' },
    ])
    subtotalRows.push(inv.rows.length)
  }
  inv.autoFilter(`A4:L${inv.rows.length}`)
  inv.add([
    { v: 'TOTAL', s: 'total' },
    { v: '', s: 'total' },
    { v: '', s: 'total' },
    { v: '', s: 'total' },
    { v: '', s: 'total' },
    { v: '', f: subtotalRows.map((r) => `F${r}`).join('+'), s: 'totalMoney' },
    { v: '', f: subtotalRows.map((r) => `G${r}`).join('+'), s: 'totalMoney' },
    { v: '', f: subtotalRows.map((r) => `H${r}`).join('+'), s: 'totalMoney' },
    { v: '', f: subtotalRows.map((r) => `I${r}`).join('+'), s: 'totalMoney' },
    { v: '', s: 'total' },
    { v: '', f: subtotalRows.map((r) => `K${r}`).join('+'), s: 'totalMoney' },
    { v: '', f: subtotalRows.map((r) => `L${r}`).join('+'), s: 'totalMoney' },
  ])
  sheets.push({ name: 'Inversiones', sheet: inv })

  // ── Cuentas: el saldo real y a dónde ha ido el dinero ──
  const cue = new Sheet()
  cue.col(0, 30).col(1, 18).col(2, 10).col(3, 16).col(4, 16).col(5, 16).col(6, 52)
  cue.add([{ v: 'Cuentas', s: 'title' }], 28)
  cue.add([{ v: 'El saldo es el real: cuenta también lo que se ha ido a otro titular', s: 'sub' }])
  cue.add([])
  for (const tf of titulares) {
    const i = titulares.indexOf(tf)
    cue.add([
      { v: tf.titular.nombre, s: `head${i}` },
      { v: '', s: `head${i}` },
      { v: '', s: `head${i}` },
      { v: '', s: `head${i}` },
      { v: '', s: `head${i}` },
      { v: '', s: `head${i}` },
      { v: '', s: `head${i}` },
    ], 20)
    cue.add(['Cuenta', 'Entidad', 'Externa', 'Entradas', 'Salidas', 'Saldo', 'A dónde ha ido su dinero'].map((h, k) => ({ v: h, s: k >= 3 ? 'hMoney' : 'h' })))
    for (const c of tf.ws.cuentas) {
      const st = accounts.get(c.id)
      if (!st) continue
      const r = cue.next
      const destino = st.porProducto
        .slice()
        .sort((a, b) => b.enviado - a.enviado)
        .map((pp) => {
          const p = ds.productos.find((x) => x.id === pp.productoId)
          return p && pp.enviado > 0 ? `${p.nombre}: ${fmtEUR(pp.enviado)}` : ''
        })
        .filter(Boolean)
        .join(' · ')
      cue.add([
        c.nombre,
        c.entidad || '—',
        c.externa ? 'Sí' : 'No',
        { v: r2(st.entradas), s: 'money' },
        { v: r2(st.salidas), s: 'money' },
        // El saldo de una cuenta externa no se sabe (es de su banco): no se inventa.
        c.externa ? { v: '—' } : { v: r2(st.saldo), f: `=D${r}-E${r}`, s: 'moneyB' },
        destino || '—',
      ])
    }
    cue.add([])
  }
  sheets.push({ name: 'Cuentas', sheet: cue })

  // ── Movimientos: todos, de todos ──
  const mov = new Sheet()
  mov.col(0, 12).col(1, 16).col(2, 22).col(3, 34).col(4, 22).col(5, 34).col(6, 14).col(7, 44)
  mov.add([{ v: 'Movimientos', s: 'title' }], 28)
  mov.add([{ v: 'Todos los movimientos de todos los titulares: de quién a quién', s: 'sub' }])
  mov.add([])
  mov.add(['Fecha', 'Tipo', 'De (titular)', 'De', 'A (titular)', 'A', 'Importe', 'Concepto'].map((h, k) => ({ v: h, s: k === 6 ? 'hMoney' : 'h' })))
    .freezeAt('A5')
  const quien = (ref: EntityRef) => {
    const t = ownerOf(lookup, ref)
    return `${t ? `${t.nombre} · ` : ''}${entityName(lookup, ref)}`
  }
  for (const m of sortMovementsDesc(fin.ws.movimientos)) {
    mov.add([
      fmtDate(m.fecha),
      kindMeta(movementKind(lookup, m)).label,
      ownerOf(lookup, m.origen)?.nombre ?? '—',
      entityName(lookup, m.origen),
      ownerOf(lookup, m.destino)?.nombre ?? '—',
      entityName(lookup, m.destino),
      { v: r2(m.importe), s: 'money' },
      m.concepto || '—',
    ])
  }
  mov.autoFilter(`A4:H${mov.rows.length}`)
  sheets.push({ name: 'Movimientos', sheet: mov })

  // ── Flujo: de dónde viene y a dónde va el dinero ──
  const g: FlowGraph = buildFlowGraph(ds, positions, { from: null, to: null })
  const flu = new Sheet()
  flu.col(0, 40).col(1, 16).col(2, 40).col(3, 22)
  flu.add([{ v: 'Flujo del dinero', s: 'title' }], 28)
  flu.add([{ v: 'De dónde viene y a dónde va', s: 'sub' }])
  flu.add([])
  flu.add(['De', 'Importe', 'A', 'Cómo'].map((h, k) => ({ v: h, s: k === 1 ? 'hMoney' : 'h' })))
  for (const l of g.links) {
    const desde = g.nodes.find((n) => n.id === l.source)
    const hasta = g.nodes.find((n) => n.id === l.target)
    flu.add([desde?.label ?? l.source, { v: r2(l.value), s: 'money' }, hasta?.label ?? l.target, kindLabel(l.kind)])
  }
  void quien
  flu.add([])
  flu.add([{ v: 'Transferencias entre cuentas', s: 'b' }])
  flu.add(['De', 'Importe', 'A', 'Cuándo'].map((h, k) => ({ v: h, s: k === 1 ? 'hMoney' : 'h' })))
  for (const m of g.transfers) {
    flu.add([quien(m.origen), { v: r2(m.importe), s: 'money' }, quien(m.destino), fmtDate(m.fecha)])
  }
  sheets.push({ name: 'Flujo', sheet: flu })

  // ── Transferencias mensuales ──
  const prog = new Sheet()
  prog.col(0, 32).col(1, 32).col(2, 14).col(3, 8).col(4, 14).col(5, 14).col(6, 44)
  prog.add([{ v: 'Transferencias mensuales', s: 'title' }], 28)
  prog.add([{ v: 'Se apuntan solas cada mes', s: 'sub' }])
  prog.add([])
  prog.add(['De', 'A', 'Importe', 'Día', 'Desde', 'Hasta', 'Concepto'].map((h, k) => ({ v: h, s: k === 2 ? 'hMoney' : 'h' })))
  for (const p of ds.programadas) {
    prog.add([
      quien(p.origen),
      quien(p.destino),
      { v: r2(p.importe), s: 'money' },
      p.inicio.slice(8),
      fmtDate(p.inicio),
      p.fin ? fmtDate(p.fin) : '—',
      p.concepto || '—',
    ])
  }
  sheets.push({ name: 'Transferencias', sheet: prog })

  // ── Juntar el libro ──
  const specs = styleSpecs(titulares.map((t) => t.color))
  const styleIndex: Record<string, number> = {}
  Object.keys(specs).forEach((k, i) => (styleIndex[k] = i))
  const entries: ZipEntry[] = [
    {
      name: '[Content_Types].xml',
      data: utf8(
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
          `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
          `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
          `<Default Extension="xml" ContentType="application/xml"/>` +
          `<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>` +
          `<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>` +
          `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
          `<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>` +
          sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('') +
          `</Types>`,
      ),
    },
    {
      name: '_rels/.rels',
      data: utf8(
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
          `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
          `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>` +
          `<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>` +
          `<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>` +
          `</Relationships>`,
      ),
    },
    {
      name: 'docProps/core.xml',
      data: utf8(
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
          `<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">` +
          `<dc:title>Mis inversiones</dc:title>` +
          `<dc:creator>Mis inversiones</dc:creator>` +
          `<cp:lastModifiedBy>Mis inversiones</cp:lastModifiedBy>` +
          `<dcterms:created xsi:type="dcterms:W3CDTF">${new Date().toISOString()}</dcterms:created>` +
          `<dcterms:modified xsi:type="dcterms:W3CDTF">${new Date().toISOString()}</dcterms:modified>` +
          `</cp:coreProperties>`,
      ),
    },
    {
      name: 'docProps/app.xml',
      data: utf8(
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
          `<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">` +
          `<Application>Mis inversiones</Application>` +
          `<DocSecurity>0</DocSecurity>` +
          `<ScaleCrop>false</ScaleCrop>` +
          `<HeadingPairs>` +
          `<vt:vector size="2" baseType="variant"><vt:variant><vt:lpstr>Hojas</vt:lpstr></vt:variant><vt:variant><vt:i4>${sheets.length}</vt:i4></vt:variant></vt:vector>` +
          `</HeadingPairs>` +
          `<TitlesOfParts>` +
          `<vt:vector size="${sheets.length}" baseType="lpstr">${sheets.map((s2) => `<vt:lpstr>${esc(s2.name)}</vt:lpstr>`).join('')}</vt:vector>` +
          `</TitlesOfParts>` +
          `<Company>Mis inversiones</Company>` +
          `<LinksUpToDate>false</LinksUpToDate>` +
          `<SharedDoc>false</SharedDoc>` +
          `<HyperlinksChanged>false</HyperlinksChanged>` +
          `<AppVersion>1.0</AppVersion>` +
          `</Properties>`,
      ),
    },
    {
      name: 'xl/workbook.xml',
      data: utf8(
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
          `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
          `<calcPr fullCalcOnLoad="1"/>` +
          `<sheets>${sheets.map((s, i) => `<sheet name="${esc(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets>` +
          `</workbook>`,
      ),
    },
    {
      name: 'xl/_rels/workbook.xml.rels',
      data: utf8(
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
          `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
          sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('') +
          `<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
          `</Relationships>`,
      ),
    },
    { name: 'xl/styles.xml', data: utf8(stylesXml(specs)) },
    ...sheets.map((s, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, data: utf8(sheetXml(s.sheet, styleIndex)) })),
  ]
  return zip(entries)
}

const totales = (ts: FinanceData['titulares']) =>
  ts.reduce(
    (acc, tf) => ({
      patrimonio: acc.patrimonio + tf.totals.patrimonio,
      aportado: acc.aportado + tf.totals.aportadoTotal,
      ganancia: acc.ganancia + tf.totals.ganancia,
    }),
    { patrimonio: 0, aportado: 0, ganancia: 0 },
  )

const kindLabel = (k: string): string =>
  ({
    aportaciones: 'Aportaciones',
    ganancia: 'Ganancia',
    reembolsos: 'Reembolsos',
    traspasos: 'Traspasos',
    efectivo: 'Dinero en cuentas',
    fuera: 'Desde fuera',
    retirado: 'Retirado',
    inversion: 'Inversión',
    reembolso: 'Reembolso',
    traspaso: 'Traspaso',
    saldo: 'Sigue invertido',
    previo: 'Valor anterior',
    pendiente: 'Pendiente',
    perdida: 'Pérdida',
  })[k] ?? k
