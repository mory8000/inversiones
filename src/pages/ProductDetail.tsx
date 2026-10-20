import { useMemo } from 'react'
import { ArrowDownLeft, ArrowLeft, ArrowUpRight, CalendarSync, Pencil, Repeat, SearchX } from 'lucide-react'
import { useFinance } from '../store/useFinance'
import { openInteres, openProduct } from '../store/ui'
import { aportarA, programarAportacionMensual, retirarDe, traspasarDe } from '../store/acciones'
import { buildProductTimeline, involvesProduct, type Position } from '../lib/finance'
import { counterparts, ownerId } from '../lib/movements'
import { PRODUCT_META } from '../lib/meta'
import { fmtDate, fmtPct } from '../lib/format'
import { goBack, navigate, paths } from '../lib/router'
import { cn } from '../lib/cn'
import { Card, CardHeader, EmptyState } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Amount, GainBadge } from '../components/ui/Amount'
import { ProductAvatar } from '../components/ui/icons'
import { EvolutionChart } from '../components/charts/lazy'
import { MovementList } from '../components/movements/MovementList'
import { BreakdownList, counterpartItems } from '../components/Breakdown'
import { DepositProgress, StatusBadge } from '../components/ProductCard'
import type { Producto } from '../types'
import { TitularTag } from '../components/Titulares'
import { PercentBox } from '../components/PercentBox'

export function BackLink({ label, fallback }: { label: string; fallback: string }) {
  return (
    <button
      type="button"
      onClick={() => goBack(fallback)}
      className="mb-3 -ml-1 inline-flex items-center gap-1.5 rounded-lg px-1 py-1 text-sm font-semibold text-slate-500 hover:text-slate-900"
    >
      <ArrowLeft className="size-4" /> {label}
    </button>
  )
}

function Line({ label, value, sign, strong, sub, tone }: { label: string; value: number; sign?: '+' | '−' | '='; strong?: boolean; sub?: boolean; tone?: boolean }) {
  return (
    <div className={cn('flex items-baseline justify-between gap-3 py-1.5', sub && 'pl-4 text-[13px]', strong && 'font-semibold')}>
      <span className={cn(sub ? 'text-slate-500' : 'text-slate-700', strong && 'text-slate-900')}>
        {sign && <span className="mr-1.5 inline-block w-3 text-center font-bold text-slate-400">{sign}</span>}
        {label}
      </span>
      <Amount value={value} sign={tone} tone={tone} className={cn(strong ? 'text-slate-900' : 'text-slate-700', sub && 'text-slate-500')} />
    </div>
  )
}

function methodText(p: Producto, pos: Position): string {
  switch (pos.metodo) {
    case 'tae': {
      const d = pos.deposito
      if (!d?.apertura) return 'Interés calculado con la TAE desde la primera aportación.'
      if (d.tramos.length > 1)
        return `Interés calculado tramo a tramo desde el ${fmtDate(d.apertura)} (${d.diasTranscurridos} días): ${d.tramos
          .map((t) => `${fmtPct(t.tae / 100)} ${t.desde ? `desde el ${fmtDate(t.desde)}` : 'al principio'}`)
          .join(', ')}.`
      return `Interés del ${fmtPct(d.tae / 100)} TAE desde el ${fmtDate(d.apertura)} (${d.diasTranscurridos} días).`
    }
    case 'porcentaje':
      return `Rentabilidad del ${fmtPct((pos.valoracion?.porcentaje ?? 0) / 100, { sign: true })} indicada el ${fmtDate(pos.valoracion?.fecha)}, como en el Excel.`
    case 'valor':
      return `Valor de mercado indicado el ${fmtDate(pos.valoracion?.fecha)}${pos.numMovimientos ? ', más los movimientos posteriores' : ''}.`
    default:
      return p.tipo === 'deposito'
        ? 'Sin interés indicado.'
        : 'Aún no has indicado cuánto gana o pierde: el saldo es igual al capital. Pulsa «Cambiar %».'
  }
}

export function ProductDetail({ id }: { id: string }) {
  const { ws, ds, positions, lookup, today } = useFinance()
  const p = ws.productos.find((x) => x.id === id)
  const movs = useMemo(() => ws.movimientos.filter((m) => involvesProduct(m, id)), [ws.movimientos, id])
  const timeline = useMemo(() => (p ? buildProductTimeline(p, ws.movimientos, today) : []), [p, ws.movimientos, today])

  if (!p) {
    return (
      <Card>
        <EmptyState
          icon={<SearchX className="size-6" />}
          title="Este producto no existe"
          description="Puede que se haya eliminado."
          action={<Button onClick={() => navigate(paths.productos())}>Ver inversiones</Button>}
        />
      </Card>
    )
  }

  const pos = positions.get(p.id)!
  const meta = PRODUCT_META[p.tipo]
  const ref = { kind: 'producto' as const, id: p.id }
  const titular = lookup.titulares.get(p.titularId)
  const multi = lookup.titulares.size > 1
  const fromOthers = movs.filter((m) => m.destino.id === p.id && ownerId(lookup, m.origen) && ownerId(lookup, m.origen) !== p.titularId)
  const fromOthersTotal = fromOthers.reduce((sum, m) => sum + m.importe, 0)
  const sources = counterpartItems(counterparts(movs, ref, 'in'), lookup, (r) => (r.kind === 'cuenta' ? 'Aportado desde la cuenta' : 'Traspaso recibido'))
  const destinations = counterpartItems(counterparts(movs, ref, 'out'), lookup, (r) => (r.kind === 'cuenta' ? 'Reembolsado a la cuenta' : 'Traspaso enviado'))
  const isDeposit = p.tipo === 'deposito'
  const closed = pos.estado === 'cerrado'

  return (
    <div>
      <BackLink label="Inversiones" fallback={paths.productos()} />

      {/* Cabecera */}
      <Card className="relative overflow-hidden">
        <div className="absolute inset-x-0 top-0 h-1.5" style={{ backgroundColor: meta.color }} />
        <div className="p-5 sm:p-6">
          <div className="flex items-start gap-3.5">
            <ProductAvatar tipo={p.tipo} size="lg" />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-semibold tracking-wide uppercase" style={{ color: meta.text }}>
                  {meta.label}
                </span>
                {multi && titular && (
                  <span className="flex items-center gap-1 text-xs text-slate-500">
                    de <TitularTag titular={titular} className="text-xs" />
                  </span>
                )}
                <StatusBadge pos={pos} />
              </div>
              <h1 className="mt-0.5 text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">{p.nombre}</h1>
              <p className="text-sm break-words text-slate-500">{[p.entidad, p.isin && `ISIN ${p.isin}`].filter(Boolean).join(' · ') || 'Sin entidad'}</p>
            </div>
            <Button variant="secondary" size="sm" icon={Pencil} onClick={() => openProduct({ productId: p.id })} className="shrink-0">
              <span className="hidden sm:inline">Editar</span>
            </Button>
          </div>

          <div className="mt-5 flex flex-wrap items-end justify-between gap-3">
            <div>
              <div className="text-sm text-slate-500">{closed ? 'Resultado final' : isDeposit ? 'Saldo hoy (con intereses)' : 'Saldo actual'}</div>
              <Amount
                value={closed ? pos.ganancia : pos.saldo}
                sign={closed}
                tone={closed}
                className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl"
              />
            </div>
            {!closed && <GainBadge ganancia={pos.ganancia} rentabilidad={pos.rentabilidad} />}
          </div>
          {isDeposit && pos.deposito && !closed && pos.estado !== 'sin-movimientos' && <DepositProgress info={pos.deposito} />}
          {fromOthersTotal > 0 && (
            <p className="mt-4 rounded-2xl bg-fuchsia-50 px-4 py-3 text-sm text-fuchsia-900">
              De lo aportado, <Amount value={fromOthersTotal} className="font-bold" /> ha llegado desde cuentas de otros titulares. Cuenta como
              inversión de {titular?.nombre ?? 'este titular'}.
            </p>
          )}

          {!closed && <PercentBox p={p} pos={pos} className="mt-4" />}

          <div className="mt-4 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
            <Button variant="soft" icon={ArrowUpRight} onClick={() => aportarA(ds, p)}>
              Aportar
            </Button>
            <Button variant="soft" icon={ArrowDownLeft} onClick={() => retirarDe(ds, p)}>
              Reembolsar
            </Button>
            <Button variant="soft" icon={Repeat} onClick={() => traspasarDe(p)}>
              Traspasar
            </Button>
            <Button variant="soft" icon={CalendarSync} wrap onClick={() => programarAportacionMensual(ds, p)}>
              Programar transferencia mensual
            </Button>
          </div>
        </div>
      </Card>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:mt-5 lg:grid-cols-5 lg:gap-5">
        <div className="min-w-0 space-y-4 lg:col-span-3 lg:space-y-5">
          {/* Cálculo */}
          <Card>
            <CardHeader title="Cómo se calcula el saldo" subtitle="La misma fórmula que tu Excel" />
            <div className="px-4 pt-2 pb-4 sm:px-5">
              <Line label="Aportado desde cuentas" value={pos.aportado} sub />
              <Line label="Recibido por traspasos" value={pos.traspasoEntrada} sub />
              <Line label="Invertido" value={pos.invertido} strong />
              <Line label="Reembolsado a cuentas" value={pos.reembolsado} sign="−" />
              <Line label="Enviado por traspasos" value={pos.traspasoSalida} sign="−" />
              {/* Las comisiones no salen del producto: se quedan (o se añaden) por el camino, así que
                  no tocan el capital. Se enseñan aparte, como lo que han costado las ventas. */}
              {Math.abs(pos.comisiones) > 0.005 && (
                <Line label={pos.comisiones > 0 ? 'Comisiones de las ventas' : 'Comisiones devueltas'} value={pos.comisiones} sub />
              )}
              <div className="my-1 border-t border-dashed border-slate-200" />
              <Line label="Capital invertido" value={pos.capital} sign="=" strong />
              <div className="flex items-baseline justify-between gap-3 py-1.5">
                <span className="text-slate-700">
                  <span className="mr-1.5 inline-block w-3 text-center font-bold text-slate-400">+</span>
                  Rentabilidad {pos.rentabilidad !== null && <span className="text-slate-400">({fmtPct(pos.rentabilidad, { sign: true })})</span>}
                </span>
                <Amount value={pos.ganancia} sign tone className="font-semibold" />
              </div>
              <div className="mt-1 flex items-baseline justify-between gap-3 rounded-xl bg-slate-900 px-3 py-2.5 text-white">
                <span className="font-semibold">
                  <span className="mr-1.5 inline-block w-3 text-center font-bold text-white/50">=</span>
                  Saldo
                </span>
                <Amount value={pos.saldo} className="text-lg font-bold" />
              </div>
              <p className="mt-3 text-[13px] text-slate-500">{methodText(p, pos)}</p>
              {closed && (
                <p className="mt-2 text-[13px] text-slate-500">
                  Este producto ya no tiene saldo. Como se ha retirado más de lo que se invirtió, la diferencia es la rentabilidad obtenida.
                </p>
              )}
            </div>
          </Card>

          {timeline.length >= 2 && (
            <Card>
              <CardHeader title="Evolución" subtitle="Valor frente al capital invertido" />
              <div className="px-2 pt-3 pb-3 sm:px-4">
                <EvolutionChart points={timeline} height={220} />
              </div>
            </Card>
          )}

          <Card>
            <CardHeader title="Movimientos" subtitle={`${movs.length} movimiento${movs.length === 1 ? '' : 's'} de este producto`} />
            <div className="mt-3 border-t border-slate-100">
              {movs.length ? (
                <MovementList movements={movs} lookup={lookup} perspective={ref} />
              ) : (
                <EmptyState
                  title="Sin movimientos"
                  description="Registra el dinero que has metido en este producto."
                  action={
                    <Button icon={ArrowUpRight} onClick={() => aportarA(ds, p)}>
                      Aportar
                    </Button>
                  }
                />
              )}
            </div>
          </Card>
        </div>

        <div className="min-w-0 space-y-4 lg:col-span-2 lg:space-y-5">
          {isDeposit && pos.deposito && (
            <Card>
              <CardHeader title="Datos del depósito" />
              <dl className="grid grid-cols-2 gap-x-4 gap-y-3 px-4 pt-3 pb-5 text-sm sm:px-5">
                <div>
                  <dt className="text-xs text-slate-500">Interés (TAE) hoy</dt>
                  <dd className="font-semibold text-slate-900">
                    {fmtPct(pos.deposito.tae / 100)}
                    <button type="button" onClick={() => openInteres(p.id)} className="ml-2 text-xs font-semibold text-brand-700 underline underline-offset-2">
                      Cambiar
                    </button>
                  </dd>
                  {pos.deposito.tramos.length > 1 && (
                    <dd className="mt-0.5 text-xs text-slate-500">
                      {pos.deposito.tramos.map((t) => `${fmtPct(t.tae / 100)} ${t.desde ? `desde ${fmtDate(t.desde)}` : 'al principio'}`).join(' · ')}
                    </dd>
                  )}
                </div>
                <div>
                  <dt className="text-xs text-slate-500">Apertura</dt>
                  <dd className="font-semibold text-slate-900">{fmtDate(pos.deposito.apertura)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-500">Vencimiento</dt>
                  <dd className="font-semibold text-slate-900">{fmtDate(pos.deposito.vencimiento)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-500">{pos.deposito.vencido ? 'Estado' : 'Días restantes'}</dt>
                  <dd className="font-semibold text-slate-900">
                    {pos.deposito.vencido ? 'Vencido' : pos.deposito.diasRestantes !== null ? pos.deposito.diasRestantes : '—'}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-500">Intereses hasta hoy</dt>
                  <dd className="font-semibold text-emerald-600">
                    <Amount value={pos.deposito.interesesHoy} sign />
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-500">Intereses al vencimiento</dt>
                  <dd className="font-semibold text-emerald-600">
                    {pos.deposito.interesesVencimiento !== null ? <Amount value={pos.deposito.interesesVencimiento} sign /> : '—'}
                  </dd>
                </div>
              </dl>
              {pos.deposito.vencido && (
                <div className="mx-4 mb-4 rounded-xl bg-amber-50 p-3 text-[13px] text-amber-800 sm:mx-5">
                  El depósito ha vencido. Cuando el dinero vuelva a tu cuenta, regístralo con «Reembolsar» (capital + intereses).
                </div>
              )}
            </Card>
          )}

          <Card>
            <CardHeader title="¿De dónde viene el dinero?" subtitle="Entradas en este producto" />
            <div className="px-2 pt-2 pb-3 sm:px-3">
              <BreakdownList items={sources} empty="Todavía no ha entrado dinero." />
            </div>
          </Card>

          <Card>
            <CardHeader title="¿A dónde ha ido?" subtitle="Salidas de este producto" />
            <div className="px-2 pt-2 pb-3 sm:px-3">
              <BreakdownList items={destinations} empty="No ha salido dinero: todo sigue invertido." />
            </div>
          </Card>

          {p.notas && (
            <Card>
              <CardHeader title="Notas" />
              <p className="px-4 pt-2 pb-5 text-sm whitespace-pre-line text-slate-600 sm:px-5">{p.notas}</p>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}
