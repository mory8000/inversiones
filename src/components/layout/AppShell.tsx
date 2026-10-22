import { useId, type ReactNode } from 'react'
import { ArrowLeftRight, Eye, EyeOff, House, Landmark, Plus, Settings, Undo2, Waypoints, Wallet, type LucideIcon } from 'lucide-react'
import type { Route } from '../../lib/router'
import { navigate, paths } from '../../lib/router'
import { useData } from '../../store/data'
import { openMovement } from '../../store/ui'
import { deshacer, useUltimoCambio } from '../../store/deshacer'
import { cn } from '../../lib/cn'
import { IconButton } from '../ui/Button'
import { SidebarTitulares } from '../Titulares'

type NavKey = 'inicio' | 'inversiones' | 'movimientos' | 'flujo' | 'cuentas' | 'ajustes'

function activeKey(route: Route): NavKey {
  switch (route.name) {
    case 'inicio':
      return 'inicio'
    case 'inversiones':
      return route.tab === 'cuentas' ? 'cuentas' : 'inversiones'
    case 'producto':
      return 'inversiones'
    case 'cuenta':
      return 'cuentas'
    case 'movimientos':
      return 'movimientos'
    case 'flujo':
      return 'flujo'
    case 'ajustes':
      return 'ajustes'
  }
}

const NAV: { key: NavKey; label: string; icon: LucideIcon; path: string }[] = [
  { key: 'inicio', label: 'Inicio', icon: House, path: paths.inicio },
  { key: 'inversiones', label: 'Inversiones', icon: Wallet, path: paths.productos() },
  { key: 'movimientos', label: 'Movimientos', icon: ArrowLeftRight, path: paths.movimientos() },
  { key: 'flujo', label: 'Gráfico del dinero', icon: Waypoints, path: paths.flujo },
  { key: 'cuentas', label: 'Cuentas', icon: Landmark, path: paths.cuentas },
  { key: 'ajustes', label: 'Ajustes', icon: Settings, path: paths.ajustes },
]

export function Logo({ className }: { className?: string }) {
  // IDs únicos: si se repiten, el degradado puede no pintarse.
  const uid = useId().replace(/:/g, '')
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden>
      <defs>
        <linearGradient id={`${uid}-bg`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#1F3D96" />
          <stop offset="1" stopColor="#0B1736" />
        </linearGradient>
        <linearGradient id={`${uid}-ln`} x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stopColor="#34D399" />
          <stop offset="1" stopColor="#6EE7F9" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="16" fill={`url(#${uid}-bg)`} />
      <path d="M14 45 L26 32.5 L34.5 39 L48 24" fill="none" stroke={`url(#${uid}-ln)`} strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M39.5 22.5 H49.5 V32.5" fill="none" stroke={`url(#${uid}-ln)`} strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function HideToggle({ dark = false }: { dark?: boolean }) {
  const hidden = useData((s) => s.hideAmounts)
  const setHidden = useData((s) => s.setHideAmounts)
  return (
    <IconButton
      icon={hidden ? EyeOff : Eye}
      label={hidden ? 'Mostrar importes' : 'Ocultar importes'}
      variant={dark ? 'dark' : 'ghost'}
      onClick={() => setHidden(!hidden)}
    />
  )
}

/**
 * Botón «Deshacer»: deshace el último cambio (un movimiento apuntado, cambiado o borrado, un %…).
 * Siempre a la vista, arriba; si no hay nada que deshacer, se ve apagado.
 */
function UndoButton({ dark = false }: { dark?: boolean }) {
  const ultimo = useUltimoCambio()
  const label = ultimo ? `Deshacer: ${ultimo}` : 'No hay nada que deshacer'
  return (
    <button
      type="button"
      onClick={deshacer}
      disabled={!ultimo}
      title={label}
      aria-label={label}
      data-deshacer
      className={cn(
        'inline-flex shrink-0 items-center justify-center gap-1.5 rounded-xl font-semibold transition-colors disabled:opacity-40',
        dark
          ? 'h-10 w-full bg-white/8 text-sm text-white ring-1 ring-white/15 hover:bg-white/12 disabled:hover:bg-white/8'
          : 'h-9 px-2.5 text-[13px] text-brand-700 ring-1 ring-brand-200 hover:bg-brand-50 disabled:text-slate-500 disabled:ring-slate-200 disabled:hover:bg-transparent',
      )}
    >
      <Undo2 className="size-[18px]" strokeWidth={2.3} />
      Deshacer
    </button>
  )
}

function Sidebar({ current }: { current: NavKey }) {
  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col overflow-y-auto bg-brand-950 px-4 py-5 text-white lg:flex">
      <div className="flex items-center gap-2.5 px-2">
        <Logo className="size-9" />
        <div>
          <div className="text-[15px] leading-tight font-bold">Mis Inversiones</div>
          <div className="text-[11px] text-white/50">Todo tu dinero, claro</div>
        </div>
      </div>
      <div className="mt-6">
        <SidebarTitulares />
      </div>
      <button
        type="button"
        onClick={() => openMovement()}
        className="mt-4 flex h-11 items-center justify-center gap-2 rounded-xl bg-emerald-400 text-sm font-bold text-brand-950 shadow-sm transition-colors hover:bg-emerald-300"
      >
        <Plus className="size-5" strokeWidth={2.6} /> Nuevo movimiento
      </button>
      <div className="mt-2">
        <UndoButton dark />
      </div>
      <nav className="mt-6 flex-1 space-y-1" aria-label="Secciones">
        {NAV.map((item) => {
          const active = item.key === current
          return (
            <a
              key={item.key}
              href={`#${item.path}`}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'flex h-10 items-center gap-3 rounded-xl px-3 text-sm font-semibold transition-colors',
                active ? 'bg-white/12 text-white' : 'text-white/65 hover:bg-white/6 hover:text-white',
              )}
            >
              <item.icon className={cn('size-[18px]', active ? 'text-emerald-300' : '')} strokeWidth={2.2} />
              {item.label}
            </a>
          )
        })}
      </nav>
      <div className="flex items-center justify-between border-t border-white/10 pt-3">
        <span className="px-2 text-xs text-white/45">Datos guardados en este dispositivo</span>
        <HideToggle dark />
      </div>
    </aside>
  )
}

function MobileTopBar() {
  return (
    <header className="pt-safe sticky top-0 z-30 border-b border-slate-200/70 bg-canvas/85 backdrop-blur-md lg:hidden">
      <div className="flex h-14 items-center justify-between gap-2 px-3">
        <a href={`#${paths.inicio}`} className="flex min-w-0 items-center gap-2 px-1" aria-label="Mis Inversiones: ir al inicio">
          <Logo className="size-8 shrink-0" />
          <span className="truncate text-[15px] font-bold text-slate-900 max-[359px]:sr-only">Mis Inversiones</span>
        </a>
        <div className="flex shrink-0 items-center gap-1">
          <UndoButton />
          <HideToggle />
          <IconButton icon={Settings} label="Ajustes" onClick={() => navigate(paths.ajustes)} />
        </div>
      </div>
    </header>
  )
}

function BottomNav({ current }: { current: NavKey }) {
  const items: { key: NavKey; label: string; icon: LucideIcon; path: string }[] = [
    { key: 'inicio', label: 'Inicio', icon: House, path: paths.inicio },
    { key: 'inversiones', label: 'Inversiones', icon: Wallet, path: paths.productos() },
    { key: 'movimientos', label: 'Movimientos', icon: ArrowLeftRight, path: paths.movimientos() },
    { key: 'flujo', label: 'Gráfico', icon: Waypoints, path: paths.flujo },
  ]
  const render = (item: (typeof items)[number]) => {
    const active = item.key === current || (item.key === 'inversiones' && current === 'cuentas')
    return (
      <a
        key={item.key}
        href={`#${item.path}`}
        aria-current={active ? 'page' : undefined}
        className={cn('flex flex-1 flex-col items-center gap-1 pt-2 pb-1 text-[11px] font-semibold', active ? 'text-brand-700' : 'text-slate-500')}
      >
        <span className={cn('flex h-7 w-12 items-center justify-center rounded-full transition-colors', active && 'bg-brand-100')}>
          <item.icon className="size-5" strokeWidth={active ? 2.4 : 2} />
        </span>
        {item.label}
      </a>
    )
  }
  return (
    <nav className="pb-safe fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 backdrop-blur-md lg:hidden" aria-label="Secciones">
      <div className="mx-auto flex max-w-lg items-end px-1">
        {items.slice(0, 2).map(render)}
        <div className="flex flex-1 justify-center">
          <button
            type="button"
            onClick={() => openMovement()}
            aria-label="Nuevo movimiento"
            className="-mt-5 flex size-14 items-center justify-center rounded-2xl bg-brand-600 text-white shadow-lg shadow-brand-600/30 transition-transform active:scale-95"
          >
            <Plus className="size-7" strokeWidth={2.5} />
          </button>
        </div>
        {items.slice(2).map(render)}
      </div>
    </nav>
  )
}

export function AppShell({ route, children }: { route: Route; children: ReactNode }) {
  const current = activeKey(route)
  return (
    <div className="min-h-dvh lg:pl-64">
      <Sidebar current={current} />
      <MobileTopBar />
      <main className="mx-auto max-w-6xl px-4 pt-4 pb-32 sm:px-6 lg:px-10 lg:pt-8 lg:pb-16">{children}</main>
      <BottomNav current={current} />
    </div>
  )
}

export function PageHeader({
  title,
  subtitle,
  actions,
  back,
}: {
  title: ReactNode
  subtitle?: ReactNode
  actions?: ReactNode
  back?: ReactNode
}) {
  return (
    <div className="mb-5 lg:mb-7">
      {back}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 lg:text-[28px]">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-slate-500 lg:text-[15px]">{subtitle}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </div>
  )
}
