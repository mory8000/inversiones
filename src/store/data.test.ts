import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildDemoWorkspace } from '../lib/demo'

class MemoryStorage {
  private map = new Map<string, string>()
  getItem(k: string) {
    return this.map.has(k) ? this.map.get(k)! : null
  }
  setItem(k: string, v: string) {
    this.map.set(k, String(v))
  }
  removeItem(k: string) {
    this.map.delete(k)
  }
  clear() {
    this.map.clear()
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.resetModules()
})

describe('datos guardados', () => {
  it('se recuperan al abrir la app', async () => {
    const storage = new MemoryStorage()
    const ws = buildDemoWorkspace('2026-10-15')
    storage.setItem(
      'mis-inversiones',
      JSON.stringify({
        version: 1,
        state: {
          version: 1,
          titulares: [{ id: 't1', codigo: '0042', nombre: 'Ana García', createdAt: '2026-01-01T00:00:00.000Z' }],
          activeTitularId: 't1',
          workspaces: { t1: ws },
          hideAmounts: true,
        },
      }),
    )
    vi.stubGlobal('localStorage', storage)
    vi.resetModules()
    const { useData } = await import('./data')

    expect(useData.persist.hasHydrated()).toBe(true)
    const s = useData.getState()
    expect(s.titulares[0]).toMatchObject({ codigo: '0042', nombre: 'Ana García' })
    expect(s.activeTitularId).toBe('t1')
    expect(s.workspaces.t1.cuentas).toHaveLength(ws.cuentas.length)
    expect(s.workspaces.t1.productos).toHaveLength(ws.productos.length)
    expect(s.workspaces.t1.movimientos).toHaveLength(ws.movimientos.length)
    expect(s.hideAmounts).toBe(true)
  })

  it('los cambios se guardan y sobreviven a una recarga', async () => {
    const storage = new MemoryStorage()
    vi.stubGlobal('localStorage', storage)
    vi.resetModules()
    let mod = await import('./data')
    const c = mod.useData.getState().addCuenta({ nombre: 'Nómina', entidad: 'BBVA', iban: '', color: '#0EA5E9', notas: '' })
    const p = mod.useData.getState().addProducto({ tipo: 'fondo', nombre: 'Fondo indexado', entidad: '', isin: '', notas: '', tae: null, vencimiento: null })
    mod.useData.getState().addMovimiento({ fecha: '2026-10-01', origen: { kind: 'cuenta', id: c }, destino: { kind: 'producto', id: p }, importe: 1500, concepto: '' })

    // "Recarga": se vuelve a crear el store leyendo lo guardado.
    vi.resetModules()
    mod = await import('./data')
    const s = mod.useData.getState()
    const ws = s.workspaces[s.activeTitularId]
    expect(ws.movimientos).toHaveLength(1)
    expect(ws.movimientos[0]).toMatchObject({ tipo: 'inversion', importe: 1500 })
  })

  it('rechaza archivos que no son copias válidas', async () => {
    vi.stubGlobal('localStorage', new MemoryStorage())
    const { sanitizeData } = await import('./sanitize')
    expect(sanitizeData(null)).toBeNull()
    expect(sanitizeData({ foo: 1 })).toBeNull()
    expect(sanitizeData({ titulares: [] })).toBeNull()
  })
})
