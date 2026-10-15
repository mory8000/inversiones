import { useMemo, useState } from 'react'
import { History, Info, Trash2, TrendingDown, TrendingUp, TriangleAlert } from 'lucide-react'
import type { Valoracion } from '../../types'
import { Sheet } from '../ui/Sheet'
import { Field, NumberInput, TextInput } from '../ui/Field'
import { Button } from '../ui/Button'
import { Segmented } from '../ui/Segmented'
import { Amount, GainBadge } from '../ui/Amount'
import { useData } from '../../store/data'
import { useFinance } from '../../store/useFinance'
import { confirmDialog, useUI } from '../../store/ui'
import { accion } from '../../store/deshacer'
import { evaluateProduct, latestValuation, sortValuations } from '../../lib/finance'
import { fmtDate, fmtEUR, fmtNumberInput, fmtPct, parseNumber } from '../../lib/format'
import { isValidISODate } from '../../lib/dates'
import { cn } from '../../lib/cn'

/**
 * «¿Sube o baja?»: el signo del % con dos botones grandes (en el móvil, el teclado numérico
 * no tiene la tecla «−»).
 */
export function SignToggle({ negativo, onChange, labels = ['Gana (sube)', 'Pierde (baja)'] }: { negativo: boolean; onChange: (negativo: boolean) => void; labels?: [string, string] }) {
  return (
    <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="¿Gana o pierde?">
      <button
        type="button"
        role="radio"
        aria-checked={!negativo}
        onClick={() => onChange(false)}
        className={cn(
          'flex h-12 items-center justify-center gap-2 rounded-xl border text-sm font-semibold transition-colors',
          !negativo ? 'border-emerald-500 bg-emerald-50 text-emerald-800 ring-2 ring-emerald-500/30' : 'border-slate-200 text-slate-600 hover:bg-slate-50',
        )}
      >
        <TrendingUp className="size-[18px]" strokeWidth={2.4} /> {labels[0]}
      </button>
      <button
        type="button"
        role="radio"
        aria-checked={negativo}
        onClick={() => onChange(true)}
        className={cn(
          'flex h-12 items-center justify-center gap-2 rounded-xl border text-sm font-semibold transition-colors',
          negativo ? 'border-rose-500 bg-rose-50 text-rose-800 ring-2 ring-rose-500/30' : 'border-slate-200 text-slate-600 hover:bg-slate-50',
        )}
      >
        <TrendingDown className="size-[18px]" strokeWidth={2.4} /> {labels[1]}
      </button>
    </div>
  )
}

export function ValuationForm({ modalId, productId }: { modalId: string; productId: string }) {
  const close = useUI((s) => s.close)
  const { ws, positions, today } = useFinance()
  const hidden = useData((s) => s.hideAmounts)
  const addValoracion = useData((s) => s.addValoracion)
  const removeValoracion = useData((s) => s.removeValoracion)
  const producto = ws.productos.find((p) => p.id === productId)
  const pos = positions.get(productId)

  // Por defecto, el % de beneficio o pérdida (como en el Excel).
  const ultima = producto ? latestValuation(producto) : null
  const pctInicial = ultima?.modo === 'porcentaje' ? ultima.porcentaje : pos?.rentabilidad != null && pos.capital > 0 ? Math.round(pos.rentabilidad * 10000) / 100 : null
  const [modo, setModo] = useState<'valor' | 'porcentaje'>('porcentaje')
  const [valor, setValor] = useState(pos && pos.saldo > 0 ? fmtNumberInput(pos.saldo, 'fixed') : '')
  const [pct, setPct] = useState(pctInicial !== null ? fmtNumberInput(Math.abs(pctInicial)) : '')
  const [negativo, setNegativo] = useState(pctInicial !== null && pctInicial < 0)
  const [fecha, setFecha] = useState(today)
  const [submitted, setSubmitted] = useState(false)

  const valorNum = parseNumber(valor)
  const pctAbs = parseNumber(pct)
  /** El % con su signo (el usuario también puede escribir «−3»). */
  const pctNum = pctAbs === null ? null : pctAbs < 0 ? pctAbs : negativo ? -pctAbs : pctAbs
  const error =
    modo === 'valor'
      ? valorNum === null || valorNum < 0
        ? 'Escribe el valor actual en euros'
        : null
      : pctNum === null
        ? 'Escribe el % (por ejemplo, 3)'
        : pctNum <= -100
          ? 'No puede perder el 100 % o más'
          : null
  const dateError = !isValidISODate(fecha) ? 'Fecha no válida' : null

  const simulated = useMemo(() => {
    if (!producto || error || dateError) return null
    const draft: Valoracion = {
      id: 'borrador',
      fecha,
      modo,
      valor: modo === 'valor' ? (valorNum ?? 0) : 0,
      porcentaje: modo === 'porcentaje' ? (pctNum ?? 0) : 0,
      createdAt: new Date().toISOString(),
    }
    return evaluateProduct({ ...producto, valoraciones: [...producto.valoraciones, draft] }, ws.movimientos, { asOf: today, mode: 'actual' })
  }, [producto, error, dateError, fecha, modo, valorNum, pctNum, ws.movimientos, today])

  if (!producto || !pos) return null
  const newer = latestValuation(producto)
  const hasNewer = !!newer && newer.fecha > fecha
  const history = sortValuations(producto.valoraciones).reverse()

  const save = () => {
    setSubmitted(true)
    if (error || dateError) return
    const etiqueta =
      modo === 'porcentaje'
        ? `Rentabilidad de «${producto.nombre}»: ${fmtPct((pctNum ?? 0) / 100, { sign: true })}`
        : `Valor de «${producto.nombre}»: ${hidden ? '•••••• €' : fmtEUR(valorNum ?? 0)}`
    accion(
      etiqueta,
      () =>
        addValoracion(producto.id, {
          fecha,
          modo,
          valor: modo === 'valor' ? (valorNum ?? 0) : 0,
          porcentaje: modo === 'porcentaje' ? (pctNum ?? 0) : 0,
        }),
      modo === 'porcentaje' ? `Rentabilidad guardada: ${fmtPct((pctNum ?? 0) / 100, { sign: true })}` : 'Valor guardado',
    )
    close(modalId)
  }

  const remove = async (v: Valoracion) => {
    const ok = await confirmDialog({
      title: '¿Eliminar esta actualización?',
      message: `Se eliminará la valoración del ${fmtDate(v.fecha)}.`,
      confirmLabel: 'Eliminar',
      danger: true,
    })
    if (ok) accion(`Borrar actualización del ${fmtDate(v.fecha)} de «${producto.nombre}»`, () => removeValoracion(producto.id, v.id), 'Actualización borrada')
  }

  return (
    <Sheet
      title={modo === 'porcentaje' ? 'Cambiar % de rentabilidad' : 'Actualizar valor'}
      subtitle={producto.nombre}
      onClose={() => close(modalId)}
      footer={
        <div className="flex justify-end gap-2">
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
        <div className="grid grid-cols-2 gap-3 rounded-2xl bg-slate-50 p-4">
          <div>
            <div className="text-xs font-medium text-slate-500">Capital invertido</div>
            <Amount value={pos.capital} className="text-lg font-semibold text-slate-900" />
          </div>
          <div>
            <div className="text-xs font-medium text-slate-500">Saldo actual</div>
            <Amount value={pos.saldo} className="text-lg font-semibold text-slate-900" />
          </div>
        </div>

        {pos.numMovimientos === 0 && (
          <div className="flex gap-2.5 rounded-xl bg-amber-50 p-3 text-sm text-amber-800">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" />
            <span>Este producto aún no tiene movimientos. Registra primero la inversión para que la rentabilidad sea correcta.</span>
          </div>
        )}

        <div>
          <div className="mb-2 text-sm font-medium text-slate-700">¿Cómo quieres indicarlo?</div>
          <Segmented
            className="w-full"
            value={modo}
            onChange={setModo}
            options={[
              { value: 'porcentaje', label: 'Rentabilidad (%)' },
              { value: 'valor', label: 'Valor actual (€)' },
            ]}
          />
        </div>

        {modo === 'porcentaje' && (
          <div>
            <div className="mb-2 text-sm font-medium text-slate-700">¿Gana o pierde?</div>
            <SignToggle negativo={negativo} onChange={setNegativo} />
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1.4fr_1fr]">
          {modo === 'valor' ? (
            <Field
              label="Valor de mercado"
              htmlFor="val-valor"
              error={submitted ? error : null}
              hint="El valor que ves hoy en la app de tu banco o bróker"
            >
              <NumberInput id="val-valor" big suffix="€" placeholder="0,00" value={valor} data-autofocus onChange={(e) => setValor(e.target.value)} />
            </Field>
          ) : (
            <Field
              label={negativo ? 'Cuánto pierde (%)' : 'Cuánto gana (%)'}
              htmlFor="val-pct"
              error={submitted ? error : null}
              hint={negativo ? 'Ej.: si baja un 2 %, escribe 2' : 'Ej.: si las acciones suben un 3 %, escribe 3'}
            >
              <NumberInput
                id="val-pct"
                big
                suffix="%"
                placeholder="0,00"
                value={pct}
                data-autofocus
                textColor={negativo ? 'text-rose-700' : 'text-emerald-700'}
                onChange={(e) => setPct(e.target.value)}
                onBlur={() => {
                  // Si se escribe «−3», se pasa a «Pierde» con 3.
                  const n = parseNumber(pct)
                  if (n !== null && n < 0) {
                    setNegativo(true)
                    setPct(fmtNumberInput(-n))
                  }
                }}
              />
            </Field>
          )}
          <Field label="Fecha" htmlFor="val-fecha" error={submitted ? dateError : null}>
            <TextInput id="val-fecha" type="date" className="h-14" value={fecha} onChange={(e) => setFecha(e.target.value)} />
          </Field>
        </div>

        {simulated && !hasNewer && (
          <div className="rounded-2xl border border-brand-100 bg-brand-50/60 p-4" data-resultado>
            <div className="text-xs font-semibold tracking-wide text-brand-700 uppercase">Así quedará</div>
            <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="text-xs text-slate-500">Nuevo saldo de «{producto.nombre}»</div>
                <Amount value={simulated.saldo} className="text-xl font-bold text-slate-900" />
              </div>
              <GainBadge ganancia={simulated.ganancia} rentabilidad={simulated.rentabilidad} />
            </div>
            {modo === 'porcentaje' && pctNum !== null && (
              <p className="mt-2 text-[13px] text-slate-600">
                Capital {hidden ? '•••••• €' : fmtEUR(pos.capital)} {pctNum < 0 ? '−' : '+'} {fmtPct(Math.abs(pctNum) / 100)} = {hidden ? '•••••• €' : fmtEUR(simulated.saldo)}
              </p>
            )}
          </div>
        )}
        {hasNewer && newer && (
          <div className="flex gap-2.5 rounded-xl bg-sky-50 p-3 text-sm text-sky-800">
            <Info className="mt-0.5 size-4 shrink-0" />
            <span>Ya hay una actualización más reciente ({fmtDate(newer.fecha)}). Esta se guardará en el histórico y se usará en el gráfico de evolución.</span>
          </div>
        )}

        {history.length > 0 && (
          <div>
            <div className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-slate-700">
              <History className="size-4 text-slate-400" /> Actualizaciones anteriores
            </div>
            <ul className="divide-y divide-slate-100 rounded-2xl border border-slate-200">
              {history.map((v) => (
                <li key={v.id} className="flex items-center justify-between gap-3 py-2 pr-2 pl-4">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-slate-800">{fmtDate(v.fecha)}</div>
                    <div className={cn('text-xs', v.modo === 'porcentaje' ? (v.porcentaje < 0 ? 'text-rose-600' : 'text-emerald-700') : 'text-slate-500')}>
                      {v.modo === 'valor' ? `Valor: ${hidden ? '•••••• €' : fmtEUR(v.valor)}` : `Rentabilidad: ${fmtPct(v.porcentaje / 100, { sign: true })}`}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => remove(v)}
                    className="inline-flex size-9 items-center justify-center rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                    aria-label={`Eliminar valoración del ${fmtDate(v.fecha)}`}
                  >
                    <Trash2 className="size-4" />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
        <button type="submit" className="hidden" />
      </form>
    </Sheet>
  )
}
