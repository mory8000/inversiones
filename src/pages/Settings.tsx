import { useRef, type ReactNode } from 'react'
import {
  Check,
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
import { exportBackup, sanitizeData, useActiveTitular, useData } from '../store/data'
import { useFinance } from '../store/useFinance'
import { confirmDialog, openTitular, toast } from '../store/ui'
import { movementsToCSV } from '../lib/movements'
import { downloadFile } from '../lib/download'
import { initials } from '../lib/format'
import { isStandalone, useInstallPrompt } from '../lib/install'
import { cn } from '../lib/cn'
import { PageHeader } from '../components/layout/AppShell'
import { Card, CardHeader } from '../components/ui/Card'
import { Button } from '../components/ui/Button'

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

function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cn('relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors', checked ? 'bg-brand-600' : 'bg-slate-300')}
    >
      <span className={cn('inline-block size-5 rounded-full bg-white shadow transition-transform', checked ? 'translate-x-6' : 'translate-x-1')} />
    </button>
  )
}

export function Settings() {
  const { ws, lookup, today } = useFinance()
  const titular = useActiveTitular()
  const titulares = useData((s) => s.titulares)
  const switchTitular = useData((s) => s.switchTitular)
  const hideAmounts = useData((s) => s.hideAmounts)
  const setHideAmounts = useData((s) => s.setHideAmounts)
  const loadDemo = useData((s) => s.loadDemo)
  const clearWorkspace = useData((s) => s.clearWorkspace)
  const resetAll = useData((s) => s.resetAll)
  const importData = useData((s) => s.importData)
  const install = useInstallPrompt()
  const fileRef = useRef<HTMLInputElement>(null)

  const backup = () => {
    downloadFile(`mis-inversiones-copia-${today}.json`, exportBackup(), 'application/json')
    toast('Copia de seguridad descargada')
  }

  const exportCSV = () => {
    const name = titular.nombre.replace(/[^\p{L}\p{N}]+/gu, '-').toLowerCase()
    downloadFile(`movimientos-${name}-${today}.csv`, movementsToCSV(ws.movimientos, lookup), 'text/csv;charset=utf-8')
    toast('Movimientos exportados')
  }

  const restore = async (file: File) => {
    try {
      const data = sanitizeData(JSON.parse(await file.text()))
      if (!data) throw new Error('invalid')
      const n = Object.values(data.workspaces).reduce((s, w) => s + w.movimientos.length, 0)
      const ok = await confirmDialog({
        title: '¿Restaurar esta copia?',
        message: `Contiene ${data.titulares.length} titular${data.titulares.length === 1 ? '' : 'es'} y ${n} movimiento${n === 1 ? '' : 's'}. Se sustituirán todos los datos actuales.`,
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
      title: `¿Borrar los datos de «${titular.nombre}»?`,
      message: 'Se eliminarán sus cuentas, productos y movimientos. Te recomendamos descargar antes una copia de seguridad.',
      confirmLabel: 'Borrar datos',
      danger: true,
    })
    if (ok) {
      clearWorkspace()
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
      <PageHeader title="Ajustes" subtitle="Titular, preferencias y copias de seguridad" />

      <div className="space-y-4 lg:space-y-5">
        <Card>
          <CardHeader title="Titular" subtitle="Como la cabecera del Excel: código y nombre" />
          <div className="mt-3 flex items-center gap-3 border-t border-slate-100 px-4 py-4 sm:px-5">
            <span className="inline-flex size-12 shrink-0 items-center justify-center rounded-full bg-brand-900 text-base font-bold text-white">
              {initials(titular.nombre)}
            </span>
            <div className="min-w-0 flex-1">
              <div className="truncate font-semibold text-slate-900">{titular.nombre}</div>
              <div className="text-sm text-slate-500">{titular.codigo ? `Código ${titular.codigo}` : 'Sin código'}</div>
            </div>
            <Button variant="secondary" size="sm" icon={Pencil} onClick={() => openTitular(titular.id)}>
              Editar
            </Button>
          </div>
          {titulares.length > 1 && (
            <ul className="divide-y divide-slate-100 border-t border-slate-100">
              {titulares
                .filter((t) => t.id !== titular.id)
                .map((t) => (
                  <li key={t.id} className="flex items-center gap-3 px-4 py-3 sm:px-5">
                    <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-slate-200 text-[13px] font-bold text-slate-700">
                      {initials(t.nombre)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold text-slate-800">{t.nombre}</div>
                      <div className="text-xs text-slate-500">{t.codigo ? `Código ${t.codigo}` : 'Sin código'}</div>
                    </div>
                    <Button
                      variant="soft"
                      size="sm"
                      icon={Check}
                      onClick={() => {
                        switchTitular(t.id)
                        toast(`Ahora ves los datos de ${t.nombre}`)
                      }}
                    >
                      Cambiar
                    </Button>
                  </li>
                ))}
            </ul>
          )}
          <div className="border-t border-slate-100 px-4 py-3 sm:px-5">
            <Button variant="ghost" size="sm" icon={Plus} onClick={() => openTitular()}>
              Añadir otro titular
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
              text="Crea un titular de ejemplo con movimientos ficticios para probar la app. No toca tus datos."
              action={
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    loadDemo()
                    toast('Datos de ejemplo cargados')
                  }}
                >
                  {titulares.some((t) => t.demo) ? 'Regenerar ejemplo' : 'Cargar ejemplo'}
                </Button>
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

        <Card className="border-rose-200/80">
          <CardHeader title="Zona peligrosa" />
          <div className="mt-2 divide-y divide-slate-100 border-t border-slate-100">
            <Row
              danger
              icon={<UserRound className="size-[18px]" />}
              title={`Borrar los datos de «${titular.nombre}»`}
              text="Elimina sus cuentas, productos y movimientos."
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

        <p className="pb-4 text-center text-xs text-slate-400">
          Mis Inversiones · Tus datos no salen de este dispositivo: no se envían a ningún servidor.
        </p>
      </div>
    </div>
  )
}
