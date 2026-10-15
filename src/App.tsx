import { useEffect } from 'react'
import { useRoute } from './lib/router'
import { useData } from './store/data'
import { useUI } from './store/ui'
import { deshacer, rehacer } from './store/deshacer'
import { AppShell } from './components/layout/AppShell'
import { Modals, Toasts } from './components/Modals'
import { Dashboard } from './pages/Dashboard'
import { Investments } from './pages/Investments'
import { ProductDetail } from './pages/ProductDetail'
import { AccountDetail } from './pages/AccountDetail'
import { Movements } from './pages/Movements'
import { Flow } from './pages/Flow'
import { Settings } from './pages/Settings'

export default function App() {
  const route = useRoute()
  const verEjemplo = useData((s) => s.verEjemplo)

  // Si la app se queda abierta (o vuelve del fondo) otro día, se apuntan las transferencias mensuales que toquen.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') useData.getState().aplicarProgramadas()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [])

  // Teclado (ordenador): Ctrl+Z deshace y Ctrl+Y (o Ctrl+Mayús+Z) rehace, salvo mientras se escribe en un campo.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return
      const t = e.target as HTMLElement | null
      if (t && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName))) return
      if (useUI.getState().modals.length > 0) return
      const k = e.key.toLowerCase()
      if (k === 'z' && !e.shiftKey) {
        e.preventDefault()
        deshacer()
      } else if (k === 'y' || (k === 'z' && e.shiftKey)) {
        e.preventDefault()
        rehacer()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    const section: Record<typeof route.name, string> = {
      inicio: 'Inicio',
      inversiones: 'Inversiones',
      producto: 'Producto',
      cuenta: 'Cuenta',
      movimientos: 'Movimientos',
      flujo: 'Flujo del dinero',
      ajustes: 'Ajustes',
    }
    document.title = `${section[route.name]} · Mis Inversiones`
  }, [route.name])

  let page
  switch (route.name) {
    case 'inicio':
      page = <Dashboard />
      break
    case 'inversiones':
      page = <Investments tab={route.tab} tipo={route.tipo} />
      break
    case 'producto':
      page = <ProductDetail id={route.id} />
      break
    case 'cuenta':
      page = <AccountDetail id={route.id} />
      break
    case 'movimientos':
      page = <Movements params={route.params} />
      break
    case 'flujo':
      page = <Flow />
      break
    case 'ajustes':
      page = <Settings />
      break
  }

  // Al pasar de tus datos al ejemplo (o al revés), se vuelve a montar la página.
  const key = `${verEjemplo ? 'ejemplo' : 'datos'}:${route.name}:${'id' in route ? route.id : ''}:${route.name === 'movimientos' ? route.params.toString() : ''}`

  return (
    <>
      <AppShell route={route}>
        <div key={key} className="animate-fade-in">
          {page}
        </div>
      </AppShell>
      <Modals />
      <Toasts />
    </>
  )
}
