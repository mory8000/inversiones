// Utilidades de fechas. Todas las fechas se guardan como texto "AAAA-MM-DD".

const pad = (n: number) => String(n).padStart(2, '0')

export function toISODate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function todayISO(): string {
  return toISODate(new Date())
}

/** Devuelve [año, mes (1-12), día]. */
export function splitISO(iso: string): [number, number, number] {
  const [y, m, d] = iso.split('-').map(Number)
  return [y, m, d]
}

function utc(iso: string): number {
  const [y, m, d] = splitISO(iso)
  return Date.UTC(y, m - 1, d)
}

/** Días naturales entre dos fechas (b − a). */
export function daysBetween(a: string, b: string): number {
  return Math.round((utc(b) - utc(a)) / 86_400_000)
}

export function addDays(iso: string, days: number): string {
  const d = new Date(utc(iso) + days * 86_400_000)
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
}

export function daysInMonth(year: number, month1: number): number {
  return new Date(Date.UTC(year, month1, 0)).getUTCDate()
}

/** Suma meses manteniendo el día cuando es posible (31 ene + 1 mes = 28/29 feb). */
export function addMonths(iso: string, months: number): string {
  const [y, m, d] = splitISO(iso)
  const total = y * 12 + (m - 1) + months
  const ny = Math.floor(total / 12)
  const nm = (total % 12) + 1
  const nd = Math.min(d, daysInMonth(ny, nm))
  return `${ny}-${pad(nm)}-${pad(nd)}`
}

export function endOfMonth(iso: string): string {
  const [y, m] = splitISO(iso)
  return `${y}-${pad(m)}-${pad(daysInMonth(y, m))}`
}

/** "AAAA-MM" */
export function monthKey(iso: string): string {
  return iso.slice(0, 7)
}

export function yearOf(iso: string): number {
  return Number(iso.slice(0, 4))
}

export function isValidISODate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false
  const [y, m, d] = splitISO(s)
  return m >= 1 && m <= 12 && d >= 1 && d <= daysInMonth(y, m)
}

export function minDate(a: string | null, b: string): string {
  return a === null || b < a ? b : a
}

export function maxDate(a: string | null, b: string): string {
  return a === null || b > a ? b : a
}

/**
 * Día desde el que la evolución (y la rentabilidad que se dibuja) empieza a contar: lo anterior
 * no se dibuja. Es un día fijo (no «ayer»), el de los valores reales del banco, para que las
 * líneas no se muevan cada día. Se puede cambiar en *Ajustes*.
 */
export const LINEA_DESDE_POR_DEFECTO = '2026-10-19'
