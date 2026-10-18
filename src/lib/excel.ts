// Un Excel como la app: mismas cifras, mismas pestañas y el mismo aspecto (el color
// de cada titular, los encabezados, el dinero en € y en %), con fórmulas donde la
// app calcula (totales, capital, ganancia, saldo en %…), para que se pueda usar
// igual. Se genera en el navegador con exceljs y se descarga; no hace falta nada más.

import ExcelJS from 'exceljs'
import type { FinanceData } from '../store/useFinance'
import { buildFlowGraph, type FlowGraph } from './flow'
import { buildTimelineMulti, recortarDesde } from './finance'
import { entityName, movementKind, ownerOf, sortMovementsDesc } from './movements'
import { PRODUCT_META, kindMeta } from './meta'
import { fmtDate, fmtEUR } from './format'
import type { EntityRef } from '../types'

const INK = 'FF0F172A'
const SLATE = 'FF64748B'
const SOFT = 'FFF1F5F9'
const LINE = 'FFCBD5E1'
const BLANCO = 'FFFFFFFF'

const MONEY = '#,##0.00 "€";[Red]-#,##0.00 "€"'
const PCT = '0.0%;[Red]-0.0%'

/** Mezcla un color con blanco (fondos suaves), en aRGB. */
const tint = (hex: string, k: number) => {
  const n = parseInt(hex.slice(1), 16)
  const m = (c: number) => Math.round(c + (255 - c) * k)
  return `FF${[m((n >> 16) & 255), m((n >> 8) & 255), m(n & 255)].map((c) => c.toString(16).padStart(2, '0')).join('')}`
}

interface EstiloSpec {
  b?: boolean
  sz?: number
  color?: string
  relleno?: string
  numFmt?: string
  align?: 'right' | 'center'
  borde?: 'bottom' | 'top' | 'box'
}

/** Estilos por nombre: los fijos + uno por titular (su color). */
function estilos(colors: string[]): Record<string, EstiloSpec> {
  const out: Record<string, EstiloSpec> = {
    title: { b: true, sz: 20, color: INK },
    sub: { sz: 11, color: SLATE },
    h: { b: true, color: SLATE, relleno: SOFT, borde: 'bottom' },
    hMoney: { b: true, color: SLATE, relleno: SOFT, borde: 'bottom', align: 'right' },
    b: { b: true },
    money: { numFmt: MONEY, align: 'right' },
    moneyB: { b: true, numFmt: MONEY, align: 'right' },
    moneyT: { b: true, numFmt: MONEY, align: 'right', relleno: SOFT, borde: 'top' },
    pct: { numFmt: PCT, align: 'right' },
    note: { sz: 10, color: SLATE },
    total: { b: true, relleno: SOFT, borde: 'top' },
    totalMoney: { b: true, numFmt: MONEY, align: 'right', relleno: SOFT, borde: 'top' },
    center: { align: 'center' },
    box: { borde: 'box' },
  }
  colors.forEach((color, i) => {
    out[`head${i}`] = { b: true, sz: 12, color: BLANCO, relleno: argb(color) }
    out[`soft${i}`] = { b: true, color: INK, relleno: tint(color, 0.88) }
  })
  return out
}

const borde = (cual: 'bottom' | 'top' | 'box'): ExcelJS.Borders => {
  const thin = { style: 'thin' as const, color: { argb: LINE } }
  if (cual === 'bottom') return { bottom: thin } as ExcelJS.Borders
  if (cual === 'top') return { top: thin } as ExcelJS.Borders
  return { left: thin, right: thin, top: thin, bottom: thin } as ExcelJS.Borders
}

/** Una celda: texto, número, o fórmula (con su valor calculado, para quien no recalcula). */
export type XCell = string | number | null | undefined | { v?: string | number; f?: string; s?: string }

type Row = XCell[]

/** Escribe una fila y le pone los estilos. */
function fila(ws: ExcelJS.Worksheet, celdas: Row, specs: Record<string, EstiloSpec>, altura?: number) {
  const row = ws.addRow([])
  if (altura) row.height = altura
  celdas.forEach((c, i) => {
    if (c === null || c === undefined || c === '') return
    const cell = row.getCell(i + 1)
    if (typeof c === 'object') {
      if (c.f !== undefined) cell.value = { formula: c.f.replace(/^=/, ''), result: Number(c.v) || 0 }
      else cell.value = c.v === undefined ? null : c.v
      if (c.s) ponerEstilo(cell, c.s, specs)
    } else {
      cell.value = c
    }
  })
  return row
}

function ponerEstilo(cell: ExcelJS.Cell, nombre: string, specs: Record<string, EstiloSpec>) {
  const e = specs[nombre]
  if (!e) return
  if (e.b || e.sz || e.color) cell.font = { bold: e.b, size: e.sz ?? 11, color: { argb: e.color ?? INK } }
  if (e.relleno) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: e.relleno } }
  if (e.numFmt) cell.numFmt = e.numFmt
  if (e.align) cell.alignment = { horizontal: e.align }
  if (e.borde) cell.border = borde(e.borde)
}

/** aRGB: Excel quiere el alfa delante y sin almohadilla (FF2447B8). */
const argb = (hex: string) => (hex.startsWith('#') ? `FF${hex.slice(1)}` : hex)

/** El dinero redondeado a céntimos (los cálculos dejan polvo de coma flotante). */
const r2 = (n: number) => Math.round(n * 100) / 100

/** El libro de Excel, como un ArrayBuffer (un .xlsx). */
export async function buildExcel(fin: FinanceData): Promise<ArrayBuffer> {
  const { ds, today, lookup, titulares, positions, accounts } = fin
  const specs = estilos(titulares.map((t) => t.color))
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Mis inversiones'
  wb.created = new Date()

  // ── Inicio: la tarjeta de cada titular y el total ──
  const ini = wb.addWorksheet('Inicio')
  ini.columns = [
    { width: 30 },
    { width: 18 },
    { width: 52 },
  ]
  fila(ini, [{ v: 'Mis inversiones', s: 'title' }], specs, 28)
  fila(ini, [{ v: `Copia de la app · ${fmtDate(today)}`, s: 'sub' }], specs)
  fila(ini, [], specs)
  const patrimonioRows: number[] = []
  const aportadoRows: number[] = []
  const gananciaRows: number[] = []
  for (const tf of titulares) {
    const i = titulares.indexOf(tf)
    fila(
      ini,
      [
        { v: tf.titular.nombre, s: `head${i}` },
        { v: tf.titular.codigo ? `Código ${tf.titular.codigo}` : '', s: `head${i}` },
        { v: i === 0 ? 'Principal' : '', s: `head${i}` },
      ],
      specs,
      22,
    )
    const linea = (label: string, value: XCell, note = '') => {
      fila(ini, [{ v: label, s: 'b' }, value, { v: note, s: 'note' }], specs)
      return ini.rowCount
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
    fila(ini, [], specs)
  }
  const suma = (rows: number[]) => rows.map((r) => `B${r}`).join('+')
  const tot = titulares.reduce(
    (acc, tf) => ({
      patrimonio: acc.patrimonio + tf.totals.patrimonio,
      aportado: acc.aportado + tf.totals.aportadoTotal,
      ganancia: acc.ganancia + tf.totals.ganancia,
    }),
    { patrimonio: 0, aportado: 0, ganancia: 0 },
  )
  fila(ini, [{ v: 'Total de todos', s: 'total' }, { v: '', s: 'total' }, { v: '', s: 'total' }], specs, 22)
  fila(ini, [{ v: 'Patrimonio', s: 'b' }, { v: r2(tot.patrimonio), f: `=${suma(patrimonioRows)}`, s: 'moneyT' }, { v: 'Lo de todos, juntado', s: 'note' }], specs)
  fila(ini, [{ v: 'Aportado', s: 'b' }, { v: r2(tot.aportado), f: `=${suma(aportadoRows)}`, s: 'moneyT' }, { v: 'Lo que ha entrado desde fuera', s: 'note' }], specs)
  fila(ini, [{ v: 'Ganancia', s: 'b' }, { v: r2(tot.ganancia), f: `=${suma(gananciaRows)}`, s: 'moneyT' }, { v: 'Lo que han ganado las inversiones', s: 'note' }], specs)

  // ── Evolución: los datos del gráfico (empiezan ayer, como en la app) ──
  const evo = wb.addWorksheet('Evolución')
  evo.columns = [{ width: 14 }, ...titulares.flatMap(() => [{ width: 20 }, { width: 20 }])]
  fila(evo, [{ v: 'Evolución', s: 'title' }], specs, 28)
  fila(evo, [{ v: 'Patrimonio (línea continua) y lo aportado (discontinua) de cada titular', s: 'sub' }], specs)
  fila(evo, [], specs)
  fila(
    evo,
    [
      { v: 'Fecha', s: 'h' },
      ...titulares.flatMap((tf) => [
        { v: `${tf.titular.nombre} · patrimonio`, s: 'hMoney' },
        { v: `${tf.titular.nombre} · aportado`, s: 'hMoney' },
      ]),
    ],
    specs,
  )
  evo.views = [{ state: 'frozen', ySplit: 4 }]
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
    fila(
      evo,
      [
        fmtDate(p.fecha),
        ...titulares.flatMap((tf) => {
          const pv = p[`${tf.titular.id}:p`]
          const cv = p[`${tf.titular.id}:c`]
          return [
            pv === undefined ? { v: '—' } : { v: r2(Number(pv)), s: 'money' },
            cv === undefined ? { v: '—' } : { v: r2(Number(cv)), s: 'money' },
          ]
        }),
      ],
      specs,
    )
  }

  // ── Inversiones: como el Excel de siempre (Invertido/Reembolso/Traspaso/%/€/Saldo) ──
  const inv = wb.addWorksheet('Inversiones')
  inv.columns = [{ width: 20 }, { width: 10 }, { width: 34 }, { width: 12 }, { width: 15 }, { width: 15 }, { width: 15 }, { width: 15 }, { width: 15 }, { width: 10 }, { width: 15 }, { width: 15 }]
  fila(inv, [{ v: 'Inversiones', s: 'title' }], specs, 28)
  fila(inv, [{ v: 'El dinero que has puesto, lo que ha vuelto, lo que ha ganado y lo que vale hoy', s: 'sub' }], specs)
  fila(inv, [], specs)
  fila(
    inv,
    ['Titular', 'Código', 'Producto', 'Tipo', 'Entidad', 'Invertido', 'Reembolso', 'Traspaso', 'Capital', '%', '€', 'Saldo'].map((h, i) => ({ v: h, s: i >= 5 ? 'hMoney' : 'h' })),
    specs,
  )
  inv.views = [{ state: 'frozen', ySplit: 4 }]
  const subtotalRows: number[] = []
  for (const tf of titulares) {
    const i = titulares.indexOf(tf)
    fila(
      inv,
      [{ v: tf.titular.nombre, s: `head${i}` }, { v: tf.titular.codigo, s: `head${i}` }, ...Array(10).fill({ v: '', s: `head${i}` })],
      specs,
      20,
    )
    const start = inv.rowCount + 1
    for (const p of tf.ws.productos) {
      const pos = positions.get(p.id)
      if (!pos) continue
      const r = inv.rowCount + 1
      // El saldo se calcula solo cuando se sabe en % (como en la app: Saldo = Capital × (1 + %)).
      const enPct = pos.metodo === 'porcentaje' && pos.rentabilidad !== null
      fila(
        inv,
        [
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
        ],
        specs,
      )
    }
    const end = inv.rowCount
    subtotalRows.push(end + 1)
    fila(
      inv,
      [
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
      ],
      specs,
    )
  }
  inv.autoFilter = `A4:L${inv.rowCount}`
  fila(
    inv,
    [
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
    ],
    specs,
  )

  // ── Cuentas: el saldo real y a dónde ha ido el dinero ──
  const cue = wb.addWorksheet('Cuentas')
  cue.columns = [{ width: 30 }, { width: 18 }, { width: 10 }, { width: 16 }, { width: 16 }, { width: 16 }, { width: 52 }]
  fila(cue, [{ v: 'Cuentas', s: 'title' }], specs, 28)
  fila(cue, [{ v: 'El saldo es el real: cuenta también lo que se ha ido a otro titular', s: 'sub' }], specs)
  fila(cue, [], specs)
  for (const tf of titulares) {
    const i = titulares.indexOf(tf)
    fila(cue, [{ v: tf.titular.nombre, s: `head${i}` }, ...Array(6).fill({ v: '', s: `head${i}` })], specs, 20)
    fila(cue, ['Cuenta', 'Entidad', 'Externa', 'Entradas', 'Salidas', 'Saldo', 'A dónde ha ido su dinero'].map((h, k) => ({ v: h, s: k >= 3 ? 'hMoney' : 'h' })), specs)
    for (const c of tf.ws.cuentas) {
      const st = accounts.get(c.id)
      if (!st) continue
      const r = cue.rowCount + 1
      const destino = st.porProducto
        .slice()
        .sort((a, b) => b.enviado - a.enviado)
        .map((pp) => {
          const p = ds.productos.find((x) => x.id === pp.productoId)
          return p && pp.enviado > 0 ? `${p.nombre}: ${fmtEUR(pp.enviado)}` : ''
        })
        .filter(Boolean)
        .join(' · ')
      fila(
        cue,
        [
          c.nombre,
          c.entidad || '—',
          c.externa ? 'Sí' : 'No',
          { v: r2(st.entradas), s: 'money' },
          { v: r2(st.salidas), s: 'money' },
          // El saldo de una cuenta externa no se sabe (es de su banco): no se inventa.
          c.externa ? { v: '—' } : { v: r2(st.saldo), f: `=D${r}-E${r}`, s: 'moneyB' },
          destino || '—',
        ],
        specs,
      )
    }
    fila(cue, [], specs)
  }

  // ── Movimientos: todos, de todos ──
  const mov = wb.addWorksheet('Movimientos')
  mov.columns = [{ width: 12 }, { width: 16 }, { width: 22 }, { width: 34 }, { width: 22 }, { width: 34 }, { width: 14 }, { width: 44 }]
  fila(mov, [{ v: 'Movimientos', s: 'title' }], specs, 28)
  fila(mov, [{ v: 'Todos los movimientos de todos los titulares: de quién a quién', s: 'sub' }], specs)
  fila(mov, [], specs)
  fila(mov, ['Fecha', 'Tipo', 'De (titular)', 'De', 'A (titular)', 'A', 'Importe', 'Concepto'].map((h, k) => ({ v: h, s: k === 6 ? 'hMoney' : 'h' })), specs)
  mov.views = [{ state: 'frozen', ySplit: 4 }]
  const quien = (ref: EntityRef) => {
    const t = ownerOf(lookup, ref)
    return `${t ? `${t.nombre} · ` : ''}${entityName(lookup, ref)}`
  }
  for (const m of sortMovementsDesc(fin.ws.movimientos)) {
    fila(
      mov,
      [
        fmtDate(m.fecha),
        kindMeta(movementKind(lookup, m)).label,
        ownerOf(lookup, m.origen)?.nombre ?? '—',
        entityName(lookup, m.origen),
        ownerOf(lookup, m.destino)?.nombre ?? '—',
        entityName(lookup, m.destino),
        { v: r2(m.importe), s: 'money' },
        m.concepto || '—',
      ],
      specs,
    )
  }
  mov.autoFilter = `A4:H${mov.rowCount}`

  // ── Flujo: de dónde viene y a dónde va el dinero ──
  const g: FlowGraph = buildFlowGraph(ds, positions, { from: null, to: null })
  const flu = wb.addWorksheet('Flujo')
  flu.columns = [{ width: 40 }, { width: 16 }, { width: 40 }, { width: 22 }]
  fila(flu, [{ v: 'Flujo del dinero', s: 'title' }], specs, 28)
  fila(flu, [{ v: 'De dónde viene y a dónde va', s: 'sub' }], specs)
  fila(flu, [], specs)
  fila(flu, ['De', 'Importe', 'A', 'Cómo'].map((h, k) => ({ v: h, s: k === 1 ? 'hMoney' : 'h' })), specs)
  for (const l of g.links) {
    const desde = g.nodes.find((n) => n.id === l.source)
    const hasta = g.nodes.find((n) => n.id === l.target)
    fila(flu, [desde?.label ?? l.source, { v: r2(l.value), s: 'money' }, hasta?.label ?? l.target, kindLabel(l.kind)], specs)
  }
  fila(flu, [], specs)
  fila(flu, [{ v: 'Transferencias entre cuentas', s: 'b' }], specs)
  fila(flu, ['De', 'Importe', 'A', 'Cuándo'].map((h, k) => ({ v: h, s: k === 1 ? 'hMoney' : 'h' })), specs)
  for (const m of g.transfers) {
    fila(flu, [quien(m.origen), { v: r2(m.importe), s: 'money' }, quien(m.destino), fmtDate(m.fecha)], specs)
  }

  // ── Transferencias mensuales ──
  const prog = wb.addWorksheet('Transferencias')
  prog.columns = [{ width: 32 }, { width: 32 }, { width: 14 }, { width: 8 }, { width: 14 }, { width: 14 }, { width: 44 }]
  fila(prog, [{ v: 'Transferencias mensuales', s: 'title' }], specs, 28)
  fila(prog, [{ v: 'Se apuntan solas cada mes', s: 'sub' }], specs)
  fila(prog, [], specs)
  fila(prog, ['De', 'A', 'Importe', 'Día', 'Desde', 'Hasta', 'Concepto'].map((h, k) => ({ v: h, s: k === 2 ? 'hMoney' : 'h' })), specs)
  for (const p of ds.programadas) {
    fila(
      prog,
      [
        quien(p.origen),
        quien(p.destino),
        { v: r2(p.importe), s: 'money' },
        p.inicio.slice(8),
        fmtDate(p.inicio),
        p.fin ? fmtDate(p.fin) : '—',
        p.concepto || '—',
      ],
      specs,
    )
  }

  return (await wb.xlsx.writeBuffer()) as ArrayBuffer
}

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
