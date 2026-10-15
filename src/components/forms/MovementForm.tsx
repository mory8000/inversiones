import { useState, type CSSProperties } from 'react'
import { ArrowDown, ArrowRight, CalendarSync, Info, Trash2, TriangleAlert } from 'lucide-react'
import type { EntityKind, EntityRef, MovementType, Titular } from '../../types'
import { Sheet } from '../ui/Sheet'
import { Field, NumberInput, SelectInput, TextInput } from '../ui/Field'
import { Button } from '../ui/Button'
import { Switch } from '../ui/Switch'
import { EntityAvatar, MOVEMENT_ICONS } from '../ui/icons'
import { CROSS_META, MOVEMENT_META, MOVEMENT_TYPES, PRODUCT_META, PRODUCT_TYPES, inferMovementType } from '../../lib/meta'
import { useData } from '../../store/data'
import { useFinance } from '../../store/useFinance'
import { confirmDialog, openAccount, openProduct, openProgramada, toast, useUI, type MovementPreset } from '../../store/ui'
import { fmtDate, fmtEUR, fmtNumberInput, parseNumber } from '../../lib/format'
import { isValidISODate, todayISO } from '../../lib/dates'
import { entityName, parseRefKey, refKey } from '../../lib/movements'
import { diaDe, fechasDebidas, movimientosDe } from '../../lib/programadas'
import { cn } from '../../lib/cn'

const NEW = '__new__'

const EXPLAIN: Record<MovementType, (o: string, d: string) => string> = {
  inversion: (o, d) => `Sale dinero de «${o}» y se invierte en «${d}».`,
  reembolso: (o, d) => `Recuperas dinero de «${o}» y vuelve a «${d}».`,
  traspaso: (o, d) => `Mueves dinero de «${o}» a «${d}» sin pasar por tu cuenta.`,
  transferencia: (o, d) => `Mueves dinero entre tus cuentas: de «${o}» a «${d}».`,
}

/** Explicación cuando el dinero va de un titular a otro. */
function explainCross(o: string, d: string, from: Titular, to: Titular, destino: EntityKind): string {
  if (destino === 'producto') return `Sale dinero de «${o}» (de ${from.nombre}) y se invierte en «${d}» (de ${to.nombre}). Cuenta como inversión de ${to.nombre}, no de ${from.nombre}.`
  return `Pasa dinero de «${o}» (de ${from.nombre}) a «${d}» (de ${to.nombre}). No cuenta como inversión de ${from.nombre}; para ${to.nombre} lo será cuando lo invierta.`
}

const dayLabel = (iso: string) => (isValidISODate(iso) ? `el día ${diaDe({ inicio: iso })}` : 'el mismo día')

export function MovementForm({
  modalId,
  movementId,
  programadaId,
  preset,
}: {
  modalId: string
  movementId?: string
  programadaId?: string
  preset?: MovementPreset
}) {
  const close = useUI((s) => s.close)
  const { ws, ds, positions, lookup, today, owner } = useFinance()
  const hidden = useData((s) => s.hideAmounts)
  const addMovimiento = useData((s) => s.addMovimiento)
  const updateMovimiento = useData((s) => s.updateMovimiento)
  const removeMovimiento = useData((s) => s.removeMovimiento)
  const addProgramada = useData((s) => s.addProgramada)
  const updateProgramada = useData((s) => s.updateProgramada)
  const removeProgramada = useData((s) => s.removeProgramada)
  const existing = movementId ? ws.movimientos.find((m) => m.id === movementId) : undefined
  const prog = programadaId ? ds.programadas.find((p) => p.id === programadaId) : undefined
  /** Si este movimiento lo apuntó una transferencia mensual. */
  const parent = existing?.programadaId ? ds.programadas.find((p) => p.id === existing.programadaId) : undefined
  const multi = ds.titulares.length > 1

  const startOrigen = existing?.origen ?? prog?.origen ?? preset?.origen
  const startDestino = existing?.destino ?? prog?.destino ?? preset?.destino
  const initialTipo: MovementType =
    existing?.tipo ?? (startOrigen && startDestino ? inferMovementType(startOrigen.kind, startDestino.kind) : (preset?.tipo ?? 'inversion'))

  const [tipo, setTipo] = useState<MovementType>(initialTipo)
  const [origen, setOrigen] = useState(startOrigen ? refKey(startOrigen) : '')
  const [destino, setDestino] = useState(startDestino ? refKey(startDestino) : '')
  const startImporte = existing?.importe ?? prog?.importe
  const [importe, setImporte] = useState(startImporte ? fmtNumberInput(startImporte, 'fixed') : '')
  const [fecha, setFecha] = useState(existing?.fecha ?? prog?.inicio ?? today)
  const [concepto, setConcepto] = useState(existing?.concepto ?? prog?.concepto ?? preset?.concepto ?? '')
  const [repetir, setRepetir] = useState(!!prog || (!existing && !!preset?.repetir))
  const [fin, setFin] = useState(prog?.fin ?? '')
  const [submitted, setSubmitted] = useState(false)

  const meta = MOVEMENT_META[tipo]
  const origenRef = parseRefKey(origen)
  const destinoRef = parseRefKey(destino)
  const amount = parseNumber(importe)
  const fromT = origenRef ? lookup.titulares.get(owner(origenRef) ?? '') : undefined
  const toT = destinoRef ? lookup.titulares.get(owner(destinoRef) ?? '') : undefined
  const cross = !!fromT && !!toT && fromT.id !== toT.id

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
    fin: repetir && fin && (!isValidISODate(fin) || fin < fecha) ? 'Tiene que ser posterior a la primera fecha' : null,
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
  const exceeds = !repetir && saldoOrigen !== null && amount !== null && amount > saldoOrigen + 0.005

  // Transferencia mensual: cuántas se apuntan ya (desde la primera fecha hasta hoy).
  const debidas = repetir && isValidISODate(fecha) ? fechasDebidas({ inicio: fecha, fin: fin && isValidISODate(fin) ? fin : null }, today) : []
  const yaApuntadas = prog ? movimientosDe(ds, prog.id).length : 0

  const save = () => {
    setSubmitted(true)
    if (hasErrors || !origenRef || !destinoRef || amount === null) return
    if (repetir) {
      const data = { origen: origenRef, destino: destinoRef, importe: amount, inicio: fecha, fin: fin || null, concepto }
      if (prog) {
        updateProgramada(prog.id, data)
        toast('Transferencia mensual actualizada')
      } else {
        addProgramada(data)
        toast(debidas.length ? `Transferencia mensual guardada: ${debidas.length} apuntada${debidas.length === 1 ? '' : 's'} hasta hoy` : 'Transferencia mensual guardada')
      }
    } else {
      const data = { fecha, origen: origenRef, destino: destinoRef, importe: amount, concepto }
      if (existing) {
        updateMovimiento(existing.id, data)
        toast('Movimiento actualizado')
      } else {
        addMovimiento(data)
        toast('Movimiento guardado')
      }
    }
    close(modalId)
  }

  const remove = async () => {
    if (prog) {
      const n = movimientosDe(ds, prog.id).length
      const ok = await confirmDialog({
        title: '¿Eliminar la transferencia mensual?',
        message:
          n > 0
            ? `Dejará de apuntarse cada mes y se borrarán también las ${n} transferencia${n === 1 ? '' : 's'} ya apuntada${n === 1 ? '' : 's'}. Si solo quieres que no siga, pon una fecha en «Hasta».`
            : 'Dejará de apuntarse cada mes.',
        confirmLabel: 'Eliminar',
        danger: true,
      })
      if (ok) {
        removeProgramada(prog.id)
        toast('Transferencia mensual eliminada')
        close(modalId)
      }
      return
    }
    if (!existing) return
    const ok = await confirmDialog({
      title: '¿Eliminar este movimiento?',
      message: parent
        ? 'Los saldos se recalcularán. Este mes no se volverá a apuntar; los demás meses de la transferencia mensual siguen igual.'
        : 'Los saldos se recalcularán automáticamente. Esta acción no se puede deshacer.',
      confirmLabel: 'Eliminar',
      danger: true,
    })
    if (ok) {
      removeMovimiento(existing.id)
      toast('Movimiento eliminado')
      close(modalId)
    }
  }

  /** Titular por defecto para lo que se cree desde aquí. */
  const defaultTitular = (side: 'origen' | 'destino') => {
    const presetId = side === 'origen' ? preset?.origenTitularId : preset?.destinoTitularId
    if (presetId) return presetId
    const other = side === 'origen' ? destinoRef : origenRef
    return (other && owner(other)) || ds.titulares[0].id
  }

  const onSelect = (kind: EntityKind, side: 'origen' | 'destino', value: string, set: (v: string) => void) => {
    if (value !== NEW) return set(value)
    const presetTitularId = defaultTitular(side)
    if (kind === 'cuenta') openAccount({ presetTitularId, onCreated: (id) => set(refKey({ kind: 'cuenta', id })) })
    else openProduct({ presetTitularId, onCreated: (id) => set(refKey({ kind: 'producto', id })) })
  }

  const options = (kind: EntityKind, exclude: string) => {
    if (kind === 'cuenta') {
      return (
        <>
          {ds.titulares.map((t) => {
            const list = ws.cuentas.filter((c) => c.titularId === t.id)
            if (!list.length) return null
            const opts = list.map((c) => {
              const k = refKey({ kind: 'cuenta', id: c.id })
              return (
                <option key={c.id} value={k} disabled={k === exclude}>
                  {c.nombre}
                  {c.entidad ? ` · ${c.entidad}` : ''}
                </option>
              )
            })
            return multi ? (
              <optgroup key={t.id} label={`Cuentas de ${t.nombre}`}>
                {opts}
              </optgroup>
            ) : (
              opts
            )
          })}
          <option value={NEW}>＋ Crear una cuenta nueva…</option>
        </>
      )
    }
    return (
      <>
        {ds.titulares.flatMap((t) =>
          PRODUCT_TYPES.map((tp) => {
            const list = ws.productos.filter((p) => p.tipo === tp && p.titularId === t.id)
            if (!list.length) return null
            return (
              <optgroup key={`${t.id}-${tp}`} label={multi ? `${PRODUCT_META[tp].plural} de ${t.nombre}` : PRODUCT_META[tp].plural}>
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
          }),
        )}
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
  const summary = cross ? CROSS_META : meta
  const title = prog ? 'Transferencia mensual' : repetir ? 'Nueva transferencia mensual' : existing ? 'Editar movimiento' : 'Nuevo movimiento'

  return (
    <Sheet
      title={title}
      subtitle={repetir ? 'Se apunta sola cada mes: indica de dónde sale el dinero y a dónde va' : 'Indica de dónde sale el dinero y a dónde va'}
      onClose={() => close(modalId)}
      footer={
        <div className="flex items-center gap-2">
          {(existing || prog) && (
            <Button
              variant="ghost"
              icon={Trash2}
              onClick={remove}
              className="text-rose-600 hover:bg-rose-50"
              aria-label={prog ? 'Eliminar transferencia mensual' : 'Eliminar movimiento'}
            />
          )}
          <div className="flex-1" />
          <Button variant="secondary" onClick={() => close(modalId)}>
            Cancelar
          </Button>
          <Button onClick={save}>{existing || prog ? 'Guardar cambios' : repetir ? 'Guardar transferencia' : 'Guardar movimiento'}</Button>
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
        {parent && (
          <div className="flex gap-2.5 rounded-xl bg-fuchsia-50 p-3 text-sm text-fuchsia-900">
            <CalendarSync className="mt-0.5 size-4 shrink-0" />
            <div className="min-w-0">
              <p>
                Lo apuntó sola la <strong>transferencia mensual</strong> ({fmtEUR(parent.importe)} {dayLabel(parent.inicio)} de cada mes). Si lo cambias aquí,
                solo cambia este mes.
              </p>
              <button
                type="button"
                onClick={() => {
                  close(modalId)
                  openProgramada({ programadaId: parent.id })
                }}
                className="mt-1.5 font-semibold text-fuchsia-800 underline underline-offset-2 hover:text-fuchsia-950"
              >
                Cambiar la transferencia mensual (todos los meses)
              </button>
            </div>
          </div>
        )}

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
            hint={
              [multi && fromT ? `De ${fromT.nombre}` : null, saldoOrigen !== null && !hidden ? `Saldo actual: ${fmtEUR(saldoOrigen)}` : null]
                .filter(Boolean)
                .join(' · ') || undefined
            }
          >
            <SelectInput
              id="mov-origen"
              value={origen}
              invalid={!!err('origen')}
              onChange={(e) => onSelect(meta.from, 'origen', e.target.value, setOrigen)}
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
            hint={multi && toT ? `De ${toT.nombre}` : undefined}
          >
            <SelectInput
              id="mov-destino"
              value={destino}
              invalid={!!err('destino')}
              onChange={(e) => onSelect(meta.to, 'destino', e.target.value, setDestino)}
            >
              <option value="" disabled>
                {placeholder(meta.to)}
              </option>
              {options(meta.to, origen)}
            </SelectInput>
          </Field>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1.4fr_1fr]">
          <Field label={repetir ? 'Importe cada mes' : 'Importe'} htmlFor="mov-importe" error={err('importe')}>
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
          <Field label={repetir ? 'Primera fecha' : 'Fecha'} htmlFor="mov-fecha" error={err('fecha')}>
            <TextInput id="mov-fecha" type="date" className="h-14" value={fecha} max="2100-12-31" onChange={(e) => setFecha(e.target.value)} />
          </Field>
        </div>

        {/* Repetir cada mes */}
        {!existing && (
          <div className={cn('rounded-2xl border p-3.5 sm:p-4', repetir ? 'border-fuchsia-200 bg-fuchsia-50/60' : 'border-slate-200')}>
            {!prog && (
              <div className="flex items-start justify-between gap-3">
                <label htmlFor="mov-repetir" className="min-w-0">
                  <span className="flex items-center gap-1.5 text-sm font-semibold text-slate-900">
                    <CalendarSync className="size-4 text-fuchsia-600" /> Repetir cada mes
                  </span>
                  <span className="mt-0.5 block text-[13px] text-slate-500">La app lo apuntará sola cada mes, el mismo día (p. ej., una transferencia mensual).</span>
                </label>
                <Switch id="mov-repetir" checked={repetir} onChange={setRepetir} label="Repetir cada mes" />
              </div>
            )}
            {repetir && (
              <div className={cn(!prog && 'mt-4')}>
                <Field label="Hasta" htmlFor="mov-fin" optional error={err('fin')} hint="Déjalo vacío si no tiene fecha de fin">
                  <TextInput id="mov-fin" type="date" value={fin} min={fecha} max="2100-12-31" onChange={(e) => setFin(e.target.value)} />
                </Field>
                <p className="mt-3 text-[13px] text-fuchsia-900">
                  {isValidISODate(fecha) ? (
                    <>
                      Se apuntará <strong>{amount && amount > 0 ? (hidden ? '•••••• €' : fmtEUR(amount)) : 'el importe'}</strong> {dayLabel(fecha)} de cada mes, desde el{' '}
                      {fmtDate(fecha)}
                      {fin && isValidISODate(fin) ? ` hasta el ${fmtDate(fin)}` : ''}.{' '}
                      {prog
                        ? `Ya hay ${yaApuntadas} apuntada${yaApuntadas === 1 ? '' : 's'}; las que no hayas cambiado a mano se actualizarán.`
                        : debidas.length > 0
                          ? `Hasta hoy son ${debidas.length}: se apuntan ya.`
                          : 'La primera se apuntará cuando llegue la fecha.'}
                    </>
                  ) : (
                    'Elige la primera fecha.'
                  )}
                </p>
              </div>
            )}
          </div>
        )}

        <Field label="Concepto" htmlFor="mov-concepto" optional>
          <TextInput
            id="mov-concepto"
            placeholder={repetir ? 'Ej.: Transferencia mensual' : 'Ej.: Aportación mensual, vencimiento…'}
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
        {!repetir && fecha > todayISO() && isValidISODate(fecha) && (
          <div className="flex gap-2.5 rounded-xl bg-sky-50 p-3 text-sm text-sky-800">
            <Info className="mt-0.5 size-4 shrink-0" />
            <span>La fecha es futura. El movimiento se tendrá en cuenta igualmente en los saldos.</span>
          </div>
        )}

        {/* Resumen visual */}
        <div className="rounded-2xl border p-4" style={{ borderColor: `${summary.color}33`, backgroundColor: `${summary.soft}66` }}>
          <div className="mb-3 flex items-center justify-between gap-2">
            <span className="text-xs font-semibold tracking-wide uppercase" style={{ color: summary.text }}>
              {cross ? `${CROSS_META.label}: de ${fromT!.nombre} a ${toT!.nombre}` : meta.label}
              {repetir ? ' · cada mes' : ''}
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
            <ArrowRight className="size-5 shrink-0" style={{ color: summary.color }} />
            <div className="flex min-w-0 flex-1 items-center justify-end gap-2 text-right">
              <span className={cn('truncate text-sm font-medium', dName ? 'text-slate-800' : 'text-slate-400')}>{dName ?? 'Destino'}</span>
              {avatarFor(destinoRef)}
            </div>
          </div>
          {oName && dName && (
            <p className="mt-3 text-[13px] text-slate-600">
              {cross && destinoRef ? explainCross(oName, dName, fromT!, toT!, destinoRef.kind) : EXPLAIN[tipo](oName, dName)}
            </p>
          )}
        </div>
        <button type="submit" className="hidden" />
      </form>
    </Sheet>
  )
}
