import { FlaskConical } from 'lucide-react'
import { useData } from '../store/data'
import { confirmDialog, toast } from '../store/ui'

/** Aviso cuando se están viendo los datos de ejemplo (van aparte de los tuyos). */
export function DemoBanner() {
  const verEjemplo = useData((s) => s.verEjemplo)
  const setVerEjemplo = useData((s) => s.setVerEjemplo)
  const removeDemo = useData((s) => s.removeDemo)
  if (!verEjemplo) return null

  const remove = async () => {
    const ok = await confirmDialog({
      title: '¿Borrar los datos de ejemplo?',
      message: 'Se eliminarán los titulares de ejemplo con todos sus movimientos. Tus datos no se tocan.',
      confirmLabel: 'Borrar ejemplo',
      danger: true,
    })
    if (ok) {
      removeDemo()
      toast('Datos de ejemplo eliminados')
    }
  }

  return (
    <div className="mb-4 flex flex-col gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-3.5 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-2.5 text-sm text-amber-900">
        <FlaskConical className="mt-0.5 size-4 shrink-0" />
        <span>
          <strong>Estás viendo datos de ejemplo.</strong> Son ficticios: pruébalo todo sin miedo.
        </span>
      </div>
      <div className="flex shrink-0 gap-2">
        <button
          type="button"
          onClick={() => setVerEjemplo(false)}
          className="h-8 rounded-lg bg-amber-900 px-3 text-[13px] font-semibold text-white hover:bg-amber-950"
        >
          Ir a mis datos
        </button>
        <button
          type="button"
          onClick={remove}
          className="h-8 rounded-lg border border-amber-300 bg-white px-3 text-[13px] font-semibold text-amber-900 hover:bg-amber-100"
        >
          Borrar ejemplo
        </button>
      </div>
    </div>
  )
}
