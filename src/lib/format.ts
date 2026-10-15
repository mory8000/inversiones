// Formato de importes, porcentajes y fechas en español (es-ES).

const LOCALE = 'es-ES'

function makeNumberFormat(options: Intl.NumberFormatOptions): Intl.NumberFormat {
  try {
    // 'always' fuerza el separador de miles también en números de 4 cifras (1.234 €).
    return new Intl.NumberFormat(LOCALE, { useGrouping: 'always', ...options })
  } catch {
    return new Intl.NumberFormat(LOCALE, options)
  }
}

const eur2 = makeNumberFormat({ style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2 })
const eur2Sign = makeNumberFormat({
  style: 'currency',
  currency: 'EUR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
  signDisplay: 'exceptZero',
})
const eur0 = makeNumberFormat({ style: 'currency', currency: 'EUR', minimumFractionDigits: 0, maximumFractionDigits: 0 })
const eurCompact = makeNumberFormat({ style: 'currency', currency: 'EUR', notation: 'compact', maximumFractionDigits: 1 })
const pct2 = makeNumberFormat({ style: 'percent', minimumFractionDigits: 2, maximumFractionDigits: 2 })
const pct2Sign = makeNumberFormat({
  style: 'percent',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
  signDisplay: 'exceptZero',
})
const pct1 = makeNumberFormat({ style: 'percent', minimumFractionDigits: 0, maximumFractionDigits: 1 })
const num2 = makeNumberFormat({ minimumFractionDigits: 2, maximumFractionDigits: 2 })
const numMax2 = makeNumberFormat({ minimumFractionDigits: 0, maximumFractionDigits: 2 })

/** Evita "-0,00 €". */
function clean(n: number): number {
  if (!Number.isFinite(n)) return 0
  return Math.abs(n) < 0.005 ? 0 : n
}

export const HIDDEN = '••••••'

/** Signo menos tipográfico (−) en lugar del guion (-). */
const minus = (s: string) => s.replace('-', '\u2212')

export function fmtEUR(n: number, opts: { sign?: boolean; decimals?: 0 | 2 } = {}): string {
  const v = clean(n)
  if (opts.decimals === 0) return minus(eur0.format(v))
  return minus((opts.sign ? eur2Sign : eur2).format(v))
}

export function fmtEURCompact(n: number): string {
  const v = clean(n)
  if (Math.abs(v) < 10_000) return eur0.format(v)
  return eurCompact.format(v)
}

/** `fraction` en tanto por uno (0.05 = 5 %). */
export function fmtPct(fraction: number | null | undefined, opts: { sign?: boolean; short?: boolean } = {}): string {
  if (fraction === null || fraction === undefined || !Number.isFinite(fraction)) return '—'
  const v = Math.abs(fraction) < 0.00005 ? 0 : fraction
  if (opts.short) return minus(pct1.format(v))
  return minus((opts.sign ? pct2Sign : pct2).format(v))
}

/** Número con 2 decimales en formato español (para rellenar inputs). */
export function fmtNumberInput(n: number | null | undefined, decimals: 'fixed' | 'max' = 'max'): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return ''
  const s = (decimals === 'fixed' ? num2 : numMax2).format(n)
  // Para inputs quitamos los separadores de miles: "1234,5"
  return s.replace(/\./g, '')
}

const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
const MONTHS_SHORT = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sept', 'oct', 'nov', 'dic']

export function monthName(month1: number): string {
  return MONTHS[month1 - 1] ?? ''
}

/** "15 oct 2026" */
export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  const [y, m, d] = iso.split('-').map(Number)
  return `${d} ${MONTHS_SHORT[m - 1]} ${y}`
}

/** "15 oct" */
export function fmtDayMonth(iso: string): string {
  const [, m, d] = iso.split('-').map(Number)
  return `${d} ${MONTHS_SHORT[m - 1]}`
}

/** "15/10/2026" */
export function fmtDateNumeric(iso: string | null | undefined): string {
  if (!iso) return ''
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

/** "Octubre 2026" a partir de "2026-10" */
export function fmtMonthKey(key: string): string {
  const [y, m] = key.split('-').map(Number)
  const name = MONTHS[m - 1] ?? ''
  return `${name.charAt(0).toUpperCase()}${name.slice(1)} ${y}`
}

/** "oct 26" a partir de "AAAA-MM-DD" (ejes de gráficos). */
export function fmtMonthShort(iso: string): string {
  const [y, m] = iso.split('-').map(Number)
  return `${MONTHS_SHORT[m - 1]} ${String(y).slice(2)}`
}

/**
 * Convierte lo que escribe el usuario en un número.
 * Acepta "1.234,56", "1234,56", "1234.56", "1 234,56 €", "-3,5 %"…
 */
export function parseNumber(input: string): number | null {
  if (typeof input !== 'string') return null
  let s = input.trim().replace(/[€%\s\u00a0]/g, '').replace(/−/g, '-')
  if (!s) return null
  let negative = false
  if (s.startsWith('-')) {
    negative = true
    s = s.slice(1)
  } else if (s.startsWith('+')) {
    s = s.slice(1)
  }
  if (!/^[\d.,]+$/.test(s)) return null
  const lastComma = s.lastIndexOf(',')
  const lastDot = s.lastIndexOf('.')
  let normalized: string
  if (lastComma >= 0 && lastDot >= 0) {
    // El último separador es el decimal.
    if (lastComma > lastDot) normalized = s.replace(/\./g, '').replace(',', '.')
    else normalized = s.replace(/,/g, '')
  } else if (lastComma >= 0) {
    const parts = s.split(',')
    if (parts.length > 2) normalized = parts.join('') // "1,234,567"
    else normalized = s.replace(',', '.')
  } else if (lastDot >= 0) {
    const parts = s.split('.')
    // "1.234" o "1.234.567" → miles (formato español). "12.5" → decimal.
    const looksLikeThousands = parts.length > 2 || (parts.length === 2 && parts[1].length === 3 && parts[0].length <= 3 && parts[0] !== '0')
    normalized = looksLikeThousands ? parts.join('') : s
  } else {
    normalized = s
  }
  const n = Number(normalized)
  if (!Number.isFinite(n)) return null
  return negative ? -n : n
}

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

export function initials(name: string): string {
  const parts = name
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[1][0]).toUpperCase()
}

export function maskIban(iban: string): string {
  const s = iban.replace(/\s+/g, '')
  if (s.length <= 4) return s
  return `•••• ${s.slice(-4)}`
}
