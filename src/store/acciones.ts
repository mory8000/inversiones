// Atajos para los botones de la app: abren el formulario de movimiento ya preparado
// (tipo, de dónde sale y a dónde va el dinero), para que solo haya que poner el importe.

import type { Dataset, EntityRef, Producto } from '../types'
import { cuentaPrincipal, cuentasExternas } from '../lib/titulares'
import { openMovement, openProgramada } from './ui'

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
 * sale de su cuenta principal (MyInvestor) y llega a una cuenta con saldo o a un producto del otro.
 */
export function programarMensual(ds: Dataset, desdeId: string) {
  const otro = ds.titulares.find((t) => t.id !== desdeId)
  const origen = cuentaPorDefecto(ds, desdeId)
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
