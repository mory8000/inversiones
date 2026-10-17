import { useMemo, useState, type CSSProperties } from 'react'
import { Ban, ChevronDown, Plus, Trash2 } from 'lucide-react'
import type { ProductType } from '../../types'
import { Sheet } from '../ui/Sheet'
import { Field, NumberInput, SelectInput, TextArea, TextInput } from '../ui/Field'
import { Button } from '../ui/Button'
import { PRODUCT_ICONS } from '../ui/icons'
import { PRODUCT_META, PRODUCT_TYPES } from '../../lib/meta'
import { useData } from '../../store/data'
import { useFinance } from '../../store/useFinance'
import { confirmDialog, openAccount, openInvestment, useUI } from '../../store/ui'
import { accion } from '../../store/deshacer'
import { anadirDinero } from '../../store/acciones'
import { fmtDate, fmtEUR, fmtNumberInput, parseNumber } from '../../lib/format'
import { cuentaPrincipal } from '../../lib/titulares'
import { saldoMinimoDesde } from '../../lib/saldo'
import { saleDePaso } from '../../lib/movements'
import { addMonths, isValidISODate } from '../../lib/dates'
import { navigate, paths } from '../../lib/router'
import { cn } from '../../lib/cn'
import { EntitySuggestions, ENTITY_LIST_ID } from './EntitySuggestions'
import { TitularPicker } from '../Titulares'

const PLAZOS = [1, 3, 6, 12, 24]

export function ProductForm({
  modalId,
  productId,
  presetTipo,
  presetTitularId,
  onCreated,
  abrirVentanilla,
}: {
  modalId: string
  productId?: string
  presetTipo?: ProductType
  presetTitularId?: string
  onCreated?: (id: string) => void
  /** Al crearlo, quedarse en Inicio y abrir su ventanilla (en vez de ir a su página). */
  abrirVentanilla?: boolean
}) {
  const close = useUI((s) => s.close)
  const { ws, ds, positions, accounts, today, lookup } = useFinance()
  const hidden = useData((s) => s.hideAmounts)
  const addProducto = useData((s) => s.addProducto)
  const updateProducto = useData((s) => s.updateProducto)
  const removeProducto = useData((s) => s.removeProducto)
  const addMovimiento = useData((s) => s.addMovimiento)
  const existing = productId ? ws.productos.find((p) => p.id === productId) : undefined

  const [tipo, setTipo] = useState<ProductType>(existing?.tipo ?? presetTipo ?? 'fondo')
  const [titularId, setTitularIdRaw] = useState(existing?.titularId ?? presetTitularId ?? ds.titulares[0].id)
  const [nombre, setNombre] = useState(existing?.nombre ?? '')
  const [entidad, setEntidad] = useState(existing?.entidad ?? '')
  const [isin, setIsin] = useState(existing?.isin ?? '')
  const [tae, setTae] = useState(existing?.tae != null ? fmtNumberInput(existing.tae) : '')
  const [vencimiento, setVencimiento] = useState(existing?.vencimiento ?? '')
  const [notas, setNotas] = useState(existing?.notas ?? '')
  const [showMore, setShowMore] = useState(!!(existing?.notas || existing?.isin))

  // Primera aportación (solo al crear desde la lista de productos).
  const offerFirst = !existing && (!onCreated || !!abrirVentanilla)
  /** Cuenta propuesta para la primera aportación: la principal del titular (su MyInvestor). */
  const cuentaPropuesta = (tid: string) => {
    const own = ws.cuentas.filter((c) => c.titularId === tid)
    return cuentaPrincipal(ws.cuentas, tid)?.id ?? (own.length === 1 ? own[0].id : ws.cuentas.length === 1 ? ws.cuentas[0].id : '')
  }
  const [cuenta, setCuentaRaw] = useState(() => cuentaPropuesta(presetTitularId ?? ds.titulares[0].id))
  const [cuentaElegida, setCuentaElegida] = useState(false)
  const setCuenta = (id: string) => {
    setCuentaRaw(id)
    setCuentaElegida(true)
  }
  const setTitularId = (id: string) => {
    setTitularIdRaw(id)
    if (!cuentaElegida) setCuentaRaw(cuentaPropuesta(id))
  }
  const [importe, setImporte] = useState('')
  const [fecha, setFecha] = useState(today)
  const [submitted, setSubmitted] = useState(false)

  const isDeposit = tipo === 'deposito'
  const taeNum = tae.trim() ? parseNumber(tae) : null
  const firstAmount = importe.trim() ? parseNumber(importe) : null
  const wantsFirst = offerFirst && importe.trim() !== ''

  // La primera aportación desde una cuenta con saldo (MyInvestor) no puede ser mayor que lo que hay.
  // Si sale de la cuenta del principal hacia una inversión de otro titular es dinero desviado: en
  // lo suyo no cuenta como inversión, pero sale de la cuenta igual, así que se comprueba igual.
  const cuentaElegidaObj = ws.cuentas.find((c) => c.id === cuenta)
  const primeraDePaso = !!cuentaElegidaObj && saleDePaso(lookup, cuentaElegidaObj.id, titularId)
  const disponible =
    wantsFirst && cuentaElegidaObj && !cuentaElegidaObj.externa && isValidISODate(fecha)
      ? Math.max(0, saldoMinimoDesde(ws.movimientos, cuentaElegidaObj.id, fecha))
      : null
  const sinSaldo = disponible !== null && firstAmount !== null && firstAmount > disponible + 0.005

  const errors = {
    nombre: !nombre.trim() ? 'Ponle un nombre al producto' : null,
    tae: isDeposit && tae.trim() && (taeNum === null || taeNum < 0 || taeNum > 100) ? 'Escribe un interés válido (p. ej. 2,5)' : null,
    vencimiento: isDeposit && vencimiento && !isValidISODate(vencimiento) ? 'Fecha no válida' : null,
    importe: wantsFirst && (firstAmount === null || firstAmount <= 0) ? 'Importe no válido' : null,
    cuenta: wantsFirst && !cuenta ? 'Elige de qué cuenta sale el dinero' : null,
    fecha: wantsFirst && !isValidISODate(fecha) ? 'Fecha no válida' : null,
    saldo: sinSaldo ? 'No hay suficiente dinero en la cuenta' : null,
  }
  const hasErrors = Object.values(errors).some(Boolean)
  const err = (k: keyof typeof errors) => (submitted ? errors[k] : null)

  const openingDate = useMemo(() => {
    if (wantsFirst && isValidISODate(fecha)) return fecha
    if (existing) {
      const first = positions.get(existing.id)?.primeraFecha
      if (first) return first
    }
    return today
  }, [wantsFirst, fecha, existing, positions, today])

  const save = () => {
    setSubmitted(true)
    if (hasErrors) return
    const data = {
      titularId,
      tipo,
      nombre: nombre.trim(),
      entidad: entidad.trim(),
      isin: isDeposit ? '' : isin.trim().toUpperCase(),
      notas: notas.trim(),
      tae: isDeposit ? taeNum : null,
      vencimiento: isDeposit && vencimiento ? vencimiento : null,
    }
    if (existing) {
      accion(`Cambiar inversión «${data.nombre}»`, () => updateProducto(existing.id, data), 'Inversión actualizada')
      close(modalId)
      return
    }
    const id = accion(
      `Nueva inversión «${data.nombre}»${wantsFirst && firstAmount && !hidden ? ` con ${fmtEUR(firstAmount)}` : ''}`,
      () => {
        const nuevo = addProducto(data)
        if (wantsFirst && firstAmount && cuenta) {
          addMovimiento({ fecha, origen: { kind: 'cuenta', id: cuenta }, destino: { kind: 'producto', id: nuevo }, importe: firstAmount, concepto: 'Aportación inicial' })
        }
        return nuevo
      },
      `${PRODUCT_META[tipo].label} creado`,
    )
    close(modalId)
    if (onCreated) onCreated(id)
    else if (abrirVentanilla) openInvestment(id)
    else navigate(paths.producto(id))
  }

  const remove = async () => {
    if (!existing) return
    const n = positions.get(existing.id)?.numMovimientos ?? 0
    const ok = await confirmDialog({
      title: `¿Eliminar «${existing.nombre}»?`,
      message:
        n > 0
          ? `También se eliminarán sus ${n} movimiento${n === 1 ? '' : 's'}. Si te equivocas, pulsa «Deshacer».`
          : 'Si te equivocas, pulsa «Deshacer».',
      confirmLabel: 'Eliminar',
      danger: true,
    })
    if (ok) {
      accion(`Eliminar inversión «${existing.nombre}»`, () => removeProducto(existing.id), 'Inversión eliminada')
      close(modalId)
      navigate(paths.productos())
    }
  }

  return (
    <Sheet
      title={existing ? 'Editar producto' : 'Nuevo producto'}
      subtitle={existing ? existing.nombre : 'Depósito, fondo, cartera…'}
      onClose={() => close(modalId)}
      footer={
        <div className="flex items-center gap-2">
          {existing && <Button variant="ghost" icon={Trash2} onClick={remove} className="text-rose-600 hover:bg-rose-50" aria-label="Eliminar producto" />}
          <div className="flex-1" />
          <Button variant="secondary" wrap className="min-w-0" onClick={() => close(modalId)}>
            Cancelar
          </Button>
          <Button onClick={save} wrap className="min-w-0">
            {existing ? 'Guardar cambios' : 'Crear producto'}
          </Button>
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
        <TitularPicker
          value={titularId}
          onChange={setTitularId}
          label="¿De quién es el producto?"
          hint="Lo que se invierta en él cuenta para este titular, aunque el dinero salga de la cuenta de otro."
        />
        <fieldset>
          <legend className="mb-2 text-sm font-medium text-slate-700">Tipo de producto</legend>
          <div className="grid grid-cols-3 gap-2">
            {PRODUCT_TYPES.map((t) => {
              const meta = PRODUCT_META[t]
              const Icon = PRODUCT_ICONS[t]
              const active = t === tipo
              return (
                <button
                  key={t}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setTipo(t)}
                  className={cn(
                    'flex flex-col items-center gap-1.5 rounded-xl border px-2 py-3 text-center transition-all',
                    active ? 'border-transparent ring-2' : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50',
                  )}
                  style={active ? ({ backgroundColor: meta.soft, '--tw-ring-color': meta.color } as CSSProperties) : undefined}
                >
                  <span className="inline-flex size-8 items-center justify-center rounded-lg" style={{ backgroundColor: active ? 'white' : meta.soft, color: meta.color }}>
                    <Icon className="size-[18px]" strokeWidth={2.3} />
                  </span>
                  <span className="text-[12.5px] leading-tight font-semibold" style={{ color: active ? meta.text : '#334155' }}>
                    {meta.label}
                  </span>
                </button>
              )
            })}
          </div>
          <p className="mt-2 text-[13px] text-slate-500">{PRODUCT_META[tipo].hint}</p>
        </fieldset>

        <Field label="Nombre" htmlFor="prod-nombre" error={err('nombre')}>
          <TextInput
            id="prod-nombre"
            data-autofocus
            invalid={!!err('nombre')}
            placeholder={
              isDeposit ? 'Ej.: Depósito 12 meses' : tipo === 'cartera' ? 'Ej.: Cartera indexada Metal' : tipo === 'plan' ? 'Ej.: Plan indexado global' : 'Ej.: Vanguard Global Stock Index'
            }
            value={nombre}
            maxLength={80}
            onChange={(e) => setNombre(e.target.value)}
          />
        </Field>

        <Field label="Entidad" htmlFor="prod-entidad" optional>
          <TextInput id="prod-entidad" list={ENTITY_LIST_ID} placeholder="Ej.: MyInvestor" value={entidad} maxLength={60} onChange={(e) => setEntidad(e.target.value)} />
        </Field>

        {isDeposit && (
          <div className="space-y-4 rounded-2xl bg-amber-50/60 p-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field
                label={existing?.cambiosTae?.length ? 'Interés al contratarlo (TAE)' : 'Interés (TAE)'}
                htmlFor="prod-tae"
                error={err('tae')}
                hint={existing ? 'Si el interés cambia, usa «Cambiar interés» en su ventanilla (desde una fecha)' : 'Interés anual del depósito'}
              >
                <NumberInput id="prod-tae" suffix="%" placeholder="2,50" value={tae} invalid={!!err('tae')} onChange={(e) => setTae(e.target.value)} />
              </Field>
              <Field label="Fecha de vencimiento" htmlFor="prod-venc" error={err('vencimiento')} optional>
                <TextInput id="prod-venc" type="date" value={vencimiento} onChange={(e) => setVencimiento(e.target.value)} />
              </Field>
            </div>
            <div>
              <div className="mb-1.5 text-[13px] text-slate-600">Plazo rápido (desde {openingDate === today ? 'hoy' : 'la apertura'}):</div>
              <div className="flex flex-wrap gap-1.5">
                {PLAZOS.map((m) => {
                  const v = addMonths(openingDate, m)
                  return (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setVencimiento(v)}
                      className={cn(
                        'h-8 rounded-full border px-3 text-[13px] font-semibold transition-colors',
                        vencimiento === v ? 'border-amber-500 bg-amber-500 text-white' : 'border-amber-200 bg-white text-amber-800 hover:bg-amber-100',
                      )}
                    >
                      {m} {m === 1 ? 'mes' : 'meses'}
                    </button>
                  )
                })}
              </div>
            </div>
          </div>
        )}

        {offerFirst && (
          <div className="rounded-2xl border border-slate-200 p-4">
            <div className="mb-3">
              <div className="text-sm font-semibold text-slate-800">Primera aportación</div>
              <p className="text-[13px] text-slate-500">Opcional: registra ya el dinero que has metido y de qué cuenta sale.</p>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Importe" htmlFor="prod-importe" error={err('importe')}>
                <NumberInput id="prod-importe" suffix="€" placeholder="0,00" value={importe} invalid={!!err('importe')} onChange={(e) => setImporte(e.target.value)} />
              </Field>
              <Field label="Fecha" htmlFor="prod-fecha" error={err('fecha')}>
                <TextInput id="prod-fecha" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
              </Field>
            </div>
            <Field label="De la cuenta" htmlFor="prod-cuenta" error={err('cuenta')} className="mt-4">
              <SelectInput
                id="prod-cuenta"
                value={cuenta}
                invalid={!!err('cuenta')}
                onChange={(e) => {
                  if (e.target.value === '__new__') openAccount({ presetTitularId: titularId, onCreated: (id) => setCuenta(id) })
                  else setCuenta(e.target.value)
                }}
              >
                <option value="">Elige una cuenta…</option>
                {ds.titulares.map((t) => {
                  const list = [...ws.cuentas.filter((c) => c.titularId === t.id && !c.externa), ...ws.cuentas.filter((c) => c.titularId === t.id && c.externa)]
                  if (!list.length) return null
                  const options = list.map((c) => {
                    const st = accounts.get(c.id)
                    return (
                      <option key={c.id} value={c.id}>
                        {c.nombre}
                        {c.externa ? ` · ${c.entidad ? `${c.entidad} · ` : ''}externa` : st && !hidden ? ` (saldo ${fmtEUR(st.saldo)})` : ''}
                      </option>
                    )
                  })
                  return ds.titulares.length > 1 ? (
                    <optgroup key={t.id} label={`Cuentas de ${t.nombre}`}>
                      {options}
                    </optgroup>
                  ) : (
                    options
                  )
                })}
                <option value="__new__">＋ Crear una cuenta nueva…</option>
              </SelectInput>
            </Field>
            {disponible !== null && !sinSaldo && !hidden && (
              <p className="mt-2 text-[13px] text-slate-500">
                Disponible en «{cuentaElegidaObj?.nombre}»: {fmtEUR(disponible)}
                {fecha < today ? ` (el ${fmtDate(fecha)})` : ''}
              </p>
            )}
            {sinSaldo && cuentaElegidaObj && (
              <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800" role="alert" data-sin-saldo>
                <p className="flex items-center gap-2 font-semibold">
                  <Ban className="size-4 shrink-0" /> No hay suficiente dinero en «{cuentaElegidaObj.nombre}»
                </p>
                <p className="mt-1">
                  Hay {hidden ? '•••••• €' : fmtEUR(disponible ?? 0)} disponibles: no se puede aportar más. Añade dinero primero o pon un importe menor.
                </p>
                <Button size="sm" icon={Plus} wrap className="mt-2.5" onClick={() => anadirDinero(ds, cuentaElegidaObj.id)}>
                  Añadir dinero a «{cuentaElegidaObj.nombre}»
                </Button>
              </div>
            )}
            {(() => {
              const c = ws.cuentas.find((x) => x.id === cuenta)
              const from = c && ds.titulares.find((t) => t.id === c.titularId)
              const to = ds.titulares.find((t) => t.id === titularId)
              return c && from && to && c.titularId !== titularId ? (
                <p className="mt-2 rounded-xl bg-fuchsia-50 px-3 py-2 text-[13px] text-fuchsia-900">
                  {primeraDePaso
                    ? `Sale de «${c.nombre}» (de ${from.nombre}) de paso: no cuenta como inversión para ${from.nombre} (el dinero sale igual de su cuenta), y cuenta como inversión de ${to.nombre}.`
                    : `Sale de una cuenta de ${from.nombre}: cuenta como inversión de ${to.nombre}, no de ${from.nombre}.`}
                </p>
              ) : null
            })()}
          </div>
        )}

        <div>
          <button
            type="button"
            onClick={() => setShowMore((v) => !v)}
            className="flex items-center gap-1.5 text-sm font-semibold text-brand-600 hover:text-brand-700"
            aria-expanded={showMore}
          >
            <ChevronDown className={cn('size-4 transition-transform', showMore && 'rotate-180')} />
            Más datos {isDeposit ? '(notas)' : '(ISIN, notas)'}
          </button>
          {showMore && (
            <div className="mt-3 space-y-4">
              {!isDeposit && (
                <Field label="ISIN" htmlFor="prod-isin" optional hint="Código de 12 caracteres que identifica el fondo o valor">
                  <TextInput
                    id="prod-isin"
                    placeholder="Ej.: IE00B03HD191"
                    value={isin}
                    maxLength={12}
                    className="uppercase"
                    onChange={(e) => setIsin(e.target.value)}
                  />
                </Field>
              )}
              <Field label="Notas" htmlFor="prod-notas" optional>
                <TextArea id="prod-notas" value={notas} maxLength={500} onChange={(e) => setNotas(e.target.value)} />
              </Field>
            </div>
          )}
        </div>
        <button type="submit" className="hidden" />
      </form>
    </Sheet>
  )
}
