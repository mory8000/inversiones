// Utilidades de titulares: nombres por defecto, orden y color de cada uno.
// Cada titular tiene sus propias cuentas, productos y movimientos, por separado.

import type { Titular } from '../types'

/** Nombre que la app da a un titular hasta que el usuario le pone el suyo: «Titular 1», «Titular 2»… */
export const defaultTitularName = (n: number): string => `Titular ${n}`
export const isDefaultTitularName = (nombre: string): boolean => /^Titular \d+$/.test(nombre.trim())

/** Colores para distinguir a cada titular de un vistazo (el primero es el azul de la app). */
const TITULAR_COLORS = ['#2447B8', '#EA580C', '#7C3AED', '#0D9488', '#DB2777', '#A16207']
const DEMO_COLOR = '#64748B'

/** Orden en el que se muestran: los titulares reales primero y el de ejemplo al final. */
export function orderTitulares(titulares: Titular[]): Titular[] {
  return [...titulares.filter((t) => !t.demo), ...titulares.filter((t) => t.demo)]
}

/**
 * Color de un titular según su posición. Sin `id` (o con uno que no existe todavía)
 * devuelve el color que le tocará al siguiente titular que se cree.
 */
export function titularColor(titulares: Titular[], id?: string): string {
  const t = id ? titulares.find((x) => x.id === id) : undefined
  if (t?.demo) return DEMO_COLOR
  const reales = titulares.filter((x) => !x.demo)
  const i = t ? reales.indexOf(t) : reales.length
  return TITULAR_COLORS[Math.max(0, i) % TITULAR_COLORS.length]
}

/** Nombre corto para sitios con poco espacio (el titular de ejemplo se muestra como «Ejemplo»). */
export const shortTitularName = (t: Titular): string => (t.demo ? 'Ejemplo' : t.nombre)
