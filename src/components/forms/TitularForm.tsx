import { useState } from 'react'
import { Trash2 } from 'lucide-react'
import { Sheet } from '../ui/Sheet'
import { Field, TextInput } from '../ui/Field'
import { Button } from '../ui/Button'
import { useData } from '../../store/data'
import { confirmDialog, toast, useUI } from '../../store/ui'
import { initials } from '../../lib/format'

export function TitularForm({ modalId, titularId }: { modalId: string; titularId?: string }) {
  const close = useUI((s) => s.close)
  const titulares = useData((s) => s.titulares)
  const addTitular = useData((s) => s.addTitular)
  const updateTitular = useData((s) => s.updateTitular)
  const removeTitular = useData((s) => s.removeTitular)
  const existing = titularId ? titulares.find((t) => t.id === titularId) : undefined

  const [nombre, setNombre] = useState(existing?.nombre ?? '')
  const [codigo, setCodigo] = useState(existing?.codigo ?? '')
  const [submitted, setSubmitted] = useState(false)
  const error = !nombre.trim() ? 'Escribe un nombre' : null

  const save = () => {
    setSubmitted(true)
    if (error) return
    if (existing) {
      updateTitular(existing.id, { nombre, codigo })
      toast('Datos guardados')
    } else {
      addTitular({ nombre, codigo })
      toast('Titular creado')
    }
    close(modalId)
  }

  const remove = async () => {
    if (!existing) return
    const ok = await confirmDialog({
      title: `¿Eliminar a «${existing.nombre}»?`,
      message: 'Se borrarán sus cuentas, productos y movimientos. Esta acción no se puede deshacer.',
      confirmLabel: 'Eliminar',
      danger: true,
    })
    if (ok) {
      removeTitular(existing.id)
      toast('Titular eliminado')
      close(modalId)
    }
  }

  return (
    <Sheet
      title={existing ? 'Datos del titular' : 'Nuevo titular'}
      subtitle={existing ? 'Nombre y código, como en la cabecera del Excel' : 'Cada titular tiene sus propias cuentas y movimientos'}
      size="sm"
      onClose={() => close(modalId)}
      footer={
        <div className="flex items-center gap-2">
          {existing && titulares.length > 1 && (
            <Button variant="ghost" icon={Trash2} onClick={remove} className="text-rose-600 hover:bg-rose-50" aria-label="Eliminar titular" />
          )}
          <div className="flex-1" />
          <Button variant="secondary" onClick={() => close(modalId)}>
            Cancelar
          </Button>
          <Button onClick={save}>Guardar</Button>
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
        <div className="flex items-center gap-3 rounded-2xl bg-slate-50 p-3">
          <span className="inline-flex size-12 items-center justify-center rounded-full bg-brand-900 text-base font-bold text-white">
            {initials(nombre || '?')}
          </span>
          <div className="min-w-0">
            <div className="truncate font-semibold text-slate-900">{nombre.trim() || 'Nombre'}</div>
            <div className="truncate text-sm text-slate-500">{codigo.trim() ? `Código ${codigo.trim()}` : 'Sin código'}</div>
          </div>
        </div>
        <Field label="Nombre" htmlFor="tit-nombre" error={submitted ? error : null}>
          <TextInput id="tit-nombre" data-autofocus value={nombre} maxLength={60} placeholder="Ej.: Ana García" onChange={(e) => setNombre(e.target.value)} />
        </Field>
        <Field label="Código" htmlFor="tit-codigo" optional hint="Por ejemplo, tu número de cliente">
          <TextInput id="tit-codigo" value={codigo} maxLength={30} placeholder="Ej.: 000123" onChange={(e) => setCodigo(e.target.value)} />
        </Field>
        <button type="submit" className="hidden" />
      </form>
    </Sheet>
  )
}
