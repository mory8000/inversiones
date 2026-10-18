// Un Excel VIVO como la app: una tabla de movimientos es la fuente principal
// (con listas desplegables de tipo, titular, de y a), y las hojas de Cuentas,
// Inversiones y el panel de Inicio se recalculan solas con fórmulas vinculadas
// entre hojas (SUMIFS). Se genera con exceljs y se descarga; la parte pesada
// (exceljs) se carga sólo cuando se pide el Excel.

import ExcelJS from 'exceljs'
import type { FinanceData } from '../store/useFinance'
import type { Lookup } from './movements'
import type { Movimiento } from '../types'
import { entityName, ownerOf } from './movements'
import { PRODUCT_META } from './meta'
import { fmtDate, fmtEUR } from './format'

const INK = 'FF0F172A'
const SLATE = 'FF64748B'
const SOFT = 'FFF1F5F9'
const LINE = 'FFCBD5E1'
const BLANCO = 'FFFFFFFF'
const EDITABLE = 'FFFFF7CC' // amarillo suave: celda para escribir

const MONEY = '#,##0.00 "€";[Red]-#,##0.00 "€"'
const PCT = '0.00%;[Red]-0.00%'
const FECHA = 'DD/MM/YYYY'

/** aRGB: Excel quiere el alfa delante y sin almohadilla (FF2447B8). */
const argb = (hex: string) => (hex.startsWith('#') ? `FF${hex.slice(1)}` : hex)

/** El dinero redondeado a céntimos (los cálculos dejan polvo de coma flotante). */
const r2 = (n: number) => Math.round(n * 100) / 100

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
    pctEditable: { numFmt: PCT, align: 'right', relleno: EDITABLE },
    fecha: { numFmt: FECHA },
    nota: { sz: 10, color: SLATE },
    total: { b: true, relleno: SOFT, borde: 'top' },
    totalMoney: { b: true, numFmt: MONEY, align: 'right', relleno: SOFT, borde: 'top' },
    center: { align: 'center' },
  }
  colors.forEach((color, i) => {
    out[`head${i}`] = { b: true, sz: 12, color: BLANCO, relleno: argb(color) }
  })
  return out
}

const borde = (cual: 'bottom' | 'top' | 'box'): ExcelJS.Borders => {
  const thin = { style: 'thin' as const, color: { argb: LINE } }
  if (cual === 'bottom') return { bottom: thin } as ExcelJS.Borders
  if (cual === 'top') return { top: thin } as ExcelJS.Borders
  return { left: thin, right: thin, top: thin, bottom: thin } as ExcelJS.Borders
}

/** Una celda: texto, número, o fórmula (con su resultado calculado, para quien no recalcula). */
type XCell = string | number | null | undefined | { v?: string | number; f?: string; s?: string }

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

/** Cómo se registra un movimiento en el libro: su tipo y para quién cuenta. */
const tipoDeMovimiento = (m: Movimiento, lookup: Lookup): { tipo: string; titularId: string } => {
  const o = ownerOf(lookup, m.origen)
  const d = ownerOf(lookup, m.destino)
  const oExterna = m.origen.kind === 'cuenta' && lookup.cuentas.get(m.origen.id)?.externa
  const dExterna = m.destino.kind === 'cuenta' && lookup.cuentas.get(m.destino.id)?.externa
  // De un titular a otro: lo registra quien lo envía (para él no es inversión, se va).
  if (o && d && o.id !== d.id) return { tipo: 'Ahorro', titularId: o.id }
  if (oExterna) return { tipo: 'Ingreso', titularId: d?.id ?? '' }
  if (dExterna) return { tipo: 'Gasto', titularId: o?.id ?? '' }
  if (m.origen.kind === 'cuenta' && m.destino.kind === 'producto') return { tipo: 'Compra', titularId: d?.id ?? '' }
  if (m.origen.kind === 'producto' && m.destino.kind === 'cuenta') return { tipo: 'Venta', titularId: o?.id ?? '' }
  return { tipo: 'Traspaso', titularId: (d ?? o)?.id ?? '' }
}

/** El libro de Excel, vivo: se recalcula solo cuando registras movimientos. */
export async function buildExcel(fin: FinanceData): Promise<ArrayBuffer> {
  const { ds, today, lookup, titulares, positions, accounts } = fin
  const specs = estilos(titulares.map((t) => t.color))
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Mis inversiones'
  wb.created = new Date()
  wb.calcProperties = { fullCalcOnLoad: true }

  // El panel va primero (se rellena al final, cuando ya existen las demás hojas).
  const ini = wb.addWorksheet('Inicio')

  // ── Movimientos: la tabla fuente (se escribe aquí y todo se calcula solo) ──
  const mov = wb.addWorksheet('Movimientos')
  mov.properties.tabColor = { argb: 'FF6366F1' }
  mov.columns = [{ width: 12 }, { width: 12 }, { width: 18 }, { width: 34 }, { width: 34 }, { width: 14 }, { width: 44 }]
  fila(mov, [{ v: 'Movimientos', s: 'title' }], specs, 28)
  fila(mov, [{ v: 'La fuente de todo: registra cada movimiento aquí. Elige el Tipo, el Titular, De y A en las listas desplegables; las demás hojas se actualizan solas.', s: 'sub' }], specs)
  fila(mov, [{ v: 'Compra = de una cuenta a una inversión · Venta = de una inversión a una cuenta · Ingreso = entra desde fuera · Gasto = sale a tu banco · Traspaso = entre lo tuyo · Ahorro = se va al otro titular (no cuenta como inversión tuya, pero sale de tu dinero)', s: 'nota' }], specs)
  fila(mov, [{ v: 'La columna «Va a (titular)» se rellena sola: no la escribas.', s: 'nota' }], specs)
  const CABECERAS = ['Fecha', 'Tipo', 'Titular', 'De', 'A', 'Importe', 'Concepto', 'Va a (titular)']
  // La fila donde empieza la tabla (1 título + 1 nota + 3 líneas de ayuda + la cabecera).
  const FILA_CAB = 5
  const FILAS_VACIAS = 30
  const movs = [...fin.ws.movimientos].sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0))
  const filasTabla: (string | number | Date | null)[][] = movs.map((m) => {
    const { tipo, titularId } = tipoDeMovimiento(m, lookup)
    const titular = titulares.find((t) => t.titular.id === titularId)?.titular.nombre ?? ownerOf(lookup, m.destino)?.nombre ?? '—'
    return [new Date(`${m.fecha}T12:00:00`), tipo, titular, entityName(lookup, m.origen), entityName(lookup, m.destino), r2(m.importe), m.concepto || '']
  })
  for (let i = 0; i < FILAS_VACIAS; i++) filasTabla.push([null, null, null, null, null, null, null, null])
  mov.addTable({
    name: 'Movimientos',
    ref: `A${FILA_CAB}:H${FILA_CAB + filasTabla.length}`,
    headerRow: true,
    columns: CABECERAS.map((name) => ({ name })),
    rows: filasTabla,
    style: { theme: 'TableStyleMedium2', showRowStripes: true },
  })
  // Estilos y listas desplegables en toda la tabla (y espacio para crecer).
  const ultima = FILA_CAB + filasTabla.length
  CABECERAS.forEach((_, ci) => ponerEstilo(mov.getCell(FILA_CAB, ci + 1), 'hMoney', specs))
  for (let r = FILA_CAB + 1; r <= ultima; r++) {
    mov.getCell(r, 1).numFmt = FECHA
    mov.getCell(r, 6).numFmt = MONEY
    // La última columna se calcula sola: de quién es lo que hay en «A».
    mov.getCell(r, 8).value = { formula: `IFERROR(VLOOKUP($E${r},TablaEntidades,2,FALSE),"")`, result: '' }
    ponerEstilo(mov.getCell(r, 8), 'nota', specs)
    mov.getCell(r, 2).dataValidation = { type: 'list', allowBlank: true, formulae: ['TiposMov'] }
    mov.getCell(r, 3).dataValidation = { type: 'list', allowBlank: true, formulae: ['ListaTitulares'] }
    mov.getCell(r, 4).dataValidation = { type: 'list', allowBlank: true, formulae: ['ListaEntidades'] }
    mov.getCell(r, 5).dataValidation = { type: 'list', allowBlank: true, formulae: ['ListaEntidades'] }
    mov.getCell(r, 6).dataValidation = { type: 'decimal', operator: 'greaterThanOrEqual', formulae: ['0'], allowBlank: true }
  }
  for (let r = ultima + 1; r <= 5000; r++) {
    mov.getCell(r, 2).dataValidation = { type: 'list', allowBlank: true, formulae: ['TiposMov'] }
    mov.getCell(r, 3).dataValidation = { type: 'list', allowBlank: true, formulae: ['ListaTitulares'] }
    mov.getCell(r, 4).dataValidation = { type: 'list', allowBlank: true, formulae: ['ListaEntidades'] }
    mov.getCell(r, 5).dataValidation = { type: 'list', allowBlank: true, formulae: ['ListaEntidades'] }
  }
  mov.views = [{ state: 'frozen', ySplit: FILA_CAB }]

  // ── Cuentas: entradas, salidas y el saldo real, todo con SUMIFS ──
  const cue = wb.addWorksheet('Cuentas')
  cue.properties.tabColor = { argb: 'FF0EA5E9' }
  cue.columns = [{ width: 20 }, { width: 30 }, { width: 10 }, { width: 16 }, { width: 16 }, { width: 16 }, { width: 16 }, { width: 56 }]
  fila(cue, [{ v: 'Cuentas', s: 'title' }], specs, 28)
  fila(cue, [{ v: 'Se actualizan solas al registrar movimientos. Saldo = entra − sale − lo que se va al otro titular.', s: 'sub' }], specs)
  fila(cue, [], specs)
  fila(cue, ['Titular', 'Cuenta', 'Externa', 'Entradas', 'Salidas', 'A otro titular', 'Saldo', 'A dónde ha ido su dinero (hoy)'].map((h, k) => ({ v: h, s: k >= 3 ? 'hMoney' : 'h' })), specs)
  for (const tf of titulares) {
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
      // Las entradas y salidas cuentan TODO lo que entra y sale de esa cuenta.
      const entra = r2(fin.ws.movimientos.filter((m) => m.destino.kind === 'cuenta' && entityName(lookup, m.destino) === c.nombre).reduce((a, m) => a + m.importe, 0))
      const sale = r2(fin.ws.movimientos.filter((m) => m.origen.kind === 'cuenta' && entityName(lookup, m.origen) === c.nombre).reduce((a, m) => a + m.importe, 0))
      // Lo que se va al otro titular sale de su dinero igual, aunque la transferencia
      // esté apuntada en otra cuenta suya (como en la app).
      const paso = c.externa
        ? 0
        : r2(
            fin.ws.movimientos
              .filter((m) => {
                const o = ownerOf(lookup, m.origen)
                const d = ownerOf(lookup, m.destino)
                return o && d && o.id !== d.id && o.id === tf.titular.id && entityName(lookup, m.origen) !== c.nombre
              })
              .reduce((a, m) => a + m.importe, 0),
          )
      fila(cue, [
        tf.titular.nombre,
        c.nombre,
        c.externa ? 'Sí' : 'No',
        { v: entra, f: `=SUMIFS(Movimientos!$F:$F,Movimientos!$E:$E,$B${r})`, s: 'money' },
        { v: sale, f: `=SUMIFS(Movimientos!$F:$F,Movimientos!$D:$D,$B${r})`, s: 'money' },
        c.externa
          ? { v: '—' }
          : { v: paso, f: `=SUMIFS(Movimientos!$F:$F,Movimientos!$C:$C,$A${r},Movimientos!$B:$B,"Ahorro",Movimientos!$D:$D,"<>"&$B${r})`, s: 'money' },
        // El saldo de una cuenta externa no se sabe (es de su banco): no se inventa.
        c.externa ? { v: '—' } : { v: r2(entra - sale - paso), f: `=$D${r}-$E${r}-$F${r}`, s: 'moneyB' },
        destino || '—',
      ], specs)
    }
  }
  cue.views = [{ state: 'frozen', ySplit: 4 }]

  // ── Inversiones: por producto, con el % editable y el saldo calculado ──
  const inv = wb.addWorksheet('Inversiones')
  inv.properties.tabColor = { argb: 'FF10B981' }
  inv.columns = [{ width: 20 }, { width: 34 }, { width: 12 }, { width: 15 }, { width: 15 }, { width: 15 }, { width: 15 }, { width: 15 }, { width: 10 }, { width: 15 }, { width: 15 }]
  fila(inv, [{ v: 'Inversiones', s: 'title' }], specs, 28)
  fila(inv, [{ v: 'Se actualizan solas al registrar movimientos. Pon el % de rentabilidad de hoy (columna %) y el Saldo se recalcula: Saldo = Capital × (1 + %).', s: 'sub' }], specs)
  fila(inv, [], specs)
  fila(inv, ['Titular', 'Producto', 'Tipo', 'Invertido', 'Reembolso', 'Traspaso', 'Capital', '%', '€', 'Saldo'].map((h, k) => ({ v: h, s: k >= 3 ? 'hMoney' : 'h' })), specs)
  const subtotalRows: number[] = []
  for (const tf of titulares) {
    const i = titulares.indexOf(tf)
    fila(inv, [{ v: tf.titular.nombre, s: `head${i}` }, ...Array(9).fill({ v: '', s: `head${i}` })], specs, 20)
    const start = inv.rowCount + 1
    for (const p of tf.ws.productos) {
      const pos = positions.get(p.id)
      if (!pos) continue
      const r = inv.rowCount + 1
      // El % que reproduce el valor de hoy (así el libro empieza con las mismas cifras).
      const pct = pos.capital > 0 ? pos.saldo / pos.capital - 1 : pos.rentabilidad ?? 0
      // Con decimales de verdad: el % de Gamma es −0,16 %, no 0 (si no, el saldo no cuadra).
      const pctExacto = Math.round(pct * 1e8) / 1e8
      fila(inv, [
        tf.titular.nombre,
        p.nombre,
        PRODUCT_META[p.tipo].label,
        {
          v: r2(pos.invertido),
          f: `=SUMIFS(Movimientos!$F:$F,Movimientos!$E:$E,$B${r},Movimientos!$B:$B,"Compra")+SUMIFS(Movimientos!$F:$F,Movimientos!$E:$E,$B${r},Movimientos!$B:$B,"Traspaso")`,
          s: 'money',
        },
        { v: r2(pos.reembolsado), f: `=SUMIFS(Movimientos!$F:$F,Movimientos!$D:$D,$B${r},Movimientos!$B:$B,"Venta")`, s: 'money' },
        {
          v: r2(pos.traspasoEntrada - pos.traspasoSalida),
          f: `=SUMIFS(Movimientos!$F:$F,Movimientos!$E:$E,$B${r},Movimientos!$B:$B,"Traspaso")-SUMIFS(Movimientos!$F:$F,Movimientos!$D:$D,$B${r},Movimientos!$B:$B,"Traspaso")`,
          s: 'money',
        },
        { v: r2(pos.capital), f: `=SUMIFS(Movimientos!$F:$F,Movimientos!$E:$E,$B${r})-SUMIFS(Movimientos!$F:$F,Movimientos!$D:$D,$B${r})`, s: 'money' },
        { v: pctExacto, s: 'pctEditable' },
        { v: r2(pos.ganancia), f: `=$J${r}-$G${r}`, s: 'money' },
        { v: r2(pos.saldo), f: `=$G${r}*(1+$H${r})`, s: 'moneyB' },
      ], specs)
    }
    const end = inv.rowCount
    subtotalRows.push(end + 1)
    fila(inv, [
      { v: `Total · ${tf.titular.nombre}`, s: 'total' },
      { v: '', s: 'total' },
      { v: '', s: 'total' },
      { v: '', f: `=SUM(D${start}:D${end})`, s: 'totalMoney' },
      { v: '', f: `=SUM(E${start}:E${end})`, s: 'totalMoney' },
      { v: '', f: `=SUM(F${start}:F${end})`, s: 'totalMoney' },
      { v: '', f: `=SUM(G${start}:G${end})`, s: 'totalMoney' },
      { v: '', s: 'total' },
      { v: '', f: `=SUM(I${start}:I${end})`, s: 'totalMoney' },
      { v: '', f: `=SUM(J${start}:J${end})`, s: 'totalMoney' },
    ], specs)
  }
  inv.autoFilter = `A4:J${inv.rowCount}`
  fila(inv, [
    { v: 'TOTAL', s: 'total' },
    { v: '', s: 'total' },
    { v: '', s: 'total' },
    { v: '', f: subtotalRows.map((r) => `D${r}`).join('+'), s: 'totalMoney' },
    { v: '', f: subtotalRows.map((r) => `E${r}`).join('+'), s: 'totalMoney' },
    { v: '', f: subtotalRows.map((r) => `F${r}`).join('+'), s: 'totalMoney' },
    { v: '', f: subtotalRows.map((r) => `G${r}`).join('+'), s: 'totalMoney' },
    { v: '', s: 'total' },
    { v: '', f: subtotalRows.map((r) => `I${r}`).join('+'), s: 'totalMoney' },
    { v: '', f: subtotalRows.map((r) => `J${r}`).join('+'), s: 'totalMoney' },
  ], specs)
  inv.views = [{ state: 'frozen', ySplit: 4 }]

  // ── Transferencias mensuales (referencia) ──
  const prog = wb.addWorksheet('Transferencias')
  prog.properties.tabColor = { argb: 'FFF59E0B' }
  prog.columns = [{ width: 36 }, { width: 36 }, { width: 14 }, { width: 8 }, { width: 14 }, { width: 14 }, { width: 44 }]
  fila(prog, [{ v: 'Transferencias mensuales', s: 'title' }], specs, 28)
  fila(prog, [{ v: 'Las programa la app; aquí son de referencia', s: 'sub' }], specs)
  fila(prog, [], specs)
  fila(prog, ['De', 'A', 'Importe', 'Día', 'Desde', 'Hasta', 'Concepto'].map((h, k) => ({ v: h, s: k === 2 ? 'hMoney' : 'h' })), specs)
  for (const p of ds.programadas) {
    fila(prog, [
      entityName(lookup, p.origen),
      entityName(lookup, p.destino),
      { v: r2(p.importe), s: 'money' },
      p.inicio.slice(8),
      fmtDate(p.inicio),
      p.fin ? fmtDate(p.fin) : '—',
      p.concepto || '—',
    ], specs)
  }

  // ── Listas (la fuente de los desplegables; oculta) ──
  const listas = wb.addWorksheet('Listas')
  listas.state = 'hidden'
  listas.addRow(['Tipo', 'Titular', 'Entidad', 'Titular de la entidad'])
  const TIPOS = ['Compra', 'Venta', 'Ingreso', 'Gasto', 'Traspaso', 'Ahorro']
  TIPOS.forEach((t) => listas.addRow([t, '', '']))
  const nombresTitulares = titulares.map((t) => t.titular.nombre)
  const entidades: string[] = []
  for (const tf of titulares) {
    for (const c of tf.ws.cuentas) if (!entidades.includes(c.nombre)) entidades.push(c.nombre)
    for (const p of tf.ws.productos) if (!entidades.includes(p.nombre)) entidades.push(p.nombre)
  }
  nombresTitulares.forEach((n, i) => (listas.getCell(2 + i, 2).value = n))
  entidades.forEach((n, i) => {
    listas.getCell(2 + i, 3).value = n
    // De quién es cada cuenta o producto (para saber a qué titular va el dinero).
    const tf = titulares.find((t) => t.ws.cuentas.some((c) => c.nombre === n) || t.ws.productos.some((p) => p.nombre === n))
    listas.getCell(2 + i, 4).value = tf?.titular.nombre ?? ''
  })
  wb.definedNames.add(`Listas!$A$2:$A${1 + TIPOS.length}`, 'TiposMov')
  wb.definedNames.add(`Listas!$B$2:$B${1 + nombresTitulares.length}`, 'ListaTitulares')
  wb.definedNames.add(`Listas!$C$2:$C${1 + entidades.length}`, 'ListaEntidades')
  wb.definedNames.add(`Listas!$C$2:$D${1 + entidades.length}`, 'TablaEntidades')


  // ── Inicio: el panel, todo vinculado a las otras hojas ──
  ini.properties.tabColor = { argb: 'FF6366F1' }
  ini.columns = [{ width: 30 }, { width: 18 }, { width: 56 }]
  fila(ini, [{ v: 'Mis inversiones', s: 'title' }], specs, 28)
  fila(ini, [{ v: `Panel de hoy (${fmtDate(today)}) · todas las cifras se calculan solas desde la hoja Movimientos`, s: 'sub' }], specs)
  fila(ini, [], specs)
  const patrimonioRows: number[] = []
  const aportadoRows: number[] = []
  const gananciaRows: number[] = []
  for (const tf of titulares) {
    const i = titulares.indexOf(tf)
    const nombre = `"${tf.titular.nombre.replace(/"/g, '""')}"`
    fila(ini, [{ v: tf.titular.nombre, s: `head${i}` }, { v: tf.titular.codigo ? `Código ${tf.titular.codigo}` : '', s: `head${i}` }, { v: i === 0 ? 'Principal' : '', s: `head${i}` }], specs, 22)
    const linea = (label: string, value: XCell, note = '') => {
      fila(ini, [{ v: label, s: 'b' }, value, { v: note, s: 'nota' }], specs)
      return ini.rowCount
    }
    const rInvertido = linea(
      'Invertido',
      { v: r2(tf.totals.invertidoValor), f: `=SUMIFS(Inversiones!$J:$J,Inversiones!$A:$A,${nombre})`, s: 'money' },
      'Lo que valen tus inversiones hoy',
    )
    const rCuentas = linea(
      'En cuentas',
      { v: r2(tf.totals.efectivo), f: `=SUMIFS(Cuentas!$G:$G,Cuentas!$A:$A,${nombre},Cuentas!$C:$C,"No")`, s: 'money' },
      'Dinero sin invertir (MyInvestor)',
    )
    const rPatrimonio = linea('Patrimonio', { v: r2(tf.totals.patrimonio), f: `=B${rInvertido}+B${rCuentas}`, s: 'moneyB' }, 'Inversiones + el dinero en cuentas')
    const rCapital = linea(
      'Capital',
      { v: r2(tf.totals.capital), f: `=SUMIFS(Inversiones!$G:$G,Inversiones!$A:$A,${nombre})`, s: 'money' },
      'Lo que has puesto, menos lo reembolsado',
    )
    const rGanancia = linea('Ganancia', { v: r2(tf.totals.ganancia), f: `=B${rInvertido}-B${rCapital}`, s: 'money' }, 'Lo que han ganado las inversiones')
    linea('Rentabilidad', tf.totals.rentabilidad === null ? { v: '—' } : { v: r2(tf.totals.rentabilidad), f: `=IFERROR(B${rGanancia}/B${rCapital},"—")`, s: 'pct' }, 'Ganancia entre capital')
    const rAportado = linea(
      'Aportado',
      {
        v: r2(tf.totals.aportadoTotal),
        f: `=SUMIFS(Movimientos!$F:$F,Movimientos!$C:$C,${nombre},Movimientos!$B:$B,"Ingreso")-SUMIFS(Movimientos!$F:$F,Movimientos!$C:$C,${nombre},Movimientos!$B:$B,"Gasto")-SUMIFS(Movimientos!$F:$F,Movimientos!$C:$C,${nombre},Movimientos!$B:$B,"Ahorro")+SUMIFS(Movimientos!$F:$F,Movimientos!$H:$H,${nombre},Movimientos!$B:$B,"Ahorro")`,
        s: 'money',
      },
      'De fuera, menos lo que ha salido a tu banco y lo que se va al otro titular',
    )
    linea(
      'Retirado',
      { v: r2(tf.totals.retiradoTotal), f: `=SUMIFS(Movimientos!$F:$F,Movimientos!$C:$C,${nombre},Movimientos!$B:$B,"Gasto")`, s: 'money' },
      'Lo que ha salido a tus bancos',
    )
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
  fila(ini, [{ v: 'Patrimonio', s: 'b' }, { v: r2(tot.patrimonio), f: `=${suma(patrimonioRows)}`, s: 'moneyT' }, { v: 'Lo de todos, juntado', s: 'nota' }], specs)
  fila(ini, [{ v: 'Aportado', s: 'b' }, { v: r2(tot.aportado), f: `=${suma(aportadoRows)}`, s: 'moneyT' }, { v: 'Lo que ha entrado desde fuera', s: 'nota' }], specs)
  fila(ini, [{ v: 'Ganancia', s: 'b' }, { v: r2(tot.ganancia), f: `=${suma(gananciaRows)}`, s: 'moneyT' }, { v: 'Lo que han ganado las inversiones', s: 'nota' }], specs)

  return (await wb.xlsx.writeBuffer()) as ArrayBuffer
}
