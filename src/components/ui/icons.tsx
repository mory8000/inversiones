import {
  ArrowDownLeft,
  ArrowRightLeft,
  ArrowUpRight,
  ChartCandlestick,
  ChartLine,
  Gem,
  HandCoins,
  Landmark,
  Layers,
  PiggyBank,
  Repeat,
  Umbrella,
  type LucideIcon,
} from 'lucide-react'
import type { Cuenta, MovementKind, Producto, ProductType } from '../../types'
import { PRODUCT_META, kindMeta } from '../../lib/meta'
import { cn } from '../../lib/cn'

export const PRODUCT_ICONS: Record<ProductType, LucideIcon> = {
  deposito: PiggyBank,
  fondo: ChartLine,
  cartera: Layers,
  plan: Umbrella,
  acciones: ChartCandlestick,
  otro: Gem,
}

export const MOVEMENT_ICONS: Record<MovementKind, LucideIcon> = {
  inversion: ArrowUpRight,
  reembolso: ArrowDownLeft,
  traspaso: Repeat,
  transferencia: ArrowRightLeft,
  entreTitulares: HandCoins,
}

export const AccountIcon = Landmark

const SIZES = {
  xs: { box: 'size-6 rounded-md', icon: 'size-3.5' },
  sm: { box: 'size-8 rounded-lg', icon: 'size-4' },
  md: { box: 'size-10 rounded-xl', icon: 'size-5' },
  lg: { box: 'size-12 rounded-2xl', icon: 'size-6' },
}

type Size = keyof typeof SIZES

export function ProductAvatar({ tipo, size = 'md', className }: { tipo: ProductType; size?: Size; className?: string }) {
  const Icon = PRODUCT_ICONS[tipo]
  const meta = PRODUCT_META[tipo]
  return (
    <span
      className={cn('inline-flex shrink-0 items-center justify-center', SIZES[size].box, className)}
      style={{ backgroundColor: meta.soft, color: meta.color }}
      aria-hidden
    >
      <Icon className={SIZES[size].icon} strokeWidth={2.2} />
    </span>
  )
}

export function AccountAvatar({ color, size = 'md', className }: { color: string; size?: Size; className?: string }) {
  return (
    <span
      className={cn('inline-flex shrink-0 items-center justify-center', SIZES[size].box, className)}
      style={{ backgroundColor: `${color}1f`, color }}
      aria-hidden
    >
      <Landmark className={SIZES[size].icon} strokeWidth={2.2} />
    </span>
  )
}

export function EntityAvatar({
  cuenta,
  producto,
  size = 'md',
  className,
}: {
  cuenta?: Cuenta
  producto?: Producto
  size?: Size
  className?: string
}) {
  if (producto) return <ProductAvatar tipo={producto.tipo} size={size} className={className} />
  return <AccountAvatar color={cuenta?.color ?? '#94A3B8'} size={size} className={className} />
}

export function MovementAvatar({ tipo, size = 'md', className }: { tipo: MovementKind; size?: Size; className?: string }) {
  const Icon = MOVEMENT_ICONS[tipo]
  const meta = kindMeta(tipo)
  return (
    <span
      className={cn('inline-flex shrink-0 items-center justify-center', SIZES[size].box, className)}
      style={{ backgroundColor: meta.soft, color: meta.color }}
      aria-hidden
    >
      <Icon className={SIZES[size].icon} strokeWidth={2.4} />
    </span>
  )
}
