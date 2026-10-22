// Traduce los datos de la app a la entrada del generador del Excel.
//
// Aquí se decide a qué cuenta pertenece cada inversión (la que más dinero le ha puesto) y cómo se
// ve en el Excel el dinero que entra y sale de fuera: en la app el dinero llega desde una cuenta
// externa (otro banco), que en el Excel aparece como dos movimientos: «Exterior → cuenta externa»
// y «cuenta externa → su destino». Así la cuenta externa queda a cero y lo aportado es lo que
// realmente ha entrado de fuera.

import type { EntityRef, Movimiento } from '../types'
import type { FinanceData } from '../store/useFinance'
import type { EntradaExcel, GrupoExcel, InversionExcel, MovimientoExcel } from './excelMovimientos'

export function entradaDesdeApp(fin: FinanceData, hoy: string): EntradaExcel {
  const { ds } = fin
  const nombreCuenta = new Map(ds.cuentas.map((c) => [c.id, c.nombre]))
  const nombreProducto = new Map(ds.productos.map((p) => [p.id, p.nombre]))
  const externa = new Map(ds.cuentas.map((c) => [c.id, c.externa]))
  const nombreDe = (ref: EntityRef) =>
    ref.kind === 'cuenta' ? nombreCuenta.get(ref.id) ?? '' : nombreProducto.get(ref.id) ?? ''

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
    // Las cuentas externas (otro banco) no salen en el resumen: en el Excel ese dinero es «Exterior».
    const cuentas = tf.ws.cuentas.filter((c) => !c.externa)
    const grupos: GrupoExcel[] = []
    for (const cuenta of cuentas) {
      const inversiones: InversionExcel[] = productos
        .filter((p) => cuentaDe(p.id) === cuenta.id)
        .map((p) => ({ nombre: p.nombre, rentabilidad: rentabilidadDe(fin, p.id) }))
      grupos.push({ cuenta: cuenta.nombre, inversiones })
    }
    const sueltos = productos.filter((p) => {
      const id = cuentaDe(p.id)
      return !id || !cuentas.some((c) => c.id === id)
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
  // El dinero que llega de fuera entra primero en la cuenta externa; el que se va, sale por ella.
  if (deExterna) {
    anade(m.fecha, 'Exterior', de, m.importe)
    anade(m.fecha, de, a, m.importe)
  } else if (aExterna) {
    anade(m.fecha, de, a, m.importe)
    anade(m.fecha, a, 'Exterior', m.importe)
  } else {
    anade(m.fecha, de, a, m.importe)
  }
}

/** Rentabilidad en tanto por uno (0,05 = 5 %): la de la app, o la que sale del valor actual. */
function rentabilidadDe(fin: FinanceData, productoId: string): number | null {
  const p = fin.positions.get(productoId)
  if (!p) return null
  if (p.rentabilidad !== null) return p.rentabilidad
  if (p.capital > 0 && p.saldo !== p.capital) return p.saldo / p.capital - 1
  return null
}
