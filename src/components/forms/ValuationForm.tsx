import { useMemo, useState } from 'react'
import { History, Info, Trash2, TriangleAlert } from 'lucide-react'
import type { Valoracion } from '../../types'
import { Sheet } from '../ui/Sheet'
import { Field, NumberInput, TextInput } from '../ui/Field'
import { Button } from '../ui/Button'
import { Segmented } from '../ui/Segmented'
import { Amount, GainBadge } from '../ui/Amount'
import { useData } from '../../store/data'
import { useFinance } from '../../store/useFinance'
import { confirmDialog, toast, useUI } from '../../store/ui'
import { evaluateProduct, latestValuation, sortValuations } from '../../lib/finance'
import { fmtDate, fmtEUR, fmtNumberInput, fmtPct, parseNumber } from '../../lib/format'
import { isValidISODate } from '../../lib/dates'

export function ValuationForm({ modalId, productId }: { modalId: string; productId: string }) {
  const close = useUI((s) => s.close)
  const { ws, positions, today } = useFinance()
  const hidden = useData((s) => s.hideAmounts)
  const addValoracion = useData((s) => s.addValoracion)
  const removeValoracion = useData((s) => s.removeValoracion)
  const producto = ws.productos.find((p) => p.id === productId)
  const pos = positions.get(productId)

  const [modo, setModo] = useState<'valor' | 'porcentaje'>('valor')
  const [valor, setValor] = useState(pos && pos.saldo > 0 ? fmtNumberInput(pos.saldo, 'fixed') : '')
  const [pct, setPct] = useState(pos?.rentabilidad != null && pos.capital > 0 ? fmtNumberInput(Math.round(pos.rentabilidad * 10000) / 100) : '')
  const [fecha, setFecha] = useState(today)
  const [submitted, setSubmitted] = useState(false)

  const valorNum = parseNumber(valor)
  const pctNum = parseNumber(pct)
  const error =
    modo === 'valor'
      ? valorNum === null || valorNum < 0
        ? 'Escribe el valor actual en euros'
        : null
      : pctNum === null || pctNum <= -100
        ? 'Escribe la rentabilidad en % (puede ser negativa)'
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
    addValoracion(producto.id, {
      fecha,
      modo,
      valor: modo === 'valor' ? (valorNum ?? 0) : 0,
      porcentaje: modo === 'porcentaje' ? (pctNum ?? 0) : 0,
    })
    toast('Valor actualizado')
    close(modalId)
  }

  const remove = async (v: Valoracion) => {
    const ok = await confirmDialog({
      title: '¿Eliminar esta actualización?',
      message: `Se eliminará la valoración del ${fmtDate(v.fecha)}.`,
      confirmLabel: 'Eliminar',
      danger: true,
    })
    if (ok) {
      removeValoracion(producto.id, v.id)
      toast('Valoración eliminada')
    }
  }

  return (
    <Sheet
      title="Actualizar valor"
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
          <div className="mb-2 text-sm font-medium text-slate-700">¿Cómo quieres actualizarlo?</div>
          <Segmented
            className="w-full"
            value={modo}
            onChange={setModo}
            options={[
              { value: 'valor', label: 'Valor actual (€)' },
              { value: 'porcentaje', label: 'Rentabilidad (%)' },
            ]}
          />
        </div>

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
              label="Rentabilidad"
              htmlFor="val-pct"
              error={submitted ? error : null}
              hint="Como en el Excel: Saldo = Capital × (1 + %)"
            >
              <NumberInput id="val-pct" big suffix="%" placeholder="0,00" value={pct} data-autofocus onChange={(e) => setPct(e.target.value)} />
            </Field>
          )}
          <Field label="Fecha" htmlFor="val-fecha" error={submitted ? dateError : null}>
            <TextInput id="val-fecha" type="date" className="h-14" value={fecha} onChange={(e) => setFecha(e.target.value)} />
          </Field>
        </div>

        {simulated && !hasNewer && (
          <div className="rounded-2xl border border-brand-100 bg-brand-50/60 p-4">
            <div className="text-xs font-semibold tracking-wide text-brand-700 uppercase">Resultado</div>
            <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="text-xs text-slate-500">Nuevo saldo</div>
                <Amount value={simulated.saldo} className="text-xl font-bold text-slate-900" />
              </div>
              <GainBadge ganancia={simulated.ganancia} rentabilidad={simulated.rentabilidad} />
            </div>
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
                    <div className="text-xs text-slate-500">
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
