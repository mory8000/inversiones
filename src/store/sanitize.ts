// Validación de los datos guardados o importados (copias de seguridad).
//
// Va en un módulo aparte a propósito: el store se hidrata de forma síncrona al
// crearse, así que estas funciones tienen que estar inicializadas antes.

import type { CambioTae, Cuenta, Dataset, EntityRef, Movimiento, PersistedData, Producto, Programada, Titular, Workspace } from '../types'
import { isValidISODate, todayISO } from '../lib/dates'
import { buildDemoDataset } from '../lib/demo'
import { nowStamp, uid } from '../lib/id'
import { inferMovementType } from '../lib/meta'
import { conCuentaPrincipal, defaultTitularName, esFondoAhorro } from '../lib/titulares'

/**
 * Versión del formato de datos.
 * - 1: un solo titular («Titular principal»).
 * - 2: dos titulares, cada uno en su propio espacio (se elegía cuál ver).
 * - 3: todos los titulares a la vez; cada cuenta y producto tiene su dueño, puede haber
 *      movimientos entre titulares y transferencias mensuales. El ejemplo va aparte.
 * - 4: cuentas con saldo (como «MyInvestor», suman en el patrimonio) y cuentas externas
 *      (de donde viene el dinero). El titular principal tiene su cuenta «MyInvestor».
 *      Los productos se guardan en el orden que elige el usuario.
 * - 5: TOTAL de Inicio: titulares, productos y cuentas pueden quedar fuera (`fueraDelTotal`;
 *      «Fondo ahorro» queda fuera solo). Los depósitos pueden cambiar de interés
 *      (`cambiosTae`).
 */
export const DATA_VERSION = 5

/** Nombre del único titular que creaba la versión 1. */
const V1_DEFAULT_NAME = 'Titular principal'

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const str = (v: unknown, fallback = ''): string => (typeof v === 'string' ? v : fallback)
const num = (v: unknown, fallback = 0): number => (typeof v === 'number' && Number.isFinite(v) ? v : fallback)
const arr = (v: unknown): Record<string, unknown>[] => (Array.isArray(v) ? v.filter(isObj) : [])
const isRef = (v: unknown): v is EntityRef => isObj(v) && (v.kind === 'cuenta' || v.kind === 'producto') && typeof v.id === 'string'
const isMonth = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(v)
const TIPOS = ['deposito', 'fondo', 'cartera', 'plan', 'acciones', 'otro']

type RawTitular = Titular & { demo: boolean }

function sanitizeTitulares(raw: unknown): RawTitular[] {
  const seen = new Set<string>()
  return arr(raw)
    .filter((t) => typeof t.id === 'string' && !seen.has(t.id) && !!seen.add(t.id))
    .map((t) => ({
      id: t.id as string,
      codigo: str(t.codigo),
      nombre: str(t.nombre, 'Titular').trim() || 'Titular',
      ...fuera(t),
      createdAt: str(t.createdAt, nowStamp()),
      demo: t.demo === true,
    }))
}

/** `fueraDelTotal` solo se guarda cuando es `true`. */
const fuera = (x: Record<string, unknown> | { fueraDelTotal?: boolean }): { fueraDelTotal?: true } => (x.fueraDelTotal === true ? { fueraDelTotal: true } : {})

const cleanTitular = ({ id, codigo, nombre, fueraDelTotal, createdAt }: RawTitular | Titular): Titular => ({
  id,
  codigo,
  nombre,
  ...fuera({ fueraDelTotal }),
  createdAt,
})

function sanitizeCuenta(c: Record<string, unknown>, titularId: string): Cuenta {
  return {
    id: str(c.id, uid()),
    titularId,
    nombre: str(c.nombre, 'Cuenta'),
    entidad: str(c.entidad),
    iban: str(c.iban),
    color: str(c.color, '#0EA5E9'),
    notas: str(c.notas),
    // Hasta la versión 3 todas las cuentas eran «de dónde sale el dinero»: externas.
    externa: c.externa !== false,
    ...fuera(c),
    createdAt: str(c.createdAt, nowStamp()),
  }
}

function sanitizeProducto(p: Record<string, unknown>, titularId: string): Producto {
  return {
    id: str(p.id, uid()),
    titularId,
    tipo: (TIPOS.includes(str(p.tipo)) ? p.tipo : 'otro') as Producto['tipo'],
    nombre: str(p.nombre, 'Producto'),
    entidad: str(p.entidad),
    isin: str(p.isin),
    notas: str(p.notas),
    tae: typeof p.tae === 'number' && Number.isFinite(p.tae) ? p.tae : null,
    ...cambiosTae(p.cambiosTae),
    vencimiento: typeof p.vencimiento === 'string' && p.vencimiento ? p.vencimiento : null,
    valoraciones: arr(p.valoraciones).map((v) => ({
      id: str(v.id, uid()),
      fecha: str(v.fecha, todayISO()),
      modo: v.modo === 'valor' ? ('valor' as const) : ('porcentaje' as const),
      valor: num(v.valor),
      porcentaje: num(v.porcentaje),
      createdAt: str(v.createdAt, nowStamp()),
    })),
    ...fuera(p),
    createdAt: str(p.createdAt, nowStamp()),
  }
}

/** Cambios de interés de un depósito (solo se guardan si hay alguno). */
function cambiosTae(raw: unknown): { cambiosTae?: CambioTae[] } {
  const list = arr(raw)
    .filter((c) => isValidISODate(str(c.desde)) && typeof c.tae === 'number' && Number.isFinite(c.tae))
    .map((c) => ({ id: str(c.id, uid()), desde: str(c.desde), tae: c.tae as number, createdAt: str(c.createdAt, nowStamp()) }))
  return list.length ? { cambiosTae: uniqueById(list) } : {}
}

function sanitizeMovimientos(raw: unknown): Movimiento[] {
  return arr(raw)
    .filter((m) => isRef(m.origen) && isRef(m.destino) && typeof m.importe === 'number' && typeof m.fecha === 'string')
    .map((m) => {
      const origen = m.origen as EntityRef
      const destino = m.destino as EntityRef
      const mov: Movimiento = {
        id: str(m.id, uid()),
        tipo: inferMovementType(origen.kind, destino.kind),
        fecha: str(m.fecha),
        origen: { kind: origen.kind, id: origen.id },
        destino: { kind: destino.kind, id: destino.id },
        importe: Math.abs(num(m.importe)),
        concepto: str(m.concepto),
        createdAt: str(m.createdAt, nowStamp()),
        updatedAt: str(m.updatedAt, nowStamp()),
      }
      if (typeof m.programadaId === 'string' && isMonth(m.programadaMes)) {
        mov.programadaId = m.programadaId
        mov.programadaMes = m.programadaMes
        if (m.editado === true) mov.editado = true
      }
      return mov
    })
}

function sanitizeProgramadas(raw: unknown): Programada[] {
  return arr(raw)
    .filter((p) => isRef(p.origen) && isRef(p.destino) && typeof p.importe === 'number' && p.importe > 0 && isValidISODate(str(p.inicio)))
    .map((p) => {
      const origen = p.origen as EntityRef
      const destino = p.destino as EntityRef
      const fin = str(p.fin)
      return {
        id: str(p.id, uid()),
        origen: { kind: origen.kind, id: origen.id },
        destino: { kind: destino.kind, id: destino.id },
        importe: num(p.importe),
        inicio: str(p.inicio),
        fin: isValidISODate(fin) ? fin : null,
        concepto: str(p.concepto),
        excluidos: (Array.isArray(p.excluidos) ? p.excluidos : []).filter(isMonth),
        createdAt: str(p.createdAt, nowStamp()),
        updatedAt: str(p.updatedAt, nowStamp()),
      }
    })
}

/** Quita duplicados por id (se queda con el primero). */
function uniqueById<T extends { id: string }>(items: T[]): T[] {
  const seen = new Set<string>()
  return items.filter((x) => !seen.has(x.id) && !!seen.add(x.id))
}

/** Conjunto de datos de la versión 3. */
function sanitizeDataset(raw: unknown): Dataset | null {
  if (!isObj(raw)) return null
  const titulares = sanitizeTitulares(raw.titulares).map(cleanTitular)
  if (titulares.length === 0) return null
  const known = new Set(titulares.map((t) => t.id))
  const owner = (v: unknown) => (typeof v === 'string' && known.has(v) ? v : titulares[0].id)
  return {
    titulares,
    cuentas: uniqueById(arr(raw.cuentas).map((c) => sanitizeCuenta(c, owner(c.titularId)))),
    productos: uniqueById(arr(raw.productos).map((p) => sanitizeProducto(p, owner(p.titularId)))),
    movimientos: uniqueById(sanitizeMovimientos(raw.movimientos)),
    programadas: uniqueById(sanitizeProgramadas(raw.programadas)),
  }
}

// ── Versiones 1 y 2: un espacio de trabajo por titular ─────────────────────

/** Junta los espacios de varios titulares en un único conjunto (cada cosa con su dueño). */
function mergeWorkspaces(titulares: Titular[], workspaces: Record<string, unknown>): Dataset {
  const used = new Set<string>()
  const ds: Dataset = { titulares, cuentas: [], productos: [], movimientos: [], programadas: [] }
  for (const t of titulares) {
    const w = isObj(workspaces[t.id]) ? (workspaces[t.id] as Record<string, unknown>) : {}
    // Si algún id se repite entre titulares (no debería), se cambia para no mezclar datos.
    const remap = new Map<string, string>()
    const fresh = (key: string, id: string) => {
      if (!used.has(key)) {
        used.add(key)
        return id
      }
      const nid = uid()
      remap.set(key, nid)
      used.add(`${key.split(':')[0]}:${nid}`)
      return nid
    }
    for (const c of arr(w.cuentas).map((x) => sanitizeCuenta(x, t.id))) ds.cuentas.push({ ...c, id: fresh(`cuenta:${c.id}`, c.id) })
    for (const p of arr(w.productos).map((x) => sanitizeProducto(x, t.id))) ds.productos.push({ ...p, id: fresh(`producto:${p.id}`, p.id) })
    const fix = (r: EntityRef): EntityRef => ({ kind: r.kind, id: remap.get(`${r.kind}:${r.id}`) ?? r.id })
    for (const m of sanitizeMovimientos(w.movimientos)) {
      ds.movimientos.push({ ...m, id: fresh(`movimiento:${m.id}`, m.id), origen: fix(m.origen), destino: fix(m.destino) })
    }
  }
  return ds
}

/**
 * Versión 1 (un solo titular): se completa con un segundo titular vacío. El titular por
 * defecto «Titular principal» pasa a llamarse «Titular 1» para que haga pareja con «Titular 2».
 */
function upgradeV1(reales: RawTitular[]): RawTitular[] {
  const out = reales.map((t, _, all) =>
    all.length === 1 && t.nombre === V1_DEFAULT_NAME && !t.codigo ? { ...t, nombre: defaultTitularName(1) } : t,
  )
  while (out.length < 2) out.push({ id: uid(), codigo: '', nombre: defaultTitularName(out.length + 1), createdAt: nowStamp(), demo: false })
  return out
}

function fromLegacy(raw: Record<string, unknown>): Omit<PersistedData, 'version' | 'hideAmounts'> | null {
  const all = sanitizeTitulares(raw.titulares)
  if (all.length === 0) return null
  const fromV1 = !(typeof raw.version === 'number' && raw.version >= 2)
  let reales = all.filter((t) => !t.demo)
  const demo = all.filter((t) => t.demo)
  if (fromV1) reales = upgradeV1(reales)
  if (reales.length === 0) reales = upgradeV1([])
  const workspaces = isObj(raw.workspaces) ? raw.workspaces : {}
  const datos = mergeWorkspaces(reales.map(cleanTitular), workspaces)
  const ejemplo = demo.length ? mergeWorkspaces(demo.map(cleanTitular), workspaces) : null
  const active = str(raw.activeTitularId)
  return { datos, ejemplo, verEjemplo: !!ejemplo && demo.some((t) => t.id === active) }
}

/**
 * Devuelve los datos limpios en el formato actual, o `null` si no son válidos.
 * Admite lo guardado por cualquier versión y las copias de seguridad.
 */
export function sanitizeData(raw: unknown): PersistedData | null {
  if (!isObj(raw)) return null
  const hideAmounts = raw.hideAmounts === true
  let data: Omit<PersistedData, 'version' | 'hideAmounts'> | null = null
  if (isObj(raw.datos)) {
    const datos = sanitizeDataset(raw.datos)
    if (!datos) return null
    const ejemplo = sanitizeDataset(raw.ejemplo)
    data = { datos, ejemplo, verEjemplo: !!ejemplo && raw.verEjemplo === true }
  } else {
    data = fromLegacy(raw)
  }
  if (!data) return null
  const version = typeof raw.version === 'number' ? raw.version : 0
  if (version < 4) data = upgradeV4(data)
  if (version < 5) data = upgradeV5(data)
  return { version: DATA_VERSION, ...data, hideAmounts }
}

/**
 * Versión 4: el titular principal pasa a tener su cuenta principal con saldo («MyInvestor»)
 * y el ejemplo se vuelve a crear con las cuentas nuevas (es ficticio).
 */
function upgradeV4(data: Omit<PersistedData, 'version' | 'hideAmounts'>): Omit<PersistedData, 'version' | 'hideAmounts'> {
  const stamp = nowStamp()
  return {
    ...data,
    datos: conCuentaPrincipal(data.datos, uid, stamp),
    ejemplo: data.ejemplo ? buildDemoDataset(todayISO()) : null,
  }
}

/**
 * Versión 5: lo que se llame «Fondo ahorro» (un titular, un producto o una cuenta) queda fuera
 * del TOTAL de Inicio. Si es un titular, queda fuera entero (con todo lo suyo).
 * El ejemplo se vuelve a crear (ahora tiene un «Fondo ahorro» y un depósito con cambio de interés).
 */
export function marcarFondoAhorro(ds: Dataset): Dataset {
  const titulares = ds.titulares.map((t) => (esFondoAhorro(t.nombre) ? { ...t, fueraDelTotal: true } : t))
  const fueraEntero = new Set(titulares.filter((t) => t.fueraDelTotal).map((t) => t.id))
  const marca = <T extends { titularId: string; nombre: string; fueraDelTotal?: boolean }>(x: T): T =>
    !fueraEntero.has(x.titularId) && esFondoAhorro(x.nombre) ? { ...x, fueraDelTotal: true } : x
  return { ...ds, titulares, cuentas: ds.cuentas.map(marca), productos: ds.productos.map(marca) }
}

function upgradeV5(data: Omit<PersistedData, 'version' | 'hideAmounts'>): Omit<PersistedData, 'version' | 'hideAmounts'> {
  return { ...data, datos: marcarFondoAhorro(data.datos), ejemplo: data.ejemplo ? buildDemoDataset(todayISO()) : null }
}

/** Resumen de un conjunto de datos (para confirmar antes de restaurar una copia). */
export function describeDataset(ds: Workspace & { titulares: Titular[] }): { titulares: number; movimientos: number } {
  return { titulares: ds.titulares.length, movimientos: ds.movimientos.length }
}
