import { useState, type CSSProperties } from 'react'
import { ArrowDown, ArrowRight, Info, Trash2, TriangleAlert } from 'lucide-react'
import type { EntityKind, EntityRef, MovementType } from '../../types'
import { Sheet } from '../ui/Sheet'
import { Field, NumberInput, SelectInput, TextInput } from '../ui/Field'
import { Button } from '../ui/Button'
import { EntityAvatar, MOVEMENT_ICONS } from '../ui/icons'
import { MOVEMENT_META, MOVEMENT_TYPES, PRODUCT_META, PRODUCT_TYPES, inferMovementType } from '../../lib/meta'
import { useData } from '../../store/data'
import { useFinance } from '../../store/useFinance'
import { confirmDialog, openAccount, openProduct, toast, useUI, type MovementPreset } from '../../store/ui'
import { fmtEUR, fmtNumberInput, parseNumber } from '../../lib/format'
import { isValidISODate, todayISO } from '../../lib/dates'
import { entityName, parseRefKey, refKey } from '../../lib/movements'
import { cn } from '../../lib/cn'

const NEW = '__new__'

const EXPLAIN: Record<MovementType, (o: string, d: string) => string> = {
  inversion: (o, d) => `Sale dinero de «${o}» y se invierte en «${d}».`,
  reembolso: (o, d) => `Recuperas dinero de «${o}» y vuelve a «${d}».`,
  traspaso: (o, d) => `Mueves dinero de «${o}» a «${d}» sin pasar por tu cuenta.`,
  transferencia: (o, d) => `Mueves dinero entre tus cuentas: de «${o}» a «${d}».`,
}

export function MovementForm({ modalId, movementId, preset }: { modalId: string; movementId?: string; preset?: MovementPreset }) {
  const close = useUI((s) => s.close)
  const { ws, positions, lookup, today } = useFinance()
  const hidden = useData((s) => s.hideAmounts)
  const addMovimiento = useData((s) => s.addMovimiento)
  const updateMovimiento = useData((s) => s.updateMovimiento)
  const removeMovimiento = useData((s) => s.removeMovimiento)
  const existing = movementId ? ws.movimientos.find((m) => m.id === movementId) : undefined

  const initialTipo: MovementType =
    existing?.tipo ??
    preset?.tipo ??
    (preset?.origen && preset?.destino ? inferMovementType(preset.origen.kind, preset.destino.kind) : 'inversion')

  const [tipo, setTipo] = useState<MovementType>(initialTipo)
  const [origen, setOrigen] = useState(existing ? refKey(existing.origen) : preset?.origen ? refKey(preset.origen) : '')
  const [destino, setDestino] = useState(existing ? refKey(existing.destino) : preset?.destino ? refKey(preset.destino) : '')
  const [importe, setImporte] = useState(existing ? fmtNumberInput(existing.importe, 'fixed') : '')
  const [fecha, setFecha] = useState(existing?.fecha ?? today)
  const [concepto, setConcepto] = useState(existing?.concepto ?? '')
  const [submitted, setSubmitted] = useState(false)

  const meta = MOVEMENT_META[tipo]
  const origenRef = parseRefKey(origen)
  const destinoRef = parseRefKey(destino)
  const amount = parseNumber(importe)

  const changeTipo = (t: MovementType) => {
    if (t === tipo) return
    const m = MOVEMENT_META[t]
    let o: EntityRef | null = origenRef
    let d: EntityRef | null = destinoRef
    // Si el nuevo tipo es el inverso (p. ej. inversión → reembolso), se intercambian.
    if (o && d && o.kind !== d.kind && o.kind === m.to && d.kind === m.from) [o, d] = [d, o]
    setOrigen(o && o.kind === m.from ? refKey(o) : '')
    setDestino(d && d.kind === m.to ? refKey(d) : '')
    setTipo(t)
  }

  const errors = {
    origen: !origenRef ? 'Elige de dónde sale el dinero' : null,
    destino: !destinoRef ? 'Elige a dónde va el dinero' : origen === destino ? 'El origen y el destino no pueden ser el mismo' : null,
    importe: amount === null ? 'Escribe el importe' : amount <= 0 ? 'El importe tiene que ser mayor que 0' : null,
    fecha: !isValidISODate(fecha) ? 'Escribe una fecha válida' : null,
  }
  const hasErrors = Object.values(errors).some(Boolean)
  const err = (k: keyof typeof errors) => (submitted ? errors[k] : null)

  // Aviso si se saca más dinero del que hay en el producto.
  let saldoOrigen: number | null = null
  if (origenRef?.kind === 'producto') {
    const pos = positions.get(origenRef.id)
    if (pos) {
      saldoOrigen = pos.saldo
      if (existing && existing.origen.kind === 'producto' && existing.origen.id === origenRef.id) saldoOrigen += existing.importe
    }
  }
  const exceeds = saldoOrigen !== null && amount !== null && amount > saldoOrigen + 0.005

  const save = () => {
    setSubmitted(true)
    if (hasErrors || !origenRef || !destinoRef || amount === null) return
    const data = { fecha, origen: origenRef, destino: destinoRef, importe: amount, concepto }
    if (existing) {
      updateMovimiento(existing.id, data)
      toast('Movimiento actualizado')
    } else {
      addMovimiento(data)
      toast('Movimiento guardado')
    }
    close(modalId)
  }

  const remove = async () => {
    if (!existing) return
    const ok = await confirmDialog({
      title: '¿Eliminar este movimiento?',
      message: 'Los saldos se recalcularán automáticamente. Esta acción no se puede deshacer.',
      confirmLabel: 'Eliminar',
      danger: true,
    })
    if (ok) {
      removeMovimiento(existing.id)
      toast('Movimiento eliminado')
      close(modalId)
    }
  }

  const onSelect = (kind: EntityKind, value: string, set: (v: string) => void) => {
    if (value !== NEW) return set(value)
    if (kind === 'cuenta') openAccount({ onCreated: (id) => set(refKey({ kind: 'cuenta', id })) })
    else openProduct({ onCreated: (id) => set(refKey({ kind: 'producto', id })) })
  }

  const options = (kind: EntityKind, exclude: string) => {
    if (kind === 'cuenta') {
      return (
        <>
          {ws.cuentas.map((c) => {
            const k = refKey({ kind: 'cuenta', id: c.id })
            return (
              <option key={c.id} value={k} disabled={k === exclude}>
                {c.nombre}
                {c.entidad ? ` · ${c.entidad}` : ''}
              </option>
            )
          })}
          <option value={NEW}>＋ Crear una cuenta nueva…</option>
        </>
      )
    }
    return (
      <>
        {PRODUCT_TYPES.map((t) => {
          const list = ws.productos.filter((p) => p.tipo === t)
          if (!list.length) return null
          return (
            <optgroup key={t} label={PRODUCT_META[t].plural}>
              {list.map((p) => {
                const k = refKey({ kind: 'producto', id: p.id })
                const pos = positions.get(p.id)
                const saldo = pos && pos.saldo > 0.005 && !hidden ? ` (${fmtEUR(pos.saldo)})` : ''
                return (
                  <option key={p.id} value={k} disabled={k === exclude}>
                    {p.nombre}
                    {saldo}
                  </option>
                )
              })}
            </optgroup>
          )
        })}
        <option value={NEW}>＋ Crear un producto nuevo…</option>
      </>
    )
  }

  const placeholder = (kind: EntityKind) => (kind === 'cuenta' ? 'Elige una cuenta…' : 'Elige un producto…')
  const oName = origenRef ? entityName(lookup, origenRef) : null
  const dName = destinoRef ? entityName(lookup, destinoRef) : null
  const avatarFor = (ref: EntityRef | null) =>
    ref ? (
      <EntityAvatar
        cuenta={ref.kind === 'cuenta' ? lookup.cuentas.get(ref.id) : undefined}
        producto={ref.kind === 'producto' ? lookup.productos.get(ref.id) : undefined}
        size="sm"
      />
    ) : (
      <span className="size-8 shrink-0 rounded-lg border-2 border-dashed border-slate-200" />
    )

  return (
    <Sheet
      title={existing ? 'Editar movimiento' : 'Nuevo movimiento'}
      subtitle="Indica de dónde sale el dinero y a dónde va"
      onClose={() => close(modalId)}
      footer={
        <div className="flex items-center gap-2">
          {existing && <Button variant="ghost" icon={Trash2} onClick={remove} className="text-rose-600 hover:bg-rose-50" aria-label="Eliminar movimiento" />}
          <div className="flex-1" />
          <Button variant="secondary" onClick={() => close(modalId)}>
            Cancelar
          </Button>
          <Button onClick={save}>{existing ? 'Guardar cambios' : 'Guardar movimiento'}</Button>
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
        {/* Tipo */}
        <fieldset>
          <legend className="mb-2 text-sm font-medium text-slate-700">¿Qué quieres registrar?</legend>
          <div className="grid grid-cols-2 gap-2">
            {MOVEMENT_TYPES.map((t) => {
              const m = MOVEMENT_META[t]
              const Icon = MOVEMENT_ICONS[t]
              const active = t === tipo
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => changeTipo(t)}
                  aria-pressed={active}
                  className={cn(
                    'flex items-start gap-2.5 rounded-xl border p-3 text-left transition-all',
                    active ? 'border-transparent ring-2' : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50',
                  )}
                  style={active ? ({ backgroundColor: m.soft, '--tw-ring-color': m.color } as CSSProperties) : undefined}
                >
                  <span className="mt-0.5 inline-flex size-7 shrink-0 items-center justify-center rounded-lg" style={{ backgroundColor: active ? 'white' : m.soft, color: m.color }}>
                    <Icon className="size-4" strokeWidth={2.5} />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold" style={{ color: active ? m.text : undefined }}>
                      {m.label}
                    </span>
                    <span className="block text-xs leading-snug text-slate-500">{m.description}</span>
                  </span>
                </button>
              )
            })}
          </div>
        </fieldset>

        {/* De → A */}
        <div className="rounded-2xl bg-slate-50 p-3.5 sm:p-4">
          <Field
            label={
              <span>
                <span className="mr-1.5 rounded bg-slate-900 px-1.5 py-0.5 text-[11px] font-bold tracking-wide text-white">DE</span>
                {meta.from === 'cuenta' ? 'Cuenta de origen' : 'Producto de origen'}
              </span>
            }
            htmlFor="mov-origen"
            error={err('origen')}
            hint={saldoOrigen !== null && !hidden ? `Saldo actual: ${fmtEUR(saldoOrigen)}` : undefined}
          >
            <SelectInput
              id="mov-origen"
              value={origen}
              invalid={!!err('origen')}
              onChange={(e) => onSelect(meta.from, e.target.value, setOrigen)}
              data-autofocus
            >
              <option value="" disabled>
                {placeholder(meta.from)}
              </option>
              {options(meta.from, destino)}
            </SelectInput>
          </Field>

          <div className="my-2 flex justify-center text-slate-400" aria-hidden>
            <span className="inline-flex size-8 items-center justify-center rounded-full border border-slate-200 bg-white">
              <ArrowDown className="size-4" />
            </span>
          </div>

          <Field
            label={
              <span>
                <span className="mr-1.5 rounded bg-slate-900 px-1.5 py-0.5 text-[11px] font-bold tracking-wide text-white">A</span>
                {meta.to === 'cuenta' ? 'Cuenta de destino' : 'Producto de destino'}
              </span>
            }
            htmlFor="mov-destino"
            error={err('destino')}
          >
            <SelectInput
              id="mov-destino"
              value={destino}
              invalid={!!err('destino')}
              onChange={(e) => onSelect(meta.to, e.target.value, setDestino)}
            >
              <option value="" disabled>
                {placeholder(meta.to)}
              </option>
              {options(meta.to, origen)}
            </SelectInput>
          </Field>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1.4fr_1fr]">
          <Field label="Importe" htmlFor="mov-importe" error={err('importe')}>
            <NumberInput
              id="mov-importe"
              big
              suffix="€"
              placeholder="0,00"
              value={importe}
              invalid={!!err('importe')}
              onChange={(e) => setImporte(e.target.value)}
              onBlur={() => {
                const n = parseNumber(importe)
                if (n !== null && n > 0) setImporte(fmtNumberInput(n, 'fixed'))
              }}
            />
          </Field>
          <Field label="Fecha" htmlFor="mov-fecha" error={err('fecha')}>
            <TextInput id="mov-fecha" type="date" className="h-14" value={fecha} max="2100-12-31" onChange={(e) => setFecha(e.target.value)} />
          </Field>
        </div>

        <Field label="Concepto" htmlFor="mov-concepto" optional>
          <TextInput
            id="mov-concepto"
            placeholder="Ej.: Aportación mensual, vencimiento…"
            value={concepto}
            maxLength={120}
            onChange={(e) => setConcepto(e.target.value)}
          />
        </Field>

        {exceeds && saldoOrigen !== null && (
          <div className="flex gap-2.5 rounded-xl bg-amber-50 p-3 text-sm text-amber-800">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" />
            <span>
              El importe supera el saldo actual de «{oName}» ({hidden ? 'oculto' : fmtEUR(saldoOrigen)}). Puede ser correcto si incluye
              ganancias o intereses.
            </span>
          </div>
        )}
        {fecha > todayISO() && isValidISODate(fecha) && (
          <div className="flex gap-2.5 rounded-xl bg-sky-50 p-3 text-sm text-sky-800">
            <Info className="mt-0.5 size-4 shrink-0" />
            <span>La fecha es futura. El movimiento se tendrá en cuenta igualmente en los saldos.</span>
          </div>
        )}

        {/* Resumen visual */}
        <div className="rounded-2xl border p-4" style={{ borderColor: `${meta.color}33`, backgroundColor: `${meta.soft}66` }}>
          <div className="mb-3 flex items-center justify-between gap-2">
            <span className="text-xs font-semibold tracking-wide uppercase" style={{ color: meta.text }}>
              {meta.label}
            </span>
            <span className="text-lg font-bold text-slate-900 tabular-nums">
              {amount && amount > 0 ? (hidden ? '•••••• €' : fmtEUR(amount)) : '— €'}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex min-w-0 flex-1 items-center gap-2">
              {avatarFor(origenRef)}
              <span className={cn('truncate text-sm font-medium', oName ? 'text-slate-800' : 'text-slate-400')}>{oName ?? 'Origen'}</span>
            </div>
            <ArrowRight className="size-5 shrink-0" style={{ color: meta.color }} />
            <div className="flex min-w-0 flex-1 items-center justify-end gap-2 text-right">
              <span className={cn('truncate text-sm font-medium', dName ? 'text-slate-800' : 'text-slate-400')}>{dName ?? 'Destino'}</span>
              {avatarFor(destinoRef)}
            </div>
          </div>
          {oName && dName && <p className="mt-3 text-[13px] text-slate-600">{EXPLAIN[tipo](oName, dName)}</p>}
        </div>
        <button type="submit" className="hidden" />
      </form>
    </Sheet>
  )
}
