// «Deshacer» y «Rehacer» desde la interfaz.
//
// Para deshacer está el botón «Deshacer» de arriba (y Ctrl+Z). Los avisos que salen al hacer un
// cambio («Movimiento guardado»…) no llevan botón «Deshacer»: son cortos y se van solos.

import { conDeshacer, currentSlot, useData } from './data'
import { ultimoPaso, useHistorial } from './historial'
import { toast } from './ui'

/** Deshace el último cambio (de los datos que se están viendo) y avisa de qué se ha deshecho. */
export function deshacer() {
  const etiqueta = useData.getState().deshacer()
  if (etiqueta) toast(`Deshecho: ${etiqueta}`, 'info', { label: 'Rehacer', onClick: rehacer })
  else toast('No hay nada que deshacer', 'info')
}

/** Vuelve a hacer lo último que se ha deshecho. */
export function rehacer() {
  const etiqueta = useData.getState().rehacer()
  if (etiqueta) toast(`Rehecho: ${etiqueta}`, 'info')
}

/**
 * Hace un cambio (o varios de una vez) con nombre, para poder deshacerlo con el botón
 * «Deshacer» de arriba, y avisa con un mensaje corto (sin botón).
 */
export function accion<T>(etiqueta: string, fn: () => T, mensaje: string = etiqueta): T {
  const result = conDeshacer(etiqueta, fn)
  toast(mensaje)
  return result
}

/** Lo último que se puede deshacer en los datos que se están viendo (para el botón de arriba). */
export function useUltimoCambio(): string | null {
  const slot = useData(currentSlot)
  return useHistorial((h) => ultimoPaso(h.deshacer, slot)?.etiqueta ?? null)
}
