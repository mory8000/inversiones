// Historial para «Deshacer» y «Rehacer».
//
// Cada cambio que hace el usuario (apuntar, cambiar o borrar un movimiento, crear una
// cuenta, cambiar un %…) se guarda como un «paso»: solo lo necesario para volver atrás
// (cómo estaba antes cada cosa que cambió). Así ocupa poco y se puede guardar en este
// dispositivo, aparte de los datos: «Deshacer» sigue funcionando aunque se cierre la app.

import { create } from 'zustand'
import type { Dataset } from '../types'
import { DATA_VERSION } from './sanitize'

export const HISTORY_KEY = 'mis-inversiones-deshacer'
/** Pasos que se recuerdan como mucho. */
const MAX_PASOS = 30
/** Tamaño máximo (aprox.) de lo que se guarda, para no llenar el almacenamiento del navegador. */
const MAX_BYTES = 900_000
/** Pasos iguales seguidos (p. ej. al ordenar las inversiones) se juntan en uno si van en este tiempo. */
const JUNTAR_MS = 120_000

/** Qué datos cambió: los tuyos o los de ejemplo. */
export type Slot = 'datos' | 'ejemplo'

type Coleccion = 'titulares' | 'cuentas' | 'productos' | 'movimientos' | 'programadas'
const COLECCIONES: Coleccion[] = ['titulares', 'cuentas', 'productos', 'movimientos', 'programadas']
/** En estas listas importa el orden (el primer titular es el principal; las inversiones van en el orden elegido). */
const CON_ORDEN = new Set<Coleccion>(['titulares', 'cuentas', 'productos', 'programadas'])

type Item = { id: string }

/**
 * Lo necesario para volver atrás, lista por lista: cómo era antes cada elemento que cambió
 * (`null` si no existía) y, si cambió el orden, el orden de antes.
 */
export type Parche = Partial<Record<Coleccion, { antes: Record<string, Item | null>; orden?: string[] }>>

export interface Paso {
  id: string
  /** Lo que se hizo, en palabras («Aportación de 500,00 € a «Fondo X»»). */
  etiqueta: string
  at: string
  slot: Slot
  parche: Parche
  /** Se puede juntar con el siguiente si es igual (p. ej. mover inversiones al ordenar). */
  juntar?: boolean
}

/** Parche para pasar de `despues` a `antes` (lo que hay que poner para deshacer el cambio). */
export function diferencia(antes: Dataset, despues: Dataset): Parche | null {
  const parche: Parche = {}
  for (const col of COLECCIONES) {
    const a = antes[col] as Item[]
    const d = despues[col] as Item[]
    if (a === d) continue
    const mapA = new Map(a.map((x) => [x.id, x]))
    const mapD = new Map(d.map((x) => [x.id, x]))
    const prev: Record<string, Item | null> = {}
    for (const [id, x] of mapA) if (mapD.get(id) !== x) prev[id] = x
    for (const id of mapD.keys()) if (!mapA.has(id)) prev[id] = null
    const mismoOrden = a.length === d.length && a.every((x, i) => x.id === d[i].id)
    const hayCambios = Object.keys(prev).length > 0
    if (!hayCambios && mismoOrden) continue
    parche[col] = { antes: prev, ...(CON_ORDEN.has(col) && !mismoOrden ? { orden: a.map((x) => x.id) } : {}) }
  }
  return Object.keys(parche).length ? parche : null
}

const own = (o: object, k: string) => Object.prototype.hasOwnProperty.call(o, k)

/** Aplica un parche: deja cada elemento como estaba (y el orden, si se guardó). */
export function aplicarParche(ds: Dataset, parche: Parche): Dataset {
  const out: Dataset = { ...ds }
  for (const col of COLECCIONES) {
    const c = parche[col]
    if (!c) continue
    const antes = c.antes
    let list = (ds[col] as Item[])
      .filter((x) => !(own(antes, x.id) && antes[x.id] === null))
      .map((x) => (own(antes, x.id) && antes[x.id] ? antes[x.id]! : x))
    const presentes = new Set(list.map((x) => x.id))
    for (const [id, x] of Object.entries(antes)) if (x && !presentes.has(id)) list.push(x)
    if (c.orden) {
      const pos = new Map(c.orden.map((id, i) => [id, i]))
      list = [...list].sort((x, y) => (pos.get(x.id) ?? Number.MAX_SAFE_INTEGER) - (pos.get(y.id) ?? Number.MAX_SAFE_INTEGER))
    }
    ;(out as unknown as Record<Coleccion, Item[]>)[col] = list
  }
  return out
}

/** Junta dos parches seguidos (primero `viejo`, luego `nuevo`) en uno que deshace los dos. */
function juntarParches(viejo: Parche, nuevo: Parche): Parche {
  const out: Parche = { ...nuevo }
  for (const col of COLECCIONES) {
    const v = viejo[col]
    if (!v) continue
    const n = nuevo[col]
    out[col] = { antes: { ...(n?.antes ?? {}), ...v.antes }, ...(v.orden || n?.orden ? { orden: v.orden ?? n!.orden } : {}) }
  }
  return out
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

/** ¿Lo leído del almacenamiento es un paso válido? */
function esPaso(p: unknown): p is Paso {
  if (!isObj(p) || typeof p.id !== 'string' || typeof p.etiqueta !== 'string' || typeof p.at !== 'string') return false
  if (p.slot !== 'datos' && p.slot !== 'ejemplo') return false
  if (!isObj(p.parche)) return false
  return Object.entries(p.parche).every(
    ([col, c]) =>
      (COLECCIONES as string[]).includes(col) &&
      isObj(c) &&
      isObj(c.antes) &&
      Object.entries(c.antes).every(([id, x]) => x === null || (isObj(x) && x.id === id)) &&
      (c.orden === undefined || (Array.isArray(c.orden) && c.orden.every((x) => typeof x === 'string'))),
  )
}

function cargar(): Paso[] {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(HISTORY_KEY) : null
    if (!raw) return []
    const j: unknown = JSON.parse(raw)
    // Si la app ha cambiado el formato de los datos, el historial anterior ya no sirve.
    if (!isObj(j) || j.version !== DATA_VERSION || !Array.isArray(j.pasos)) return []
    return j.pasos.filter(esPaso).slice(-MAX_PASOS)
  } catch {
    return []
  }
}

function guardar(pasos: Paso[]) {
  try {
    if (pasos.length === 0) localStorage.removeItem(HISTORY_KEY)
    else localStorage.setItem(HISTORY_KEY, JSON.stringify({ version: DATA_VERSION, pasos }))
  } catch {
    // Sin espacio o sin almacenamiento: el historial se queda solo en memoria.
  }
}

/** Quita los pasos más antiguos si son demasiados o si ocupan demasiado. */
function recortar(pasos: Paso[]): Paso[] {
  let out = pasos.slice(-MAX_PASOS)
  while (out.length > 1 && JSON.stringify(out).length > MAX_BYTES) out = out.slice(1)
  return out
}

interface HistorialState {
  /** Pasos que se pueden deshacer (el último es el más reciente). */
  deshacer: Paso[]
  /** Pasos deshechos que se pueden rehacer. */
  rehacer: Paso[]
  /** Un cambio nuevo: se puede deshacer y ya no se puede rehacer lo deshecho. */
  nuevo: (paso: Paso) => void
  /** Se ha deshecho `paso`: pasa a «rehacer» con el parche para volver a hacerlo. */
  deshecho: (paso: Paso, inverso: Parche | null) => void
  /** Se ha rehecho `paso`: vuelve a «deshacer». */
  rehecho: (paso: Paso, inverso: Parche | null) => void
  /** Olvida los pasos (todos, o los de tus datos / los del ejemplo). */
  olvidar: (slot?: Slot) => void
}

export const useHistorial = create<HistorialState>()((set) => ({
  deshacer: cargar(),
  rehacer: [],
  nuevo: (paso) =>
    set((s) => {
      const last = s.deshacer[s.deshacer.length - 1]
      if (last && paso.juntar && last.juntar && last.etiqueta === paso.etiqueta && last.slot === paso.slot && Date.parse(paso.at) - Date.parse(last.at) < JUNTAR_MS) {
        return { deshacer: [...s.deshacer.slice(0, -1), { ...paso, id: last.id, parche: juntarParches(last.parche, paso.parche) }], rehacer: [] }
      }
      return { deshacer: recortar([...s.deshacer, paso]), rehacer: [] }
    }),
  deshecho: (paso, inverso) =>
    set((s) => ({
      deshacer: s.deshacer.filter((p) => p.id !== paso.id),
      rehacer: inverso ? [...s.rehacer, { ...paso, parche: inverso, juntar: false }].slice(-MAX_PASOS) : s.rehacer,
    })),
  rehecho: (paso, inverso) =>
    set((s) => ({
      rehacer: s.rehacer.filter((p) => p.id !== paso.id),
      deshacer: inverso ? recortar([...s.deshacer, { ...paso, parche: inverso, juntar: false }]) : s.deshacer,
    })),
  olvidar: (slot) =>
    set((s) => (slot ? { deshacer: s.deshacer.filter((p) => p.slot !== slot), rehacer: s.rehacer.filter((p) => p.slot !== slot) } : { deshacer: [], rehacer: [] })),
}))

// Se guarda en este dispositivo cada vez que cambia (aparte de los datos).
useHistorial.subscribe((s, prev) => {
  if (s.deshacer !== prev.deshacer) guardar(s.deshacer)
})

/** Último paso que se puede deshacer (o rehacer) de unos datos. */
export const ultimoPaso = (pasos: Paso[], slot: Slot): Paso | undefined => {
  for (let i = pasos.length - 1; i >= 0; i--) if (pasos[i].slot === slot) return pasos[i]
  return undefined
}
