// Validación de los datos guardados o importados (copias de seguridad).
//
// Va en un módulo aparte a propósito: el store se hidrata de forma síncrona al
// crearse, así que estas funciones tienen que estar inicializadas antes.

import type { Cuenta, EntityRef, Movimiento, PersistedData, Producto, Titular, Workspace } from '../types'
import { todayISO } from '../lib/dates'
import { nowStamp, uid } from '../lib/id'
import { inferMovementType } from '../lib/meta'
import { defaultTitularName } from '../lib/titulares'

/**
 * Versión del formato de datos.
 * - 1: un solo titular («Titular principal»).
 * - 2: la app trabaja con dos titulares, cada uno con sus datos por separado.
 */
export const DATA_VERSION = 2

/** Nombre del único titular que creaba la versión 1. */
const V1_DEFAULT_NAME = 'Titular principal'

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const str = (v: unknown, fallback = ''): string => (typeof v === 'string' ? v : fallback)
const num = (v: unknown, fallback = 0): number => (typeof v === 'number' && Number.isFinite(v) ? v : fallback)
const isRef = (v: unknown): v is EntityRef =>
  isObj(v) && (v.kind === 'cuenta' || v.kind === 'producto') && typeof v.id === 'string'

function sanitizeWorkspace(raw: unknown): Workspace {
  const w = isObj(raw) ? raw : {}
  const cuentas: Cuenta[] = (Array.isArray(w.cuentas) ? w.cuentas : []).filter(isObj).map((c) => ({
    id: str(c.id, uid()),
    nombre: str(c.nombre, 'Cuenta'),
    entidad: str(c.entidad),
    iban: str(c.iban),
    color: str(c.color, '#0EA5E9'),
    notas: str(c.notas),
    createdAt: str(c.createdAt, nowStamp()),
  }))
  const tipos = ['deposito', 'fondo', 'cartera', 'plan', 'acciones', 'otro']
  const productos: Producto[] = (Array.isArray(w.productos) ? w.productos : []).filter(isObj).map((p) => ({
    id: str(p.id, uid()),
    tipo: (tipos.includes(str(p.tipo)) ? p.tipo : 'otro') as Producto['tipo'],
    nombre: str(p.nombre, 'Producto'),
    entidad: str(p.entidad),
    isin: str(p.isin),
    notas: str(p.notas),
    tae: typeof p.tae === 'number' && Number.isFinite(p.tae) ? p.tae : null,
    vencimiento: typeof p.vencimiento === 'string' && p.vencimiento ? p.vencimiento : null,
    valoraciones: (Array.isArray(p.valoraciones) ? p.valoraciones : []).filter(isObj).map((v) => ({
      id: str(v.id, uid()),
      fecha: str(v.fecha, todayISO()),
      modo: v.modo === 'valor' ? ('valor' as const) : ('porcentaje' as const),
      valor: num(v.valor),
      porcentaje: num(v.porcentaje),
      createdAt: str(v.createdAt, nowStamp()),
    })),
    createdAt: str(p.createdAt, nowStamp()),
  }))
  const movimientos: Movimiento[] = (Array.isArray(w.movimientos) ? w.movimientos : [])
    .filter(isObj)
    .filter((m) => isRef(m.origen) && isRef(m.destino) && typeof m.importe === 'number' && typeof m.fecha === 'string')
    .map((m) => {
      const origen = m.origen as EntityRef
      const destino = m.destino as EntityRef
      return {
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
    })
  return { cuentas, productos, movimientos }
}

export function sanitizeData(raw: unknown): PersistedData | null {
  if (!isObj(raw)) return null
  const titulares: Titular[] = (Array.isArray(raw.titulares) ? raw.titulares : [])
    .filter(isObj)
    .filter((t) => typeof t.id === 'string')
    .map((t) => ({
      id: t.id as string,
      codigo: str(t.codigo),
      nombre: str(t.nombre, 'Titular'),
      ...(t.demo === true ? { demo: true } : {}),
      createdAt: str(t.createdAt, nowStamp()),
    }))
  if (titulares.length === 0) return null
  const wsRaw = isObj(raw.workspaces) ? raw.workspaces : {}
  const workspaces: Record<string, Workspace> = {}
  for (const t of titulares) workspaces[t.id] = sanitizeWorkspace(wsRaw[t.id])
  const active = str(raw.activeTitularId)
  const fromV1 = !(typeof raw.version === 'number' && raw.version >= 2)
  return {
    version: DATA_VERSION,
    titulares: fromV1 ? upgradeToTwoTitulares(titulares, workspaces) : titulares,
    activeTitularId: titulares.some((t) => t.id === active) ? active : titulares[0].id,
    workspaces,
    hideAmounts: raw.hideAmounts === true,
  }
}

/**
 * Datos de la versión 1 (un solo titular): se completan con un segundo titular vacío,
 * sin tocar los datos que ya había. El titular por defecto «Titular principal» pasa a
 * llamarse «Titular 1» para que haga pareja con «Titular 2». Solo se hace una vez: los
 * datos guardados ya llevan la versión 2, así que si luego se borra un titular no vuelve.
 */
function upgradeToTwoTitulares(titulares: Titular[], workspaces: Record<string, Workspace>): Titular[] {
  const demo = titulares.filter((t) => t.demo)
  const reales = titulares
    .filter((t) => !t.demo)
    .map((t, _, all) => (all.length === 1 && t.nombre === V1_DEFAULT_NAME && !t.codigo ? { ...t, nombre: defaultTitularName(1) } : t))
  while (reales.length < 2) {
    const id = uid()
    reales.push({ id, codigo: '', nombre: defaultTitularName(reales.length + 1), createdAt: nowStamp() })
    workspaces[id] = { cuentas: [], productos: [], movimientos: [] }
  }
  return [...reales, ...demo]
}
