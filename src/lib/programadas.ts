// Transferencias mensuales: la app apunta sola el movimiento de cada mes.
//
// Es idempotente: `aplicarProgramadas` solo añade los meses que faltan (hasta hoy),
// así que se puede llamar siempre que se quiera (al abrir la app, al volver a ella…).
// Los meses borrados a mano se recuerdan en `excluidos` y no se vuelven a crear.

import type { Dataset, EntityRef, Movimiento, Programada } from '../types'
import { daysInMonth, isValidISODate, monthKey, splitISO } from './dates'
import { round2 } from './format'
import { nowStamp, uid } from './id'
import { inferMovementType } from './meta'

const pad = (n: number) => String(n).padStart(2, '0')

/** Día del mes en que se hace: el de la primera fecha. */
export const diaDe = (p: Pick<Programada, 'inicio'>): number => splitISO(p.inicio)[2]

/** Fecha del mes `mes` (AAAA-MM) en el día `dia`, o el último día si el mes es más corto. */
export function fechaEnMes(mes: string, dia: number): string {
  const [y, m] = mes.split('-').map(Number)
  return `${mes}-${pad(Math.min(dia, daysInMonth(y, m)))}`
}

export function nextMonth(mes: string): string {
  const [y, m] = mes.split('-').map(Number)
  return m === 12 ? `${y + 1}-01` : `${y}-${pad(m + 1)}`
}

/** Meses que tocan, con su fecha: desde la primera hasta `hasta` (hoy) o hasta el fin. */
export function fechasDebidas(p: Pick<Programada, 'inicio' | 'fin'>, hasta: string): { mes: string; fecha: string }[] {
  if (!isValidISODate(p.inicio)) return []
  const limite = p.fin && p.fin < hasta ? p.fin : hasta
  if (p.inicio > limite) return []
  const dia = diaDe(p)
  const out: { mes: string; fecha: string }[] = []
  for (let mes = monthKey(p.inicio); mes <= monthKey(limite) && out.length < 1200; mes = nextMonth(mes)) {
    const fecha = fechaEnMes(mes, dia)
    if (fecha >= p.inicio && fecha <= limite) out.push({ mes, fecha })
  }
  return out
}

/** Próxima fecha (después de hoy), o `null` si ya ha terminado. */
export function proximaFecha(p: Pick<Programada, 'inicio' | 'fin'>, today: string): string | null {
  if (!isValidISODate(p.inicio)) return null
  const dia = diaDe(p)
  let mes = monthKey(p.inicio > today ? p.inicio : today)
  for (let i = 0; i < 3; i++) {
    const f = fechaEnMes(mes, dia)
    if (f > today && f >= p.inicio) return p.fin && f > p.fin ? null : f
    mes = nextMonth(mes)
  }
  return null
}

const refExists = (ds: Dataset, ref: EntityRef) =>
  ref.kind === 'cuenta' ? ds.cuentas.some((c) => c.id === ref.id) : ds.productos.some((p) => p.id === ref.id)

function movimientoDe(p: Programada, mes: string, fecha: string, stamp: string): Movimiento {
  return {
    id: uid(),
    tipo: inferMovementType(p.origen.kind, p.destino.kind),
    fecha,
    origen: { ...p.origen },
    destino: { ...p.destino },
    importe: round2(p.importe),
    concepto: p.concepto,
    programadaId: p.id,
    programadaMes: mes,
    createdAt: stamp,
    updatedAt: stamp,
  }
}

/** Apunta los movimientos que tocan hasta hoy y aún no están. Si no hay nada nuevo, devuelve el mismo objeto. */
export function aplicarProgramadas(ds: Dataset, today: string): Dataset {
  if (ds.programadas.length === 0) return ds
  const hechos = new Set<string>()
  for (const m of ds.movimientos) if (m.programadaId) hechos.add(`${m.programadaId}|${m.programadaMes}`)
  const stamp = nowStamp()
  const nuevos: Movimiento[] = []
  for (const p of ds.programadas) {
    if (!refExists(ds, p.origen) || !refExists(ds, p.destino)) continue
    const excluidos = new Set(p.excluidos)
    for (const { mes, fecha } of fechasDebidas(p, today)) {
      if (excluidos.has(mes) || hechos.has(`${p.id}|${mes}`)) continue
      nuevos.push(movimientoDe(p, mes, fecha, stamp))
    }
  }
  return nuevos.length ? { ...ds, movimientos: [...ds.movimientos, ...nuevos] } : ds
}

/**
 * Tras cambiar una transferencia mensual: actualiza los movimientos ya apuntados (salvo los
 * cambiados a mano), quita los que quedan fuera de las nuevas fechas y apunta los que falten.
 */
export function sincronizarProgramada(ds: Dataset, p: Programada, today: string): Dataset {
  const dia = diaDe(p)
  const tipo = inferMovementType(p.origen.kind, p.destino.kind)
  const stamp = nowStamp()
  const movimientos: Movimiento[] = []
  for (const m of ds.movimientos) {
    if (m.programadaId !== p.id || m.editado || !m.programadaMes) {
      movimientos.push(m)
      continue
    }
    const fecha = fechaEnMes(m.programadaMes, dia)
    if (fecha < p.inicio || (p.fin && fecha > p.fin) || fecha > today) continue
    movimientos.push({
      ...m,
      tipo,
      fecha,
      origen: { ...p.origen },
      destino: { ...p.destino },
      importe: round2(p.importe),
      concepto: p.concepto,
      updatedAt: stamp,
    })
  }
  return aplicarProgramadas({ ...ds, movimientos }, today)
}

/** Movimientos ya apuntados por una transferencia mensual. */
export function movimientosDe(ds: Pick<Dataset, 'movimientos'>, programadaId: string): Movimiento[] {
  return ds.movimientos.filter((m) => m.programadaId === programadaId)
}
