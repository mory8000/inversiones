import { useEffect, useId, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { cn } from '../../lib/cn'

let openCount = 0

/**
 * Ventana modal: hoja inferior en el móvil y diálogo centrado en escritorio.
 */
export function Sheet({
  title,
  subtitle,
  onClose,
  children,
  footer,
  size = 'md',
}: {
  title: ReactNode
  subtitle?: ReactNode
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  size?: 'sm' | 'md' | 'lg'
}) {
  const titleId = useId()
  const panelRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef(onClose)
  closeRef.current = onClose

  useEffect(() => {
    openCount++
    document.body.style.overflow = 'hidden'
    const previouslyFocused = document.activeElement as HTMLElement | null
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      // Solo cierra la ventana superior.
      const panels = document.querySelectorAll('[data-sheet-panel]')
      if (panels[panels.length - 1] === panelRef.current) {
        e.stopPropagation()
        closeRef.current()
      }
    }
    window.addEventListener('keydown', onKey)
    // Enfoca el primer campo si lo hay (sin abrir el teclado en móviles).
    const t = window.setTimeout(() => {
      const panel = panelRef.current
      if (!panel) return
      const isTouch = window.matchMedia('(pointer: coarse)').matches
      const first = panel.querySelector<HTMLElement>('[data-autofocus]')
      if (first && !isTouch) {
        first.focus()
        // Si el campo ya trae un valor (p. ej. el saldo actual), se selecciona para escribir encima.
        if (first instanceof HTMLInputElement && first.value) first.select()
      } else panel.focus()
    }, 30)
    return () => {
      window.clearTimeout(t)
      window.removeEventListener('keydown', onKey)
      openCount--
      if (openCount <= 0) {
        openCount = 0
        document.body.style.overflow = ''
      }
      previouslyFocused?.focus?.()
    }
  }, [])

  const width = size === 'sm' ? 'sm:max-w-md' : size === 'lg' ? 'sm:max-w-2xl' : 'sm:max-w-lg'

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6">
      <div className="absolute inset-0 animate-fade-in bg-slate-950/45 backdrop-blur-[2px]" onClick={onClose} aria-hidden />
      <div
        ref={panelRef}
        data-sheet-panel
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={cn(
          'relative flex max-h-[94dvh] w-full animate-slide-up flex-col overflow-hidden rounded-t-[28px] bg-white shadow-2xl outline-none sm:max-h-[88dvh] sm:animate-pop sm:rounded-3xl',
          width,
        )}
      >
        <div className="mx-auto mt-2.5 h-1.5 w-10 rounded-full bg-slate-200 sm:hidden" aria-hidden />
        <header className="flex items-start justify-between gap-3 px-5 pt-3 pb-3 sm:px-6 sm:pt-5">
          <div className="min-w-0">
            <h2 id={titleId} className="text-lg font-semibold text-slate-900">
              {title}
            </h2>
            {subtitle && <p className="mt-0.5 text-sm text-slate-500">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="-mr-2 inline-flex size-9 shrink-0 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100 hover:text-slate-800"
          >
            <X className="size-5" />
          </button>
        </header>
        <div className="flex-1 overflow-y-auto overscroll-contain px-5 pb-5 sm:px-6">{children}</div>
        {footer && <footer className="pb-safe border-t border-slate-100 bg-white px-5 pt-3 sm:px-6 sm:pb-4">{footer}</footer>}
      </div>
    </div>,
    document.body,
  )
}
