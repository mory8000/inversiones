// Validación de los datos guardados o importados (copias de seguridad).
//
// Va en un módulo aparte a propósito: el store se hidrata de forma síncrona al
// crearse, así que estas funciones tienen que estar inicializadas antes.

import type { Cuenta, EntityRef, Movimiento, PersistedData, Producto, Titular, Workspace } from '../types'
import { todayISO } from '../lib/dates'
import { nowStamp, uid } from '../lib/id'
import { inferMovementType } from '../lib/meta'

export const DATA_VERSION = 1

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
  return {
    version: DATA_VERSION,
    titulares,
    activeTitularId: titulares.some((t) => t.id === active) ? active : titulares[0].id,
    workspaces,
    hideAmounts: raw.hideAmounts === true,
  }
}
