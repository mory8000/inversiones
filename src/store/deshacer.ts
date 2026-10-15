// «Deshacer» y «Rehacer» desde la interfaz: el botón de arriba y el de los avisos.

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
  if (etiqueta) toast(`Rehecho: ${etiqueta}`, 'info', { label: 'Deshacer', onClick: deshacer })
}

/**
 * Hace un cambio (o varios de una vez) con nombre, y avisa con el botón «Deshacer».
 * El botón del aviso solo deshace este cambio: si después ya se ha hecho otro, avisa de que
 * se use el botón «Deshacer» de arriba.
 */
export function accion<T>(etiqueta: string, fn: () => T, mensaje: string = etiqueta): T {
  const slot = currentSlot(useData.getState())
  const antes = ultimoPaso(useHistorial.getState().deshacer, slot)?.id
  const result = conDeshacer(etiqueta, fn)
  const paso = ultimoPaso(useHistorial.getState().deshacer, currentSlot(useData.getState()))
  if (paso && paso.id !== antes) {
    toast(mensaje, 'success', {
      label: 'Deshacer',
      onClick: () => {
        const ultimo = ultimoPaso(useHistorial.getState().deshacer, currentSlot(useData.getState()))
        if (ultimo?.id === paso.id) deshacer()
        else toast('Ya hay cambios más recientes: usa el botón «Deshacer» de arriba', 'info')
      },
    })
  } else toast(mensaje)
  return result
}

/** Lo último que se puede deshacer en los datos que se están viendo (para el botón de arriba). */
export function useUltimoCambio(): string | null {
  const slot = useData(currentSlot)
  return useHistorial((h) => ultimoPaso(h.deshacer, slot)?.etiqueta ?? null)
}
