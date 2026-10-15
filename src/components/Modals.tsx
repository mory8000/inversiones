import { CircleCheck, CircleAlert, Info } from 'lucide-react'
import { useUI, type ModalSpec } from '../store/ui'
import { Sheet } from './ui/Sheet'
import { Button } from './ui/Button'
import { MovementForm } from './forms/MovementForm'
import { ProductForm } from './forms/ProductForm'
import { AccountForm } from './forms/AccountForm'
import { ValuationForm } from './forms/ValuationForm'
import { TitularForm } from './forms/TitularForm'

function ConfirmDialog({ spec }: { spec: Extract<ModalSpec, { type: 'confirm' }> }) {
  const close = useUI((s) => s.close)
  const done = (ok: boolean) => {
    spec.resolve(ok)
    close(spec.id)
  }
  return (
    <Sheet
      title={spec.title}
      size="sm"
      onClose={() => done(false)}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => done(false)}>
            Cancelar
          </Button>
          <Button variant={spec.danger ? 'danger' : 'primary'} onClick={() => done(true)} data-autofocus>
            {spec.confirmLabel ?? 'Aceptar'}
          </Button>
        </div>
      }
    >
      <div className="text-[15px] text-slate-600">{spec.message}</div>
    </Sheet>
  )
}

/** Muestra las ventanas abiertas (pueden apilarse). */
export function Modals() {
  const modals = useUI((s) => s.modals)
  return (
    <>
      {modals.map((m) => {
        switch (m.type) {
          case 'movement':
            return <MovementForm key={m.id} modalId={m.id} movementId={m.movementId} preset={m.preset} />
          case 'product':
            return <ProductForm key={m.id} modalId={m.id} productId={m.productId} presetTipo={m.presetTipo} onCreated={m.onCreated} />
          case 'account':
            return <AccountForm key={m.id} modalId={m.id} accountId={m.accountId} onCreated={m.onCreated} />
          case 'valuation':
            return <ValuationForm key={m.id} modalId={m.id} productId={m.productId} />
          case 'titular':
            return <TitularForm key={m.id} modalId={m.id} titularId={m.titularId} />
          case 'confirm':
            return <ConfirmDialog key={m.id} spec={m} />
        }
      })}
    </>
  )
}

export function Toasts() {
  const toasts = useUI((s) => s.toasts)
  const dismiss = useUI((s) => s.dismissToast)
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-24 z-[60] flex flex-col items-center gap-2 px-4 lg:bottom-6" aria-live="polite">
      {toasts.map((t) => {
        const Icon = t.kind === 'error' ? CircleAlert : t.kind === 'info' ? Info : CircleCheck
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => dismiss(t.id)}
            className="pointer-events-auto flex animate-toast items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white shadow-lg"
          >
            <Icon className={t.kind === 'error' ? 'size-4 text-rose-300' : 'size-4 text-emerald-300'} />
            {t.message}
          </button>
        )
      })}
    </div>
  )
}
