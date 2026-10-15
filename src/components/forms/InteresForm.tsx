import { useMemo, useState } from 'react'
import { History, Trash2 } from 'lucide-react'
import type { Producto } from '../../types'
import { Sheet } from '../ui/Sheet'
import { Field, NumberInput, TextInput } from '../ui/Field'
import { Button } from '../ui/Button'
import { Amount } from '../ui/Amount'
import { SignToggle } from './ValuationForm'
import { useData } from '../../store/data'
import { useFinance } from '../../store/useFinance'
import { confirmDialog, useUI } from '../../store/ui'
import { accion } from '../../store/deshacer'
import { evaluateProduct, tramosTae } from '../../lib/finance'
import { fmtDate, fmtNumberInput, fmtPct, parseNumber } from '../../lib/format'
import { isValidISODate } from '../../lib/dates'
import { cn } from '../../lib/cn'

type Desde = 'hoy' | 'fecha' | 'inicio'

/**
 * Cambiar el interés (TAE) de un depósito. Los intereses pueden variar: el nuevo interés rige
 * desde la fecha que se elija (los días anteriores se siguen calculando con el de antes).
 * También se puede corregir el interés inicial.
 */
export function InteresForm({ modalId, productId }: { modalId: string; productId: string }) {
  const close = useUI((s) => s.close)
  const { ws, positions, today } = useFinance()
  const cambiarTae = useData((s) => s.cambiarTae)
  const removeCambioTae = useData((s) => s.removeCambioTae)
  const p = ws.productos.find((x) => x.id === productId)
  const pos = positions.get(productId)
  const actual = pos?.deposito?.tae ?? p?.tae ?? 0

  const [tae, setTae] = useState(fmtNumberInput(Math.abs(actual)))
  const [negativo, setNegativo] = useState(actual < 0)
  const [desde, setDesde] = useState<Desde>('hoy')
  const [fecha, setFecha] = useState(today)
  const [submitted, setSubmitted] = useState(false)

  const abs = parseNumber(tae)
  const nuevo = abs === null ? null : abs < 0 ? abs : negativo ? -abs : abs
  const fechaDesde = desde === 'hoy' ? today : desde === 'fecha' ? fecha : null
  const errors = {
    tae: nuevo === null ? 'Escribe el interés (p. ej. 2,25)' : Math.abs(nuevo) > 100 ? 'Escribe un interés válido' : null,
    fecha: desde === 'fecha' && !isValidISODate(fecha) ? 'Escribe una fecha válida' : null,
  }
  const hasErrors = Object.values(errors).some(Boolean)

  /** Cómo quedaría el depósito con el cambio. */
  const simulado = useMemo(() => {
    if (!p || hasErrors || nuevo === null) return null
    const draft: Producto =
      fechaDesde === null
        ? { ...p, tae: nuevo }
        : { ...p, cambiosTae: [...(p.cambiosTae ?? []).filter((c) => c.desde !== fechaDesde), { id: 'borrador', desde: fechaDesde, tae: nuevo, createdAt: new Date().toISOString() }] }
    return evaluateProduct(draft, ws.movimientos, { asOf: today, mode: 'actual' })
  }, [p, hasErrors, nuevo, fechaDesde, ws.movimientos, today])

  if (!p || !pos) return null
  const tramos = tramosTae(p)
  const cambios = [...(p.cambiosTae ?? [])].sort((a, b) => b.desde.localeCompare(a.desde))

  const save = () => {
    setSubmitted(true)
    if (hasErrors || nuevo === null) return
    const cuando = fechaDesde === null ? 'desde el principio' : `desde el ${fmtDate(fechaDesde)}`
    accion(`Interés de «${p.nombre}»: ${fmtPct(nuevo / 100)} ${cuando}`, () => cambiarTae(p.id, fechaDesde, nuevo), `Interés cambiado: ${fmtPct(nuevo / 100)} ${cuando}`)
    close(modalId)
  }

  const remove = async (id: string, d: string, t: number) => {
    const ok = await confirmDialog({
      title: '¿Quitar este cambio de interés?',
      message: `Se quitará el ${fmtPct(t / 100)} desde el ${fmtDate(d)}: esos días se calcularán con el interés de antes.`,
      confirmLabel: 'Quitar',
      danger: true,
    })
    if (ok) accion(`Quitar el interés del ${fmtDate(d)} de «${p.nombre}»`, () => removeCambioTae(p.id, id), 'Cambio de interés quitado')
  }

  const opcion = (value: Desde, label: string, text: string) => (
    <label
      className={cn(
        'flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors',
        desde === value ? 'border-amber-400 bg-amber-50/70 ring-2 ring-amber-400/30' : 'border-slate-200 hover:bg-slate-50',
      )}
    >
      <input type="radio" name="tae-desde" value={value} checked={desde === value} onChange={() => setDesde(value)} className="mt-1 size-4 accent-amber-600" />
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-slate-900">{label}</span>
        <span className="block text-[13px] text-slate-500">{text}</span>
      </span>
    </label>
  )

  return (
    <Sheet
      title="Cambiar interés (TAE)"
      subtitle={p.nombre}
      onClose={() => close(modalId)}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => close(modalId)}>
            Cancelar
          </Button>
          <Button onClick={save}>Guardar interés</Button>
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
        <div className="rounded-2xl bg-amber-50/70 p-4 text-sm text-amber-900">
          Ahora: <strong>{fmtPct(actual / 100)} TAE</strong>
          {pos.deposito?.taeDesde ? ` desde el ${fmtDate(pos.deposito.taeDesde)}` : ' desde que se contrató'}. Los intereses pueden variar: pon el nuevo y desde
          cuándo rige. Los días de antes se siguen calculando con el interés anterior.
        </div>

        <div>
          <div className="mb-2 text-sm font-medium text-slate-700">¿El interés es positivo o negativo?</div>
          <SignToggle negativo={negativo} onChange={setNegativo} labels={['Positivo (gana)', 'Negativo (pierde)']} />
        </div>

        <Field label="Nuevo interés (TAE)" htmlFor="tae-nuevo" error={submitted ? errors.tae : null} hint="Interés anual, p. ej. 2,25">
          <NumberInput
            id="tae-nuevo"
            big
            suffix="%"
            placeholder="2,25"
            value={tae}
            data-autofocus
            textColor={negativo ? 'text-rose-700' : 'text-amber-800'}
            onChange={(e) => setTae(e.target.value)}
            onBlur={() => {
              // Si se escribe «−1», se pasa a «Negativo» con 1.
              const n = parseNumber(tae)
              if (n !== null && n < 0) {
                setNegativo(true)
                setTae(fmtNumberInput(-n))
              }
            }}
          />
        </Field>

        <fieldset className="space-y-2">
          <legend className="mb-2 text-sm font-medium text-slate-700">¿Desde cuándo?</legend>
          {opcion('hoy', 'Desde hoy', `A partir del ${fmtDate(today)}`)}
          {opcion('fecha', 'Desde otra fecha', 'El día en que el banco cambió el interés')}
          {desde === 'fecha' && (
            <Field label="Fecha del cambio" htmlFor="tae-fecha" error={submitted ? errors.fecha : null} className="pl-7">
              <TextInput id="tae-fecha" type="date" value={fecha} max="2100-12-31" onChange={(e) => setFecha(e.target.value)} />
            </Field>
          )}
          {opcion('inicio', 'Desde el principio', 'Para corregir el interés con el que se contrató')}
        </fieldset>

        {simulado?.deposito && pos.estado !== 'sin-movimientos' && (
          <div className="rounded-2xl border border-brand-100 bg-brand-50/60 p-4" data-resultado>
            <div className="text-xs font-semibold tracking-wide text-brand-700 uppercase">Así quedará</div>
            <dl className="mt-2 grid grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="text-xs text-slate-500">Intereses hasta hoy</dt>
                <dd className="font-semibold text-slate-900">
                  <Amount value={simulado.deposito.interesesHoy} sign />
                </dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Saldo hoy</dt>
                <dd className="font-semibold text-slate-900">
                  <Amount value={simulado.saldo} />
                </dd>
              </div>
              {simulado.deposito.interesesVencimiento !== null && (
                <div className="col-span-2">
                  <dt className="text-xs text-slate-500">Intereses al vencimiento ({fmtDate(simulado.deposito.vencimiento)})</dt>
                  <dd className="font-semibold text-slate-900">
                    <Amount value={simulado.deposito.interesesVencimiento} sign />
                  </dd>
                </div>
              )}
            </dl>
          </div>
        )}

        <div>
          <div className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-slate-700">
            <History className="size-4 text-slate-400" /> Intereses que ha tenido
          </div>
          <ul className="divide-y divide-slate-100 rounded-2xl border border-slate-200">
            {cambios.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-3 py-2 pr-2 pl-4">
                <div className="min-w-0 text-sm">
                  <span className="font-medium text-slate-800">Desde el {fmtDate(c.desde)}</span>
                  <span className="ml-2 font-semibold text-amber-800 tabular-nums">{fmtPct(c.tae / 100)}</span>
                </div>
                <button
                  type="button"
                  onClick={() => remove(c.id, c.desde, c.tae)}
                  className="inline-flex size-9 items-center justify-center rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                  aria-label={`Quitar el interés del ${fmtDate(c.desde)}`}
                >
                  <Trash2 className="size-4" />
                </button>
              </li>
            ))}
            <li className="py-2.5 pr-2 pl-4 text-sm">
              <span className="font-medium text-slate-800">Al contratarlo</span>
              <span className="ml-2 font-semibold text-amber-800 tabular-nums">{fmtPct(tramos[0].tae / 100)}</span>
            </li>
          </ul>
        </div>
        <button type="submit" className="hidden" />
      </form>
    </Sheet>
  )
}
