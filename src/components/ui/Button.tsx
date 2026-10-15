import type { ButtonHTMLAttributes, ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '../../lib/cn'

type Variant = 'primary' | 'secondary' | 'soft' | 'ghost' | 'danger' | 'dark' | 'accent' | 'light'
type Size = 'sm' | 'md' | 'lg'

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-brand-600 text-white shadow-sm hover:bg-brand-700 active:bg-brand-800',
  secondary: 'border border-slate-300 bg-white text-slate-700 shadow-sm hover:bg-slate-50 active:bg-slate-100',
  soft: 'bg-brand-50 text-brand-700 hover:bg-brand-100 active:bg-brand-200',
  ghost: 'text-slate-600 hover:bg-slate-100 active:bg-slate-200',
  danger: 'bg-rose-600 text-white shadow-sm hover:bg-rose-700 active:bg-rose-800',
  dark: 'bg-white/10 text-white hover:bg-white/20 active:bg-white/25',
  /** Verde, para la acción principal sobre fondo oscuro (p. ej. «Añadir dinero»). */
  accent: 'bg-emerald-400 text-brand-950 shadow-sm hover:bg-emerald-300 active:bg-emerald-500',
  /** Blanco, sobre fondo oscuro. */
  light: 'bg-white text-brand-900 shadow-sm hover:bg-slate-100 active:bg-slate-200',
}

const SIZES: Record<Size, string> = {
  sm: 'h-8 gap-1.5 rounded-lg px-3 text-[13px]',
  md: 'h-10 gap-2 rounded-xl px-4 text-sm',
  lg: 'h-12 gap-2 rounded-xl px-5 text-[15px]',
}

/** Igual, pero el texto puede ocupar dos líneas si no cabe (pantallas estrechas). */
const SIZES_WRAP: Record<Size, string> = {
  sm: 'min-h-8 gap-1.5 rounded-lg px-2.5 py-1.5 text-[13px] leading-tight',
  md: 'min-h-10 gap-2 rounded-xl px-3 py-2 text-sm leading-tight',
  lg: 'min-h-12 gap-2 rounded-xl px-4 py-2.5 text-[15px] leading-tight',
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  icon?: LucideIcon
  iconRight?: LucideIcon
  /** Deja que el texto pase a dos líneas si no cabe. */
  wrap?: boolean
  children?: ReactNode
}

export function Button({ variant = 'primary', size = 'md', icon: Icon, iconRight: IconRight, wrap = false, className, children, type = 'button', ...rest }: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        'inline-flex select-none items-center justify-center font-semibold transition-colors',
        wrap ? 'text-center whitespace-normal' : 'whitespace-nowrap',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500',
        'disabled:pointer-events-none disabled:opacity-50',
        VARIANTS[variant],
        (wrap ? SIZES_WRAP : SIZES)[size],
        className,
      )}
      {...rest}
    >
      {Icon && <Icon className={cn('shrink-0', size === 'sm' ? 'size-4' : 'size-[18px]')} strokeWidth={2.3} />}
      {children}
      {IconRight && <IconRight className={cn('shrink-0', size === 'sm' ? 'size-4' : 'size-[18px]')} strokeWidth={2.3} />}
    </button>
  )
}

export function IconButton({
  icon: Icon,
  label,
  className,
  variant = 'ghost',
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { icon: LucideIcon; label: string; variant?: 'ghost' | 'dark' | 'soft' }) {
  const styles = {
    ghost: 'text-slate-500 hover:bg-slate-100 hover:text-slate-800',
    dark: 'text-white/80 hover:bg-white/10 hover:text-white',
    soft: 'bg-white text-slate-600 border border-slate-200 shadow-sm hover:bg-slate-50',
  }
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cn(
        'inline-flex size-10 items-center justify-center rounded-xl transition-colors',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500',
        styles[variant],
        className,
      )}
      {...rest}
    >
      <Icon className="size-5" strokeWidth={2.1} />
    </button>
  )
}
