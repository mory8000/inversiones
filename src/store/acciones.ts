// Atajos para los botones de la app: abren el formulario de movimiento ya preparado
// (tipo, de dónde sale y a dónde va el dinero), para que solo haya que poner el importe.

import type { Dataset, EntityRef, Movimiento, Producto } from '../types'
import { cuentaPrincipal, cuentasExternas } from '../lib/titulares'
import { buildLookup, detectorDePaso, entityName, isConSaldo, isExterna, type Lookup } from '../lib/movements'
import { faltaDinero } from '../lib/saldo'
import { fmtDate, fmtEUR } from '../lib/format'
import { useData } from './data'
import { accion } from './deshacer'
import { confirmDialog, openMovement, openProgramada } from './ui'

const cuentaRef = (id: string): EntityRef => ({ kind: 'cuenta', id })
const productoRef = (id: string): EntityRef => ({ kind: 'producto', id })

/** Cuenta por defecto de un titular: su cuenta principal (MyInvestor) o, si no tiene, la primera. */
function cuentaPorDefecto(ds: Dataset, titularId: string): EntityRef | undefined {
  const c = cuentaPrincipal(ds.cuentas, titularId) ?? ds.cuentas.find((x) => x.titularId === titularId)
  return c ? cuentaRef(c.id) : undefined
}

/** Meter más dinero en una inversión (por defecto, desde la cuenta principal de su dueño). */
export function aportarA(ds: Dataset, p: Producto) {
  openMovement({
    tipo: 'inversion',
    destino: productoRef(p.id),
    origen: cuentaPorDefecto(ds, p.titularId),
    origenTitularId: p.titularId,
    titulo: `Aportar a «${p.nombre}»`,
    fijo: true,
  })
}

/** Sacar dinero de una inversión (reembolso), por defecto a la cuenta principal de su dueño. */
export function retirarDe(ds: Dataset, p: Producto) {
  openMovement({
    tipo: 'reembolso',
    origen: productoRef(p.id),
    destino: cuentaPorDefecto(ds, p.titularId),
    destinoTitularId: p.titularId,
    titulo: `Retirar de «${p.nombre}»`,
    fijo: true,
  })
}

/** Pasar dinero de una inversión a otra sin pasar por la cuenta. */
export function traspasarDe(p: Producto) {
  openMovement({ tipo: 'traspaso', origen: productoRef(p.id), destinoTitularId: p.titularId, titulo: `Traspasar desde «${p.nombre}»`, fijo: true })
}

/**
 * «Añadir dinero» a una cuenta con saldo (p. ej. MyInvestor): una aportación desde una cuenta
 * externa. Si el titular aún no tiene cuentas externas, se ofrece crear «Cuenta externa».
 */
export function anadirDinero(ds: Dataset, cuentaId: string) {
  const c = ds.cuentas.find((x) => x.id === cuentaId)
  if (!c) return
  const externa = cuentasExternas(ds.cuentas, c.titularId)[0]
  openMovement({
    tipo: 'transferencia',
    destino: cuentaRef(c.id),
    origen: externa ? cuentaRef(externa.id) : undefined,
    origenTitularId: c.titularId,
    externaNueva: c.titularId,
    titulo: `Añadir dinero a «${c.nombre}»`,
    concepto: 'Aportación',
    fijo: true,
  })
}

/** Invertir desde una cuenta (elige el producto). */
export function invertirDesde(ds: Dataset, cuentaId: string) {
  const c = ds.cuentas.find((x) => x.id === cuentaId)
  if (!c) return
  openMovement({ tipo: 'inversion', origen: cuentaRef(c.id), destinoTitularId: c.titularId, titulo: `Invertir desde «${c.nombre}»`, fijo: true })
}

/**
 * Programar la transferencia mensual del titular `desdeId` (el principal) a otro titular:
 * sale de su cuenta principal (MyInvestor) —o de la cuenta `desdeCuentaId`— y llega a una
 * cuenta con saldo o a un producto del otro.
 */
export function programarMensual(ds: Dataset, desdeId: string, desdeCuentaId?: string) {
  const otro = ds.titulares.find((t) => t.id !== desdeId)
  const origen = desdeCuentaId ? cuentaRef(desdeCuentaId) : cuentaPorDefecto(ds, desdeId)
  let destino: EntityRef | undefined
  let tipo: 'inversion' | 'transferencia' = 'inversion'
  if (otro) {
    const cuenta = cuentaPrincipal(ds.cuentas, otro.id)
    const producto = ds.productos.find((p) => p.titularId === otro.id)
    if (cuenta) {
      destino = cuentaRef(cuenta.id)
      tipo = 'transferencia'
    } else if (producto) destino = productoRef(producto.id)
  }
  openProgramada({
    preset: {
      tipo,
      origen,
      destino,
      origenTitularId: desdeId,
      destinoTitularId: otro?.id,
      concepto: otro ? `Transferencia mensual a ${otro.nombre}` : 'Transferencia mensual',
    },
  })
}

/**
 * Programar una aportación cada mes a una inversión (desde su ventanilla). Sale, por defecto,
 * de la cuenta principal (MyInvestor) del titular principal; se puede cambiar en el formulario.
 */
export function programarAportacionMensual(ds: Dataset, p: Producto) {
  const principal = ds.titulares[0]
  const origen = (principal && cuentaPorDefecto(ds, principal.id)) ?? cuentaPorDefecto(ds, p.titularId)
  const owner = origen ? ds.cuentas.find((c) => c.id === origen.id)?.titularId : undefined
  const otro = owner && owner !== p.titularId ? ds.titulares.find((t) => t.id === p.titularId) : undefined
  openProgramada({
    preset: {
      tipo: 'inversion',
      origen,
      destino: productoRef(p.id),
      origenTitularId: owner ?? p.titularId,
      destinoTitularId: p.titularId,
      concepto: otro ? `Transferencia mensual a ${otro.nombre}` : `Aportación mensual a ${p.nombre}`,
    },
  })
}

/** Sacar dinero de una cuenta con saldo a una cuenta externa (otro banco). */
export function sacarDinero(ds: Dataset, cuentaId: string) {
  const c = ds.cuentas.find((x) => x.id === cuentaId)
  if (!c) return
  const externa = cuentasExternas(ds.cuentas, c.titularId)[0]
  openMovement({
    tipo: 'transferencia',
    origen: cuentaRef(c.id),
    destino: externa ? cuentaRef(externa.id) : undefined,
    destinoTitularId: c.titularId,
    titulo: `Sacar dinero de «${c.nombre}»`,
    concepto: 'Retirada',
    fijo: true,
  })
}

/** Nombre de un movimiento para el historial («Deshacer») y los avisos. */
export function etiquetaMovimiento(lookup: Lookup, m: Pick<Movimiento, 'origen' | 'destino' | 'importe'>, hidden = false): string {
  const imp = hidden ? '' : ` ${fmtEUR(m.importe)}`
  const o = `«${entityName(lookup, m.origen)}»`
  const d = `«${entityName(lookup, m.destino)}»`
  if (m.origen.kind === 'cuenta' && m.destino.kind === 'cuenta') {
    if (isExterna(lookup, m.origen) && isConSaldo(lookup, m.destino)) return `Añadir dinero:${imp} a ${d}`
    if (isConSaldo(lookup, m.origen) && isExterna(lookup, m.destino)) return `Sacar dinero:${imp} de ${o}`
    return `Transferencia:${imp} de ${o} a ${d}`
  }
  if (m.destino.kind === 'producto' && m.origen.kind === 'cuenta') return `Aportación:${imp} a ${d}`
  if (m.origen.kind === 'producto' && m.destino.kind === 'cuenta') return `Retirada:${imp} de ${o}`
  return `Traspaso:${imp} de ${o} a ${d}`
}

/**
 * Borrar un movimiento (con confirmación). Si al borrarlo una cuenta con saldo se queda en
 * negativo (p. ej. se borra dinero añadido que ya se ha invertido), se avisa antes.
 * Se puede deshacer. Devuelve si se ha borrado.
 */
export async function borrarMovimiento(ds: Dataset, m: Movimiento): Promise<boolean> {
  const lookup = buildLookup(ds)
  const hidden = useData.getState().hideAmounts
  const sin = ds.movimientos.filter((x) => x.id !== m.id)
  const queda =
    m.destino.kind === 'cuenta' && isConSaldo(lookup, m.destino) ? faltaDinero(ds.movimientos, sin, m.destino.id, m.fecha, { dePaso: detectorDePaso(lookup) }) : null
  const parent = m.programadaId ? ds.programadas.find((p) => p.id === m.programadaId) : undefined
  const ok = await confirmDialog({
    title: '¿Borrar este movimiento?',
    message: [
      `${etiquetaMovimiento(lookup, m, hidden)} (${fmtDate(m.fecha)}).`,
      parent ? 'Este mes no se volverá a apuntar; los demás meses de la transferencia mensual siguen igual.' : null,
      queda
        ? `Atención: «${entityName(lookup, m.destino)}» se quedará en negativo (${hidden ? '•••••• €' : fmtEUR(queda.saldoMinimo)}), porque ese dinero ya se ha usado.`
        : null,
      'Los saldos se recalculan solos. Si te equivocas, pulsa «Deshacer».',
    ]
      .filter(Boolean)
      .join(' '),
    confirmLabel: 'Borrar',
    danger: true,
  })
  if (!ok) return false
  accion(`Borrar movimiento (${etiquetaMovimiento(lookup, m, hidden)})`, () => useData.getState().removeMovimiento(m.id), 'Movimiento borrado')
  return true
}
