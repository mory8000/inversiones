// Utilidades de titulares: nombres por defecto, el principal y el color de cada uno.
// Todos se ven a la vez; el primero de la lista es el principal.

import type { Dataset, EntityRef, Titular, Workspace } from '../types'

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

/** Cuentas, productos y movimientos que tocan a un titular (incluidos los que vienen de o van a otro titular). */
export function titularWorkspace(ds: Workspace, titularId: string): Workspace {
  const cuentas = ds.cuentas.filter((c) => c.titularId === titularId)
  const productos = ds.productos.filter((p) => p.titularId === titularId)
  const ids = new Set<string>()
  for (const c of cuentas) ids.add(`cuenta:${c.id}`)
  for (const p of productos) ids.add(`producto:${p.id}`)
  const movimientos = ds.movimientos.filter((m) => ids.has(`${m.origen.kind}:${m.origen.id}`) || ids.has(`${m.destino.kind}:${m.destino.id}`))
  return { cuentas, productos, movimientos }
}

export const emptyDataset = (titulares: Titular[]): Dataset => ({ titulares, cuentas: [], productos: [], movimientos: [], programadas: [] })
