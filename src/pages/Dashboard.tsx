import { useMemo } from 'react'
import { ArrowRight, Check, ChevronRight, FlaskConical, Landmark, Pencil, Plus, Sparkles, Wallet, ArrowLeftRight } from 'lucide-react'
import { useFinance } from '../store/useFinance'
import { useActiveTitular, useData } from '../store/data'
import { editMovement, openAccount, openMovement, openProduct, openTitular } from '../store/ui'
import { buildTimeline } from '../lib/finance'
import { buildFlowGraph } from '../lib/flow'
import { MOVEMENT_META, PRODUCT_META } from '../lib/meta'
import type { MovementType } from '../types'
import { fmtDate, fmtEUR, fmtPct, maskIban } from '../lib/format'
import { navigate, paths } from '../lib/router'
import { cn } from '../lib/cn'
import { useMediaQuery } from '../lib/useMediaQuery'
import { Card, CardHeader } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Amount, GainBadge, useHidden } from '../components/ui/Amount'
import { AccountAvatar, MovementAvatar } from '../components/ui/icons'
import { Donut, EvolutionChart } from '../components/charts/lazy'
import { Sankey } from '../components/charts/Sankey'
import { MovementList } from '../components/movements/MovementList'
import { SummaryTable } from '../components/SummaryTable'
import { DemoBanner } from '../components/DemoBanner'
import { Logo } from '../components/layout/AppShell'
import { TitularAvatar } from '../components/layout/TitularSwitcher'
import { isDefaultTitularName, shortTitularName } from '../lib/titulares'

function HeroStat({ label, value, hint }: { label: string; value: number; hint: string }) {
  return (
    <div className="min-w-0">
      <div className="truncate text-[11px] font-medium text-white/60 sm:text-xs">{label}</div>
      <Amount value={value} className="mt-0.5 block truncate text-[15px] font-semibold sm:text-lg" />
      <div className="hidden truncate text-[11px] text-white/40 sm:block">{hint}</div>
    </div>
  )
}

/** Deja claro de quién son los datos que se ven y que cada titular va por su lado. */
function TitularIntro() {
  const titular = useActiveTitular()
  const titulares = useData((s) => s.titulares)
  const otros = titulares.filter((t) => !t.demo && t.id !== titular.id)
  if (titular.demo || otros.length === 0) return null
  const sinNombre = isDefaultTitularName(titular.nombre)
  const nombresOtros = otros.length === 1 ? `«${otros[0].nombre}»` : 'los demás titulares'
  return (
    <Card className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:gap-4 sm:p-5">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <TitularAvatar titular={titular} size="lg" />
        <div className="min-w-0">
          <h2 className="font-semibold text-slate-900">
            Estás en el espacio de <span className="break-words">«{titular.nombre}»</span>
          </h2>
          <p className="mt-0.5 text-sm text-slate-500">
            Sus cuentas, productos y movimientos van por separado de los de {nombresOtros}. Para cambiar de titular, toca su nombre{' '}
            <span className="lg:hidden">arriba del todo</span>
            <span className="max-lg:hidden">en el menú de la izquierda</span>.
          </p>
        </div>
      </div>
      <Button variant={sinNombre ? 'primary' : 'secondary'} size="sm" icon={Pencil} onClick={() => openTitular(titular.id)} className="shrink-0 self-start sm:self-center">
        {sinNombre ? 'Ponerle nombre' : 'Editar titular'}
      </Button>
    </Card>
  )
}

function Welcome() {
  const { ws } = useFinance()
  const loadDemo = useData((s) => s.loadDemo)
  const steps = [
    {
      done: ws.cuentas.length > 0,
      title: 'Añade una cuenta',
      text: 'La cuenta bancaria de donde sale el dinero (y a donde vuelve).',
      action: (
        <Button size="sm" variant="soft" icon={Plus} onClick={() => openAccount()}>
          Añadir cuenta
        </Button>
      ),
    },
    {
      done: ws.productos.length > 0,
      title: 'Añade un producto',
      text: 'Un depósito, un fondo, una cartera, un plan de pensiones…',
      action: (
        <Button size="sm" variant="soft" icon={Plus} onClick={() => openProduct()}>
          Añadir producto
        </Button>
      ),
    },
    {
      done: ws.movimientos.length > 0,
      title: 'Registra un movimiento',
      text: 'Por ejemplo: 1.000 € de tu cuenta al fondo. De dónde viene y a dónde va.',
      action: (
        <Button size="sm" icon={Plus} onClick={() => openMovement()}>
          Nuevo movimiento
        </Button>
      ),
    },
  ]
  return (
    <div className="space-y-4">
      <TitularIntro />
      <section className="relative overflow-hidden rounded-3xl bg-brand-900 px-5 py-8 text-white sm:px-10 sm:py-12">
        <div className="pointer-events-none absolute -top-24 -right-16 size-80 rounded-full bg-brand-500/30 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-28 left-1/4 size-72 rounded-full bg-emerald-400/15 blur-3xl" />
        <div className="relative max-w-2xl">
          <Logo className="size-12" />
          <h1 className="mt-5 text-3xl font-bold tracking-tight sm:text-4xl">Tus inversiones, todo claro</h1>
          <p className="mt-3 text-[15px] text-white/75 sm:text-base">
            Apunta tus cuentas, tus depósitos, fondos y carteras, y cada movimiento de dinero. La app calcula los saldos y la rentabilidad, y te
            enseña <strong className="text-white">de dónde viene y a dónde va cada euro</strong>.
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

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {steps.map((s, i) => (
          <Card key={s.title} className="flex flex-col p-4 sm:p-5">
            <div className="flex items-center gap-2.5">
              <span
                className={cn(
                  'inline-flex size-7 items-center justify-center rounded-full text-[13px] font-bold',
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
      <p className="px-1 text-center text-xs text-slate-500">
        Tus datos se guardan solo en este dispositivo. Puedes hacer copias de seguridad desde Ajustes.
      </p>
    </div>
  )
}

export function Dashboard() {
  const { ws, positions, totals, byType, accounts, lookup, today } = useFinance()
  const titular = useActiveTitular()
  const hidden = useHidden()
  const isDesktop = useMediaQuery('(min-width: 1024px)')
  const timeline = useMemo(() => buildTimeline(ws, today), [ws, today])
  const graph = useMemo(() => buildFlowGraph(ws, positions, { from: null, to: null }), [ws, positions])

  if (ws.movimientos.length === 0) {
    return (
      <>
        <DemoBanner />
        <Welcome />
      </>
    )
  }

  const donutData = byType
    .filter((r) => r.saldo > 0.005)
    .map((r) => ({ key: r.tipo, label: PRODUCT_META[r.tipo].plural, value: r.saldo, color: PRODUCT_META[r.tipo].color }))
  const accountList = ws.cuentas
    .map((c) => ({ c, s: accounts.get(c.id)! }))
    .filter((x) => x.s)
    .sort((a, b) => b.s.enviado - a.s.enviado)

  return (
    <div className="space-y-4 lg:space-y-5">
      <DemoBanner />

      {/* Patrimonio */}
      <section className="relative overflow-hidden rounded-3xl bg-brand-900 p-5 text-white shadow-lg shadow-brand-900/10 sm:p-7">
        <div className="pointer-events-none absolute -top-24 -right-16 size-80 rounded-full bg-brand-500/35 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-28 left-1/3 size-72 rounded-full bg-emerald-400/15 blur-3xl" />
        <div className="relative">
          <div className="flex items-center justify-between gap-3">
            <span className="flex min-w-0 items-center gap-2 text-sm font-medium text-white/75">
              <TitularAvatar titular={titular} size="xs" className="ring-2 ring-white/25" />
              <span className="truncate">Patrimonio de {shortTitularName(titular)}</span>
            </span>
            <span className="shrink-0 text-xs text-white/50">a {fmtDate(today)}</span>
          </div>
          <div className="mt-1 text-[40px] leading-tight font-bold tracking-tight sm:text-5xl">
            <Amount value={totals.patrimonio} />
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <GainBadge onDark ganancia={totals.ganancia} rentabilidad={totals.rentabilidad} />
            <span className="text-sm text-white/55">rentabilidad total</span>
          </div>
          <div className="mt-6 grid grid-cols-3 gap-3 border-t border-white/10 pt-4">
            <HeroStat label="Capital invertido" value={totals.capital} hint="Aportado − reembolsado" />
            <HeroStat label="Aportado" value={totals.aportado} hint="Desde tus cuentas" />
            <HeroStat label="Reembolsado" value={totals.reembolsado} hint="Vuelto a tus cuentas" />
          </div>
        </div>
      </section>

      {/* Evolución + distribución */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5 lg:gap-5">
        <Card className="lg:col-span-3">
          <CardHeader
            title="Evolución"
            subtitle="Patrimonio frente al capital invertido"
            action={
              <div className="hidden items-center gap-3 text-xs text-slate-500 sm:flex">
                <span className="flex items-center gap-1.5">
                  <span className="size-2.5 rounded-full bg-brand-500" /> Patrimonio
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-0.5 w-3 bg-slate-400" /> Capital
                </span>
              </div>
            }
          />
          <div className="px-2 pt-3 pb-3 sm:px-4">
            <EvolutionChart points={timeline} height={isDesktop ? 330 : 240} />
          </div>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader title="Distribución" subtitle="¿Dónde está tu dinero?" />
          <div className="px-4 pt-2 pb-4 sm:px-5">
            <Donut data={donutData} centerLabel="Total" centerValue={fmtEUR(totals.patrimonio, { decimals: 0 })} height={190} />
            <ul className="mt-4 space-y-1">
              {donutData.map((d) => (
                <li key={d.key}>
                  <button
                    type="button"
                    onClick={() => navigate(paths.productos(d.key))}
                    className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm transition-colors hover:bg-slate-50"
                  >
                    <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: d.color }} />
                    <span className="min-w-0 flex-1 text-left leading-tight font-medium text-slate-700">{d.label}</span>
                    <span className="text-xs text-slate-400 tabular-nums">{fmtPct(totals.patrimonio ? d.value / totals.patrimonio : 0, { short: true })}</span>
                    <Amount value={d.value} className="w-28 text-right font-semibold text-slate-900" />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </Card>
      </div>

      {/* Flujo del dinero */}
      <Card>
        <CardHeader
          title="¿De dónde viene y a dónde va tu dinero?"
          subtitle="El grosor de cada banda es proporcional al importe. Toca una caja para resaltarla."
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

      {/* Resumen tipo Excel */}
      <Card>
        <CardHeader title="Resumen por tipo de producto" subtitle="Depósitos, fondos y carteras: invertido, reembolsado, traspasos, rentabilidad y saldo" />
        <div className="pt-3">
          <SummaryTable rows={byType} totals={totals} />
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5 lg:gap-5">
        {/* Últimos movimientos */}
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
            <CompactRecent />
          </div>
        </Card>

        {/* Cuentas */}
        <Card className="lg:col-span-2">
          <CardHeader
            title="Tus cuentas"
            subtitle="Lo que ha salido hacia tus inversiones"
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
          <ul className="mt-3 divide-y divide-slate-100 border-t border-slate-100">
            {accountList.length === 0 && <li className="px-5 py-6 text-center text-sm text-slate-500">Aún no hay cuentas.</li>}
            {accountList.map(({ c, s }) => (
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
                      {[c.entidad, c.iban && maskIban(c.iban)].filter(Boolean).join(' · ') || 'Cuenta'}
                    </div>
                  </div>
                  <div className="text-right">
                    <Amount value={s.netoInvertido} className="font-semibold text-slate-900" />
                    <div className="text-[11px] text-slate-400">neto invertido</div>
                  </div>
                </button>
              </li>
            ))}
          </ul>
          <div className="flex gap-2 border-t border-slate-100 px-4 py-3 sm:px-5">
            <Button variant="soft" size="sm" icon={Wallet} className="flex-1" onClick={() => navigate(paths.productos())}>
              Inversiones
            </Button>
            <Button variant="soft" size="sm" icon={Plus} className="flex-1" onClick={() => openAccount()}>
              Nueva cuenta
            </Button>
          </div>
        </Card>
      </div>
      {hidden && <p className="text-center text-xs text-slate-400">Importes ocultos. Pulsa el icono del ojo para mostrarlos.</p>}
    </div>
  )
}

/** Últimos movimientos en formato compacto (para la columna del escritorio). */
function CompactRecent() {
  const { ws, lookup } = useFinance()
  const items = [...ws.movimientos]
    .sort((a, b) => (a.fecha === b.fecha ? b.createdAt.localeCompare(a.createdAt) : b.fecha.localeCompare(a.fecha)))
    .slice(0, 6)
  return (
    <ul className="divide-y divide-slate-100">
      {items.map((m) => {
        const o = lookup.cuentas.get(m.origen.id)?.nombre ?? lookup.productos.get(m.origen.id)?.nombre ?? '—'
        const d = lookup.cuentas.get(m.destino.id)?.nombre ?? lookup.productos.get(m.destino.id)?.nombre ?? '—'
        return (
          <li key={m.id}>
            <CompactRow id={m.id} tipo={m.tipo} fecha={m.fecha} origen={o} destino={d} importe={m.importe} />
          </li>
        )
      })}
    </ul>
  )
}

function CompactRow({ id, tipo, fecha, origen, destino, importe }: { id: string; tipo: MovementType; fecha: string; origen: string; destino: string; importe: number }) {
  return (
    <button type="button" onClick={() => editMovement(id)} className="flex w-full items-center gap-3 px-5 py-3 text-left transition-colors hover:bg-slate-50">
      <MovementAvatar tipo={tipo} size="sm" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 text-sm">
          <span className="truncate font-medium text-slate-800">{origen}</span>
          <ArrowRight className="size-3.5 shrink-0 text-slate-400" />
          <span className="truncate font-medium text-slate-800">{destino}</span>
        </div>
        <div className="text-xs text-slate-500">
          <span className="font-medium" style={{ color: MOVEMENT_META[tipo].text }}>
            {MOVEMENT_META[tipo].label}
          </span>{' '}
          · {fmtDate(fecha)}
        </div>
      </div>
      <Amount value={importe} className="font-semibold text-slate-900" />
    </button>
  )
}
