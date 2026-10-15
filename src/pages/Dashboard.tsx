import { useMemo } from 'react'
import {
  ArrowDownLeft,
  ArrowLeftRight,
  ArrowRight,
  ArrowUpRight,
  CalendarSync,
  Check,
  ChevronRight,
  FlaskConical,
  Landmark,
  Pencil,
  Plus,
  Sparkles,
  Wallet,
} from 'lucide-react'
import type { Movimiento, Titular } from '../types'
import { useFinance, type FinanceData, type TitularFinance } from '../store/useFinance'
import { useData } from '../store/data'
import { editMovement, openAccount, openMovement, openProduct, openProgramada, openTitular } from '../store/ui'
import { buildTimelineMulti } from '../lib/finance'
import { buildFlowGraph } from '../lib/flow'
import { PRODUCT_META, kindMeta } from '../lib/meta'
import { entityName, movementKind, ownerOf, sortMovementsDesc } from '../lib/movements'
import { diaDe, movimientosDe, proximaFecha } from '../lib/programadas'
import { isDefaultTitularName } from '../lib/titulares'
import { fmtDate, fmtEUR, fmtPct, maskIban } from '../lib/format'
import { navigate, paths } from '../lib/router'
import { cn } from '../lib/cn'
import { useMediaQuery } from '../lib/useMediaQuery'
import { Card, CardHeader } from '../components/ui/Card'
import { Button, IconButton } from '../components/ui/Button'
import { Amount, GainBadge, useHidden } from '../components/ui/Amount'
import { AccountAvatar, MovementAvatar } from '../components/ui/icons'
import { Donut, MultiEvolutionChart } from '../components/charts/lazy'
import { Sankey } from '../components/charts/Sankey'
import { MovementList } from '../components/movements/MovementList'
import { movementLabel } from '../components/movements/MovementRow'
import { SummaryTable } from '../components/SummaryTable'
import { DemoBanner } from '../components/DemoBanner'
import { Logo } from '../components/layout/AppShell'
import { PrincipalBadge, TitularAvatar, TitularTag } from '../components/Titulares'

function HeroStat({ label, value, hint }: { label: string; value: number; hint: string }) {
  return (
    <div className="min-w-0">
      <div className="truncate text-[11px] font-medium text-white/60 sm:text-xs">{label}</div>
      <Amount value={value} className="mt-0.5 block truncate text-[15px] font-semibold sm:text-lg" />
      <div className="hidden truncate text-[11px] text-white/40 sm:block">{hint}</div>
    </div>
  )
}

/** Lo que un titular ha recibido de otros o enviado a otros (cuenta solo para quien lo recibe en un producto). */
function CrossLines({ tf, fin }: { tf: TitularFinance; fin: FinanceData }) {
  const name = (id: string) => fin.byTitular.get(id)?.titular.nombre ?? 'otro titular'
  if (tf.recibido.length === 0 && tf.enviado.length === 0) return null
  return (
    <ul className="mt-4 space-y-1.5 border-t border-white/10 pt-3 text-[13px]">
      {tf.recibido.map((r) => (
        <li key={`r-${r.titularId}`} className="flex items-start gap-2">
          <ArrowDownLeft className="mt-0.5 size-4 shrink-0 text-emerald-300" />
          <span className="min-w-0 text-white/80">
            Recibido de {name(r.titularId)}: <Amount value={r.importe} className="font-semibold text-white" />
            <span className="text-white/50"> · cuenta como inversión de {tf.titular.nombre}</span>
          </span>
        </li>
      ))}
      {tf.enviado.map((e) => (
        <li key={`e-${e.titularId}`} className="flex items-start gap-2">
          <ArrowUpRight className="mt-0.5 size-4 shrink-0 text-fuchsia-300" />
          <span className="min-w-0 text-white/80">
            Enviado a {name(e.titularId)}: <Amount value={e.importe} className="font-semibold text-white" />
            <span className="text-white/50"> · no cuenta como inversión de {tf.titular.nombre}</span>
          </span>
        </li>
      ))}
    </ul>
  )
}

/** Tarjeta de un titular: su patrimonio y sus cifras, por separado de las de los demás. */
function TitularHero({ tf, fin }: { tf: TitularFinance; fin: FinanceData }) {
  const { titular, totals, color, index } = tf
  const empty = tf.ws.movimientos.length === 0
  return (
    <section
      aria-label={`Titular ${titular.nombre}`}
      className="relative flex flex-col overflow-hidden rounded-3xl bg-brand-900 p-5 text-white shadow-lg shadow-brand-900/10 sm:p-6"
    >
      <div className="pointer-events-none absolute -top-24 -right-16 size-72 rounded-full opacity-40 blur-3xl" style={{ backgroundColor: color }} />
      <div className="pointer-events-none absolute -bottom-28 left-1/3 size-64 rounded-full bg-emerald-400/10 blur-3xl" />
      <div className="absolute inset-x-0 top-0 h-1.5" style={{ backgroundColor: color }} />
      <div className="relative flex flex-1 flex-col">
        <div className="flex items-center justify-between gap-3">
          <span className="flex min-w-0 items-center gap-2.5">
            <TitularAvatar titular={titular} size="sm" className="ring-2 ring-white/30" />
            <span className="min-w-0">
              <span className="flex min-w-0 items-center gap-1.5">
                <span className="truncate text-[15px] font-semibold">{titular.nombre}</span>
                {index === 0 && <PrincipalBadge dark />}
              </span>
              <span className="block text-xs text-white/55">Patrimonio a {fmtDate(fin.today)}</span>
            </span>
          </span>
          <IconButton icon={Pencil} label={`Editar ${titular.nombre}`} variant="dark" onClick={() => openTitular(titular.id)} />
        </div>
        <div className="mt-2 text-[36px] leading-tight font-bold tracking-tight sm:text-[44px]">
          <Amount value={totals.patrimonio} />
        </div>
        {empty ? (
          <div className="mt-2 text-sm text-white/65">
            Sin movimientos todavía.
            {isDefaultTitularName(titular.nombre) && (
              <button type="button" onClick={() => openTitular(titular.id)} className="ml-1.5 font-semibold text-emerald-300 underline underline-offset-2">
                Ponerle nombre
              </button>
            )}
          </div>
        ) : (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <GainBadge onDark ganancia={totals.ganancia} rentabilidad={totals.rentabilidad} />
            <span className="text-sm text-white/55">rentabilidad total</span>
          </div>
        )}
        <div className="mt-5 grid grid-cols-3 gap-3 border-t border-white/10 pt-4">
          <HeroStat label="Capital invertido" value={totals.capital} hint="Aportado − reembolsado" />
          <HeroStat label="Aportado" value={totals.aportado} hint={tf.recibidoTotal > 0 ? 'Incluye lo recibido' : 'Desde sus cuentas'} />
          <HeroStat label="Reembolsado" value={totals.reembolsado} hint="Vuelto a las cuentas" />
        </div>
        <CrossLines tf={tf} fin={fin} />
      </div>
    </section>
  )
}

/** Transferencias mensuales (p. ej. del titular 1 al titular 2), o la invitación a programar una. */
function ProgramadasCard({ fin }: { fin: FinanceData }) {
  const { ds, lookup, today, owner } = fin
  const hidden = useHidden()
  const [t1, t2] = ds.titulares
  if (ds.programadas.length === 0) {
    if (!t2) return null
    const origen = ds.cuentas.find((c) => c.titularId === t1.id)
    const destino = ds.productos.find((p) => p.titularId === t2.id)
    return (
      <Card className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:gap-4 sm:p-5">
        <span className="inline-flex size-11 shrink-0 items-center justify-center rounded-2xl bg-fuchsia-50 text-fuchsia-600">
          <CalendarSync className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold text-slate-900">
            ¿{t1.nombre} envía dinero cada mes a {t2.nombre}?
          </h2>
          <p className="mt-0.5 text-sm text-slate-500">
            Prográmalo una vez y la app lo apuntará sola cada mes. Contará como inversión de {t2.nombre}, no de {t1.nombre}.
          </p>
        </div>
        <Button
          icon={CalendarSync}
          className="shrink-0 self-start sm:self-center"
          onClick={() =>
            openProgramada({
              preset: {
                origen: origen && { kind: 'cuenta', id: origen.id },
                destino: destino && { kind: 'producto', id: destino.id },
                origenTitularId: t1.id,
                destinoTitularId: t2.id,
                concepto: `Transferencia mensual a ${t2.nombre}`,
              },
            })
          }
        >
          Programar transferencia mensual
        </Button>
      </Card>
    )
  }
  return (
    <Card>
      <CardHeader
        title={ds.programadas.length === 1 ? 'Transferencia mensual' : 'Transferencias mensuales'}
        subtitle="Se apuntan solas cada mes"
        icon={
          <span className="inline-flex size-9 items-center justify-center rounded-xl bg-fuchsia-50 text-fuchsia-600">
            <CalendarSync className="size-[18px]" />
          </span>
        }
        action={
          <Button variant="ghost" size="sm" icon={Plus} onClick={() => openProgramada()}>
            <span className="max-sm:hidden">Nueva</span>
          </Button>
        }
      />
      <ul className="mt-3 divide-y divide-slate-100 border-t border-slate-100">
        {ds.programadas.map((p) => {
          const from = lookup.titulares.get(owner(p.origen) ?? '')
          const to = lookup.titulares.get(owner(p.destino) ?? '')
          const hechas = movimientosDe(ds, p.id)
          const total = hechas.reduce((s, m) => s + m.importe, 0)
          const next = proximaFecha(p, today)
          const cross = !!from && !!to && from.id !== to.id
          return (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => openProgramada({ programadaId: p.id })}
                className="flex w-full items-start gap-3 px-4 py-3.5 text-left transition-colors hover:bg-slate-50 sm:px-5"
              >
                <div className="flex shrink-0 items-center pt-0.5">
                  {from && <TitularAvatar titular={from} size="sm" />}
                  {cross && to && (
                    <>
                      <ArrowRight className="mx-0.5 size-3.5 text-slate-400" />
                      <TitularAvatar titular={to} size="sm" />
                    </>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <span className="font-semibold text-slate-900">{hidden ? '•••••• €' : fmtEUR(p.importe)} al mes</span>
                    <span className="text-sm text-slate-500">el día {diaDe(p)}</span>
                  </div>
                  <div className="mt-0.5 text-sm text-slate-600">
                    {cross && from && to ? (
                      <>
                        De {from.nombre} a {to.nombre}: «{entityName(lookup, p.origen)}» → «{entityName(lookup, p.destino)}»
                      </>
                    ) : (
                      <>
                        «{entityName(lookup, p.origen)}» → «{entityName(lookup, p.destino)}»
                      </>
                    )}
                  </div>
                  <div className="mt-1 text-xs text-slate-500">
                    {hechas.length} apuntada{hechas.length === 1 ? '' : 's'} desde el {fmtDate(p.inicio)} ({hidden ? '•••••• €' : fmtEUR(total)})
                    {' · '}
                    {next ? `próxima: ${fmtDate(next)}` : 'terminada'}
                    {cross && to && p.destino.kind === 'producto' && <> · cuenta como inversión de {to.nombre}</>}
                  </div>
                </div>
                <ChevronRight className="mt-1 size-4 shrink-0 text-slate-300" />
              </button>
            </li>
          )
        })}
      </ul>
    </Card>
  )
}

/** Dónde está el dinero de cada titular (por tipo de producto), uno junto a otro. */
function DistributionCard({ fin }: { fin: FinanceData }) {
  const list = fin.titulares.filter((tf) => tf.totals.patrimonio > 0.005)
  if (list.length === 0) return null
  return (
    <Card>
      <CardHeader title="Distribución" subtitle="¿Dónde está el dinero de cada uno?" />
      <div className={cn('grid grid-cols-1 gap-x-6 gap-y-5 px-4 pt-3 pb-4 sm:px-5', list.length > 1 && 'md:grid-cols-2')}>
        {list.map((tf) => {
          const data = tf.byType
            .filter((r) => r.saldo > 0.005)
            .map((r) => ({ key: r.tipo, label: PRODUCT_META[r.tipo].plural, value: r.saldo, color: PRODUCT_META[r.tipo].color }))
          return (
            <section key={tf.titular.id} aria-label={`Distribución de ${tf.titular.nombre}`} className="min-w-0">
              <div className="mb-1 flex items-center gap-2">
                <TitularAvatar titular={tf.titular} size="xs" />
                <h3 className="truncate text-sm font-semibold text-slate-900">{tf.titular.nombre}</h3>
              </div>
              <Donut data={data} centerLabel="Total" centerValue={fmtEUR(tf.totals.patrimonio, { decimals: 0 })} height={170} />
              <ul className="mt-3 space-y-1">
                {data.map((d) => (
                  <li key={d.key}>
                    <button
                      type="button"
                      onClick={() => navigate(paths.productos(d.key))}
                      className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm transition-colors hover:bg-slate-50"
                    >
                      <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: d.color }} />
                      <span className="min-w-0 flex-1 text-left leading-tight font-medium text-slate-700">{d.label}</span>
                      <span className="text-xs text-slate-400 tabular-nums">{fmtPct(d.value / tf.totals.patrimonio, { short: true })}</span>
                      <Amount value={d.value} className="w-28 text-right font-semibold text-slate-900" />
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )
        })}
      </div>
    </Card>
  )
}

function Welcome({ fin }: { fin: FinanceData }) {
  const { ds } = fin
  const loadDemo = useData((s) => s.loadDemo)
  const [t1, t2] = ds.titulares
  const steps = [
    {
      done: ds.titulares.some((t) => !isDefaultTitularName(t.nombre)),
      title: 'Pon nombre a los titulares',
      text: `Ahora se llaman «${ds.titulares.map((t) => t.nombre).join('» y «')}». Toca el lápiz de cada uno.`,
      action: (
        <Button size="sm" variant="soft" icon={Pencil} onClick={() => openTitular(t1.id)}>
          Ponerle nombre
        </Button>
      ),
    },
    {
      done: ds.cuentas.length > 0 && ds.productos.length > 0,
      title: 'Añade cuentas y productos',
      text: 'La cuenta de donde sale el dinero y los depósitos, fondos o carteras de cada titular.',
      action: (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="soft" icon={Plus} onClick={() => openAccount()}>
            Cuenta
          </Button>
          <Button size="sm" variant="soft" icon={Plus} onClick={() => openProduct()}>
            Producto
          </Button>
        </div>
      ),
    },
    ...(t2
      ? [
          {
            done: ds.programadas.length > 0,
            title: 'Programa la transferencia mensual',
            text: `Si ${t1.nombre} envía dinero cada mes a ${t2.nombre}, la app lo apuntará sola. Cuenta como inversión de ${t2.nombre}.`,
            action: (
              <Button
                size="sm"
                variant="soft"
                icon={CalendarSync}
                onClick={() =>
                  openProgramada({ preset: { origenTitularId: t1.id, destinoTitularId: t2.id, concepto: `Transferencia mensual a ${t2.nombre}` } })
                }
              >
                Programar
              </Button>
            ),
          },
        ]
      : []),
    {
      done: ds.movimientos.length > 0,
      title: 'Registra un movimiento',
      text: 'Por ejemplo: 1.000 € de una cuenta a un fondo. De dónde viene y a dónde va.',
      action: (
        <Button size="sm" icon={Plus} onClick={() => openMovement()}>
          Nuevo movimiento
        </Button>
      ),
    },
  ]
  return (
    <div className="space-y-4">
      {/* Los titulares, a la vez */}
      <div className={cn('grid grid-cols-1 gap-3', ds.titulares.length > 1 && 'sm:grid-cols-2')}>
        {ds.titulares.map((t, i) => (
          <Card key={t.id} className="flex items-center gap-3 p-4">
            <TitularAvatar titular={t} size="lg" />
            <div className="min-w-0 flex-1">
              <div className="flex min-w-0 items-center gap-1.5">
                <span className="truncate font-semibold text-slate-900">{t.nombre}</span>
                {i === 0 && <PrincipalBadge />}
              </div>
              <div className="text-sm text-slate-500">Sin movimientos todavía</div>
              <Button
                size="sm"
                variant={isDefaultTitularName(t.nombre) ? 'primary' : 'secondary'}
                icon={Pencil}
                onClick={() => openTitular(t.id)}
                className="mt-2 sm:hidden"
              >
                {isDefaultTitularName(t.nombre) ? 'Ponerle nombre' : 'Editar'}
              </Button>
            </div>
            <Button
              size="sm"
              variant={isDefaultTitularName(t.nombre) ? 'primary' : 'secondary'}
              icon={Pencil}
              onClick={() => openTitular(t.id)}
              className="shrink-0 max-sm:hidden"
            >
              {isDefaultTitularName(t.nombre) ? 'Ponerle nombre' : 'Editar'}
            </Button>
          </Card>
        ))}
      </div>

      <section className="relative overflow-hidden rounded-3xl bg-brand-900 px-5 py-8 text-white sm:px-10 sm:py-12">
        <div className="pointer-events-none absolute -top-24 -right-16 size-80 rounded-full bg-brand-500/30 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-28 left-1/4 size-72 rounded-full bg-emerald-400/15 blur-3xl" />
        <div className="relative max-w-2xl">
          <Logo className="size-12" />
          <h1 className="mt-5 text-3xl font-bold tracking-tight sm:text-4xl">Tus inversiones, todo claro</h1>
          <p className="mt-3 text-[15px] text-white/75 sm:text-base">
            Apunta las cuentas, los depósitos, fondos y carteras de cada titular, y cada movimiento de dinero. La app calcula los saldos y la
            rentabilidad de cada uno, por separado, y te enseña <strong className="text-white">de dónde viene y a dónde va cada euro</strong>.
          </p>
          <div className="mt-6 flex flex-wrap gap-2">
            <Button size="lg" className="bg-emerald-400 text-brand-950 hover:bg-emerald-300" icon={Sparkles} onClick={() => openMovement()}>
              Empezar
            </Button>
            <Button size="lg" variant="dark" icon={FlaskConical} onClick={loadDemo}>
              Ver un ejemplo
            </Button>
          </div>
        </div>
      </section>

      <div className={cn('grid grid-cols-1 gap-3', steps.length === 4 ? 'md:grid-cols-2 xl:grid-cols-4' : 'md:grid-cols-3')}>
        {steps.map((s, i) => (
          <Card key={s.title} className="flex flex-col p-4 sm:p-5">
            <div className="flex items-center gap-2.5">
              <span
                className={cn(
                  'inline-flex size-7 shrink-0 items-center justify-center rounded-full text-[13px] font-bold',
                  s.done ? 'bg-emerald-500 text-white' : 'bg-slate-100 text-slate-600',
                )}
              >
                {s.done ? <Check className="size-4" strokeWidth={3} /> : i + 1}
              </span>
              <h2 className="font-semibold text-slate-900">{s.title}</h2>
            </div>
            <p className="mt-2 flex-1 text-sm text-slate-500">{s.text}</p>
            <div className="mt-4">{s.action}</div>
          </Card>
        ))}
      </div>
      <p className="px-1 text-center text-xs text-slate-500">Tus datos se guardan solo en este dispositivo. Puedes hacer copias de seguridad desde Ajustes.</p>
    </div>
  )
}

export function Dashboard() {
  const fin = useFinance()
  const { ds, ws, positions, lookup } = fin
  const hidden = useHidden()
  const isDesktop = useMediaQuery('(min-width: 1024px)')
  const withData = fin.titulares.filter((tf) => tf.ws.movimientos.length > 0)
  const timeline = useMemo(
    () =>
      buildTimelineMulti(
        fin.titulares.filter((tf) => tf.ws.movimientos.length > 0).map((tf) => ({ id: tf.titular.id, ws: tf.ws })),
        fin.ws.movimientos,
        fin.today,
      ),
    [fin],
  )
  const graph = useMemo(() => buildFlowGraph(ds, positions, { from: null, to: null }), [ds, positions])

  if (ws.movimientos.length === 0 && ds.programadas.length === 0) {
    return (
      <>
        <DemoBanner />
        <Welcome fin={fin} />
      </>
    )
  }

  const multi = ds.titulares.length > 1

  return (
    <div className="space-y-4 lg:space-y-5">
      <DemoBanner />

      {/* Los titulares, a la vez (el primero es el principal) */}
      <div className={cn('grid grid-cols-1 gap-4 lg:gap-5', multi && 'lg:grid-cols-2')}>
        {fin.titulares.map((tf) => (
          <TitularHero key={tf.titular.id} tf={tf} fin={fin} />
        ))}
      </div>

      <ProgramadasCard fin={fin} />

      {/* Evolución de cada uno */}
      <Card>
        <CardHeader
          title="Evolución"
          subtitle={multi ? 'Patrimonio de cada titular (línea continua) y lo que ha invertido (discontinua)' : 'Patrimonio frente al capital invertido'}
          action={
            <div className="hidden flex-wrap items-center justify-end gap-3 text-xs text-slate-500 sm:flex">
              {withData.map((tf) => (
                <span key={tf.titular.id} className="flex items-center gap-1.5">
                  <span className="size-2.5 rounded-full" style={{ backgroundColor: tf.color }} /> {tf.titular.nombre}
                </span>
              ))}
            </div>
          }
        />
        <div className="flex flex-wrap gap-3 px-4 pt-2 text-xs text-slate-500 sm:hidden">
          {withData.map((tf) => (
            <span key={tf.titular.id} className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-full" style={{ backgroundColor: tf.color }} /> {tf.titular.nombre}
            </span>
          ))}
        </div>
        <div className="px-2 pt-3 pb-3 sm:px-4">
          <MultiEvolutionChart
            points={timeline}
            series={withData.map((tf) => ({ id: tf.titular.id, name: tf.titular.nombre, color: tf.color }))}
            height={isDesktop ? 320 : 240}
          />
        </div>
      </Card>

      <DistributionCard fin={fin} />

      {/* Flujo del dinero */}
      <Card>
        <CardHeader
          title="¿De dónde viene y a dónde va el dinero?"
          subtitle={
            multi
              ? 'De todos los titulares: cada caja lleva el nombre de su dueño. El grosor de cada banda es proporcional al importe.'
              : 'El grosor de cada banda es proporcional al importe. Toca una caja para resaltarla.'
          }
          action={
            <Button variant="ghost" size="sm" iconRight={ArrowRight} onClick={() => navigate(paths.flujo)} className="max-sm:hidden">
              Ver en detalle
            </Button>
          }
        />
        <div className="px-2 pt-3 pb-4 sm:px-4">
          <Sankey graph={graph} />
        </div>
        <div className="border-t border-slate-100 px-4 py-3 sm:hidden">
          <Button variant="soft" size="sm" className="w-full" iconRight={ArrowRight} onClick={() => navigate(paths.flujo)}>
            Ver el flujo en detalle
          </Button>
        </div>
      </Card>

      {/* Resumen tipo Excel, de cada titular */}
      <Card>
        <CardHeader title="Resumen por tipo de producto" subtitle="Depósitos, fondos y carteras de cada titular: invertido, reembolsado, traspasos, rentabilidad y saldo" />
        <div className="pt-3">
          {fin.titulares
            .filter((tf) => tf.byType.length > 0)
            .map((tf) => (
              <section key={tf.titular.id} aria-label={`Resumen de ${tf.titular.nombre}`}>
                {multi && (
                  <div className="flex items-center gap-2 border-t border-slate-100 bg-slate-50/70 px-4 py-2 sm:px-5">
                    <TitularAvatar titular={tf.titular} size="xs" />
                    <h3 className="text-sm font-semibold text-slate-800">{tf.titular.nombre}</h3>
                  </div>
                )}
                <SummaryTable rows={tf.byType} totals={tf.totals} />
              </section>
            ))}
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5 lg:gap-5">
        {/* Últimos movimientos (de todos) */}
        <Card className="lg:col-span-3">
          <CardHeader
            title="Últimos movimientos"
            subtitle={`${ws.movimientos.length} en total`}
            action={
              <Button variant="ghost" size="sm" iconRight={ChevronRight} onClick={() => navigate(paths.movimientos())}>
                Ver todos
              </Button>
            }
            icon={
              <span className="inline-flex size-9 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
                <ArrowLeftRight className="size-[18px]" />
              </span>
            }
          />
          <div className="mt-3 border-t border-slate-100 lg:hidden">
            <MovementList movements={ws.movimientos} lookup={lookup} grouped={false} limit={6} />
          </div>
          <div className="mt-3 hidden border-t border-slate-100 lg:block">
            <CompactRecent fin={fin} />
          </div>
        </Card>

        {/* Cuentas, por titular */}
        <AccountsCard fin={fin} />
      </div>
      {hidden && <p className="text-center text-xs text-slate-400">Importes ocultos. Pulsa el icono del ojo para mostrarlos.</p>}
    </div>
  )
}

function AccountsCard({ fin }: { fin: FinanceData }) {
  const { ds, accounts } = fin
  const multi = ds.titulares.length > 1
  return (
    <Card className="lg:col-span-2">
      <CardHeader
        title="Cuentas"
        subtitle="Lo que ha salido de cada cuenta hacia las inversiones"
        icon={
          <span className="inline-flex size-9 items-center justify-center rounded-xl bg-sky-50 text-sky-600">
            <Landmark className="size-[18px]" />
          </span>
        }
        action={
          <Button variant="ghost" size="sm" iconRight={ChevronRight} onClick={() => navigate(paths.cuentas)}>
            Ver
          </Button>
        }
      />
      <div className="mt-3 border-t border-slate-100">
        {ds.cuentas.length === 0 && <p className="px-5 py-6 text-center text-sm text-slate-500">Aún no hay cuentas.</p>}
        {ds.titulares.map((t) => {
          const list = ds.cuentas
            .filter((c) => c.titularId === t.id)
            .map((c) => ({ c, s: accounts.get(c.id)! }))
            .filter((x) => x.s)
            .sort((a, b) => b.s.enviado + b.s.enviadoOtros - (a.s.enviado + a.s.enviadoOtros))
          if (list.length === 0) return null
          return (
            <section key={t.id} aria-label={`Cuentas de ${t.nombre}`}>
              {multi && (
                <div className="flex items-center gap-2 bg-slate-50/70 px-4 py-1.5 sm:px-5">
                  <TitularAvatar titular={t} size="xs" />
                  <h3 className="text-xs font-semibold text-slate-600">{t.nombre}</h3>
                </div>
              )}
              <ul className="divide-y divide-slate-100">
                {list.map(({ c, s }) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => navigate(paths.cuenta(c.id))}
                      className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-slate-50 sm:px-5"
                    >
                      <AccountAvatar color={c.color} />
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-semibold text-slate-800">{c.nombre}</div>
                        <div className="truncate text-xs text-slate-500">{[c.entidad, c.iban && maskIban(c.iban)].filter(Boolean).join(' · ') || 'Cuenta'}</div>
                      </div>
                      <div className="text-right">
                        <Amount value={s.netoInvertido} className="font-semibold text-slate-900" />
                        <div className="text-[11px] text-slate-400">neto invertido</div>
                        {s.enviadoOtros > 0 && (
                          <div className="text-[11px] text-fuchsia-700">
                            + <Amount value={s.enviadoOtros} /> a otros
                          </div>
                        )}
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )
        })}
      </div>
      <div className="flex gap-2 border-t border-slate-100 px-4 py-3 sm:px-5">
        <Button variant="soft" size="sm" icon={Wallet} className="flex-1" onClick={() => navigate(paths.productos())}>
          Inversiones
        </Button>
        <Button variant="soft" size="sm" icon={Plus} className="flex-1" onClick={() => openAccount()}>
          Nueva cuenta
        </Button>
      </div>
    </Card>
  )
}

/** Últimos movimientos en formato compacto (para la columna del escritorio). */
function CompactRecent({ fin }: { fin: FinanceData }) {
  const items = sortMovementsDesc(fin.ws.movimientos).slice(0, 6)
  return (
    <ul className="divide-y divide-slate-100">
      {items.map((m) => (
        <li key={m.id}>
          <CompactRow m={m} fin={fin} />
        </li>
      ))}
    </ul>
  )
}

function CompactRow({ m, fin }: { m: Movimiento; fin: FinanceData }) {
  const { lookup } = fin
  const kind = movementKind(lookup, m)
  const multi = lookup.titulares.size > 1
  const end = (ref: Movimiento['origen'], t: Titular | undefined) => (
    <span className="flex min-w-0 items-baseline gap-1">
      <span className="truncate font-medium text-slate-800">{entityName(lookup, ref)}</span>
      {multi && t && <TitularTag titular={t} className="shrink-0 text-[11px]" />}
    </span>
  )
  return (
    <button type="button" onClick={() => editMovement(m.id)} className="flex w-full items-center gap-3 px-5 py-3 text-left transition-colors hover:bg-slate-50">
      <MovementAvatar tipo={kind} size="sm" />
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-1.5 text-sm">
          {end(m.origen, ownerOf(lookup, m.origen))}
          <ArrowRight className="size-3.5 shrink-0 text-slate-400" />
          {end(m.destino, ownerOf(lookup, m.destino))}
        </div>
        <div className="truncate text-xs text-slate-500">
          <span className="font-medium" style={{ color: kindMeta(kind).text }}>
            {movementLabel(m, lookup)}
          </span>{' '}
          · {fmtDate(m.fecha)}
        </div>
      </div>
      <Amount value={m.importe} className="font-semibold text-slate-900" />
    </button>
  )
}
