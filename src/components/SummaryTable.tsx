import type { TypeSummary, Totals } from '../lib/finance'
import { PRODUCT_META } from '../lib/meta'
import { navigate, paths } from '../lib/router'
import { Amount, Pct } from './ui/Amount'
import { ProductAvatar } from './ui/icons'

/**
 * Resumen por tipo de producto con las mismas columnas que el Excel original:
 * Invertido · Reembolso · Traspaso · % · € · Saldo.
 */
export function SummaryTable({ rows, totals }: { rows: TypeSummary[]; totals: Totals }) {
  const totalTraspasos = rows.reduce((s, r) => s + r.traspasosNeto, 0)
  return (
    <div>
      {/* Escritorio / tableta */}
      <div className="hidden overflow-x-auto sm:block">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-[11px] font-semibold tracking-wide text-slate-400 uppercase">
              <th className="py-2.5 pr-3 pl-5 text-left font-semibold">Tipo</th>
              <th className="px-3 py-2.5 text-right font-semibold">Invertido</th>
              <th className="px-3 py-2.5 text-right font-semibold">Reembolsado</th>
              <th className="px-3 py-2.5 text-right font-semibold">Traspasos</th>
              <th className="px-3 py-2.5 text-right font-semibold">Capital</th>
              <th className="px-3 py-2.5 text-right font-semibold">Rentab. %</th>
              <th className="px-3 py-2.5 text-right font-semibold">Rentab. €</th>
              <th className="py-2.5 pr-5 pl-3 text-right font-semibold">Saldo</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((r) => (
              <tr key={r.tipo} className="cursor-pointer transition-colors hover:bg-slate-50" onClick={() => navigate(paths.productos(r.tipo))}>
                <td className="py-3 pr-3 pl-5">
                  <div className="flex items-center gap-2.5">
                    <ProductAvatar tipo={r.tipo} size="sm" />
                    <div>
                      <div className="font-semibold text-slate-800">{PRODUCT_META[r.tipo].plural}</div>
                      <div className="text-xs text-slate-400">
                        {r.activos} activo{r.activos === 1 ? '' : 's'}
                        {r.numProductos > r.activos ? ` · ${r.numProductos - r.activos} cerrado${r.numProductos - r.activos === 1 ? '' : 's'}` : ''}
                      </div>
                    </div>
                  </div>
                </td>
                <td className="px-3 py-3 text-right text-slate-700">
                  <Amount value={r.aportado} />
                </td>
                <td className="px-3 py-3 text-right text-slate-700">
                  <Amount value={r.reembolsado} />
                </td>
                <td className="px-3 py-3 text-right text-slate-700">
                  {Math.abs(r.traspasosNeto) < 0.005 ? <span className="text-slate-300">—</span> : <Amount value={r.traspasosNeto} sign />}
                </td>
                <td className="px-3 py-3 text-right font-medium text-slate-800">
                  <Amount value={r.capital} />
                </td>
                <td className="px-3 py-3 text-right font-semibold">
                  <Pct value={r.rentabilidad} />
                </td>
                <td className="px-3 py-3 text-right font-semibold">
                  <Amount value={r.ganancia} sign tone />
                </td>
                <td className="py-3 pr-5 pl-3 text-right font-bold text-slate-900">
                  <Amount value={r.saldo} />
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-slate-200 bg-slate-50/70 font-bold text-slate-900">
              <td className="py-3 pr-3 pl-5">Total</td>
              <td className="px-3 py-3 text-right">
                <Amount value={totals.aportado} />
              </td>
              <td className="px-3 py-3 text-right">
                <Amount value={totals.reembolsado} />
              </td>
              <td className="px-3 py-3 text-right">
                {Math.abs(totalTraspasos) < 0.005 ? <span className="font-normal text-slate-300">—</span> : <Amount value={totalTraspasos} sign />}
              </td>
              <td className="px-3 py-3 text-right">
                <Amount value={totals.capital} />
              </td>
              <td className="px-3 py-3 text-right">
                <Pct value={totals.rentabilidad} />
              </td>
              <td className="px-3 py-3 text-right">
                <Amount value={totals.ganancia} sign tone />
              </td>
              <td className="py-3 pr-5 pl-3 text-right">
                <Amount value={totals.invertidoValor} />
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Móvil */}
      <div className="space-y-2.5 px-4 pb-1 sm:hidden">
        {rows.map((r) => (
          <button
            key={r.tipo}
            type="button"
            onClick={() => navigate(paths.productos(r.tipo))}
            className="w-full rounded-xl border border-slate-200 p-3 text-left transition-colors active:bg-slate-50"
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <ProductAvatar tipo={r.tipo} size="sm" />
                <span className="font-semibold text-slate-800">{PRODUCT_META[r.tipo].plural}</span>
              </div>
              <Amount value={r.saldo} className="font-bold text-slate-900" />
            </div>
            <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-[13px]">
              <dt className="text-slate-500">Invertido</dt>
              <dd className="text-right text-slate-800">
                <Amount value={r.aportado} />
              </dd>
              <dt className="text-slate-500">Reembolsado</dt>
              <dd className="text-right text-slate-800">
                <Amount value={r.reembolsado} />
              </dd>
              {Math.abs(r.traspasosNeto) >= 0.005 && (
                <>
                  <dt className="text-slate-500">Traspasos</dt>
                  <dd className="text-right text-slate-800">
                    <Amount value={r.traspasosNeto} sign />
                  </dd>
                </>
              )}
              <dt className="text-slate-500">Capital</dt>
              <dd className="text-right font-medium text-slate-800">
                <Amount value={r.capital} />
              </dd>
              <dt className="text-slate-500">Rentabilidad</dt>
              <dd className="text-right font-semibold">
                <Amount value={r.ganancia} sign tone /> <Pct value={r.rentabilidad} className="text-xs" />
              </dd>
            </dl>
          </button>
        ))}
        <div className="flex items-center justify-between rounded-xl bg-slate-900 px-3 py-3 text-white">
          <span className="font-semibold">Total</span>
          <div className="text-right">
            <Amount value={totals.invertidoValor} className="font-bold" />
            <div className="text-xs">
              <Amount value={totals.ganancia} sign className={totals.ganancia >= 0 ? 'text-emerald-300' : 'text-rose-300'} />
            </div>
          </div>
        </div>
      </div>

      {totals.efectivo > 0.005 && (
        <p className="mx-4 mt-3 rounded-xl bg-indigo-50 px-3 py-2 text-[13px] text-indigo-900 sm:mx-5">
          Además hay <Amount value={totals.efectivo} className="font-semibold" /> sin invertir en cuentas con saldo (como MyInvestor). Patrimonio total:{' '}
          <Amount value={totals.patrimonio} className="font-semibold" />.
        </p>
      )}
      <p className="px-4 pt-3 pb-4 text-xs text-slate-500 sm:px-5">
        <span className="font-semibold text-slate-600">Cómo se calcula:</span> Capital = Invertido − Reembolsado ± Traspasos · Saldo = Capital ×
        (1 + %) · Rentabilidad € = Saldo − Capital.
      </p>
    </div>
  )
}
