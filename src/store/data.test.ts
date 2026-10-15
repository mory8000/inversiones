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
    // Versión 1 → se añade un segundo titular vacío; el que tenía nombre propio no se renombra.
    expect(s.titulares.map((t) => t.nombre)).toEqual(['Ana García', 'Titular 2'])
    expect(s.workspaces[s.titulares[1].id].movimientos).toHaveLength(0)
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

  it('una instalación nueva empieza con dos titulares, cada uno con sus datos', async () => {
    vi.stubGlobal('localStorage', new MemoryStorage())
    vi.resetModules()
    const { useData } = await import('./data')
    const s = useData.getState()
    expect(s.titulares.map((t) => t.nombre)).toEqual(['Titular 1', 'Titular 2'])
    expect(s.activeTitularId).toBe(s.titulares[0].id)
    for (const t of s.titulares) expect(s.workspaces[t.id]).toEqual({ cuentas: [], productos: [], movimientos: [] })
  })

  it('los datos de la versión 1 se conservan y se añade «Titular 2»', async () => {
    const storage = new MemoryStorage()
    const ws = buildDemoWorkspace('2026-10-15')
    const v1 = (titulares: object[], workspaces: object) =>
      JSON.stringify({ version: 1, state: { version: 1, titulares, activeTitularId: 't1', workspaces, hideAmounts: false } })
    storage.setItem(
      'mis-inversiones',
      v1(
        [
          { id: 't1', codigo: '', nombre: 'Titular principal', createdAt: '2026-01-01T00:00:00.000Z' },
          { id: 'demo', codigo: 'DEMO', nombre: 'Ejemplo (datos ficticios)', demo: true, createdAt: '2026-01-02T00:00:00.000Z' },
        ],
        { t1: ws, demo: ws },
      ),
    )
    vi.stubGlobal('localStorage', storage)
    vi.resetModules()
    const { useData } = await import('./data')
    const s = useData.getState()

    // «Titular principal» pasa a «Titular 1» con sus datos intactos; el de ejemplo queda al final.
    expect(s.titulares.map((t) => t.nombre)).toEqual(['Titular 1', 'Titular 2', 'Ejemplo (datos ficticios)'])
    expect(s.titulares[0].id).toBe('t1')
    expect(s.activeTitularId).toBe('t1')
    expect(s.workspaces.t1.movimientos).toHaveLength(ws.movimientos.length)
    expect(s.workspaces[s.titulares[1].id]).toEqual({ cuentas: [], productos: [], movimientos: [] })

    // Lo actualizado se guarda ya con la versión 2.
    const saved = JSON.parse(storage.getItem('mis-inversiones')!)
    expect(saved.version).toBe(2)
    expect(saved.state.version).toBe(2)
    expect(saved.state.titulares).toHaveLength(3)
  })

  it('con datos de la versión 2 no vuelve a aparecer un titular borrado', async () => {
    const storage = new MemoryStorage()
    storage.setItem(
      'mis-inversiones',
      JSON.stringify({
        version: 2,
        state: {
          version: 2,
          titulares: [{ id: 't1', codigo: '', nombre: 'Solo yo', createdAt: '2026-01-01T00:00:00.000Z' }],
          activeTitularId: 't1',
          workspaces: { t1: { cuentas: [], productos: [], movimientos: [] } },
          hideAmounts: false,
        },
      }),
    )
    vi.stubGlobal('localStorage', storage)
    vi.resetModules()
    const { useData } = await import('./data')
    expect(useData.getState().titulares.map((t) => t.nombre)).toEqual(['Solo yo'])
  })

  it('cada titular guarda sus movimientos por separado', async () => {
    const storage = new MemoryStorage()
    vi.stubGlobal('localStorage', storage)
    vi.resetModules()
    let mod = await import('./data')
    const [t1, t2] = mod.useData.getState().titulares
    const add = (importe: number) => {
      const st = mod.useData.getState()
      const c = st.addCuenta({ nombre: 'Nómina', entidad: '', iban: '', color: '#0EA5E9', notas: '' })
      const p = st.addProducto({ tipo: 'deposito', nombre: 'Depósito', entidad: '', isin: '', notas: '', tae: 2, vencimiento: null })
      st.addMovimiento({ fecha: '2026-10-01', origen: { kind: 'cuenta', id: c }, destino: { kind: 'producto', id: p }, importe, concepto: '' })
    }
    add(1500)
    mod.useData.getState().switchTitular(t2.id)
    expect(mod.useData.getState().workspaces[t2.id].movimientos).toHaveLength(0)
    add(300)

    vi.resetModules()
    mod = await import('./data')
    const s = mod.useData.getState()
    expect(s.workspaces[t1.id].movimientos.map((m) => m.importe)).toEqual([1500])
    expect(s.workspaces[t2.id].movimientos.map((m) => m.importe)).toEqual([300])
    expect(s.workspaces[t1.id].cuentas).toHaveLength(1)
    expect(s.workspaces[t2.id].cuentas).toHaveLength(1)
    expect(s.activeTitularId).toBe(t2.id)
  })

  it('una copia de seguridad antigua (versión 1) también recibe el segundo titular', async () => {
    vi.stubGlobal('localStorage', new MemoryStorage())
    const { sanitizeData } = await import('./sanitize')
    const data = sanitizeData({
      version: 1,
      titulares: [{ id: 't1', codigo: '7', nombre: 'Titular principal' }],
      activeTitularId: 't1',
      workspaces: {},
    })
    // Tiene código, así que se respeta el nombre que tenía.
    expect(data?.titulares.map((t) => t.nombre)).toEqual(['Titular principal', 'Titular 2'])
    expect(data?.version).toBe(2)
  })

  it('rechaza archivos que no son copias válidas', async () => {
    vi.stubGlobal('localStorage', new MemoryStorage())
    const { sanitizeData } = await import('./sanitize')
    expect(sanitizeData(null)).toBeNull()
    expect(sanitizeData({ foo: 1 })).toBeNull()
    expect(sanitizeData({ titulares: [] })).toBeNull()
  })
})
