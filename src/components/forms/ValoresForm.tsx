import { useMemo, useState } from 'react'
import { Calculator, Info, TriangleAlert } from 'lucide-react'
import { Sheet } from '../ui/Sheet'
import { NumberInput } from '../ui/Field'
import { Button } from '../ui/Button'
import { Amount, useHidden } from '../ui/Amount'
import { ProductAvatar } from '../ui/icons'
import { TitularAvatar } from '../Titulares'
import { useData } from '../../store/data'
import { useFinance } from '../../store/useFinance'
import { useUI } from '../../store/ui'
import { accion } from '../../store/deshacer'
import { PRODUCT_META } from '../../lib/meta'
import { fmtDate, fmtEUR, fmtNumberInput, parseNumber } from '../../lib/format'
import { cn } from '../../lib/cn'

/**
 * «Poner los valores de hoy»: en una sola ventana, el valor de mercado (en €) de cada inversión,
 * tal como se ve en la app del banco. Al guardar, todos se apuntan con la fecha de hoy y las
 * tarjetas de Inicio quedan cuadradas con lo que hay en el banco.
 */
export function ValoresForm({ modalId }: { modalId: string }) {
  const close = useUI((s) => s.close)
  const hidden = useHidden()
  const guardarValores = useData((s) => s.setValores)
  const { ds, positions, accounts, today, lookup } = useFinance()

  const productos = useMemo(
    () => ds.productos.map((p) => ({ p, pos: positions.get(p.id)! })).filter((x) => x.pos && x.pos.estado !== 'cerrado'),
    [ds.productos, positions],
  )
  const [valores, setValores] = useState<Record<string, string>>(() =>
    Object.fromEntries(productos.map(({ p, pos }) => [p.id, fmtNumberInput(pos.saldo, 'fixed')])),
  )
  const [submitted, setSubmitted] = useState(false)

  /**
   * Las filas, ya con el valor que se va escribiendo (si un hueco está vacío se usa el que tiene),
   * y con el nombre del titular solo en la primera de cada uno.
   */
  const filas = useMemo(() => {
    let titular = ''
    return productos.map(({ p, pos }) => {
      const n = parseNumber(valores[p.id] ?? '')
      const cabecera = ds.titulares.length > 1 && p.titularId !== titular ? ((titular = p.titularId), lookup.titulares.get(p.titularId)) : null
      return { p, pos, cabecera, n, malo: n !== null && n < 0, valor: n ?? pos.saldo }
    })
  }, [productos, valores, ds.titulares.length, lookup])
  const malos = filas.filter((x) => x.malo)
  const vacios = filas.filter((x) => x.n === null)

  // Totales por titular, tal como quedarán las tarjetas: sus inversiones + el dinero en sus cuentas.
  const totales = ds.titulares.map((t) => {
    const invertido = filas.filter((x) => x.p.titularId === t.id).reduce((sum, x) => sum + x.valor, 0)
    let enCuentas = 0
    for (const c of ds.cuentas) if (c.titularId === t.id && !c.externa) enCuentas += accounts.get(c.id)?.saldo ?? 0
    return { titular: t, invertido, enCuentas, total: invertido + enCuentas }
  })
  const total = totales.reduce((sum, x) => sum + x.total, 0)

  const guardar = () => {
    setSubmitted(true)
    if (vacios.length > 0 || malos.length > 0) return
    const distintos = filas.filter((x) => Math.abs(x.valor - x.pos.saldo) > 0.004)
    if (distintos.length === 0) {
      close(modalId)
      return
    }
    accion(
      `Valores de hoy (${distintos.length} inversión${distintos.length === 1 ? '' : 'es'})`,
      () => guardarValores(today, distintos.map((x) => ({ productoId: x.p.id, valor: Math.round(x.valor * 100) / 100 }))),
      `Valores guardados: ${hidden ? '•••••• €' : fmtEUR(total)} en total`,
    )
    close(modalId)
  }

  return (
    <Sheet
      title="Poner los valores de hoy"
      subtitle={`Escribe lo que vale ahora cada inversión (lo que ves en tu banco), a ${fmtDate(today)}`}
      onClose={() => close(modalId)}
      footer={
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button variant="secondary" onClick={() => close(modalId)}>
            Cancelar
          </Button>
          <Button onClick={guardar}>Guardar valores</Button>
        </div>
      }
    >
      <div className="space-y-4" data-values-sheet>
        {productos.length === 0 ? (
          <p className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-500">Todavía no hay inversiones. Crea una en «Nueva inversión».</p>
        ) : (
          <>
            <div className="flex gap-2.5 rounded-xl bg-brand-50/70 p-3 text-[13px] text-brand-900">
              <Info className="mt-0.5 size-4 shrink-0" />
              <span>
                Se guardan como el <strong>valor de mercado</strong> de cada inversión, con la fecha de hoy. Lo que ya estaba apuntado ese mismo día se
                sustituye (no se suma). El dinero sin invertir de tus cuentas no se toca.
              </span>
            </div>

            <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 border-b border-slate-100 pb-1.5 text-[11px] font-semibold tracking-wide text-slate-400 uppercase">
              <span>Inversión</span>
              <span className="text-right">Vale hoy (€)</span>
            </div>
            <ul className="space-y-2.5">
              {filas.map((x) => {
                const meta = PRODUCT_META[x.p.tipo]
                const cabecera = x.cabecera
                const malo = x.malo || (submitted && x.n === null)
                return (
                  <li key={x.p.id} data-valor={x.p.id}>
                    {cabecera && (
                      <div className="mt-4 mb-1 flex items-center gap-2 text-xs font-semibold text-slate-600">
                        <TitularAvatar titular={cabecera} size="xs" />
                        {cabecera.nombre}
                      </div>
                    )}
                    <div className="grid grid-cols-[minmax(0,1fr)_7.5rem] items-center gap-x-3">
                      <div className="flex min-w-0 items-center gap-2.5">
                        <ProductAvatar tipo={x.p.tipo} size="sm" />
                        <div className="min-w-0">
                          <div className="truncate text-sm font-semibold text-slate-900">{x.p.nombre}</div>
                          <div className="truncate text-xs text-slate-500">
                            {meta.label}
                            {x.pos.capital > 0 ? (
                              <>
                                {' · invertido '}
                                {hidden ? '•••••• €' : fmtEUR(x.pos.capital)}
                              </>
                            ) : null}
                          </div>
                        </div>
                      </div>
                      <NumberInput
                        id={`valor-${x.p.id}`}
                        aria-label={`Valor de ${x.p.nombre}`}
                        suffix="€"
                        value={valores[x.p.id] ?? ''}
                        onChange={(e) => setValores((v) => ({ ...v, [x.p.id]: e.target.value }))}
                        className={cn(malo && 'border-rose-300 ring-rose-200')}
                      />
                    </div>
                    {malo && <p className="mt-1 text-xs font-medium text-rose-600">Escribe un valor de 0 o más (por ejemplo, 9011,10).</p>}
                  </li>
                )
              })}
            </ul>

            {vacios.length === 0 && malos.length === 0 && (
              <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4" data-valores-totales>
                <div className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Cómo quedan las tarjetas de Inicio</div>
                <ul className="mt-2 space-y-1.5">
                  {totales.map((x) => (
                    <li key={x.titular.id} className="flex items-baseline justify-between gap-3 text-sm" data-valores-titular={x.titular.nombre}>
                      <span className="flex min-w-0 items-center gap-2">
                        <TitularAvatar titular={x.titular} size="xs" />
                        <span className="truncate text-slate-700">{x.titular.nombre}</span>
                        <span className="hidden shrink-0 text-xs text-slate-400 sm:inline">
                          inversiones {hidden ? '••••••' : fmtEUR(x.invertido)} + cuentas {hidden ? '••••••' : fmtEUR(x.enCuentas)}
                        </span>
                      </span>
                      <span className="shrink-0" data-valores-linea={x.titular.nombre}>
                        <Amount value={x.total} className="font-semibold text-slate-900" />
                      </span>
                    </li>
                  ))}
                </ul>
                <div className="mt-2 flex items-baseline justify-between gap-3 border-t border-slate-200 pt-2" data-valores-total>
                  <span className="flex items-center gap-1.5 text-sm font-semibold text-slate-900">
                    <Calculator className="size-4 text-slate-400" /> Total
                  </span>
                  <Amount value={total} className="text-lg font-bold text-slate-900" />
                </div>
              </div>
            )}

            {submitted && (vacios.length > 0 || malos.length > 0) && (
              <p className="flex gap-2.5 rounded-xl bg-rose-50 p-3 text-sm text-rose-800">
                <TriangleAlert className="mt-0.5 size-4 shrink-0" />
                <span>Revisa las casillas marcadas: hacen falta los valores de todas las inversiones.</span>
              </p>
            )}
          </>
        )}
      </div>
    </Sheet>
  )
}
