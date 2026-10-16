// Saldo de las cuentas con saldo (como «MyInvestor») día a día.
//
// Sirve para no dejar sacar (invertir, enviar…) más dinero del que hay: el saldo de la
// cuenta tiene que alcanzar en la fecha del movimiento y también después (si hay
// movimientos posteriores, no pueden quedarse sin dinero).
//
// `dePaso`: lo que pasa «de paso» por la cuenta del titular principal hacia otro titular
// (p. ej. al «Fondo ahorro») entra y se va: no baja el saldo, así que tampoco se bloquea.

import type { Movimiento } from '../types'
import { EPS } from './finance'
import type { DePaso } from './movements'

/** Saldo de una cuenta al final de cada día con movimientos, en orden de fecha. */
export function saldosPorDia(movs: Movimiento[], cuentaId: string, dePaso?: DePaso): { fecha: string; saldo: number }[] {
  const delta = new Map<string, number>()
  for (const m of movs) {
    const entra = m.destino.kind === 'cuenta' && m.destino.id === cuentaId
    const sale = m.origen.kind === 'cuenta' && m.origen.id === cuentaId && !dePaso?.(m)
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
export function saldoEn(movs: Movimiento[], cuentaId: string, fecha: string, dePaso?: DePaso): number {
  let saldo = 0
  for (const d of saldosPorDia(movs, cuentaId, dePaso)) {
    if (d.fecha > fecha) break
    saldo = d.saldo
  }
  return saldo
}

/**
 * Lo mínimo que habrá en la cuenta desde `fecha` (incluida) en adelante: lo que se puede
 * sacar ese día sin que la cuenta se quede en negativo ni entonces ni después.
 */
export function saldoMinimoDesde(movs: Movimiento[], cuentaId: string, fecha: string, dePaso?: DePaso): number {
  let min = saldoEn(movs, cuentaId, fecha, dePaso)
  for (const d of saldosPorDia(movs, cuentaId, dePaso)) if (d.fecha >= fecha && d.saldo < min) min = d.saldo
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
 * disponible para él); por defecto, los de antes. `dePaso`: ver arriba.
 */
export function faltaDinero(
  antes: Movimiento[],
  despues: Movimiento[],
  cuentaId: string,
  fecha: string,
  { sinElMovimiento = antes, dePaso }: { sinElMovimiento?: Movimiento[]; dePaso?: DePaso } = {},
): FaltaDinero | null {
  const minAntes = saldoMinimoDesde(antes, cuentaId, fecha, dePaso)
  const minDespues = saldoMinimoDesde(despues, cuentaId, fecha, dePaso)
  if (minDespues >= -EPS || minDespues >= minAntes - EPS) return null
  return {
    cuentaId,
    falta: minAntes >= 0 ? -minDespues : minAntes - minDespues,
    disponible: Math.max(0, saldoMinimoDesde(sinElMovimiento, cuentaId, fecha, dePaso)),
    saldoMinimo: minDespues,
  }
}
