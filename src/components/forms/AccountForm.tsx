import { useState } from 'react'
import { Check, Trash2 } from 'lucide-react'
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

export function AccountForm({
  modalId,
  accountId,
  presetTitularId,
  onCreated,
}: {
  modalId: string
  accountId?: string
  presetTitularId?: string
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
  const [submitted, setSubmitted] = useState(false)
  const error = !nombre.trim() ? 'Ponle un nombre a la cuenta' : null

  const save = () => {
    setSubmitted(true)
    if (error) return
    const data = { titularId, nombre: nombre.trim(), entidad: entidad.trim(), iban: iban.trim().toUpperCase(), color, notas: notas.trim() }
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
      subtitle="Cuenta bancaria de donde sale (o a donde vuelve) el dinero"
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
        <Field label="Nombre" htmlFor="acc-nombre" error={submitted ? error : null}>
          <TextInput
            id="acc-nombre"
            data-autofocus
            invalid={submitted && !!error}
            placeholder="Ej.: Cuenta nómina"
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
