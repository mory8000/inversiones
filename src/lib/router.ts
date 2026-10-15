// Navegación sencilla basada en "#/ruta" (funciona en cualquier alojamiento estático).

import { useEffect, useState } from 'react'

export type Route =
  | { name: 'inicio' }
  | { name: 'inversiones'; tab: 'productos' | 'cuentas'; tipo: string | null }
  | { name: 'producto'; id: string }
  | { name: 'cuenta'; id: string }
  | { name: 'movimientos'; params: URLSearchParams }
  | { name: 'flujo' }
  | { name: 'ajustes' }

export function parseHash(hash: string): Route {
  const raw = hash.replace(/^#/, '') || '/'
  const [path, query = ''] = raw.split('?')
  const params = new URLSearchParams(query)
  const parts = path.split('/').filter(Boolean)
  switch (parts[0]) {
    case undefined:
      return { name: 'inicio' }
    case 'inversiones':
      return { name: 'inversiones', tab: parts[1] === 'cuentas' ? 'cuentas' : 'productos', tipo: params.get('tipo') }
    case 'producto':
      return parts[1] ? { name: 'producto', id: decodeURIComponent(parts[1]) } : { name: 'inversiones', tab: 'productos', tipo: null }
    case 'cuenta':
      return parts[1] ? { name: 'cuenta', id: decodeURIComponent(parts[1]) } : { name: 'inversiones', tab: 'cuentas', tipo: null }
    case 'movimientos':
      return { name: 'movimientos', params }
    case 'flujo':
      return { name: 'flujo' }
    case 'ajustes':
      return { name: 'ajustes' }
    default:
      return { name: 'inicio' }
  }
}

export function navigate(path: string) {
  const target = path.startsWith('#') ? path : `#${path}`
  if (window.location.hash === target) return
  window.location.hash = target
}

export function goBack(fallback = '/') {
  if (window.history.length > 1) window.history.back()
  else navigate(fallback)
}

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parseHash(window.location.hash))
  useEffect(() => {
    const onChange = () => {
      setRoute(parseHash(window.location.hash))
      window.scrollTo({ top: 0 })
    }
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])
  return route
}

export const paths = {
  inicio: '/',
  productos: (tipo?: string) => (tipo ? `/inversiones?tipo=${tipo}` : '/inversiones'),
  cuentas: '/inversiones/cuentas',
  producto: (id: string) => `/producto/${encodeURIComponent(id)}`,
  cuenta: (id: string) => `/cuenta/${encodeURIComponent(id)}`,
  movimientos: (params?: Record<string, string>) => {
    const q = params ? new URLSearchParams(params).toString() : ''
    return q ? `/movimientos?${q}` : '/movimientos'
  },
  flujo: '/flujo',
  ajustes: '/ajustes',
}
