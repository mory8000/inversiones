// ─────────────────────────────────────────────────────────────────────────────
// Modelo de datos de la app.
//
// Mantiene la lógica del Excel original:
//   · Cada movimiento tiene un origen ("De") y un destino ("A").
//   · Tipos de producto: Depósitos, Fondos y Carteras (+ planes, acciones, otros).
//   · Por producto: Invertido, Reembolso, Traspaso, %, € y Saldo, donde
//       Saldo = (Invertido − Reembolso − Traspaso) × (1 + %)
// ─────────────────────────────────────────────────────────────────────────────

export type ProductType = 'deposito' | 'fondo' | 'cartera' | 'plan' | 'acciones' | 'otro'

/**
 * El tipo de movimiento se deduce del origen y del destino:
 *  - inversion:     Cuenta   → Producto
 *  - reembolso:     Producto → Cuenta
 *  - traspaso:      Producto → Producto
 *  - transferencia: Cuenta   → Cuenta
 */
export type MovementType = 'inversion' | 'reembolso' | 'traspaso' | 'transferencia'

export type EntityKind = 'cuenta' | 'producto'

export interface EntityRef {
  kind: EntityKind
  id: string
}

export interface Titular {
  id: string
  codigo: string
  nombre: string
  /** Titular creado con datos de ejemplo. */
  demo?: boolean
  createdAt: string
}

/** Cuenta bancaria: de dónde sale el dinero y a dónde vuelve. */
export interface Cuenta {
  id: string
  nombre: string
  entidad: string
  iban: string
  color: string
  notas: string
  createdAt: string
}

/** Actualización del valor de un producto (fondos, carteras, planes…). */
export interface Valoracion {
  id: string
  /** Fecha AAAA-MM-DD */
  fecha: string
  /** 'valor': valor de mercado en €. 'porcentaje': rentabilidad en % sobre el capital. */
  modo: 'valor' | 'porcentaje'
  valor: number
  /** En puntos porcentuales (5 = 5 %). */
  porcentaje: number
  createdAt: string
}

/** Producto de inversión: depósito, fondo, cartera… */
export interface Producto {
  id: string
  tipo: ProductType
  nombre: string
  entidad: string
  isin: string
  notas: string
  /** Solo depósitos: interés anual en % (2.5 = 2,5 % TAE). */
  tae: number | null
  /** Solo depósitos: fecha de vencimiento AAAA-MM-DD. */
  vencimiento: string | null
  valoraciones: Valoracion[]
  createdAt: string
}

export interface Movimiento {
  id: string
  tipo: MovementType
  /** Fecha AAAA-MM-DD */
  fecha: string
  origen: EntityRef
  destino: EntityRef
  /** Siempre positivo. */
  importe: number
  concepto: string
  createdAt: string
  updatedAt: string
}

export interface Workspace {
  cuentas: Cuenta[]
  productos: Producto[]
  movimientos: Movimiento[]
}

export interface PersistedData {
  version: number
  titulares: Titular[]
  activeTitularId: string
  workspaces: Record<string, Workspace>
  hideAmounts: boolean
}
