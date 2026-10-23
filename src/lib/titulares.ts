// Utilidades de titulares: nombres por defecto, el principal y el color de cada uno.
// Todos se ven a la vez; el primero de la lista es el principal.

import type { Cuenta, Dataset, EntityRef, Titular, Workspace } from '../types'
import { buildLookup, isDePaso } from './movements'

/** Nombre que la app da a un titular hasta que el usuario le pone el suyo: «Titular 1», «Titular 2»… */
export const defaultTitularName = (n: number): string => `Titular ${n}`
export const isDefaultTitularName = (nombre: string): boolean => /^Titular \d+$/.test(nombre.trim())

/** Colores para distinguir a cada titular de un vistazo (el primero es el azul de la app). */
export const TITULAR_COLORS = ['#2447B8', '#EA580C', '#7C3AED', '#0D9488', '#DB2777', '#A16207']

/**
 * Color de un titular según su posición. Sin `id` (o con uno que no existe todavía)
 * devuelve el color que le tocará al siguiente titular que se cree.
 */
export function titularColor(titulares: Titular[], id?: string): string {
  const i = id ? titulares.findIndex((t) => t.id === id) : -1
  return TITULAR_COLORS[(i >= 0 ? i : titulares.length) % TITULAR_COLORS.length]
}

export const isPrincipal = (titulares: Titular[], id: string): boolean => titulares[0]?.id === id

/** Titular al que pertenece una cuenta o un producto. */
export function ownerOf(ws: Workspace, ref: EntityRef): string | undefined {
  return ref.kind === 'cuenta' ? ws.cuentas.find((c) => c.id === ref.id)?.titularId : ws.productos.find((p) => p.id === ref.id)?.titularId
}

/**
 * Cuentas, productos y movimientos que tocan a un titular (incluidos los que vienen de o van a
 * otro titular). Al principal no le tocan los movimientos «de paso» (lo que pasa por una cuenta
 * suya camino de otro titular, como la transferencia mensual al «Fondo ahorro»): no dejan
 * constancia en lo suyo.
 */
export function titularWorkspace(ds: Workspace & { titulares?: Titular[] }, titularId: string): Workspace & { titulares?: Titular[] } {
  const cuentas = ds.cuentas.filter((c) => c.titularId === titularId)
  const productos = ds.productos.filter((p) => p.titularId === titularId)
  const ids = new Set<string>()
  for (const c of cuentas) ids.add(`cuenta:${c.id}`)
  for (const p of productos) ids.add(`producto:${p.id}`)
  const lookup = ds.titulares?.[0]?.id === titularId ? buildLookup(ds) : null
  const movimientos = ds.movimientos.filter(
    (m) => (ids.has(`${m.origen.kind}:${m.origen.id}`) || ids.has(`${m.destino.kind}:${m.destino.id}`)) && !(lookup && isDePaso(lookup, m)),
  )
  return { cuentas, productos, movimientos, titulares: ds.titulares }
}

export const emptyDataset = (titulares: Titular[]): Dataset => ({ titulares, cuentas: [], productos: [], movimientos: [], programadas: [] })

// ── Cuenta principal («MyInvestor») ─────────────────────────────────────────

/** Nombre de la cuenta principal que la app crea al titular principal. */
export const MYINVESTOR = 'MyInvestor'
export const CUENTA_LUIS = 'Cuenta Luis'
export const MYINVESTOR_COLOR = '#6366F1'

/** Solo la cuenta principal de Luis cambia de nombre; la entidad sigue siendo MyInvestor. */
export function nombreCuentaLuis(nombreTitular: string | undefined, nombreCuenta: string): string {
  return nombreTitular?.trim().toLocaleLowerCase('es') === 'luis' && /^(?:cuenta\s+)?my\s*investor$/i.test(nombreCuenta.trim())
    ? CUENTA_LUIS
    : nombreCuenta
}

/** Migra nombres predeterminados (también los guardados en versiones anteriores), sin tocar nombres personalizados. */
export function renombrarCuentaLuis(ds: Dataset): Dataset {
  const ids = new Set(ds.titulares.filter((t) => t.nombre.trim().toLocaleLowerCase('es') === 'luis')
    .map((t) => cuentaPrincipal(ds.cuentas, t.id)?.id).filter((id): id is string => !!id))
  if (!ds.cuentas.some((c) => ids.has(c.id) && nombreCuentaLuis('Luis', c.nombre) !== c.nombre)) return ds
  return { ...ds, cuentas: ds.cuentas.map((c) => ids.has(c.id) ? { ...c, nombre: nombreCuentaLuis('Luis', c.nombre) } : c) }
}

const simple = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '')

/** Cuentas con saldo de un titular (la primera es su cuenta principal). */
export const cuentasConSaldo = (cuentas: Cuenta[], titularId: string): Cuenta[] => cuentas.filter((c) => c.titularId === titularId && !c.externa)

/** Cuenta principal de un titular: su primera cuenta con saldo (p. ej. «MyInvestor»). */
export function cuentaPrincipal(cuentas: Cuenta[], titularId: string): Cuenta | undefined {
  return cuentas.find((c) => c.titularId === titularId && !c.externa)
}

/** Cuentas externas de un titular (de donde trae el dinero). */
export const cuentasExternas = (cuentas: Cuenta[], titularId: string): Cuenta[] => cuentas.filter((c) => c.titularId === titularId && c.externa)

/** Cuenta «MyInvestor» nueva (con saldo) para un titular. */
export function nuevaCuentaMyInvestor(titularId: string, id: string, createdAt: string): Cuenta {
  return { id, titularId, nombre: MYINVESTOR, entidad: MYINVESTOR, iban: '', color: MYINVESTOR_COLOR, notas: '', externa: false, createdAt }
}

/**
 * Se asegura de que el titular principal tenga cuenta principal con saldo («MyInvestor»):
 *  1. si ya tiene una cuenta con saldo, no cambia nada;
 *  2. si tiene una cuenta que se llama «MyInvestor», pasa a ser su cuenta con saldo;
 *  3. si tiene una que se llama «… principal» (p. ej. «Cuenta principal»), pasa a llamarse
 *     «MyInvestor» y a llevar saldo;
 *  4. si no, se crea una cuenta «MyInvestor» nueva (la primera de la lista).
 */
export function conCuentaPrincipal(ds: Dataset, newId: () => string, stamp: string): Dataset {
  const t = ds.titulares[0]
  if (!t) return ds
  if (cuentaPrincipal(ds.cuentas, t.id)) return renombrarCuentaLuis(ds)
  const propias = ds.cuentas.filter((c) => c.titularId === t.id)
  const porNombre = propias.find((c) => simple(c.nombre) === simple(MYINVESTOR))
  if (porNombre) return renombrarCuentaLuis({ ...ds, cuentas: ds.cuentas.map((c) => (c.id === porNombre.id ? { ...c, externa: false } : c)) })
  const principal = propias.find((c) => /principal/.test(simple(c.nombre)))
  if (principal) {
    return renombrarCuentaLuis({
      ...ds,
      cuentas: ds.cuentas.map((c) => (c.id === principal.id ? { ...c, nombre: MYINVESTOR, entidad: c.entidad || MYINVESTOR, externa: false } : c)),
    })
  }
  return renombrarCuentaLuis({ ...ds, cuentas: [nuevaCuentaMyInvestor(t.id, newId(), stamp), ...ds.cuentas] })
}

// ── Orden de las inversiones ────────────────────────────────────────────────

/**
 * Coloca los elementos de `ids` en ese orden, en los huecos que ocupan dentro de `items`.
 * Los que no están en `ids` (p. ej. los productos cerrados, que no se ven) no se mueven.
 */
export function applyOrder<T extends { id: string }>(items: T[], ids: string[]): T[] {
  const wanted = new Set(ids)
  const byId = new Map(items.map((x) => [x.id, x]))
  const queue = ids.filter((id, i) => byId.has(id) && ids.indexOf(id) === i).map((id) => byId.get(id)!)
  if (queue.length === 0) return items
  let k = 0
  return items.map((x) => (wanted.has(x.id) && k < queue.length ? queue[k++] : x))
}

/** Mueve `id` una posición (−1 arriba, +1 abajo) dentro de la lista `ids`. */
export function moveInList(ids: string[], id: string, dir: -1 | 1): string[] {
  const i = ids.indexOf(id)
  const j = i + dir
  if (i < 0 || j < 0 || j >= ids.length) return ids
  const out = [...ids]
  ;[out[i], out[j]] = [out[j], out[i]]
  return out
}
