import type { EntityKind, MovementKind, MovementType, ProductType } from '../types'

export const PRODUCT_TYPES: ProductType[] = ['deposito', 'fondo', 'cartera', 'plan', 'acciones', 'otro']

export interface ProductMeta {
  label: string
  plural: string
  /** Color principal (gráficos, iconos). */
  color: string
  /** Fondo suave para iconos/insignias. */
  soft: string
  /** Texto sobre fondo suave. */
  text: string
  hint: string
}

export const PRODUCT_META: Record<ProductType, ProductMeta> = {
  deposito: {
    label: 'Depósito',
    plural: 'Depósitos',
    color: '#F59E0B',
    soft: '#FEF3C7',
    text: '#92400E',
    hint: 'Plazo fijo con interés (TAE) y fecha de vencimiento',
  },
  fondo: {
    label: 'Fondo',
    plural: 'Fondos',
    color: '#3B82F6',
    soft: '#DBEAFE',
    text: '#1E40AF',
    hint: 'Fondos de inversión e indexados',
  },
  cartera: {
    label: 'Cartera',
    plural: 'Carteras',
    color: '#8B5CF6',
    soft: '#EDE9FE',
    text: '#5B21B6',
    hint: 'Carteras gestionadas / roboadvisor',
  },
  plan: {
    label: 'Plan de pensiones',
    plural: 'Planes de pensiones',
    color: '#14B8A6',
    soft: '#CCFBF1',
    text: '#115E59',
    hint: 'Planes de pensiones individuales',
  },
  acciones: {
    label: 'Acciones / ETF',
    plural: 'Acciones y ETFs',
    color: '#F43F5E',
    soft: '#FFE4E6',
    text: '#9F1239',
    hint: 'Acciones, ETFs y otros valores',
  },
  otro: {
    label: 'Otro',
    plural: 'Otros',
    color: '#64748B',
    soft: '#E2E8F0',
    text: '#334155',
    hint: 'Cualquier otra inversión',
  },
}

export interface MovementMeta {
  label: string
  /** Frase corta que explica el movimiento. */
  description: string
  color: string
  soft: string
  text: string
  from: EntityKind
  to: EntityKind
  /** Signo con el que se muestra el importe (visto desde tus inversiones). */
  sign: '+' | '−' | ''
}

export const MOVEMENT_TYPES: MovementType[] = ['inversion', 'reembolso', 'traspaso', 'transferencia']

export const MOVEMENT_META: Record<MovementType, MovementMeta> = {
  inversion: {
    label: 'Inversión',
    description: 'De una cuenta a un producto',
    color: '#2F5BEA',
    soft: '#E3E9FD',
    text: '#1A3380',
    from: 'cuenta',
    to: 'producto',
    sign: '+',
  },
  reembolso: {
    label: 'Reembolso',
    description: 'De un producto a una cuenta',
    color: '#059669',
    soft: '#D1FAE5',
    text: '#065F46',
    from: 'producto',
    to: 'cuenta',
    sign: '−',
  },
  traspaso: {
    label: 'Traspaso',
    description: 'De un producto a otro producto',
    color: '#7C3AED',
    soft: '#EDE9FE',
    text: '#5B21B6',
    from: 'producto',
    to: 'producto',
    sign: '',
  },
  transferencia: {
    label: 'Transferencia',
    description: 'De una cuenta a otra cuenta',
    color: '#475569',
    soft: '#E2E8F0',
    text: '#1E293B',
    from: 'cuenta',
    to: 'cuenta',
    sign: '',
  },
}

/** Movimiento de un titular a otro. */
export const CROSS_META: Pick<MovementMeta, 'label' | 'description' | 'color' | 'soft' | 'text'> = {
  label: 'Entre titulares',
  description: 'De un titular a otro',
  color: '#C026D3',
  soft: '#FAE8FF',
  text: '#86198F',
}

export const MOVEMENT_KINDS: MovementKind[] = ['inversion', 'reembolso', 'traspaso', 'transferencia', 'entreTitulares']

export function kindMeta(k: MovementKind): Pick<MovementMeta, 'label' | 'description' | 'color' | 'soft' | 'text'> {
  return k === 'entreTitulares' ? CROSS_META : MOVEMENT_META[k]
}

export const ACCOUNT_COLORS = [
  '#0EA5E9',
  '#6366F1',
  '#F97316',
  '#EC4899',
  '#84CC16',
  '#06B6D4',
  '#EAB308',
  '#A855F7',
  '#EF4444',
  '#64748B',
]

export function inferMovementType(from: EntityKind, to: EntityKind): MovementType {
  if (from === 'cuenta' && to === 'producto') return 'inversion'
  if (from === 'producto' && to === 'cuenta') return 'reembolso'
  if (from === 'producto' && to === 'producto') return 'traspaso'
  return 'transferencia'
}
