import type { ReactNode } from 'react'
import { Landmark } from 'lucide-react'
import { useFinance } from '../store/useFinance'
import { useData, type TotalRef } from '../store/data'
import { useUI } from '../store/ui'
import { accion } from '../store/deshacer'
import { PRODUCT_META } from '../lib/meta'
import { cn } from '../lib/cn'
import { Sheet } from './ui/Sheet'
import { Button } from './ui/Button'
import { Switch } from './ui/Switch'
import { Amount } from './ui/Amount'
import { ProductAvatar } from './ui/icons'
import { TitularAvatar } from './Titulares'

/** Fila con su interruptor «Suma en el TOTAL». */
function FilaTotal({
  refe,
  label,
  sub,
  value,
  icon,
  suma,
  disabled,
}: {
  refe: TotalRef
  label: string
  sub?: string
  value: number
  icon: ReactNode
  suma: boolean
  disabled?: boolean
}) {
  const setFueraDelTotal = useData((s) => s.setFueraDelTotal)
  return (
    <li className={cn('flex items-center gap-3 py-2.5', disabled && 'opacity-50')}>
      {icon}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-slate-800">{label}</span>
        <span className="block truncate text-xs text-slate-500">
          <Amount value={value} />
          {sub ? ` · ${sub}` : ''}
        </span>
      </span>
      <Switch
        checked={suma}
        label={`${label}: suma en el TOTAL`}
        onChange={(v) => {
          if (disabled) return
          accion(v ? `Sumar «${label}» en el TOTAL` : `Dejar «${label}» fuera del TOTAL`, () => setFueraDelTotal(refe, !v), v ? `«${label}» suma en el TOTAL` : `«${label}» ya no suma en el TOTAL`)
        }}
      />
    </li>
  )
}

/** «¿Qué suma en el TOTAL?»: cada titular, sus inversiones y sus cuentas con saldo, con su interruptor. */
export function TotalSheet({ modalId }: { modalId: string }) {
  const close = useUI((s) => s.close)
  const fin = useFinance()
  const { granTotal: g, titulares, positions, accounts } = fin
  return (
    <Sheet
      title="¿Qué suma en el TOTAL?"
      subtitle="Apaga lo que no quieras sumar (p. ej. «Fondo ahorro»)"
      onClose={() => close(modalId)}
      footer={
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm text-slate-600">
            TOTAL: <Amount value={g.total} className="font-bold text-slate-900" />
          </span>
          <Button onClick={() => close(modalId)}>Listo</Button>
        </div>
      }
    >
      <div className="space-y-5">
        {titulares.map((tf) => {
          const t = tf.titular
          const fueraT = !!t.fueraDelTotal
          const productos = tf.ws.productos.filter((p) => positions.get(p.id)?.estado !== 'cerrado')
          const cuentas = tf.ws.cuentas.filter((c) => !c.externa)
          return (
            <section key={t.id} aria-label={`Qué suma de ${t.nombre}`} className="rounded-2xl border border-slate-200 p-3.5">
              <ul>
                <FilaTotal
                  refe={{ kind: 'titular', id: t.id }}
                  label={t.nombre}
                  sub={fueraT ? 'No suma nada suyo' : 'Titular (todo lo suyo)'}
                  value={tf.totals.patrimonio}
                  icon={<TitularAvatar titular={t} size="sm" />}
                  suma={!fueraT}
                />
              </ul>
              {(productos.length > 0 || cuentas.length > 0) && (
                <ul className="mt-1 divide-y divide-slate-100 border-t border-slate-100 pl-2">
                  {cuentas.map((c) => (
                    <FilaTotal
                      key={c.id}
                      refe={{ kind: 'cuenta', id: c.id }}
                      label={c.nombre}
                      sub="Cuenta"
                      value={accounts.get(c.id)?.saldo ?? 0}
                      icon={
                        <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-white" style={{ backgroundColor: c.color }}>
                          <Landmark className="size-4" />
                        </span>
                      }
                      suma={!fueraT && !c.fueraDelTotal}
                      disabled={fueraT}
                    />
                  ))}
                  {productos.map((p) => (
                    <FilaTotal
                      key={p.id}
                      refe={{ kind: 'producto', id: p.id }}
                      label={p.nombre}
                      sub={PRODUCT_META[p.tipo].label}
                      value={positions.get(p.id)?.saldo ?? 0}
                      icon={<ProductAvatar tipo={p.tipo} size="sm" />}
                      suma={!fueraT && !p.fueraDelTotal}
                      disabled={fueraT}
                    />
                  ))}
                </ul>
              )}
            </section>
          )
        })}
        <p className="text-[13px] text-slate-500">
          Lo que apagues no suma en el TOTAL de Inicio, pero sigue en su titular con todas sus cifras. Lo que se llame «Fondo ahorro» queda fuera solo; puedes
          cambiarlo aquí.
        </p>
      </div>
    </Sheet>
  )
}
