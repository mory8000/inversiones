// Traduce los datos de la app a la entrada del generador del Excel.
//
// Aquí se decide a qué cuenta pertenece cada inversión (la que más dinero le ha puesto) y cómo se
// ve en el Excel el dinero que entra y sale de fuera: de la cuenta externa (otro banco, la
// nómina) no se ve nada, porque ese dinero es sencillamente el «Exterior»; su nombre no aparece
// por ningún lado.
//
// Y lo que queda a cero, no sale: ni las inversiones de las que se sacó todo el dinero ni las cuentas
// que no tienen nada. Así no quedan huecos y las filas de abajo suben solas.

import type { EntityRef, Movimiento } from '../types'
import type { FinanceData } from '../store/useFinance'
import type { EntradaExcel, GrupoExcel, InversionExcel, MovimientoExcel } from './excelMovimientos'

export function entradaDesdeApp(fin: FinanceData, hoy: string): EntradaExcel {
  const { ds } = fin
  const nombreCuenta = new Map(ds.cuentas.map((c) => [c.id, c.nombre]))
  const nombreProducto = new Map(ds.productos.map((p) => [p.id, p.nombre]))
  const externa = new Map(ds.cuentas.map((c) => [c.id, c.externa]))
  // «Myinvestor» se escribe siempre «Cuenta Myinvestor» (es el nombre que usa quien lleva las cuentas).
  const bonito = (nombre: string) => (/^my\s*investor$/i.test(nombre.trim()) ? 'Cuenta Myinvestor' : nombre)
  const nombreDe = (ref: EntityRef) =>
    bonito(ref.kind === 'cuenta' ? nombreCuenta.get(ref.id) ?? '' : nombreProducto.get(ref.id) ?? '')

  // Cuenta que se ha quedado a cero: aunque tenga movimientos históricos, su fila ya no ocupa
  // sitio en el resumen. Los movimientos históricos siguen en la tabla y en el flujo.
  const saldoCuentas = new Map<string, number>()
  for (const m of ds.movimientos) {
    if (m.origen.kind === 'cuenta') saldoCuentas.set(m.origen.id, (saldoCuentas.get(m.origen.id) ?? 0) - m.importe)
    if (m.destino.kind === 'cuenta') saldoCuentas.set(m.destino.id, (saldoCuentas.get(m.destino.id) ?? 0) + m.importe)
  }
  const tocaElDinero = (cuentaId: string) => Math.abs(saldoCuentas.get(cuentaId) ?? 0) > 0.005

  // ── Titulares: cada cuenta con las inversiones que paga ──────────────────
  const titulares = fin.titulares.map((tf) => {
    const productos = tf.ws.productos
    // Cuánto ha puesto cada cuenta en cada producto.
    const pagado = new Map<string, Map<string, number>>()
    for (const m of ds.movimientos) {
      if (m.destino.kind !== 'producto' || m.origen.kind !== 'cuenta') continue
      const porProducto = pagado.get(m.destino.id) ?? new Map<string, number>()
      porProducto.set(m.origen.id, (porProducto.get(m.origen.id) ?? 0) + m.importe)
      pagado.set(m.destino.id, porProducto)
    }
    const cuentaDe = (productoId: string): string | null => {
      const porCuenta = pagado.get(productoId)
      if (!porCuenta?.size) return null
      const [cuentaId] = [...porCuenta.entries()].sort((a, b) => b[1] - a[1])[0]
      return cuentaId
    }
    // Las cuentas externas (otro banco, la nómina) no salen en el resumen: en el Excel ese dinero es
    // «Exterior». Y tampoco sale una cuenta que ha acabado a cero y no tiene inversiones.
    const cuentas = tf.ws.cuentas.filter(
      (c) => !c.externa && (tocaElDinero(c.id) || productos.some((p) => conDatos(fin, p.id) && cuentaDe(p.id) === c.id)),
    )
    const grupos: GrupoExcel[] = []
    for (const cuenta of cuentas) {
      const inversiones: InversionExcel[] = productos
        .filter((p) => conDatos(fin, p.id))
        .filter((p) => cuentaDe(p.id) === cuenta.id)
        .map((p) => ({ nombre: p.nombre, rentabilidad: rentabilidadDe(fin, p.id) }))
      grupos.push({ cuenta: bonito(cuenta.nombre), inversiones })
    }
    const sueltos = productos.filter((p) => {
      const id = cuentaDe(p.id)
      return conDatos(fin, p.id) && (!id || !cuentas.some((c) => c.id === id))
    })
    if (sueltos.length)
      grupos.push({
        cuenta: null,
        inversiones: sueltos.map((p) => ({ nombre: p.nombre, rentabilidad: rentabilidadDe(fin, p.id) })),
      })
    return { nombre: tf.titular.nombre, color: tf.color, grupos }
  })

  // ── Movimientos ──────────────────────────────────────────────────────────
  const movimientos: MovimientoExcel[] = []
  const ordenados = [...ds.movimientos].sort((a, b) =>
    a.fecha === b.fecha ? a.createdAt.localeCompare(b.createdAt) : a.fecha.localeCompare(b.fecha),
  )
  const anade = (fecha: string, de: string, a: string, importe: number) => {
    if (!de || !a || de === a || !(importe > 0)) return
    movimientos.push({ fecha, de, a, importe })
  }
  for (const m of ordenados) anadirMovimiento(anade, m, nombreDe, externa)

  return { hoy, titulares, movimientos }
}

function anadirMovimiento(
  anade: (fecha: string, de: string, a: string, importe: number) => void,
  m: Movimiento,
  nombreDe: (ref: EntityRef) => string,
  externa: Map<string, boolean>,
) {
  const de = nombreDe(m.origen)
  const a = nombreDe(m.destino)
  const deExterna = m.origen.kind === 'cuenta' && externa.get(m.origen.id) === true
  const aExterna = m.destino.kind === 'cuenta' && externa.get(m.destino.id) === true
  // La cuenta de fuera (el otro banco, la nómina) no se nombra: el dinero entra o sale «del Exterior».
  anade(m.fecha, deExterna ? 'Exterior' : de, aExterna ? 'Exterior' : a, m.importe)
}

/**
 * Las inversiones que quedan a cero no salen en el resumen: ni las que nunca tuvieron dinero ni las
 * que se vendieron o se vaciaron del todo (así no dejan un hueco en medio de las demás).
 */
function conDatos(fin: FinanceData, productoId: string): boolean {
  const p = fin.positions.get(productoId)
  if (!p) return false
  const EPS = 0.005
  return Math.abs(p.saldo) > EPS || Math.abs(p.capital) > EPS
}

/** Rentabilidad en tanto por uno (0,05 = 5 %): la de la app, o la que sale del valor actual. */
function rentabilidadDe(fin: FinanceData, productoId: string): number | null {
  const p = fin.positions.get(productoId)
  if (!p) return null
  if (p.rentabilidad !== null) return p.rentabilidad
  if (p.capital > 0 && p.saldo !== p.capital) return p.saldo / p.capital - 1
  return null
}
