// Almacén principal de datos. Se guarda automáticamente en el navegador
// (localStorage), así que funciona sin conexión y sin servidor.

import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import type { Cuenta, EntityRef, Movimiento, PersistedData, Producto, Titular, Valoracion, Workspace } from '../types'
import { buildDemoWorkspace } from '../lib/demo'
import { todayISO } from '../lib/dates'
import { round2 } from '../lib/format'
import { nowStamp, uid } from '../lib/id'
import { inferMovementType } from '../lib/meta'
import { defaultTitularName } from '../lib/titulares'
import { DATA_VERSION, sanitizeData } from './sanitize'

export { DATA_VERSION, sanitizeData }
export const STORAGE_KEY = 'mis-inversiones'

export const EMPTY_WORKSPACE: Workspace = Object.freeze({ cuentas: [], productos: [], movimientos: [] }) as Workspace

export type CuentaInput = Omit<Cuenta, 'id' | 'createdAt'>
export type ProductoInput = Omit<Producto, 'id' | 'createdAt' | 'valoraciones'>
export type ValoracionInput = Omit<Valoracion, 'id' | 'createdAt'>
export interface MovimientoInput {
  fecha: string
  origen: EntityRef
  destino: EntityRef
  importe: number
  concepto: string
}

interface Actions {
  setHideAmounts: (v: boolean) => void

  addTitular: (data: { codigo: string; nombre: string }) => string
  updateTitular: (id: string, data: Partial<Pick<Titular, 'codigo' | 'nombre'>>) => void
  removeTitular: (id: string) => void
  switchTitular: (id: string) => void

  addCuenta: (data: CuentaInput) => string
  updateCuenta: (id: string, data: Partial<CuentaInput>) => void
  removeCuenta: (id: string) => void

  addProducto: (data: ProductoInput) => string
  updateProducto: (id: string, data: Partial<ProductoInput>) => void
  removeProducto: (id: string) => void
  addValoracion: (productoId: string, data: ValoracionInput) => void
  removeValoracion: (productoId: string, valoracionId: string) => void

  addMovimiento: (data: MovimientoInput) => string
  updateMovimiento: (id: string, data: MovimientoInput) => void
  removeMovimiento: (id: string) => void

  loadDemo: () => void
  clearWorkspace: () => void
  resetAll: () => void
  importData: (data: PersistedData) => void
}

export type DataState = PersistedData & Actions

/** Datos de partida: dos titulares, cada uno con sus cuentas y movimientos por separado. */
function initialData(): PersistedData {
  const a = uid()
  const b = uid()
  const stamp = nowStamp()
  return {
    version: DATA_VERSION,
    titulares: [
      { id: a, codigo: '', nombre: defaultTitularName(1), createdAt: stamp },
      { id: b, codigo: '', nombre: defaultTitularName(2), createdAt: stamp },
    ],
    activeTitularId: a,
    workspaces: { [a]: { cuentas: [], productos: [], movimientos: [] }, [b]: { cuentas: [], productos: [], movimientos: [] } },
    hideAmounts: false,
  }
}

const refUses = (ref: EntityRef, kind: EntityRef['kind'], id: string) => ref.kind === kind && ref.id === id

export const useData = create<DataState>()(
  persist(
    (set, get) => {
      /** Modifica el espacio de trabajo del titular activo. */
      const updateWs = (fn: (ws: Workspace) => Workspace) =>
        set((s) => {
          const current = s.workspaces[s.activeTitularId] ?? { cuentas: [], productos: [], movimientos: [] }
          return { workspaces: { ...s.workspaces, [s.activeTitularId]: fn(current) } }
        })

      return {
        ...initialData(),

        setHideAmounts: (v) => set({ hideAmounts: v }),

        // ── Titulares ───────────────────────────────────────────────────────
        addTitular: ({ codigo, nombre }) => {
          const id = uid()
          set((s) => ({
            titulares: [
              ...s.titulares,
              {
                id,
                codigo: codigo.trim(),
                nombre: nombre.trim() || defaultTitularName(s.titulares.filter((t) => !t.demo).length + 1),
                createdAt: nowStamp(),
              },
            ],
            workspaces: { ...s.workspaces, [id]: { cuentas: [], productos: [], movimientos: [] } },
            activeTitularId: id,
          }))
          return id
        },
        updateTitular: (id, data) =>
          set((s) => ({
            titulares: s.titulares.map((t) =>
              t.id === id
                ? {
                    ...t,
                    ...(data.codigo !== undefined ? { codigo: data.codigo.trim() } : {}),
                    ...(data.nombre !== undefined ? { nombre: data.nombre.trim() || t.nombre } : {}),
                  }
                : t,
            ),
          })),
        removeTitular: (id) =>
          set((s) => {
            const titulares = s.titulares.filter((t) => t.id !== id)
            const workspaces = { ...s.workspaces }
            delete workspaces[id]
            if (titulares.length === 0) return initialData()
            return {
              titulares,
              workspaces,
              activeTitularId: s.activeTitularId === id ? titulares[0].id : s.activeTitularId,
            }
          }),
        switchTitular: (id) => {
          if (get().titulares.some((t) => t.id === id)) set({ activeTitularId: id })
        },

        // ── Cuentas ─────────────────────────────────────────────────────────
        addCuenta: (data) => {
          const id = uid()
          updateWs((ws) => ({ ...ws, cuentas: [...ws.cuentas, { ...data, nombre: data.nombre.trim(), id, createdAt: nowStamp() }] }))
          return id
        },
        updateCuenta: (id, data) =>
          updateWs((ws) => ({ ...ws, cuentas: ws.cuentas.map((c) => (c.id === id ? { ...c, ...data } : c)) })),
        removeCuenta: (id) =>
          updateWs((ws) => ({
            ...ws,
            cuentas: ws.cuentas.filter((c) => c.id !== id),
            movimientos: ws.movimientos.filter((m) => !refUses(m.origen, 'cuenta', id) && !refUses(m.destino, 'cuenta', id)),
          })),

        // ── Productos ───────────────────────────────────────────────────────
        addProducto: (data) => {
          const id = uid()
          updateWs((ws) => ({
            ...ws,
            productos: [...ws.productos, { ...data, nombre: data.nombre.trim(), id, valoraciones: [], createdAt: nowStamp() }],
          }))
          return id
        },
        updateProducto: (id, data) =>
          updateWs((ws) => ({ ...ws, productos: ws.productos.map((p) => (p.id === id ? { ...p, ...data } : p)) })),
        removeProducto: (id) =>
          updateWs((ws) => ({
            ...ws,
            productos: ws.productos.filter((p) => p.id !== id),
            movimientos: ws.movimientos.filter((m) => !refUses(m.origen, 'producto', id) && !refUses(m.destino, 'producto', id)),
          })),
        addValoracion: (productoId, data) =>
          updateWs((ws) => ({
            ...ws,
            productos: ws.productos.map((p) =>
              p.id === productoId
                ? {
                    ...p,
                    valoraciones: [
                      ...p.valoraciones,
                      { ...data, valor: round2(data.valor), id: uid(), createdAt: nowStamp() },
                    ],
                  }
                : p,
            ),
          })),
        removeValoracion: (productoId, valoracionId) =>
          updateWs((ws) => ({
            ...ws,
            productos: ws.productos.map((p) =>
              p.id === productoId ? { ...p, valoraciones: p.valoraciones.filter((v) => v.id !== valoracionId) } : p,
            ),
          })),

        // ── Movimientos ─────────────────────────────────────────────────────
        addMovimiento: (data) => {
          const id = uid()
          const stamp = nowStamp()
          updateWs((ws) => ({
            ...ws,
            movimientos: [
              ...ws.movimientos,
              {
                id,
                tipo: inferMovementType(data.origen.kind, data.destino.kind),
                fecha: data.fecha,
                origen: { ...data.origen },
                destino: { ...data.destino },
                importe: round2(data.importe),
                concepto: data.concepto.trim(),
                createdAt: stamp,
                updatedAt: stamp,
              },
            ],
          }))
          return id
        },
        updateMovimiento: (id, data) =>
          updateWs((ws) => ({
            ...ws,
            movimientos: ws.movimientos.map(
              (m): Movimiento =>
                m.id === id
                  ? {
                      ...m,
                      tipo: inferMovementType(data.origen.kind, data.destino.kind),
                      fecha: data.fecha,
                      origen: { ...data.origen },
                      destino: { ...data.destino },
                      importe: round2(data.importe),
                      concepto: data.concepto.trim(),
                      updatedAt: nowStamp(),
                    }
                  : m,
            ),
          })),
        removeMovimiento: (id) => updateWs((ws) => ({ ...ws, movimientos: ws.movimientos.filter((m) => m.id !== id) })),

        // ── Datos ───────────────────────────────────────────────────────────
        loadDemo: () => {
          const existing = get().titulares.find((t) => t.demo)
          const id = existing?.id ?? uid()
          const ws = buildDemoWorkspace(todayISO())
          set((s) => ({
            titulares: existing
              ? s.titulares
              : [...s.titulares, { id, codigo: 'DEMO', nombre: 'Ejemplo (datos ficticios)', demo: true, createdAt: nowStamp() }],
            workspaces: { ...s.workspaces, [id]: ws },
            activeTitularId: id,
          }))
        },
        clearWorkspace: () => updateWs(() => ({ cuentas: [], productos: [], movimientos: [] })),
        resetAll: () => set({ ...initialData() }),
        importData: (data) =>
          set({
            version: DATA_VERSION,
            titulares: data.titulares,
            activeTitularId: data.activeTitularId,
            workspaces: data.workspaces,
            hideAmounts: data.hideAmounts,
          }),
      }
    },
    {
      name: STORAGE_KEY,
      version: DATA_VERSION,
      storage: createJSONStorage(() => localStorage),
      // Datos de una versión anterior: se pasan tal cual y `sanitizeData` (en `merge`) los
      // actualiza según su campo `version`. Sin esta función, zustand los descartaría.
      migrate: (persisted) => persisted as PersistedData,
      partialize: (s): PersistedData => ({
        version: s.version,
        titulares: s.titulares,
        activeTitularId: s.activeTitularId,
        workspaces: s.workspaces,
        hideAmounts: s.hideAmounts,
      }),
      merge: (persisted, current) => {
        const clean = sanitizeData(persisted)
        return clean ? { ...current, ...clean } : current
      },
    },
  ),
)

/** Espacio de trabajo (cuentas, productos y movimientos) del titular activo. */
export function useWorkspace(): Workspace {
  return useData((s) => s.workspaces[s.activeTitularId] ?? EMPTY_WORKSPACE)
}

export function useActiveTitular(): Titular {
  return useData((s) => s.titulares.find((t) => t.id === s.activeTitularId) ?? s.titulares[0])
}

/** Copia de seguridad completa (todos los titulares). */
export function exportBackup(): string {
  const s = useData.getState()
  const data: PersistedData & { app: string; exportedAt: string } = {
    app: 'mis-inversiones',
    exportedAt: nowStamp(),
    version: DATA_VERSION,
    titulares: s.titulares,
    activeTitularId: s.activeTitularId,
    workspaces: s.workspaces,
    hideAmounts: s.hideAmounts,
  }
  return JSON.stringify(data, null, 2)
}
