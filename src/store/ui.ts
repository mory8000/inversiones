// Estado de la interfaz (ventanas, avisos). No se guarda.

import type { ReactNode } from 'react'
import { create } from 'zustand'
import type { EntityRef, ProductType } from '../types'
import { uid } from '../lib/id'

export interface MovementPreset {
  origen?: EntityRef
  destino?: EntityRef
  tipo?: 'inversion' | 'reembolso' | 'traspaso' | 'transferencia'
  /** Repetir cada mes (transferencia mensual). */
  repetir?: boolean
  /** Titular para las cuentas o productos que se creen desde el formulario (origen / destino). */
  origenTitularId?: string
  destinoTitularId?: string
  concepto?: string
  /** Título de la ventana (p. ej. «Añadir dinero a MyInvestor»). */
  titulo?: string
  /** No enseñar la elección del tipo de movimiento (ya viene dado por el botón que se pulsó). */
  fijo?: boolean
  /**
   * Para «Añadir dinero»: si este titular no tiene cuentas externas, se ofrece «Cuenta externa
   * (nueva)» como origen y se crea al guardar.
   */
  externaNueva?: string
}

export type ModalSpec =
  | { id: string; type: 'movement'; movementId?: string; programadaId?: string; preset?: MovementPreset }
  | {
      id: string
      type: 'product'
      productId?: string
      presetTipo?: ProductType
      presetTitularId?: string
      onCreated?: (id: string) => void
      abrirVentanilla?: boolean
    }
  | { id: string; type: 'account'; accountId?: string; presetTitularId?: string; presetExterna?: boolean; onCreated?: (id: string) => void }
  | { id: string; type: 'investment'; productId: string }
  /** Ventana de una cuenta con saldo (p. ej. «MyInvestor»): su saldo y lo que se puede hacer. */
  | { id: string; type: 'cuenta'; cuentaId: string }
  | { id: string; type: 'valuation'; productId: string }
  /** Cambiar el interés (TAE) de un depósito. */
  | { id: string; type: 'interes'; productId: string }
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

/** Botón dentro de un aviso (p. ej. «Deshacer»). */
export interface ToastAction {
  label: string
  onClick: () => void
}

export interface Toast {
  id: string
  message: string
  kind: 'success' | 'info' | 'error'
  action?: ToastAction
}

interface UIState {
  modals: ModalSpec[]
  toasts: Toast[]
  open: (spec: ModalInput) => string
  close: (id: string) => void
  toast: (message: string, kind?: Toast['kind'], action?: ToastAction) => void
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
  toast: (message, kind = 'success', action) => {
    const id = uid()
    set((s) => ({ toasts: [...s.toasts.slice(-2), { id, message, kind, ...(action ? { action } : {}) }] }))
    // Con botón (p. ej. «Deshacer») se deja más tiempo para pulsarlo.
    window.setTimeout(() => get().dismissToast(id), action ? 7000 : 3200)
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
/** Nueva transferencia mensual (o editar una, con `programadaId`). */
export const openProgramada = (opts: { programadaId?: string; preset?: MovementPreset } = {}) =>
  useUI.getState().open({ type: 'movement', programadaId: opts.programadaId, preset: { ...opts.preset, repetir: true } })
export const openProduct = (
  opts: { productId?: string; presetTipo?: ProductType; presetTitularId?: string; onCreated?: (id: string) => void; abrirVentanilla?: boolean } = {},
) => useUI.getState().open({ type: 'product', ...opts })
export const openAccount = (opts: { accountId?: string; presetTitularId?: string; presetExterna?: boolean; onCreated?: (id: string) => void } = {}) =>
  useUI.getState().open({ type: 'account', ...opts })
/** Ventanilla de una inversión: su resumen y los movimientos que se pueden hacer. */
export const openInvestment = (productId: string) => useUI.getState().open({ type: 'investment', productId })
export const openValuation = (productId: string) => useUI.getState().open({ type: 'valuation', productId })
/** Ventana de una cuenta con saldo (p. ej. «MyInvestor»). */
export const openCuenta = (cuentaId: string) => useUI.getState().open({ type: 'cuenta', cuentaId })
export const openInteres = (productId: string) => useUI.getState().open({ type: 'interes', productId })
export const openTitular = (titularId?: string) => useUI.getState().open({ type: 'titular', titularId })
export const toast = (message: string, kind?: Toast['kind'], action?: ToastAction) => useUI.getState().toast(message, kind, action)
