// Saldo de las cuentas con saldo (como «MyInvestor») día a día.
//
// Sirve para no dejar sacar (invertir, enviar…) más dinero del que hay: el saldo de la
// cuenta tiene que alcanzar en la fecha del movimiento y también después (si hay
// movimientos posteriores, no pueden quedarse sin dinero).
//
// Se comprueba con el dinero que cuenta en la cuenta: lo que se desvía camino de otro titular
// (como la transferencia mensual al «Fondo ahorro») no cuenta en ella (ni entra ni sale), así
// que quien decide no lo mira. El saldo que sale de aquí es el real de todas formas.

import type { Movimiento } from '../types'
import { EPS } from './finance'

/** Saldo de una cuenta al final de cada día con movimientos, en orden de fecha. */
export function saldosPorDia(movs: Movimiento[], cuentaId: string): { fecha: string; saldo: number }[] {
  const delta = new Map<string, number>()
  for (const m of movs) {
    const entra = m.destino.kind === 'cuenta' && m.destino.id === cuentaId
    const sale = m.origen.kind === 'cuenta' && m.origen.id === cuentaId
    if (!entra && !sale) continue
    delta.set(m.fecha, (delta.get(m.fecha) ?? 0) + (entra ? m.importe : 0) - (sale ? m.importe : 0))
  }
  let saldo = 0
  return [...delta.keys()].sort().map((fecha) => {
    saldo += delta.get(fecha)!
    return { fecha, saldo }
  })
}

/** Saldo de una cuenta al final de un día. */
export function saldoEn(movs: Movimiento[], cuentaId: string, fecha: string): number {
  let saldo = 0
  for (const d of saldosPorDia(movs, cuentaId)) {
    if (d.fecha > fecha) break
    saldo = d.saldo
  }
  return saldo
}

/**
 * Lo mínimo que habrá en la cuenta desde `fecha` (incluida) en adelante: lo que se puede
 * sacar ese día sin que la cuenta se quede en negativo ni entonces ni después.
 */
export function saldoMinimoDesde(movs: Movimiento[], cuentaId: string, fecha: string): number {
  let min = saldoEn(movs, cuentaId, fecha)
  for (const d of saldosPorDia(movs, cuentaId)) if (d.fecha >= fecha && d.saldo < min) min = d.saldo
  return min
}

export interface FaltaDinero {
  cuentaId: string
  /** Cuánto dinero falta para que el saldo no quede en negativo. */
  falta: number
  /** Lo que había disponible antes del cambio (desde esa fecha en adelante). */
  disponible: number
  /** Saldo más bajo que quedaría. */
  saldoMinimo: number
}

/**
 * ¿Un cambio en los movimientos deja la cuenta sin dinero? Compara el saldo más bajo desde
 * `fecha` antes y después: si pasa a ser negativo y además empeora, devuelve cuánto falta.
 * (Un cambio que mejora una cuenta que ya estaba en negativo no se considera un problema.)
 * `sinElMovimiento`: los movimientos sin el que se está cambiando (para saber cuánto hay
 * disponible para él); por defecto, los de antes.
 */
export function faltaDinero(
  antes: Movimiento[],
  despues: Movimiento[],
  cuentaId: string,
  fecha: string,
  { sinElMovimiento = antes }: { sinElMovimiento?: Movimiento[] } = {},
): FaltaDinero | null {
  const minAntes = saldoMinimoDesde(antes, cuentaId, fecha)
  const minDespues = saldoMinimoDesde(despues, cuentaId, fecha)
  if (minDespues >= -EPS || minDespues >= minAntes - EPS) return null
  return {
    cuentaId,
    falta: minAntes >= 0 ? -minDespues : minAntes - minDespues,
    disponible: Math.max(0, saldoMinimoDesde(sinElMovimiento, cuentaId, fecha)),
    saldoMinimo: minDespues,
  }
}
