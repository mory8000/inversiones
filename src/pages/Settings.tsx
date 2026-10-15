import { useRef, type ReactNode } from 'react'
import {
  ArrowRight,
  CalendarSync,
  Check,
  Crown,
  Download,
  Eye,
  FileSpreadsheet,
  FlaskConical,
  Pencil,
  Plus,
  ShieldCheck,
  Smartphone,
  Trash2,
  Upload,
  UserRound,
} from 'lucide-react'
import { exportBackup, sanitizeData, useData } from '../store/data'
import { useFinance, type TitularFinance } from '../store/useFinance'
import { confirmDialog, openProgramada, openTitular, toast } from '../store/ui'
import { entityName, movementsToCSV } from '../lib/movements'
import { diaDe, movimientosDe, proximaFecha } from '../lib/programadas'
import { fmtDate, fmtEUR } from '../lib/format'
import { downloadFile } from '../lib/download'
import { isStandalone, useInstallPrompt } from '../lib/install'
import { cn } from '../lib/cn'
import { PageHeader } from '../components/layout/AppShell'
import { Card, CardHeader } from '../components/ui/Card'
import { Button, IconButton } from '../components/ui/Button'
import { Amount, useHidden } from '../components/ui/Amount'
import { Switch } from '../components/ui/Switch'
import { PrincipalBadge, TitularAvatar } from '../components/Titulares'

function Row({ icon, title, text, action, danger }: { icon: ReactNode; title: string; text?: ReactNode; action: ReactNode; danger?: boolean }) {
  return (
    <div className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
      <div className="flex min-w-0 items-start gap-3">
        <span
          className={cn(
            'inline-flex size-9 shrink-0 items-center justify-center rounded-xl',
            danger ? 'bg-rose-50 text-rose-600' : 'bg-slate-100 text-slate-600',
          )}
        >
          {icon}
        </span>
        <div className="min-w-0">
          <div className={cn('text-sm font-semibold', danger ? 'text-rose-700' : 'text-slate-900')}>{title}</div>
          {text && <div className="mt-0.5 text-[13px] text-slate-500">{text}</div>}
        </div>
      </div>
      <div className="flex shrink-0 gap-2 pl-12 sm:pl-0">{action}</div>
    </div>
  )
}

/** Un titular en Ajustes: su código, su patrimonio y botones para editarlo o hacerlo principal. */
function TitularRow({ tf }: { tf: TitularFinance }) {
  const makePrincipal = useData((s) => s.makePrincipal)
  const { titular, index } = tf
  return (
    <li className="flex items-center gap-3 px-4 py-3.5 sm:px-5">
      <TitularAvatar titular={titular} size="lg" />
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate font-semibold text-slate-900">{titular.nombre}</span>
          {index === 0 && <PrincipalBadge />}
        </div>
        <div className="text-sm">
          {tf.ws.movimientos.length === 0 ? (
            <span className="text-slate-500">Sin movimientos</span>
          ) : (
            <Amount value={tf.totals.patrimonio} className="font-medium text-slate-700" />
          )}
        </div>
        {titular.codigo && <div className="truncate text-xs text-slate-500">Código {titular.codigo}</div>}
      </div>
      {index > 0 && (
        <Button
          variant="soft"
          size="sm"
          icon={Crown}
          onClick={() => {
            makePrincipal(titular.id)
            toast(`${titular.nombre} es ahora el titular principal`)
          }}
          className="shrink-0"
        >
          <span className="max-sm:sr-only">Hacer principal</span>
        </Button>
      )}
      <IconButton icon={Pencil} label={`Editar ${titular.nombre}`} onClick={() => openTitular(titular.id)} />
    </li>
  )
}

export function Settings() {
  const fin = useFinance()
  const { ws, ds, lookup, today, owner } = fin
  const hidden = useHidden()
  const hideAmounts = useData((s) => s.hideAmounts)
  const setHideAmounts = useData((s) => s.setHideAmounts)
  const loadDemo = useData((s) => s.loadDemo)
  const hasDemo = useData((s) => !!s.ejemplo)
  const verEjemplo = useData((s) => s.verEjemplo)
  const setVerEjemplo = useData((s) => s.setVerEjemplo)
  const clearData = useData((s) => s.clearData)
  const resetAll = useData((s) => s.resetAll)
  const importData = useData((s) => s.importData)
  const [t1, t2] = ds.titulares
  const install = useInstallPrompt()
  const fileRef = useRef<HTMLInputElement>(null)

  const backup = () => {
    downloadFile(`mis-inversiones-copia-${today}.json`, exportBackup(), 'application/json')
    toast('Copia de seguridad descargada')
  }

  const exportCSV = () => {
    downloadFile(`movimientos-${today}.csv`, movementsToCSV(ws.movimientos, lookup), 'text/csv;charset=utf-8')
    toast('Movimientos exportados')
  }

  const restore = async (file: File) => {
    try {
      const data = sanitizeData(JSON.parse(await file.text()))
      if (!data) throw new Error('invalid')
      const n = data.datos.movimientos.length
      const nt = data.datos.titulares.length
      const ok = await confirmDialog({
        title: '¿Restaurar esta copia?',
        message: `Contiene ${nt} titular${nt === 1 ? '' : 'es'} (${data.datos.titulares.map((t) => t.nombre).join(', ')}) y ${n} movimiento${n === 1 ? '' : 's'}. Se sustituirán todos tus datos actuales.`,
        confirmLabel: 'Restaurar',
        danger: true,
      })
      if (ok) {
        importData(data)
        toast('Copia restaurada')
      }
    } catch {
      toast('El archivo no es una copia válida de Mis Inversiones', 'error')
    }
  }

  const clear = async () => {
    const ok = await confirmDialog({
      title: '¿Borrar cuentas, productos y movimientos?',
      message:
        'Se eliminarán las cuentas, productos, movimientos y transferencias mensuales de todos los titulares. Los titulares (y sus nombres) se quedan, y el principal vuelve a tener su cuenta «MyInvestor» vacía. Te recomendamos descargar antes una copia de seguridad.',
      confirmLabel: 'Borrar datos',
      danger: true,
    })
    if (ok) {
      clearData()
      toast('Datos borrados')
    }
  }

  const reset = async () => {
    const ok = await confirmDialog({
      title: '¿Borrar absolutamente todo?',
      message: 'Se eliminarán todos los titulares y sus datos de este dispositivo. Esta acción no se puede deshacer.',
      confirmLabel: 'Borrarlo todo',
      danger: true,
    })
    if (ok) {
      resetAll()
      toast('Se han borrado todos los datos')
    }
  }

  const standalone = isStandalone()

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Ajustes" subtitle="Titulares, preferencias y copias de seguridad" />

      <div className="space-y-4 lg:space-y-5">
        <Card>
          <CardHeader
            title="Titulares"
            subtitle="Se ven todos a la vez, cada uno con sus cuentas y productos. El primero es el principal."
          />
          <ul className="mt-3 divide-y divide-slate-100 border-t border-slate-100">
            {fin.titulares.map((tf) => (
              <TitularRow key={tf.titular.id} tf={tf} />
            ))}
          </ul>
          <div className="border-t border-slate-100 px-4 py-3 sm:px-5">
            <Button variant="ghost" size="sm" icon={Plus} onClick={() => openTitular()}>
              Añadir otro titular
            </Button>
          </div>
        </Card>

        <Card>
          <CardHeader
            title="Transferencias mensuales"
            subtitle="Movimientos que se repiten cada mes: la app los apunta solos"
            icon={
              <span className="inline-flex size-9 items-center justify-center rounded-xl bg-fuchsia-50 text-fuchsia-600">
                <CalendarSync className="size-[18px]" />
              </span>
            }
          />
          {ds.programadas.length === 0 ? (
            <p className="mt-3 border-t border-slate-100 px-4 py-4 text-sm text-slate-500 sm:px-5">
              Aún no hay ninguna.
              {t2 ? ` Por ejemplo, la transferencia de cada mes de ${t1.nombre} a ${t2.nombre} (se programa en la tarjeta de ${t1.nombre}, en Inicio): cuenta solo para ${t2.nombre}.` : ''}
            </p>
          ) : (
            <ul className="mt-3 divide-y divide-slate-100 border-t border-slate-100">
              {ds.programadas.map((p) => {
                const from = lookup.titulares.get(owner(p.origen) ?? '')
                const to = lookup.titulares.get(owner(p.destino) ?? '')
                const n = movimientosDe(ds, p.id).length
                const next = proximaFecha(p, today)
                return (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => openProgramada({ programadaId: p.id })}
                      className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-slate-50 sm:px-5"
                    >
                      <span className="flex shrink-0 items-center">
                        {from && <TitularAvatar titular={from} size="sm" />}
                        {to && from && to.id !== from.id && (
                          <>
                            <ArrowRight className="mx-0.5 size-3.5 text-slate-400" />
                            <TitularAvatar titular={to} size="sm" />
                          </>
                        )}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-slate-900">
                          {hidden ? '•••••• €' : fmtEUR(p.importe)} el día {diaDe(p)} de cada mes
                        </span>
                        <span className="block truncate text-[13px] text-slate-500">
                          {entityName(lookup, p.origen)} → {entityName(lookup, p.destino)}
                        </span>
                        <span className="block truncate text-xs text-slate-400">
                          {n} apuntada{n === 1 ? '' : 's'} · {next ? `próxima: ${fmtDate(next)}` : 'terminada'}
                        </span>
                      </span>
                      <Pencil className="size-4 shrink-0 text-slate-400" />
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
          <div className="border-t border-slate-100 px-4 py-3 sm:px-5">
            <Button
              variant="ghost"
              size="sm"
              icon={Plus}
              onClick={() =>
                openProgramada({
                  preset: t2 && ds.programadas.length === 0 ? { origenTitularId: t1.id, destinoTitularId: t2.id, concepto: `Transferencia mensual a ${t2.nombre}` } : undefined,
                })
              }
            >
              Nueva transferencia mensual
            </Button>
          </div>
        </Card>

        <Card>
          <CardHeader title="Preferencias" />
          <div className="mt-2 divide-y divide-slate-100 border-t border-slate-100">
            <Row
              icon={<Eye className="size-[18px]" />}
              title="Ocultar importes"
              text="Muestra •••••• en lugar de las cantidades (útil en público)."
              action={<Switch checked={hideAmounts} onChange={setHideAmounts} label="Ocultar importes" />}
            />
          </div>
        </Card>

        <Card>
          <CardHeader title="Tus datos" subtitle="Se guardan solo en este dispositivo y navegador" />
          <div className="mt-2 divide-y divide-slate-100 border-t border-slate-100">
            <Row
              icon={<ShieldCheck className="size-[18px]" />}
              title="Copia de seguridad"
              text="Descarga un archivo con todos tus datos para guardarlo o pasarlo a otro dispositivo."
              action={
                <>
                  <Button variant="secondary" size="sm" icon={Download} onClick={backup}>
                    Descargar
                  </Button>
                  <Button variant="secondary" size="sm" icon={Upload} onClick={() => fileRef.current?.click()}>
                    Restaurar
                  </Button>
                  <input
                    ref={fileRef}
                    type="file"
                    accept="application/json,.json"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0]
                      if (f) void restore(f)
                      e.target.value = ''
                    }}
                  />
                </>
              }
            />
            <Row
              icon={<FileSpreadsheet className="size-[18px]" />}
              title="Exportar movimientos a Excel"
              text="Archivo CSV que se abre directamente con Excel o Google Sheets."
              action={
                <Button variant="secondary" size="sm" icon={Download} onClick={exportCSV} disabled={!ws.movimientos.length}>
                  Exportar CSV
                </Button>
              }
            />
            <Row
              icon={<FlaskConical className="size-[18px]" />}
              title="Datos de ejemplo"
              text="Dos titulares ficticios (Marta y Pablo, con una transferencia mensual entre ellos) para probar la app. Van aparte: no tocan tus datos."
              action={
                <>
                  {hasDemo && (
                    <Button variant="secondary" size="sm" onClick={() => setVerEjemplo(!verEjemplo)}>
                      {verEjemplo ? 'Volver a mis datos' : 'Ver ejemplo'}
                    </Button>
                  )}
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      loadDemo()
                      toast('Datos de ejemplo cargados')
                    }}
                  >
                    {hasDemo ? 'Regenerar' : 'Cargar ejemplo'}
                  </Button>
                </>
              }
            />
          </div>
        </Card>

        <Card>
          <CardHeader title="Instalar en el móvil" subtitle="Úsala como una app más, también sin conexión" />
          <div className="mt-2 border-t border-slate-100 px-4 py-4 sm:px-5">
            {standalone ? (
              <p className="flex items-center gap-2 text-sm font-medium text-emerald-700">
                <Check className="size-4" /> La app ya está instalada en este dispositivo.
              </p>
            ) : (
              <div className="space-y-3 text-sm text-slate-600">
                {install && (
                  <Button icon={Smartphone} onClick={() => void install()}>
                    Instalar la app
                  </Button>
                )}
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="rounded-xl bg-slate-50 p-3">
                    <div className="font-semibold text-slate-800">iPhone / iPad (Safari)</div>
                    <p className="mt-1 text-[13px]">
                      Pulsa <strong>Compartir</strong> y después <strong>Añadir a pantalla de inicio</strong>.
                    </p>
                  </div>
                  <div className="rounded-xl bg-slate-50 p-3">
                    <div className="font-semibold text-slate-800">Android (Chrome)</div>
                    <p className="mt-1 text-[13px]">
                      Abre el menú <strong>⋮</strong> y elige <strong>Instalar aplicación</strong>.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </Card>

        {!verEjemplo && (
        <Card className="border-rose-200/80">
          <CardHeader title="Zona peligrosa" />
          <div className="mt-2 divide-y divide-slate-100 border-t border-slate-100">
            <Row
              danger
              icon={<UserRound className="size-[18px]" />}
              title="Borrar cuentas, productos y movimientos"
              text="De todos los titulares. Los titulares y sus nombres se quedan."
              action={
                <Button variant="secondary" size="sm" icon={Trash2} onClick={clear} className="text-rose-600">
                  Borrar
                </Button>
              }
            />
            <Row
              danger
              icon={<Trash2 className="size-[18px]" />}
              title="Borrar todo"
              text="Elimina todos los titulares y datos de este dispositivo."
              action={
                <Button variant="danger" size="sm" onClick={reset}>
                  Borrar todo
                </Button>
              }
            />
          </div>
        </Card>
        )}

        <p className="pb-4 text-center text-xs text-slate-400">
          Mis Inversiones · Tus datos no salen de este dispositivo: no se envían a ningún servidor.
        </p>
      </div>
    </div>
  )
}
