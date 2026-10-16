// Almacén principal de datos. Se guarda automáticamente en el navegador
// (localStorage), así que funciona sin conexión y sin servidor.
//
// Cada cambio queda en el historial para poder deshacerlo (y rehacerlo): ver `historial.ts`.

import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import type { Cuenta, Dataset, EntityRef, Movimiento, PersistedData, Producto, Programada, Titular, Valoracion } from '../types'
import { buildDemoDataset } from '../lib/demo'
import { todayISO } from '../lib/dates'
import { round2 } from '../lib/format'
import { nowStamp, uid } from '../lib/id'
import { inferMovementType } from '../lib/meta'
import { aplicarProgramadas, sincronizarProgramada } from '../lib/programadas'
import { applyOrder, conCuentaPrincipal, cuentaPrincipal, defaultTitularName, emptyDataset, nuevaCuentaMyInvestor } from '../lib/titulares'
import { DATA_VERSION, sanitizeData } from './sanitize'
import { aplicarParche, diferencia, ultimoPaso, useHistorial, type Slot } from './historial'

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
  /** Crea la cuenta principal con saldo («MyInvestor») de un titular, si no tiene. Devuelve su id. */
  crearCuentaPrincipal: (titularId: string) => string

  addProducto: (data: ProductoInput) => string
  updateProducto: (id: string, data: Partial<ProductoInput>) => void
  removeProducto: (id: string) => void
  /** Pone los productos en este orden (los que no estén en la lista se quedan donde estaban). */
  reorderProductos: (ids: string[]) => void
  addValoracion: (productoId: string, data: ValoracionInput) => void
  removeValoracion: (productoId: string, valoracionId: string) => void
  /**
   * Pone de una vez el valor de mercado (en €) de varias inversiones, con la fecha indicada.
   * Lo que ya tuviera un valor ese mismo día se sustituye (no se acumulan).
   */
  setValores: (fecha: string, valores: { productoId: string; valor: number }[]) => void
  /**
   * Cambia el interés (TAE) de un depósito desde una fecha (los intereses pueden variar).
   * Con `desde: null` se corrige el interés inicial (desde que se contrató).
   */
  cambiarTae: (productoId: string, desde: string | null, tae: number) => void
  removeCambioTae: (productoId: string, cambioId: string) => void

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

  /** Deshace el último cambio de los datos que se están viendo. Devuelve lo que se ha deshecho. */
  deshacer: () => string | null
  /** Vuelve a hacer lo último que se ha deshecho. */
  rehacer: () => string | null
}

export type DataState = PersistedData & Actions

/**
 * Datos de partida: dos titulares, «Titular 1» (el principal, con su cuenta principal
 * «MyInvestor») y «Titular 2».
 */
function initialDataset(): Dataset {
  const stamp = nowStamp()
  const ds = emptyDataset([
    { id: uid(), codigo: '', nombre: defaultTitularName(1), createdAt: stamp },
    { id: uid(), codigo: '', nombre: defaultTitularName(2), createdAt: stamp },
  ])
  return conCuentaPrincipal(ds, uid, stamp)
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
/** Qué datos se están viendo. */
export const currentSlot = (s: PersistedData): Slot => (s.verEjemplo && s.ejemplo ? 'ejemplo' : 'datos')

// ── Historial (deshacer) ────────────────────────────────────────────────────

/** Cambios que se están agrupando en un solo paso (ver `conDeshacer`). */
let lote: { etiqueta: string; slot?: Slot; antes?: Dataset } | null = null

function apuntarPaso(slot: Slot, antes: Dataset, despues: Dataset, etiqueta: string, juntar = false) {
  const parche = diferencia(antes, despues)
  if (parche) useHistorial.getState().nuevo({ id: uid(), etiqueta, at: nowStamp(), slot, parche, ...(juntar ? { juntar } : {}) })
}

/**
 * Agrupa varios cambios en un solo paso del historial, con un nombre que lo explica
 * (p. ej. crear la cuenta externa y apuntar la aportación: «Deshacer» quita las dos cosas).
 */
export function conDeshacer<T>(etiqueta: string, fn: () => T): T {
  if (lote) return fn()
  lote = { etiqueta }
  try {
    return fn()
  } finally {
    const l = lote
    lote = null
    if (l.antes && l.slot) {
      const s = useData.getState()
      const despues = l.slot === 'ejemplo' ? s.ejemplo : s.datos
      if (despues) apuntarPaso(l.slot, l.antes, despues, l.etiqueta)
    }
  }
}

/**
 * Tras deshacer o rehacer: quita los movimientos de transferencias mensuales que ya no existen
 * (los que se apuntaron solos después de crearla).
 */
function sinHuerfanos(ds: Dataset): Dataset {
  const ids = new Set(ds.programadas.map((p) => p.id))
  const movimientos = ds.movimientos.filter((m) => !m.programadaId || ids.has(m.programadaId))
  return movimientos.length === ds.movimientos.length ? ds : { ...ds, movimientos }
}

export const useData = create<DataState>()(
  persist(
    (set, get) => {
      /** Modifica los datos que se están viendo y lo apunta en el historial (para poder deshacerlo). */
      const updateDs = (fn: (ds: Dataset) => Dataset, etiqueta: string, juntar = false) =>
        set((s) => {
          const slot = currentSlot(s)
          const antes = slot === 'ejemplo' ? s.ejemplo! : s.datos
          const despues = fn(antes)
          if (despues === antes) return {}
          if (lote) {
            if (!lote.antes) {
              lote.antes = antes
              lote.slot = slot
            }
          } else apuntarPaso(slot, antes, despues, etiqueta, juntar)
          return slot === 'ejemplo' ? { ejemplo: despues } : { datos: despues }
        })

      /** Deshacer o rehacer: aplica el último paso de los datos que se están viendo. */
      const moverHistorial = (cual: 'deshacer' | 'rehacer'): string | null => {
        const s = get()
        const slot = currentSlot(s)
        const h = useHistorial.getState()
        const paso = ultimoPaso(cual === 'deshacer' ? h.deshacer : h.rehacer, slot)
        if (!paso) return null
        const actual = slot === 'ejemplo' ? s.ejemplo! : s.datos
        const nuevo = sinHuerfanos(aplicarParche(actual, paso.parche))
        const inverso = diferencia(actual, nuevo)
        if (cual === 'deshacer') h.deshecho(paso, inverso)
        else h.rehecho(paso, inverso)
        set(slot === 'ejemplo' ? { ejemplo: nuevo } : { datos: nuevo })
        // Si ha vuelto una transferencia mensual, se apuntan los meses que falten.
        get().aplicarProgramadas()
        return paso.etiqueta
      }

      return {
        ...initialData(),

        setHideAmounts: (v) => set({ hideAmounts: v }),

        // ── Titulares ───────────────────────────────────────────────────────
        addTitular: ({ codigo, nombre }) => {
          const id = uid()
          updateDs(
            (ds) => ({
              ...ds,
              titulares: [
                ...ds.titulares,
                { id, codigo: codigo.trim(), nombre: nombre.trim() || defaultTitularName(ds.titulares.length + 1), createdAt: nowStamp() },
              ],
            }),
            `Nuevo titular «${nombre.trim()}»`,
          )
          return id
        },
        updateTitular: (id, data) =>
          updateDs(
            (ds) => ({
              ...ds,
              titulares: ds.titulares.map((t) => {
                if (t.id !== id) return t
                const next: Titular = {
                  ...t,
                  ...(data.codigo !== undefined ? { codigo: data.codigo.trim() } : {}),
                  ...(data.nombre !== undefined ? { nombre: data.nombre.trim() || t.nombre } : {}),
                }
                return JSON.stringify(next) === JSON.stringify(t) ? t : next
              }),
            }),
            'Cambio en los datos del titular',
          ),
        removeTitular: (id) =>
          updateDs((ds) => {
            if (ds.titulares.length <= 1 || !ds.titulares.some((t) => t.id === id)) return ds
            const cuentas = new Set(ds.cuentas.filter((c) => c.titularId === id).map((c) => c.id))
            const productos = new Set(ds.productos.filter((p) => p.titularId === id).map((p) => p.id))
            return { ...removeEntities(ds, cuentas, productos), titulares: ds.titulares.filter((t) => t.id !== id) }
          }, 'Titular eliminado'),
        makePrincipal: (id) =>
          updateDs((ds) => {
            const t = ds.titulares.find((x) => x.id === id)
            return t && ds.titulares[0]?.id !== id ? { ...ds, titulares: [t, ...ds.titulares.filter((x) => x.id !== id)] } : ds
          }, 'Cambio del titular principal'),

        // ── Cuentas ─────────────────────────────────────────────────────────
        addCuenta: (data) => {
          const id = uid()
          updateDs(
            (ds) => ({ ...ds, cuentas: [...ds.cuentas, { ...data, nombre: data.nombre.trim(), id, createdAt: nowStamp() }] }),
            `Nueva cuenta «${data.nombre.trim()}»`,
          )
          return id
        },
        updateCuenta: (id, data) =>
          updateDs(
            (ds) => ({
              ...ds,
              cuentas: ds.cuentas.map((c) => {
                if (c.id !== id) return c
                const next: Cuenta = { ...c, ...data }
                return JSON.stringify(next) === JSON.stringify(c) ? c : next
              }),
            }),
            'Cuenta cambiada',
          ),
        removeCuenta: (id) => updateDs((ds) => removeEntities(ds, new Set([id]), new Set()), 'Cuenta eliminada'),
        crearCuentaPrincipal: (titularId) => {
          const ds = currentDataset(get())
          const existing = cuentaPrincipal(ds.cuentas, titularId)
          if (existing) return existing.id
          const id = uid()
          updateDs((d) => ({ ...d, cuentas: [nuevaCuentaMyInvestor(titularId, id, nowStamp()), ...d.cuentas] }), 'Cuenta «MyInvestor» creada')
          return id
        },

        // ── Productos ───────────────────────────────────────────────────────
        addProducto: (data) => {
          const id = uid()
          updateDs(
            (ds) => ({
              ...ds,
              productos: [...ds.productos, { ...data, nombre: data.nombre.trim(), id, valoraciones: [], createdAt: nowStamp() }],
            }),
            `Nueva inversión «${data.nombre.trim()}»`,
          )
          return id
        },
        updateProducto: (id, data) =>
          updateDs(
            (ds) => ({
              ...ds,
              productos: ds.productos.map((p) => {
                if (p.id !== id) return p
                const next: Producto = { ...p, ...data }
                return JSON.stringify(next) === JSON.stringify(p) ? p : next
              }),
            }),
            'Inversión cambiada',
          ),
        removeProducto: (id) => updateDs((ds) => removeEntities(ds, new Set(), new Set([id])), 'Inversión eliminada'),
        reorderProductos: (ids) => updateDs((ds) => ({ ...ds, productos: applyOrder(ds.productos, ids) }), 'Orden de las inversiones', true),
        addValoracion: (productoId, data) =>
          updateDs(
            (ds) => ({
              ...ds,
              productos: ds.productos.map((p) =>
                p.id === productoId
                  ? { ...p, valoraciones: [...p.valoraciones, { ...data, valor: round2(data.valor), id: uid(), createdAt: nowStamp() }] }
                  : p,
              ),
            }),
            'Rentabilidad cambiada',
          ),
        removeValoracion: (productoId, valoracionId) =>
          updateDs(
            (ds) => ({
              ...ds,
              productos: ds.productos.map((p) => (p.id === productoId ? { ...p, valoraciones: p.valoraciones.filter((v) => v.id !== valoracionId) } : p)),
            }),
            'Actualización de valor eliminada',
          ),
        setValores: (fecha, valores) =>
          updateDs((ds) => {
            if (valores.length === 0) return ds
            const porId = new Map(valores.map((v) => [v.productoId, round2(v.valor)]))
            const stamp = nowStamp()
            return {
              ...ds,
              productos: ds.productos.map((p) => {
                const valor = porId.get(p.id)
                if (valor === undefined) return p
                // Si ya hay un valor de mercado de ese mismo día, se cambia (no se apila otro).
                const otros = p.valoraciones.filter((v) => !(v.fecha === fecha && v.modo === 'valor'))
                return {
                  ...p,
                  valoraciones: [...otros, { id: uid(), fecha, modo: 'valor' as const, valor, porcentaje: 0, createdAt: stamp }],
                }
              }),
            }
          }, 'Valores de hoy'),

        cambiarTae: (productoId, desde, tae) =>
          updateDs(
            (ds) => ({
              ...ds,
              productos: ds.productos.map((p) => {
                if (p.id !== productoId) return p
                if (desde === null) return { ...p, tae }
                // Un cambio por fecha: si ya había uno ese día, se sustituye.
                const otros = (p.cambiosTae ?? []).filter((c) => c.desde !== desde)
                const cambiosTae = [...otros, { id: uid(), desde, tae, createdAt: nowStamp() }].sort((a, b) => a.desde.localeCompare(b.desde))
                return { ...p, cambiosTae }
              }),
            }),
            'Interés cambiado',
          ),
        removeCambioTae: (productoId, cambioId) =>
          updateDs(
            (ds) => ({
              ...ds,
              productos: ds.productos.map((p) => {
                if (p.id !== productoId || !p.cambiosTae?.some((c) => c.id === cambioId)) return p
                const cambiosTae = p.cambiosTae.filter((c) => c.id !== cambioId)
                const next: Producto = { ...p, cambiosTae }
                if (cambiosTae.length === 0) delete next.cambiosTae
                return next
              }),
            }),
            'Cambio de interés eliminado',
          ),

        // ── Movimientos ─────────────────────────────────────────────────────
        addMovimiento: (data) => {
          const id = uid()
          const stamp = nowStamp()
          updateDs(
            (ds) => ({
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
          }),
            'Nuevo movimiento',
          )
          return id
        },
        updateMovimiento: (id, data) =>
          updateDs(
            (ds) => ({
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
          }),
            'Movimiento cambiado',
          ),
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
          }, 'Movimiento borrado'),

        // ── Transferencias mensuales ───────────────────────────────────────
        addProgramada: (data) => {
          const id = uid()
          const stamp = nowStamp()
          updateDs(
            (ds) =>
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
            'Transferencia mensual programada',
          )
          return id
        },
        updateProgramada: (id, data) =>
          updateDs((ds) => {
            const old = ds.programadas.find((p) => p.id === id)
            if (!old) return ds
            const p: Programada = { ...old, ...data, importe: round2(data.importe), concepto: data.concepto.trim(), updatedAt: nowStamp() }
            return sincronizarProgramada({ ...ds, programadas: ds.programadas.map((x) => (x.id === id ? p : x)) }, p, todayISO())
          }, 'Transferencia mensual cambiada'),
        removeProgramada: (id) =>
          updateDs(
            (ds) => ({
              ...ds,
              programadas: ds.programadas.filter((p) => p.id !== id),
              movimientos: ds.movimientos.filter((m) => m.programadaId !== id),
            }),
            'Transferencia mensual eliminada',
          ),
        aplicarProgramadas: () => {
          const today = todayISO()
          const s = get()
          const datos = aplicarProgramadas(s.datos, today)
          const ejemplo = s.ejemplo ? aplicarProgramadas(s.ejemplo, today) : null
          if (datos !== s.datos || ejemplo !== s.ejemplo) set({ datos, ejemplo })
        },

        // ── Datos ───────────────────────────────────────────────────────────
        loadDemo: () => {
          useHistorial.getState().olvidar('ejemplo')
          set({ ejemplo: buildDemoDataset(todayISO()), verEjemplo: true })
        },
        setVerEjemplo: (v) => set((s) => ({ verEjemplo: v && !!s.ejemplo })),
        removeDemo: () => {
          useHistorial.getState().olvidar('ejemplo')
          set({ ejemplo: null, verEjemplo: false })
        },
        // Se empieza de cero, como al instalar: el titular principal vuelve a tener su «MyInvestor».
        // (Se puede deshacer.)
        clearData: () => updateDs((ds) => conCuentaPrincipal(emptyDataset(ds.titulares), uid, nowStamp()), 'Datos borrados'),
        // Borrarlo todo también borra el historial: no queda nada en este dispositivo.
        resetAll: () => {
          useHistorial.getState().olvidar()
          set({ ...initialData() })
        },
        importData: (data) => {
          useHistorial.getState().olvidar('datos')
          set({ version: DATA_VERSION, datos: data.datos, verEjemplo: false, hideAmounts: data.hideAmounts })
        },

        deshacer: () => moverHistorial('deshacer'),
        rehacer: () => moverHistorial('rehacer'),
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
