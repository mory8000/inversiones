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
import { nombreCuentaLuis } from './titulares'
import type { EntradaExcel, GrupoExcel, InversionExcel, MovimientoExcel } from './excelMovimientos'

export function entradaDesdeApp(fin: FinanceData, hoy: string): EntradaExcel {
  const { ds } = fin
  const cuentaPorId = new Map(ds.cuentas.map((c) => [c.id, c]))
  // «Gamma Global 2» puede ser un segundo producto con el mismo nombre al exportar.
  // Solo se puede unir dentro del mismo titular: entre titulares movería importes al dueño equivocado.
  const etiquetaGamma = (name: string) => name.replace(/\s*\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim()
  const gamma = (name: string) => /^gamma global(?: 2)?$/i.test(etiquetaGamma(name))
  const baseGamma = new Map<string, string>()
  const fusion = new Map<string, string>()
  // Elegir primero la fila sin sufijo, aunque en la app aparezca después de «Gamma Global 2».
  for (const p of ds.productos) {
    if (/^gamma global$/i.test(etiquetaGamma(p.nombre)) && !baseGamma.has(p.titularId)) baseGamma.set(p.titularId, p.id)
  }
  for (const p of ds.productos) {
    if (!gamma(p.nombre)) continue
    const base = baseGamma.get(p.titularId)
    if (base && base !== p.id) fusion.set(p.id, base)
    else if (!base) baseGamma.set(p.titularId, p.id)
  }
  const idExportado = (id: string) => fusion.get(id) ?? id
  const productosPorId = new Map(ds.productos.map((p) => [p.id, p]))
  const titularesPorId = new Map(fin.titulares.map((tf) => [tf.titular.id, tf.titular.nombre]))
  // Si distintos titulares tienen este fondo, conservar dos filas distinguibles, nunca sumar
  // cantidades entre personas ni volver a crear un ambiguo «Gamma Global 2».
  const nombreProducto = new Map(ds.productos.map((p) => {
    const principal = productosPorId.get(idExportado(p.id)) ?? p
    const nombre = gamma(p.nombre)
      ? `Gamma Global${baseGamma.size > 1 ? ` · ${titularesPorId.get(principal.titularId) ?? principal.titularId}` : ''}`
      : principal.nombre
    return [p.id, nombre]
  }))
  const posicionExportada = (id: string) => {
    const ids = [id, ...[...fusion].filter(([, principal]) => principal === id).map(([alias]) => alias)]
    return ids.map((key) => fin.positions.get(key)).filter((pos) => !!pos)
  }
  const tieneDatos = (id: string) => posicionExportada(id).some((p) => Math.abs(p.saldo) > 0.005 || Math.abs(p.capital) > 0.005)
  const rentabilidadExportada = (id: string) => {
    const posiciones = posicionExportada(id)
    if (posiciones.length === 1) return rentabilidadDe(fin, id)
    const capital = posiciones.reduce((n, p) => n + p.capital, 0)
    const saldo = posiciones.reduce((n, p) => n + p.saldo, 0)
    return capital > 0 ? saldo / capital - 1 : null
  }
  const externa = new Map(ds.cuentas.map((c) => [c.id, c.externa]))
  const titularDe = new Map(fin.titulares.map((tf) => [tf.titular.id, tf.titular.nombre]))
  const principalDe = new Map(fin.titulares.map((tf) => [tf.titular.id, tf.ws.cuentas.find((c) => !c.externa)?.id]))
  const bonito = (cuentaId: string) => {
    const cuenta = cuentaPorId.get(cuentaId)
    if (!cuenta) return ''
    const nombre = principalDe.get(cuenta.titularId) === cuentaId
      ? nombreCuentaLuis(titularDe.get(cuenta.titularId), cuenta.nombre)
      : cuenta.nombre
    // Las cuentas MyInvestor de otros titulares conservan su nombre anterior en los Excel.
    return /^my\s*investor$/i.test(nombre.trim()) ? 'Cuenta Myinvestor' : nombre
  }
  const nombreDe = (ref: EntityRef) => ref.kind === 'cuenta' ? bonito(ref.id) : nombreProducto.get(ref.id) ?? ''

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
    const productos = tf.ws.productos.filter((p) => !fusion.has(p.id))
    // Cuánto ha puesto cada cuenta en cada producto.
    const pagado = new Map<string, Map<string, number>>()
    for (const m of ds.movimientos) {
      if (m.destino.kind !== 'producto' || m.origen.kind !== 'cuenta') continue
      const id = idExportado(m.destino.id)
      const porProducto = pagado.get(id) ?? new Map<string, number>()
      porProducto.set(m.origen.id, (porProducto.get(m.origen.id) ?? 0) + m.importe)
      pagado.set(id, porProducto)
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
      (c) => !c.externa && (tocaElDinero(c.id) || productos.some((p) => tieneDatos(p.id) && cuentaDe(p.id) === c.id)),
    )
    const grupos: GrupoExcel[] = []
    for (const cuenta of cuentas) {
      const inversiones: InversionExcel[] = productos
        .filter((p) => tieneDatos(p.id))
        .filter((p) => cuentaDe(p.id) === cuenta.id)
        .map((p) => ({ nombre: nombreProducto.get(p.id) ?? p.nombre, rentabilidad: rentabilidadExportada(p.id) }))
      grupos.push({ cuenta: bonito(cuenta.id), inversiones })
    }
    const sueltos = productos.filter((p) => {
      const id = cuentaDe(p.id)
      return tieneDatos(p.id) && (!id || !cuentas.some((c) => c.id === id))
    })
    if (sueltos.length)
      grupos.push({
        cuenta: null,
        inversiones: sueltos.map((p) => ({ nombre: nombreProducto.get(p.id) ?? p.nombre, rentabilidad: rentabilidadExportada(p.id) })),
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

  // También identificar los nombres históricos cuyo saldo ya es cero. No se deben confundir
  // con inversiones recién escritas en De/A cuando se abra el libro.
  const nombresConocidos = [
    ...ds.cuentas.filter((c) => !c.externa).map((c) => bonito(c.id)),
    ...ds.productos.map((p) => nombreProducto.get(p.id) ?? p.nombre),
  ]
  return { hoy, titulares, movimientos, nombresConocidos }
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

/** Rentabilidad en tanto por uno (0,05 = 5 %): la de la app, o la que sale del valor actual. */
function rentabilidadDe(fin: FinanceData, productoId: string): number | null {
  const p = fin.positions.get(productoId)
  if (!p) return null
  if (p.rentabilidad !== null) return p.rentabilidad
  if (p.capital > 0 && p.saldo !== p.capital) return p.saldo / p.capital - 1
  return null
}
