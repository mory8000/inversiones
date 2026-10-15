import { useState, type CSSProperties } from 'react'
import { Check, Landmark, Trash2, Wallet, TriangleAlert } from 'lucide-react'
import { Sheet } from '../ui/Sheet'
import { Field, TextArea, TextInput } from '../ui/Field'
import { Button } from '../ui/Button'
import { AccountAvatar } from '../ui/icons'
import { ACCOUNT_COLORS } from '../../lib/meta'
import { useData } from '../../store/data'
import { useFinance } from '../../store/useFinance'
import { confirmDialog, toast, useUI } from '../../store/ui'
import { navigate, paths } from '../../lib/router'
import { EntitySuggestions, ENTITY_LIST_ID } from './EntitySuggestions'
import { TitularPicker } from '../Titulares'
import { cuentaPrincipal } from '../../lib/titulares'
import { fmtEUR } from '../../lib/format'
import { cn } from '../../lib/cn'

/** Las dos clases de cuenta, explicadas con palabras sencillas. */
const TIPOS_CUENTA = [
  {
    externa: false,
    icon: Wallet,
    label: 'Con saldo (como MyInvestor)',
    text: 'El dinero que hay en ella es del titular y suma en su patrimonio. La app calcula el saldo con lo que entra y sale.',
  },
  {
    externa: true,
    icon: Landmark,
    label: 'Externa (otro banco)',
    text: 'De donde traes el dinero (aportaciones) o a donde lo sacas. No lleva saldo ni suma en el patrimonio.',
  },
] as const

export function AccountForm({
  modalId,
  accountId,
  presetTitularId,
  presetExterna,
  onCreated,
}: {
  modalId: string
  accountId?: string
  presetTitularId?: string
  /** Clase de cuenta propuesta al crearla. */
  presetExterna?: boolean
  onCreated?: (id: string) => void
}) {
  const close = useUI((s) => s.close)
  const { ws, ds, accounts } = useFinance()
  const addCuenta = useData((s) => s.addCuenta)
  const updateCuenta = useData((s) => s.updateCuenta)
  const removeCuenta = useData((s) => s.removeCuenta)
  const existing = accountId ? ws.cuentas.find((c) => c.id === accountId) : undefined

  const [nombre, setNombre] = useState(existing?.nombre ?? '')
  const [entidad, setEntidad] = useState(existing?.entidad ?? '')
  const [iban, setIban] = useState(existing?.iban ?? '')
  const [color, setColor] = useState(existing?.color ?? ACCOUNT_COLORS[ws.cuentas.length % ACCOUNT_COLORS.length])
  const [notas, setNotas] = useState(existing?.notas ?? '')
  const [titularId, setTitularId] = useState(existing?.titularId ?? presetTitularId ?? ds.titulares[0].id)
  // Si no se indica, la primera cuenta de un titular es su cuenta con saldo y las demás, externas.
  const [externa, setExterna] = useState<boolean>(existing?.externa ?? presetExterna ?? !!cuentaPrincipal(ws.cuentas, existing?.titularId ?? presetTitularId ?? ds.titulares[0].id))
  const [submitted, setSubmitted] = useState(false)
  const error = !nombre.trim() ? 'Ponle un nombre a la cuenta' : null
  const stats = existing ? accounts.get(existing.id) : undefined
  /** Saldo que tendría la cuenta con los movimientos que ya tiene. */
  const saldoSiConSaldo = stats ? stats.saldo : 0

  const save = () => {
    setSubmitted(true)
    if (error) return
    const data = { titularId, nombre: nombre.trim(), entidad: entidad.trim(), iban: iban.trim().toUpperCase(), color, notas: notas.trim(), externa }
    if (existing) {
      updateCuenta(existing.id, data)
      toast('Cuenta actualizada')
      close(modalId)
      return
    }
    const id = addCuenta(data)
    toast('Cuenta creada')
    close(modalId)
    onCreated?.(id)
  }

  const remove = async () => {
    if (!existing) return
    const n = accounts.get(existing.id)?.numMovimientos ?? 0
    const ok = await confirmDialog({
      title: `¿Eliminar «${existing.nombre}»?`,
      message:
        n > 0
          ? `También se eliminarán sus ${n} movimiento${n === 1 ? '' : 's'}. Esta acción no se puede deshacer.`
          : 'Esta acción no se puede deshacer.',
      confirmLabel: 'Eliminar',
      danger: true,
    })
    if (ok) {
      removeCuenta(existing.id)
      toast('Cuenta eliminada')
      close(modalId)
      navigate(paths.cuentas)
    }
  }

  return (
    <Sheet
      title={existing ? 'Editar cuenta' : 'Nueva cuenta'}
      subtitle="Tu cuenta con saldo (como MyInvestor) o una cuenta externa de otro banco"
      size="sm"
      onClose={() => close(modalId)}
      footer={
        <div className="flex items-center gap-2">
          {existing && <Button variant="ghost" icon={Trash2} onClick={remove} className="text-rose-600 hover:bg-rose-50" aria-label="Eliminar cuenta" />}
          <div className="flex-1" />
          <Button variant="secondary" onClick={() => close(modalId)}>
            Cancelar
          </Button>
          <Button onClick={save}>{existing ? 'Guardar cambios' : 'Crear cuenta'}</Button>
        </div>
      }
    >
      <form
        className="space-y-5"
        onSubmit={(e) => {
          e.preventDefault()
          save()
        }}
      >
        <EntitySuggestions />
        <div className="flex items-center gap-3 rounded-2xl bg-slate-50 p-3">
          <AccountAvatar color={color} size="lg" />
          <div className="min-w-0">
            <div className="truncate font-semibold text-slate-900">{nombre.trim() || 'Nombre de la cuenta'}</div>
            <div className="truncate text-sm text-slate-500">{entidad.trim() || 'Entidad'}</div>
          </div>
        </div>
        <TitularPicker value={titularId} onChange={setTitularId} label="¿De quién es la cuenta?" />
        <fieldset>
          <legend className="mb-2 text-sm font-medium text-slate-700">¿Qué clase de cuenta es?</legend>
          <div className="grid grid-cols-1 gap-2">
            {TIPOS_CUENTA.map((t) => {
              const active = t.externa === externa
              return (
                <button
                  key={String(t.externa)}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setExterna(t.externa)}
                  className={cn(
                    'flex items-start gap-3 rounded-xl border p-3 text-left transition-all',
                    active ? 'border-transparent bg-brand-50 ring-2' : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50',
                  )}
                  style={active ? ({ '--tw-ring-color': '#2447B8' } as CSSProperties) : undefined}
                >
                  <span className={cn('mt-0.5 inline-flex size-8 shrink-0 items-center justify-center rounded-lg', active ? 'bg-white text-brand-700' : 'bg-slate-100 text-slate-500')}>
                    <t.icon className="size-4" strokeWidth={2.4} />
                  </span>
                  <span className="min-w-0">
                    <span className={cn('block text-sm font-semibold', active ? 'text-brand-800' : 'text-slate-800')}>{t.label}</span>
                    <span className="block text-[13px] leading-snug text-slate-500">{t.text}</span>
                  </span>
                </button>
              )
            })}
          </div>
          {existing && existing.externa && !externa && saldoSiConSaldo < -0.005 && (
            <p className="mt-2 flex gap-2 rounded-xl bg-amber-50 p-3 text-[13px] text-amber-800">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" />
              <span>
                Con los movimientos que tiene, han salido {fmtEUR(-saldoSiConSaldo)} más de los que han entrado. Apunta después de dónde vino ese dinero con «Añadir
                dinero» (una aportación desde una cuenta externa).
              </span>
            </p>
          )}
        </fieldset>
        <Field label="Nombre" htmlFor="acc-nombre" error={submitted ? error : null}>
          <TextInput
            id="acc-nombre"
            data-autofocus
            invalid={submitted && !!error}
            placeholder={externa ? 'Ej.: Cuenta nómina' : 'Ej.: MyInvestor'}
            value={nombre}
            maxLength={60}
            onChange={(e) => setNombre(e.target.value)}
          />
        </Field>
        <Field label="Entidad" htmlFor="acc-entidad" optional>
          <TextInput id="acc-entidad" list={ENTITY_LIST_ID} placeholder="Ej.: BBVA" value={entidad} maxLength={60} onChange={(e) => setEntidad(e.target.value)} />
        </Field>
        <Field label="IBAN" htmlFor="acc-iban" optional hint="Solo se muestran los 4 últimos dígitos">
          <TextInput id="acc-iban" placeholder="ES00 0000 0000 0000 0000 0000" value={iban} maxLength={34} className="uppercase" onChange={(e) => setIban(e.target.value)} />
        </Field>
        <fieldset>
          <legend className="mb-2 text-sm font-medium text-slate-700">Color</legend>
          <div className="flex flex-wrap gap-2">
            {ACCOUNT_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                aria-label={`Color ${c}`}
                aria-pressed={color === c}
                className="inline-flex size-9 items-center justify-center rounded-full ring-offset-2 transition-transform hover:scale-105"
                style={{ backgroundColor: c, boxShadow: color === c ? `0 0 0 2px white, 0 0 0 4px ${c}` : undefined }}
              >
                {color === c && <Check className="size-4 text-white" strokeWidth={3} />}
              </button>
            ))}
          </div>
        </fieldset>
        <Field label="Notas" htmlFor="acc-notas" optional>
          <TextArea id="acc-notas" value={notas} maxLength={300} onChange={(e) => setNotas(e.target.value)} />
        </Field>
        <button type="submit" className="hidden" />
      </form>
    </Sheet>
  )
}
