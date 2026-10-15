// Estado de la interfaz (ventanas, avisos). No se guarda.

import type { ReactNode } from 'react'
import { create } from 'zustand'
import type { EntityRef, ProductType } from '../types'
import { uid } from '../lib/id'

export interface MovementPreset {
  origen?: EntityRef
  destino?: EntityRef
  tipo?: 'inversion' | 'reembolso' | 'traspaso' | 'transferencia'
}

export type ModalSpec =
  | { id: string; type: 'movement'; movementId?: string; preset?: MovementPreset }
  | { id: string; type: 'product'; productId?: string; presetTipo?: ProductType; onCreated?: (id: string) => void }
  | { id: string; type: 'account'; accountId?: string; onCreated?: (id: string) => void }
  | { id: string; type: 'valuation'; productId: string }
  | { id: string; type: 'titular'; titularId?: string }
  | {
      id: string
      type: 'confirm'
      title: string
      message: ReactNode
      confirmLabel?: string
      danger?: boolean
      resolve: (ok: boolean) => void
    }

type DistributiveOmit<T, K extends keyof T> = T extends unknown ? Omit<T, K> : never
export type ModalInput = DistributiveOmit<ModalSpec, 'id'>

export interface Toast {
  id: string
  message: string
  kind: 'success' | 'info' | 'error'
}

interface UIState {
  modals: ModalSpec[]
  toasts: Toast[]
  open: (spec: ModalInput) => string
  close: (id: string) => void
  toast: (message: string, kind?: Toast['kind']) => void
  dismissToast: (id: string) => void
}

export const useUI = create<UIState>()((set, get) => ({
  modals: [],
  toasts: [],
  open: (spec) => {
    const id = uid()
    set((s) => ({ modals: [...s.modals, { ...spec, id } as ModalSpec] }))
    return id
  },
  close: (id) => set((s) => ({ modals: s.modals.filter((m) => m.id !== id) })),
  toast: (message, kind = 'success') => {
    const id = uid()
    set((s) => ({ toasts: [...s.toasts.slice(-2), { id, message, kind }] }))
    window.setTimeout(() => get().dismissToast(id), 3200)
  },
  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}))

/** Ventana de confirmación. Devuelve `true` si el usuario acepta. */
export function confirmDialog(opts: { title: string; message: ReactNode; confirmLabel?: string; danger?: boolean }): Promise<boolean> {
  return new Promise((resolve) => {
    useUI.getState().open({ type: 'confirm', ...opts, resolve })
  })
}

export const openMovement = (preset?: MovementPreset) => useUI.getState().open({ type: 'movement', preset })
export const editMovement = (movementId: string) => useUI.getState().open({ type: 'movement', movementId })
export const openProduct = (opts: { productId?: string; presetTipo?: ProductType; onCreated?: (id: string) => void } = {}) =>
  useUI.getState().open({ type: 'product', ...opts })
export const openAccount = (opts: { accountId?: string; onCreated?: (id: string) => void } = {}) =>
  useUI.getState().open({ type: 'account', ...opts })
export const openValuation = (productId: string) => useUI.getState().open({ type: 'valuation', productId })
export const openTitular = (titularId?: string) => useUI.getState().open({ type: 'titular', titularId })
export const toast = (message: string, kind?: Toast['kind']) => useUI.getState().toast(message, kind)
