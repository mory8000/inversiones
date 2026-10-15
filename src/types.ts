// ─────────────────────────────────────────────────────────────────────────────
// Modelo de datos de la app.
//
// Mantiene la lógica del Excel original:
//   · Cada movimiento tiene un origen ("De") y un destino ("A").
//   · Tipos de producto: Depósitos, Fondos y Carteras (+ planes, acciones, otros).
//   · Por producto: Invertido, Reembolso, Traspaso, %, € y Saldo, donde
//       Saldo = (Invertido − Reembolso − Traspaso) × (1 + %)
//
// Varios titulares, vistos a la vez: cada cuenta y cada producto tiene un dueño
// (`titularId`). Un movimiento puede ir de un titular a otro; el dinero cuenta
// siempre para el dueño de lo que lo recibe (un producto o una cuenta con saldo),
// nunca para quien lo envía.
//
// El orden de `productos` es el que elige el usuario para ver sus inversiones.
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

/** Tipo tal y como se muestra: además de los cuatro anteriores, «entre titulares» (de un titular a otro). */
export type MovementKind = MovementType | 'entreTitulares'

export type EntityKind = 'cuenta' | 'producto'

export interface EntityRef {
  kind: EntityKind
  id: string
}

export interface Titular {
  id: string
  codigo: string
  nombre: string
  createdAt: string
}

/**
 * Cuenta bancaria: de dónde sale el dinero y a dónde vuelve. Hay dos clases:
 *  - Con saldo (`externa: false`), como «MyInvestor»: el dinero que hay en ella es del
 *    titular y suma en su patrimonio. La app calcula el saldo con lo que entra y sale.
 *  - Externa (`externa: true`), p. ej. la cuenta nómina de otro banco: solo indica de dónde
 *    viene el dinero (aportaciones) o a dónde va. No lleva saldo ni suma en el patrimonio.
 */
export interface Cuenta {
  id: string
  /** Titular al que pertenece. */
  titularId: string
  nombre: string
  entidad: string
  iban: string
  color: string
  notas: string
  /** `true`: cuenta externa (otro banco). `false`: cuenta con saldo (como MyInvestor). */
  externa: boolean
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
  /** Titular al que pertenece (para quien cuenta lo invertido). */
  titularId: string
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
  /** Si lo ha apuntado una transferencia mensual: cuál y de qué mes (AAAA-MM). */
  programadaId?: string
  programadaMes?: string
  /** Movimiento de una transferencia mensual cambiado a mano (ya no se actualiza solo). */
  editado?: boolean
  createdAt: string
  updatedAt: string
}

/**
 * Transferencia mensual: la app apunta sola el movimiento de cada mes
 * (p. ej. de una cuenta del titular 1 a un fondo del titular 2).
 */
export interface Programada {
  id: string
  origen: EntityRef
  destino: EntityRef
  importe: number
  /** Fecha de la primera (AAAA-MM-DD). Las siguientes, el mismo día de cada mes. */
  inicio: string
  /** Última fecha posible (incluida) o `null` si no tiene fin. */
  fin: string | null
  concepto: string
  /** Meses (AAAA-MM) borrados a mano: no se vuelven a apuntar. */
  excluidos: string[]
  createdAt: string
  updatedAt: string
}

/** Cuentas, productos y movimientos (de uno o de todos los titulares). */
export interface Workspace {
  cuentas: Cuenta[]
  productos: Producto[]
  movimientos: Movimiento[]
}

/** Todos los datos: titulares (el primero es el principal), sus cuentas, productos, movimientos y transferencias mensuales. */
export interface Dataset extends Workspace {
  titulares: Titular[]
  programadas: Programada[]
}

export interface PersistedData {
  version: number
  /** Tus datos. */
  datos: Dataset
  /** Datos de ejemplo (ficticios), aparte de los tuyos. */
  ejemplo: Dataset | null
  /** Si se están viendo los datos de ejemplo. */
  verEjemplo: boolean
  hideAmounts: boolean
}
