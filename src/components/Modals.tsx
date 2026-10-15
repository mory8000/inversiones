import { Suspense, lazy, useEffect } from 'react'
import { CircleCheck, CircleAlert, Info, Undo2, Redo2, X } from 'lucide-react'
import { useUI } from '../store/ui'

const cargarVentanas = () => import('./ModalHost')
const ModalHost = lazy(cargarVentanas)

/** Muestra las ventanas abiertas (pueden apilarse). Se cargan al poco de arrancar la app. */
export function Modals() {
  const hay = useUI((s) => s.modals.length > 0)
  useEffect(() => {
    const t = window.setTimeout(() => void cargarVentanas(), 800)
    return () => window.clearTimeout(t)
  }, [])
  return <Suspense fallback={null}>{hay && <ModalHost />}</Suspense>
}

export function Toasts() {
  const toasts = useUI((s) => s.toasts)
  const dismiss = useUI((s) => s.dismissToast)
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-24 z-[60] flex flex-col items-center gap-2 px-4 lg:bottom-6" aria-live="polite">
      {toasts.map((t) => {
        const Icon = t.kind === 'error' ? CircleAlert : t.kind === 'info' ? Info : CircleCheck
        const iconClass = t.kind === 'error' ? 'size-4 shrink-0 text-rose-300' : t.kind === 'info' ? 'size-4 shrink-0 text-sky-300' : 'size-4 shrink-0 text-emerald-300'
        if (!t.action) {
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => dismiss(t.id)}
              className="pointer-events-auto flex max-w-full animate-toast items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-left text-sm font-medium text-white shadow-lg"
            >
              <Icon className={iconClass} />
              {t.message}
            </button>
          )
        }
        const ActionIcon = t.action.label === 'Rehacer' ? Redo2 : Undo2
        return (
          <div
            key={t.id}
            role="status"
            className="pointer-events-auto flex max-w-full animate-toast items-center gap-1 rounded-xl bg-slate-900 py-1.5 pr-1.5 pl-4 text-sm font-medium text-white shadow-lg"
          >
            <Icon className={iconClass} />
            <span className="ml-1 min-w-0 flex-1 py-1">{t.message}</span>
            <button
              type="button"
              onClick={() => {
                dismiss(t.id)
                t.action!.onClick()
              }}
              className="ml-1 inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg bg-white/10 px-3 font-semibold text-emerald-300 hover:bg-white/15"
            >
              <ActionIcon className="size-4" strokeWidth={2.4} />
              {t.action.label}
            </button>
            <button type="button" onClick={() => dismiss(t.id)} aria-label="Cerrar aviso" className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg text-white/50 hover:text-white">
              <X className="size-4" />
            </button>
          </div>
        )
      })}
    </div>
  )
}
