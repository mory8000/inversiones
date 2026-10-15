// Almacén principal de datos. Se guarda automáticamente en el navegador
// (localStorage), así que funciona sin conexión y sin servidor.

import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import type { Cuenta, Dataset, EntityRef, Movimiento, PersistedData, Producto, Programada, Titular, Valoracion } from '../types'
import { buildDemoDataset } from '../lib/demo'
import { todayISO } from '../lib/dates'
import { round2 } from '../lib/format'
import { nowStamp, uid } from '../lib/id'
import { inferMovementType } from '../lib/meta'
import { aplicarProgramadas, sincronizarProgramada } from '../lib/programadas'
import { defaultTitularName, emptyDataset } from '../lib/titulares'
import { DATA_VERSION, sanitizeData } from './sanitize'

export { DATA_VERSION, sanitizeData }
export const STORAGE_KEY = 'mis-inversiones'

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
export type ProgramadaInput = Pick<Programada, 'origen' | 'destino' | 'importe' | 'inicio' | 'fin' | 'concepto'>

interface Actions {
  setHideAmounts: (v: boolean) => void

  addTitular: (data: { codigo: string; nombre: string }) => string
  updateTitular: (id: string, data: Partial<Pick<Titular, 'codigo' | 'nombre'>>) => void
  removeTitular: (id: string) => void
  /** Lo pone el primero de la lista (el principal). */
  makePrincipal: (id: string) => void

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

  addProgramada: (data: ProgramadaInput) => string
  updateProgramada: (id: string, data: ProgramadaInput) => void
  /** Elimina la transferencia mensual y los movimientos que ya había apuntado. */
  removeProgramada: (id: string) => void
  /** Apunta los movimientos de las transferencias mensuales que tocan hasta hoy. */
  aplicarProgramadas: () => void

  loadDemo: () => void
  setVerEjemplo: (v: boolean) => void
  removeDemo: () => void
  /** Borra cuentas, productos, movimientos y transferencias (se quedan los titulares). */
  clearData: () => void
  resetAll: () => void
  importData: (data: PersistedData) => void
}

export type DataState = PersistedData & Actions

/** Datos de partida: dos titulares, «Titular 1» (el principal) y «Titular 2». */
function initialDataset(): Dataset {
  const stamp = nowStamp()
  return emptyDataset([
    { id: uid(), codigo: '', nombre: defaultTitularName(1), createdAt: stamp },
    { id: uid(), codigo: '', nombre: defaultTitularName(2), createdAt: stamp },
  ])
}

function initialData(): PersistedData {
  return { version: DATA_VERSION, datos: initialDataset(), ejemplo: null, verEjemplo: false, hideAmounts: false }
}

const usesAny = (ref: EntityRef, cuentas: Set<string>, productos: Set<string>) =>
  ref.kind === 'cuenta' ? cuentas.has(ref.id) : productos.has(ref.id)

/** Quita cuentas y productos, con los movimientos y transferencias mensuales que los usan. */
function removeEntities(ds: Dataset, cuentas: Set<string>, productos: Set<string>): Dataset {
  const fuera = (r: EntityRef) => usesAny(r, cuentas, productos)
  return {
    ...ds,
    cuentas: ds.cuentas.filter((c) => !cuentas.has(c.id)),
    productos: ds.productos.filter((p) => !productos.has(p.id)),
    movimientos: ds.movimientos.filter((m) => !fuera(m.origen) && !fuera(m.destino)),
    programadas: ds.programadas.filter((p) => !fuera(p.origen) && !fuera(p.destino)),
  }
}

/** Los datos que se están viendo: el ejemplo o los tuyos. */
export const currentDataset = (s: PersistedData): Dataset => (s.verEjemplo && s.ejemplo ? s.ejemplo : s.datos)

export const useData = create<DataState>()(
  persist(
    (set, get) => {
      /** Modifica los datos que se están viendo. */
      const updateDs = (fn: (ds: Dataset) => Dataset) =>
        set((s) => (s.verEjemplo && s.ejemplo ? { ejemplo: fn(s.ejemplo) } : { datos: fn(s.datos) }))

      return {
        ...initialData(),

        setHideAmounts: (v) => set({ hideAmounts: v }),

        // ── Titulares ───────────────────────────────────────────────────────
        addTitular: ({ codigo, nombre }) => {
          const id = uid()
          updateDs((ds) => ({
            ...ds,
            titulares: [
              ...ds.titulares,
              { id, codigo: codigo.trim(), nombre: nombre.trim() || defaultTitularName(ds.titulares.length + 1), createdAt: nowStamp() },
            ],
          }))
          return id
        },
        updateTitular: (id, data) =>
          updateDs((ds) => ({
            ...ds,
            titulares: ds.titulares.map((t) =>
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
          updateDs((ds) => {
            if (ds.titulares.length <= 1 || !ds.titulares.some((t) => t.id === id)) return ds
            const cuentas = new Set(ds.cuentas.filter((c) => c.titularId === id).map((c) => c.id))
            const productos = new Set(ds.productos.filter((p) => p.titularId === id).map((p) => p.id))
            return { ...removeEntities(ds, cuentas, productos), titulares: ds.titulares.filter((t) => t.id !== id) }
          }),
        makePrincipal: (id) =>
          updateDs((ds) => {
            const t = ds.titulares.find((x) => x.id === id)
            return t ? { ...ds, titulares: [t, ...ds.titulares.filter((x) => x.id !== id)] } : ds
          }),

        // ── Cuentas ─────────────────────────────────────────────────────────
        addCuenta: (data) => {
          const id = uid()
          updateDs((ds) => ({ ...ds, cuentas: [...ds.cuentas, { ...data, nombre: data.nombre.trim(), id, createdAt: nowStamp() }] }))
          return id
        },
        updateCuenta: (id, data) => updateDs((ds) => ({ ...ds, cuentas: ds.cuentas.map((c) => (c.id === id ? { ...c, ...data } : c)) })),
        removeCuenta: (id) => updateDs((ds) => removeEntities(ds, new Set([id]), new Set())),

        // ── Productos ───────────────────────────────────────────────────────
        addProducto: (data) => {
          const id = uid()
          updateDs((ds) => ({
            ...ds,
            productos: [...ds.productos, { ...data, nombre: data.nombre.trim(), id, valoraciones: [], createdAt: nowStamp() }],
          }))
          return id
        },
        updateProducto: (id, data) => updateDs((ds) => ({ ...ds, productos: ds.productos.map((p) => (p.id === id ? { ...p, ...data } : p)) })),
        removeProducto: (id) => updateDs((ds) => removeEntities(ds, new Set(), new Set([id]))),
        addValoracion: (productoId, data) =>
          updateDs((ds) => ({
            ...ds,
            productos: ds.productos.map((p) =>
              p.id === productoId
                ? { ...p, valoraciones: [...p.valoraciones, { ...data, valor: round2(data.valor), id: uid(), createdAt: nowStamp() }] }
                : p,
            ),
          })),
        removeValoracion: (productoId, valoracionId) =>
          updateDs((ds) => ({
            ...ds,
            productos: ds.productos.map((p) => (p.id === productoId ? { ...p, valoraciones: p.valoraciones.filter((v) => v.id !== valoracionId) } : p)),
          })),

        // ── Movimientos ─────────────────────────────────────────────────────
        addMovimiento: (data) => {
          const id = uid()
          const stamp = nowStamp()
          updateDs((ds) => ({
            ...ds,
            movimientos: [
              ...ds.movimientos,
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
          updateDs((ds) => ({
            ...ds,
            movimientos: ds.movimientos.map(
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
                      // Si era de una transferencia mensual, se queda con los cambios hechos a mano.
                      ...(m.programadaId ? { editado: true } : {}),
                      updatedAt: nowStamp(),
                    }
                  : m,
            ),
          })),
        removeMovimiento: (id) =>
          updateDs((ds) => {
            const m = ds.movimientos.find((x) => x.id === id)
            if (!m) return ds
            return {
              ...ds,
              movimientos: ds.movimientos.filter((x) => x.id !== id),
              // Si era de una transferencia mensual, ese mes no se vuelve a apuntar.
              programadas:
                m.programadaId && m.programadaMes
                  ? ds.programadas.map((p) =>
                      p.id === m.programadaId && !p.excluidos.includes(m.programadaMes!) ? { ...p, excluidos: [...p.excluidos, m.programadaMes!] } : p,
                    )
                  : ds.programadas,
            }
          }),

        // ── Transferencias mensuales ───────────────────────────────────────
        addProgramada: (data) => {
          const id = uid()
          const stamp = nowStamp()
          updateDs((ds) =>
            aplicarProgramadas(
              {
                ...ds,
                programadas: [
                  ...ds.programadas,
                  { ...data, id, importe: round2(data.importe), concepto: data.concepto.trim(), excluidos: [], createdAt: stamp, updatedAt: stamp },
                ],
              },
              todayISO(),
            ),
          )
          return id
        },
        updateProgramada: (id, data) =>
          updateDs((ds) => {
            const old = ds.programadas.find((p) => p.id === id)
            if (!old) return ds
            const p: Programada = { ...old, ...data, importe: round2(data.importe), concepto: data.concepto.trim(), updatedAt: nowStamp() }
            return sincronizarProgramada({ ...ds, programadas: ds.programadas.map((x) => (x.id === id ? p : x)) }, p, todayISO())
          }),
        removeProgramada: (id) =>
          updateDs((ds) => ({
            ...ds,
            programadas: ds.programadas.filter((p) => p.id !== id),
            movimientos: ds.movimientos.filter((m) => m.programadaId !== id),
          })),
        aplicarProgramadas: () => {
          const today = todayISO()
          const s = get()
          const datos = aplicarProgramadas(s.datos, today)
          const ejemplo = s.ejemplo ? aplicarProgramadas(s.ejemplo, today) : null
          if (datos !== s.datos || ejemplo !== s.ejemplo) set({ datos, ejemplo })
        },

        // ── Datos ───────────────────────────────────────────────────────────
        loadDemo: () => set({ ejemplo: buildDemoDataset(todayISO()), verEjemplo: true }),
        setVerEjemplo: (v) => set((s) => ({ verEjemplo: v && !!s.ejemplo })),
        removeDemo: () => set({ ejemplo: null, verEjemplo: false }),
        clearData: () => updateDs((ds) => emptyDataset(ds.titulares)),
        resetAll: () => set({ ...initialData() }),
        importData: (data) => set({ version: DATA_VERSION, datos: data.datos, verEjemplo: false, hideAmounts: data.hideAmounts }),
      }
    },
    {
      name: STORAGE_KEY,
      version: DATA_VERSION,
      storage: createJSONStorage(() => localStorage),
      // Datos de una versión anterior: se pasan tal cual y `sanitizeData` (en `merge`) los
      // convierte al formato actual. Sin esta función, zustand los descartaría.
      migrate: (persisted) => persisted as PersistedData,
      partialize: (s): PersistedData => ({
        version: s.version,
        datos: s.datos,
        ejemplo: s.ejemplo,
        verEjemplo: s.verEjemplo,
        hideAmounts: s.hideAmounts,
      }),
      merge: (persisted, current) => {
        const clean = sanitizeData(persisted)
        return clean ? { ...current, ...clean } : current
      },
    },
  ),
)

// Al abrir la app se apuntan las transferencias mensuales que hayan tocado desde la última vez.
useData.getState().aplicarProgramadas()

/** Los datos que se están viendo (todos los titulares). */
export function useDataset(): Dataset {
  return useData(currentDataset)
}

export function useTitulares(): Titular[] {
  return useData((s) => currentDataset(s).titulares)
}

/** Copia de seguridad completa (tus datos, sin el ejemplo). */
export function exportBackup(): string {
  const s = useData.getState()
  return JSON.stringify({ app: 'mis-inversiones', exportedAt: nowStamp(), version: DATA_VERSION, datos: s.datos, hideAmounts: s.hideAmounts }, null, 2)
}
