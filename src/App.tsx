import { useEffect } from 'react'
import { useRoute } from './lib/router'
import { useData } from './store/data'
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
