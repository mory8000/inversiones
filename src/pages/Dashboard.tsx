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
  Wallet,
} from 'lucide-react'
import type { Movimiento, Titular } from '../types'
import { useFinance, type FinanceData, type TitularFinance } from '../store/useFinance'
import { currentDataset, useData } from '../store/data'
import { editMovement, openAccount, openProduct, openProgramada, openTitular, toast } from '../store/ui'
import { anadirDinero, invertirDesde, programarMensual } from '../store/acciones'
import { buildTimelineMulti } from '../lib/finance'
import { buildFlowGraph } from '../lib/flow'
import { PRODUCT_META, kindMeta } from '../lib/meta'
import { countsForOwner, entityName, movementKind, ownerOf, sortMovementsDesc } from '../lib/movements'
import { diaDe, movimientosDe, proximaFecha } from '../lib/programadas'
import { MYINVESTOR, cuentaPrincipal, cuentasConSaldo, isDefaultTitularName } from '../lib/titulares'
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
import { InvestmentTiles } from '../components/InvestmentTiles'
import { PrincipalBadge, TitularAvatar, TitularTag } from '../components/Titulares'

/** Color del dinero sin invertir (en cuentas con saldo, como MyInvestor). */
const EFECTIVO_COLOR = '#6366F1'

function HeroStat({ label, value, hint }: { label: string; value: number; hint: string }) {
  return (
    <div className="min-w-0">
      <div className="truncate text-[11px] font-medium text-white/60 sm:text-xs">{label}</div>
      <Amount value={value} className="mt-0.5 block truncate text-[15px] font-semibold sm:text-lg" />
      <div className="hidden truncate text-[11px] text-white/40 sm:block">{hint}</div>
    </div>
  )
}

const GLASS = 'rounded-2xl bg-white/[0.07] p-3 ring-1 ring-white/10 sm:p-3.5'

/**
 * Las cuentas con saldo del titular (su «MyInvestor»): cuánto hay sin invertir y el botón
 * para añadir dinero desde una cuenta externa. Al principal sin cuenta se le ofrece crearla.
 */
function CuentasBox({ tf, fin }: { tf: TitularFinance; fin: FinanceData }) {
  const { ds } = fin
  const crearCuentaPrincipal = useData((s) => s.crearCuentaPrincipal)
  const cuentas = cuentasConSaldo(tf.ws.cuentas, tf.titular.id)
  if (cuentas.length === 0) {
    if (tf.index !== 0) return null
    return (
      <div className={cn(GLASS, 'mt-4')}>
        <div className="flex items-start gap-3">
          <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-xl bg-white/10 text-white">
            <Landmark className="size-[18px]" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold">Cuenta principal «{MYINVESTOR}»</div>
            <p className="mt-0.5 text-[13px] text-white/65">Para apuntar el dinero que traes desde tu cuenta externa y, desde ahí, invertir.</p>
          </div>
        </div>
        <Button
          size="sm"
          variant="accent"
          wrap
          icon={Plus}
          className="mt-3 w-full"
          onClick={() => {
            crearCuentaPrincipal(tf.titular.id)
            toast(`Cuenta «${MYINVESTOR}» creada`)
          }}
        >
          Crear la cuenta {MYINVESTOR}
        </Button>
      </div>
    )
  }
  return (
    <div className="mt-4 space-y-2">
      {cuentas.map((c, i) => {
        const s = tf.accounts.get(c.id)
        const saldo = s?.saldo ?? 0
        return (
          <div key={c.id} className={GLASS} data-cuenta={c.nombre}>
            <button type="button" onClick={() => navigate(paths.cuenta(c.id))} className="flex w-full items-center gap-3 text-left">
              <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-xl text-white" style={{ backgroundColor: `${c.color}55` }}>
                <Landmark className="size-[18px]" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">{c.nombre}</span>
                <span className="block truncate text-xs text-white/55">{i === 0 ? 'Cuenta principal' : 'Cuenta con saldo'}</span>
              </span>
              <span className="text-right">
                <Amount value={Math.max(0, saldo)} className="block text-lg font-bold" />
                <span className="block text-[11px] text-white/45">sin invertir</span>
              </span>
            </button>
            {saldo < -0.005 && (
              <p className="mt-2 rounded-lg bg-amber-300/15 px-2.5 py-1.5 text-xs text-amber-100">
                Han salido <Amount value={-saldo} className="font-semibold" /> más de los que han entrado. Apunta de dónde vino ese dinero con «Añadir dinero».
              </p>
            )}
            <div className="mt-3 grid grid-cols-2 gap-2">
              <Button size="sm" variant="accent" wrap icon={Plus} onClick={() => anadirDinero(ds, c.id)}>
                Añadir dinero
              </Button>
              <Button size="sm" variant="dark" wrap icon={ArrowUpRight} onClick={() => invertirDesde(ds, c.id)}>
                Invertir
              </Button>
            </div>
          </div>
        )
      })}
    </div>
  )
}

/**
 * Transferencias mensuales que salen de este titular (p. ej. del principal al otro titular).
 * Al principal, si aún no tiene ninguna, se le invita a programarla.
 */
function MensualBox({ tf, fin }: { tf: TitularFinance; fin: FinanceData }) {
  const { ds, lookup, today, owner } = fin
  const hidden = useHidden()
  const mias = ds.programadas.filter((p) => owner(p.origen) === tf.titular.id)
  const otro = ds.titulares.find((t) => t.id !== tf.titular.id)
  if (mias.length === 0 && (tf.index !== 0 || !otro)) return null
  return (
    <div className={cn(GLASS, 'mt-3')} data-mensual>
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-sm font-semibold">
          <CalendarSync className="size-4 text-fuchsia-300" />
          {mias.length > 1 ? 'Transferencias mensuales' : 'Transferencia mensual'}
        </span>
        {mias.length > 0 && otro && (
          <button
            type="button"
            onClick={() => programarMensual(ds, tf.titular.id)}
            className="inline-flex items-center gap-0.5 text-xs font-semibold text-emerald-300 hover:text-emerald-200"
          >
            <Plus className="size-3.5" strokeWidth={2.6} /> Otra
          </button>
        )}
      </div>
      {mias.length === 0 && otro ? (
        <>
          <p className="mt-1.5 text-[13px] text-white/70">
            ¿{tf.titular.nombre} envía dinero cada mes a {otro.nombre}? Prográmalo una vez y la app lo apuntará sola cada mes. Contará solo para {otro.nombre}, no para{' '}
            {tf.titular.nombre}.
          </p>
          <Button size="sm" variant="light" wrap icon={CalendarSync} className="mt-3 w-full" onClick={() => programarMensual(ds, tf.titular.id)}>
            Programar transferencia mensual
          </Button>
        </>
      ) : (
        <ul className="mt-1 divide-y divide-white/10">
          {mias.map((p) => {
            const to = lookup.titulares.get(owner(p.destino) ?? '')
            const cross = !!to && to.id !== tf.titular.id
            const hechas = movimientosDe(ds, p.id)
            const total = hechas.reduce((sum, m) => sum + m.importe, 0)
            const next = proximaFecha(p, today)
            return (
              <li key={p.id}>
                <button type="button" onClick={() => openProgramada({ programadaId: p.id })} className="group flex w-full items-start gap-2 py-2 text-left">
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm">
                      <strong className="font-semibold">{hidden ? '•••••• €' : fmtEUR(p.importe)} al mes</strong>
                      {cross && to ? ` a ${to.nombre}` : ''} · el día {diaDe(p)}
                    </span>
                    <span className="block truncate text-xs text-white/60">
                      «{entityName(lookup, p.origen)}» → «{entityName(lookup, p.destino)}»
                    </span>
                    <span className="block text-xs text-white/60">
                      {hechas.length} apuntada{hechas.length === 1 ? '' : 's'} ({hidden ? '•••••• €' : fmtEUR(total)}) · {next ? `próxima: ${fmtDate(next)}` : 'terminada'}
                    </span>
                    {cross && to && (
                      <span className="block text-xs text-emerald-200">
                        {countsForOwner(lookup, p.destino)
                          ? `Cuenta solo para ${to.nombre}, no para ${tf.titular.nombre}`
                          : `Va a una cuenta externa de ${to.nombre}: contará para ${to.nombre} cuando la invierta`}
                      </span>
                    )}
                  </span>
                  <span className="mt-0.5 flex shrink-0 items-center text-xs font-semibold text-emerald-300 group-hover:text-emerald-200">
                    Cambiar <ChevronRight className="size-3.5" />
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

/** Lo que un titular ha recibido de otros o enviado a otros (cuenta solo para quien lo recibe). */
function CrossLines({ tf, fin }: { tf: TitularFinance; fin: FinanceData }) {
  const { ds, owner } = fin
  const name = (id: string) => fin.byTitular.get(id)?.titular.nombre ?? 'otro titular'
  // Transferencias mensuales que recibe de otro titular.
  const recibe = ds.programadas.filter((p) => owner(p.destino) === tf.titular.id && owner(p.origen) && owner(p.origen) !== tf.titular.id)
  if (tf.recibido.length === 0 && tf.enviado.length === 0 && tf.recibidoEnExternas <= 0 && recibe.length === 0) return null
  return (
    <ul className="mt-4 space-y-1.5 border-t border-white/10 pt-3 text-[13px]">
      {recibe.map((p) => (
        <li key={`p-${p.id}`} className="flex items-start gap-2">
          <CalendarSync className="mt-0.5 size-4 shrink-0 text-fuchsia-300" />
          <span className="min-w-0 text-white/80">
            Recibe <Amount value={p.importe} className="font-semibold text-white" /> cada mes de {name(owner(p.origen)!)} (el día {diaDe(p)})
          </span>
        </li>
      ))}
      {tf.recibido.map((r) => (
        <li key={`r-${r.titularId}`} className="flex items-start gap-2">
          <ArrowDownLeft className="mt-0.5 size-4 shrink-0 text-emerald-300" />
          <span className="min-w-0 text-white/80">
            Recibido de {name(r.titularId)}: <Amount value={r.importe} className="font-semibold text-white" />
            <span className="text-white/50"> · cuenta para {tf.titular.nombre}</span>
          </span>
        </li>
      ))}
      {tf.recibidoEnExternas > 0 && (
        <li className="flex items-start gap-2">
          <ArrowDownLeft className="mt-0.5 size-4 shrink-0 text-white/50" />
          <span className="min-w-0 text-white/80">
            Recibido en cuentas externas: <Amount value={tf.recibidoEnExternas} className="font-semibold text-white" />
            <span className="text-white/50"> · contará cuando lo invierta</span>
          </span>
        </li>
      )}
      {tf.enviado.map((e) => (
        <li key={`e-${e.titularId}`} className="flex items-start gap-2">
          <ArrowUpRight className="mt-0.5 size-4 shrink-0 text-fuchsia-300" />
          <span className="min-w-0 text-white/80">
            Enviado a {name(e.titularId)}: <Amount value={e.importe} className="font-semibold text-white" />
            <span className="text-white/50">
              {' '}
              · no cuenta para {tf.titular.nombre}, solo para {name(e.titularId)}
            </span>
          </span>
        </li>
      ))}
    </ul>
  )
}

/**
 * Tarjeta de un titular: su patrimonio (inversiones + dinero en su MyInvestor) y sus cifras,
 * por separado de las de los demás. Dentro van su cuenta principal y sus transferencias mensuales.
 */
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
        <div className="mt-2 text-[34px] leading-tight font-bold tracking-tight sm:text-[42px]">
          <Amount value={totals.patrimonio} />
        </div>
        {empty ? (
          <div className="mt-1 text-sm text-white/65">
            Sin movimientos todavía.
            {isDefaultTitularName(titular.nombre) && (
              <button type="button" onClick={() => openTitular(titular.id)} className="ml-1.5 font-semibold text-emerald-300 underline underline-offset-2">
                Ponerle nombre
              </button>
            )}
          </div>
        ) : (
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <GainBadge onDark ganancia={totals.ganancia} rentabilidad={totals.rentabilidad} />
            <span className="text-sm text-white/55">rentabilidad</span>
          </div>
        )}
        {!empty && (
          <div className="mt-4 grid grid-cols-3 gap-3 border-t border-white/10 pt-4">
            <HeroStat label="Invertido" value={totals.capital} hint="En fondos, carteras…" />
            <HeroStat label="En cuentas" value={totals.efectivo} hint="Sin invertir (MyInvestor)" />
            <HeroStat label="Aportado" value={totals.aportadoTotal} hint={tf.recibidoTotal > 0 ? 'Incluye lo recibido' : 'Desde fuera'} />
          </div>
        )}
        <CuentasBox tf={tf} fin={fin} />
        <MensualBox tf={tf} fin={fin} />
        <CrossLines tf={tf} fin={fin} />
      </div>
    </section>
  )
}

/** Dónde está el dinero de cada titular (por tipo de producto y en cuentas), uno junto a otro. */
function DistributionCard({ fin }: { fin: FinanceData }) {
  const list = fin.titulares.filter((tf) => tf.totals.patrimonio > 0.005)
  if (list.length === 0) return null
  return (
    <Card>
      <CardHeader title="Distribución" subtitle="¿Dónde está el dinero de cada uno?" />
      <div className={cn('grid grid-cols-1 gap-x-6 gap-y-5 px-4 pt-3 pb-4 sm:px-5', list.length > 1 && 'md:grid-cols-2')}>
        {list.map((tf) => {
          const data: { key: string; label: string; value: number; color: string; path: string }[] = tf.byType
            .filter((r) => r.saldo > 0.005)
            .map((r) => ({ key: r.tipo, label: PRODUCT_META[r.tipo].plural, value: r.saldo, color: PRODUCT_META[r.tipo].color, path: paths.productos(r.tipo) }))
          if (tf.totals.efectivo > 0.005) data.push({ key: 'efectivo', label: 'En cuentas (sin invertir)', value: tf.totals.efectivo, color: EFECTIVO_COLOR, path: paths.cuentas })
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
                      onClick={() => navigate(d.path)}
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

/** Primeros pasos (solo mientras no hay movimientos). */
function GettingStarted({ fin }: { fin: FinanceData }) {
  const { ds, accounts } = fin
  const loadDemo = useData((s) => s.loadDemo)
  const crearCuentaPrincipal = useData((s) => s.crearCuentaPrincipal)
  const [t1, t2] = ds.titulares
  const principal = cuentaPrincipal(ds.cuentas, t1.id)
  const conDinero = ds.cuentas.some((c) => !c.externa && (accounts.get(c.id)?.entradas ?? 0) > 0)
  const steps = [
    {
      done: ds.titulares.some((t) => !isDefaultTitularName(t.nombre)),
      title: 'Pon nombre a los titulares',
      text: `Ahora se llaman «${ds.titulares.map((t) => t.nombre).join('» y «')}». Toca el lápiz de cada tarjeta.`,
      action: (
        <Button size="sm" variant="soft" icon={Pencil} onClick={() => openTitular(t1.id)}>
          Ponerle nombre
        </Button>
      ),
    },
    {
      done: conDinero,
      title: `Añade dinero a ${principal?.nombre ?? MYINVESTOR}`,
      text: `Apunta lo que traes desde tu cuenta externa (otro banco) a la cuenta principal de ${t1.nombre}.`,
      action: (
        <Button
          size="sm"
          variant="soft"
          icon={Plus}
          onClick={() => {
            const id = principal?.id ?? crearCuentaPrincipal(t1.id)
            // La cuenta recién creada aún no está en `ds`: se busca en el estado actual.
            anadirDinero(currentDataset(useData.getState()), id)
          }}
        >
          Añadir dinero
        </Button>
      ),
    },
    {
      done: ds.productos.length > 0,
      title: 'Añade tus inversiones',
      text: 'Fondos, carteras, depósitos… Cada una sale arriba en su ventanilla.',
      action: (
        <Button size="sm" variant="soft" icon={Plus} onClick={() => openProduct({ abrirVentanilla: true })}>
          Nueva inversión
        </Button>
      ),
    },
    ...(t2
      ? [
          {
            done: ds.programadas.length > 0,
            title: 'Programa la transferencia mensual',
            text: `Está en la tarjeta de ${t1.nombre}. La app la apuntará sola cada mes y contará solo para ${t2.nombre}.`,
            action: (
              <Button size="sm" variant="soft" icon={CalendarSync} onClick={() => programarMensual(ds, t1.id)}>
                Programar
              </Button>
            ),
          },
        ]
      : []),
  ]
  return (
    <section aria-labelledby="primeros-pasos" className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 id="primeros-pasos" className="text-base font-semibold text-slate-900">
            Primeros pasos
          </h2>
          <p className="text-sm text-slate-500">Así empiezas a ver todo claro: de dónde viene y a dónde va cada euro.</p>
        </div>
        <Button size="sm" variant="secondary" icon={FlaskConical} onClick={loadDemo}>
          Ver un ejemplo
        </Button>
      </div>
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
              <h3 className="font-semibold text-slate-900">{s.title}</h3>
            </div>
            <p className="mt-2 flex-1 text-sm text-slate-500">{s.text}</p>
            <div className="mt-4">{s.action}</div>
          </Card>
        ))}
      </div>
      <p className="px-1 text-center text-xs text-slate-500">Tus datos se guardan solo en este dispositivo. Puedes hacer copias de seguridad desde Ajustes.</p>
    </section>
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
  const multi = ds.titulares.length > 1
  const empty = ws.movimientos.length === 0

  return (
    <div className="space-y-4 lg:space-y-5">
      <DemoBanner />

      {/* Lo primero: los titulares a la vez (el primero es el principal) y una ventanilla por inversión */}
      <div>
        <div className={cn('grid grid-cols-1 items-start gap-4 lg:gap-5', multi && 'lg:grid-cols-2')}>
          {fin.titulares.map((tf) => (
            <TitularHero key={tf.titular.id} tf={tf} fin={fin} />
          ))}
        </div>
        <InvestmentTiles fin={fin} />
      </div>

      {empty ? (
        <GettingStarted fin={fin} />
      ) : (
        <>
          {/* Evolución de cada uno */}
          <Card>
            <CardHeader
              title="Evolución"
              subtitle={multi ? 'Patrimonio de cada titular (línea continua) y el dinero que ha puesto (discontinua)' : 'Patrimonio frente al dinero puesto'}
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
          {fin.titulares.some((tf) => tf.byType.length > 0) && (
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
          )}

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
        </>
      )}
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
        subtitle="Saldo de tus cuentas (como MyInvestor) y lo aportado desde las externas"
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
          // Primero las cuentas con saldo; luego las externas.
          const list = [...ds.cuentas.filter((c) => c.titularId === t.id && !c.externa), ...ds.cuentas.filter((c) => c.titularId === t.id && c.externa)]
            .map((c) => ({ c, s: accounts.get(c.id)! }))
            .filter((x) => x.s)
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
                        <div className="truncate text-xs text-slate-500">
                          {[c.externa ? 'Externa' : 'Con saldo', c.entidad, c.iban && maskIban(c.iban)].filter(Boolean).join(' · ')}
                        </div>
                      </div>
                      <div className="text-right">
                        {c.externa ? (
                          <>
                            <Amount value={s.salidas - s.entradas} className="font-semibold text-slate-900" />
                            <div className="text-[11px] text-slate-400">aportado (neto)</div>
                          </>
                        ) : (
                          <>
                            <Amount value={s.saldo} className={cn('font-semibold', s.saldo < -0.005 ? 'text-amber-700' : 'text-slate-900')} />
                            <div className="text-[11px] text-slate-400">saldo</div>
                          </>
                        )}
                        {s.enviadoOtros > 0 && (
                          <div className="text-[11px] text-fuchsia-700">
                            <Amount value={s.enviadoOtros} /> a otros
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
