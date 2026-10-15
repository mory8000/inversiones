// Las ventanas (formularios, ventanillas…). Van en un archivo aparte que se carga al poco de
// abrir la app (y al abrir la primera ventana), para que la app arranque antes.

import { useUI, type ModalSpec } from '../store/ui'
import { Sheet } from './ui/Sheet'
import { Button } from './ui/Button'
import { MovementForm } from './forms/MovementForm'
import { ProductForm } from './forms/ProductForm'
import { AccountForm } from './forms/AccountForm'
import { ValuationForm } from './forms/ValuationForm'
import { TitularForm } from './forms/TitularForm'
import { InteresForm } from './forms/InteresForm'
import { InvestmentSheet } from './InvestmentSheet'
import { AccountSheet } from './AccountSheet'
import { TotalSheet } from './TotalSheet'

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
export default function ModalHost() {
  const modals = useUI((s) => s.modals)
  return (
    <>
      {modals.map((m) => {
        switch (m.type) {
          case 'movement':
            return <MovementForm key={m.id} modalId={m.id} movementId={m.movementId} programadaId={m.programadaId} preset={m.preset} />
          case 'product':
            return (
              <ProductForm
                key={m.id}
                modalId={m.id}
                productId={m.productId}
                presetTipo={m.presetTipo}
                presetTitularId={m.presetTitularId}
                onCreated={m.onCreated}
                abrirVentanilla={m.abrirVentanilla}
              />
            )
          case 'account':
            return (
              <AccountForm
                key={m.id}
                modalId={m.id}
                accountId={m.accountId}
                presetTitularId={m.presetTitularId}
                presetExterna={m.presetExterna}
                onCreated={m.onCreated}
              />
            )
          case 'investment':
            return <InvestmentSheet key={m.id} modalId={m.id} productId={m.productId} />
          case 'cuenta':
            return <AccountSheet key={m.id} modalId={m.id} cuentaId={m.cuentaId} />
          case 'valuation':
            return <ValuationForm key={m.id} modalId={m.id} productId={m.productId} />
          case 'interes':
            return <InteresForm key={m.id} modalId={m.id} productId={m.productId} />
          case 'total':
            return <TotalSheet key={m.id} modalId={m.id} />
          case 'titular':
            return <TitularForm key={m.id} modalId={m.id} titularId={m.titularId} />
          case 'confirm':
            return <ConfirmDialog key={m.id} spec={m} />
        }
      })}
    </>
  )
}

