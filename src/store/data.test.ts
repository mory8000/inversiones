import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
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

// Fecha fija para que las transferencias mensuales den siempre lo mismo.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-15T12:00:00'))
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.resetModules()
})

/** Abre la app con lo que haya guardado en `storage`. */
async function open(storage: MemoryStorage) {
  vi.stubGlobal('localStorage', storage)
  vi.resetModules()
  const data = await import('./data')
  const fin = await import('./useFinance')
  const finance = () => fin.computeFinance(data.currentDataset(data.useData.getState()), '2026-10-15')
  return { ...data, finance }
}

const saved = (storage: MemoryStorage) => JSON.parse(storage.getItem('mis-inversiones')!)
const legacy = (version: number, state: object) => JSON.stringify({ version, state: { version, ...state } })

describe('datos guardados', () => {
  it('versión 1: se conservan y se añade un segundo titular', async () => {
    const storage = new MemoryStorage()
    const ws = buildDemoWorkspace('2026-10-15')
    storage.setItem(
      'mis-inversiones',
      legacy(1, {
        titulares: [{ id: 't1', codigo: '0042', nombre: 'Ana García', createdAt: '2026-01-01T00:00:00.000Z' }],
        activeTitularId: 't1',
        workspaces: { t1: ws },
        hideAmounts: true,
      }),
    )
    const { useData } = await open(storage)
    expect(useData.persist.hasHydrated()).toBe(true)
    const s = useData.getState()
    expect(s.datos.titulares.map((t) => t.nombre)).toEqual(['Ana García', 'Titular 2'])
    expect(s.datos.titulares[0]).toMatchObject({ id: 't1', codigo: '0042' })
    expect(s.datos.cuentas).toHaveLength(ws.cuentas.length)
    expect(s.datos.productos).toHaveLength(ws.productos.length)
    expect(s.datos.movimientos).toHaveLength(ws.movimientos.length)
    expect(s.datos.cuentas.every((c) => c.titularId === 't1')).toBe(true)
    expect(s.datos.productos.every((p) => p.titularId === 't1')).toBe(true)
    expect(s.hideAmounts).toBe(true)
    expect(s.verEjemplo).toBe(false)
  })

  it('versión 1: «Titular principal» pasa a «Titular 1»', async () => {
    const storage = new MemoryStorage()
    storage.setItem(
      'mis-inversiones',
      legacy(1, {
        titulares: [{ id: 't1', codigo: '', nombre: 'Titular principal', createdAt: '2026-01-01T00:00:00.000Z' }],
        activeTitularId: 't1',
        workspaces: { t1: buildDemoWorkspace('2026-10-15') },
      }),
    )
    const { useData } = await open(storage)
    expect(useData.getState().datos.titulares.map((t) => t.nombre)).toEqual(['Titular 1', 'Titular 2'])
  })

  it('versión 2: cada titular conserva lo suyo, el ejemplo va aparte y se guarda en la versión 3', async () => {
    const storage = new MemoryStorage()
    const ws1 = buildDemoWorkspace('2026-10-15')
    const ws2 = {
      cuentas: [{ id: 'c-luis', nombre: 'Cuenta de Luis', entidad: '', iban: '', color: '#000', notas: '', createdAt: '' }],
      productos: [{ id: 'p-luis', tipo: 'fondo', nombre: 'Fondo de Luis', entidad: '', isin: '', notas: '', tae: null, vencimiento: null, valoraciones: [], createdAt: '' }],
      movimientos: [
        {
          id: 'm-luis',
          tipo: 'inversion',
          fecha: '2026-03-01',
          origen: { kind: 'cuenta', id: 'c-luis' },
          destino: { kind: 'producto', id: 'p-luis' },
          importe: 300,
          concepto: '',
          createdAt: '',
          updatedAt: '',
        },
      ],
    }
    storage.setItem(
      'mis-inversiones',
      legacy(2, {
        titulares: [
          { id: 't1', codigo: '', nombre: 'Ana', createdAt: '' },
          { id: 't2', codigo: '', nombre: 'Luis', createdAt: '' },
          { id: 'dm', codigo: 'DEMO', nombre: 'Ejemplo (datos ficticios)', demo: true, createdAt: '' },
        ],
        activeTitularId: 'dm',
        workspaces: { t1: ws1, t2: ws2, dm: buildDemoWorkspace('2026-10-15') },
        hideAmounts: false,
      }),
    )
    const { useData, finance } = await open(storage)
    const s = useData.getState()
    expect(s.datos.titulares.map((t) => t.nombre)).toEqual(['Ana', 'Luis'])
    expect(s.datos.movimientos).toHaveLength(ws1.movimientos.length + 1)
    expect(s.datos.productos.find((p) => p.id === 'p-luis')?.titularId).toBe('t2')
    expect(s.ejemplo?.titulares.map((t) => t.nombre)).toEqual(['Ejemplo (datos ficticios)'])
    expect(s.verEjemplo).toBe(true)

    useData.getState().setVerEjemplo(false)
    const f = finance()
    expect(f.byTitular.get('t2')!.totals.patrimonio).toBe(300)
    expect(f.byTitular.get('t1')!.totals.patrimonio).toBeGreaterThan(20000)

    expect(saved(storage).version).toBe(3)
    expect(saved(storage).state.datos.titulares).toHaveLength(2)
  })

  it('versión 2 con un solo titular: no se añade otro', async () => {
    const storage = new MemoryStorage()
    storage.setItem(
      'mis-inversiones',
      legacy(2, { titulares: [{ id: 't1', codigo: '', nombre: 'Solo yo', createdAt: '' }], activeTitularId: 't1', workspaces: {} }),
    )
    const { useData } = await open(storage)
    expect(useData.getState().datos.titulares.map((t) => t.nombre)).toEqual(['Solo yo'])
  })

  it('una instalación nueva empieza con dos titulares, vacíos', async () => {
    const { useData } = await open(new MemoryStorage())
    const s = useData.getState()
    expect(s.datos.titulares.map((t) => t.nombre)).toEqual(['Titular 1', 'Titular 2'])
    expect(s.datos.movimientos).toHaveLength(0)
    expect(s.ejemplo).toBeNull()
  })

  it('los cambios se guardan y sobreviven a una recarga', async () => {
    const storage = new MemoryStorage()
    let app = await open(storage)
    const [t1, t2] = app.useData.getState().datos.titulares
    const st = app.useData.getState()
    const c = st.addCuenta({ titularId: t1.id, nombre: 'Nómina', entidad: '', iban: '', color: '#0EA5E9', notas: '' })
    const p = st.addProducto({ titularId: t2.id, tipo: 'fondo', nombre: 'Fondo de T2', entidad: '', isin: '', notas: '', tae: null, vencimiento: null })
    st.addMovimiento({ fecha: '2026-10-01', origen: { kind: 'cuenta', id: c }, destino: { kind: 'producto', id: p }, importe: 1500, concepto: '' })
    st.updateTitular(t2.id, { nombre: 'Luis' })

    app = await open(storage)
    const s = app.useData.getState()
    expect(s.datos.titulares.map((t) => t.nombre)).toEqual(['Titular 1', 'Luis'])
    expect(s.datos.movimientos.map((m) => m.importe)).toEqual([1500])
    expect(s.datos.productos[0].titularId).toBe(t2.id)
  })

  it('rechaza archivos que no son copias válidas y acepta copias antiguas', async () => {
    const { sanitizeData } = await import('./sanitize')
    expect(sanitizeData(null)).toBeNull()
    expect(sanitizeData({ foo: 1 })).toBeNull()
    expect(sanitizeData({ titulares: [] })).toBeNull()
    expect(sanitizeData({ datos: { titulares: [] } })).toBeNull()
    const v1 = sanitizeData({ version: 1, titulares: [{ id: 't1', codigo: '7', nombre: 'Titular principal' }], activeTitularId: 't1', workspaces: {} })
    // Tiene código, así que se respeta el nombre que tenía.
    expect(v1?.datos.titulares.map((t) => t.nombre)).toEqual(['Titular principal', 'Titular 2'])
    expect(v1?.version).toBe(3)
  })
})

describe('entre titulares', () => {
  it('lo que el titular 1 envía al titular 2 cuenta como inversión solo del titular 2', async () => {
    const { useData, finance } = await open(new MemoryStorage())
    const [t1, t2] = useData.getState().datos.titulares
    const st = useData.getState()
    const c1 = st.addCuenta({ titularId: t1.id, nombre: 'Nómina', entidad: '', iban: '', color: '#0EA5E9', notas: '' })
    const f1 = st.addProducto({ titularId: t1.id, tipo: 'fondo', nombre: 'Fondo T1', entidad: '', isin: '', notas: '', tae: null, vencimiento: null })
    const f2 = st.addProducto({ titularId: t2.id, tipo: 'fondo', nombre: 'Fondo T2', entidad: '', isin: '', notas: '', tae: null, vencimiento: null })
    st.addMovimiento({ fecha: '2026-09-01', origen: { kind: 'cuenta', id: c1 }, destino: { kind: 'producto', id: f1 }, importe: 700, concepto: '' })
    st.addMovimiento({ fecha: '2026-09-02', origen: { kind: 'cuenta', id: c1 }, destino: { kind: 'producto', id: f2 }, importe: 200, concepto: '' })

    const f = finance()
    const a = f.byTitular.get(t1.id)!
    const b = f.byTitular.get(t2.id)!
    expect(a.totals).toMatchObject({ patrimonio: 700, aportado: 700 })
    expect(b.totals).toMatchObject({ patrimonio: 200, aportado: 200 })
    expect(a.enviadoTotal).toBe(200)
    expect(b.recibidoTotal).toBe(200)
    expect(b.recibido).toEqual([{ titularId: t1.id, importe: 200 }])
    expect(f.accounts.get(c1)).toMatchObject({ enviado: 700, enviadoOtros: 200 })
  })

  it('borrar un titular quita sus cosas y lo que se movía con él; «hacer principal» lo pone primero', async () => {
    const { useData } = await open(new MemoryStorage())
    const [t1, t2] = useData.getState().datos.titulares
    const st = useData.getState()
    const c1 = st.addCuenta({ titularId: t1.id, nombre: 'Nómina', entidad: '', iban: '', color: '#0EA5E9', notas: '' })
    const f2 = st.addProducto({ titularId: t2.id, tipo: 'fondo', nombre: 'Fondo T2', entidad: '', isin: '', notas: '', tae: null, vencimiento: null })
    st.addProgramada({ origen: { kind: 'cuenta', id: c1 }, destino: { kind: 'producto', id: f2 }, importe: 100, inicio: '2026-09-01', fin: null, concepto: '' })
    expect(useData.getState().datos.movimientos).toHaveLength(2)

    st.makePrincipal(t2.id)
    expect(useData.getState().datos.titulares.map((t) => t.id)).toEqual([t2.id, t1.id])

    st.removeTitular(t2.id)
    const s = useData.getState().datos
    expect(s.titulares.map((t) => t.id)).toEqual([t1.id])
    expect(s.productos).toHaveLength(0)
    expect(s.movimientos).toHaveLength(0)
    expect(s.programadas).toHaveLength(0)
    expect(s.cuentas).toHaveLength(1)
    // El último titular no se puede borrar.
    st.removeTitular(t1.id)
    expect(useData.getState().datos.titulares).toHaveLength(1)
  })
})

describe('transferencia mensual', () => {
  async function setup(storage = new MemoryStorage()) {
    const app = await open(storage)
    const [t1, t2] = app.useData.getState().datos.titulares
    const st = app.useData.getState()
    const c1 = st.addCuenta({ titularId: t1.id, nombre: 'Nómina', entidad: '', iban: '', color: '#0EA5E9', notas: '' })
    const f2 = st.addProducto({ titularId: t2.id, tipo: 'fondo', nombre: 'Fondo T2', entidad: '', isin: '', notas: '', tae: null, vencimiento: null })
    const input = { origen: { kind: 'cuenta' as const, id: c1 }, destino: { kind: 'producto' as const, id: f2 }, importe: 150, inicio: '2026-07-05', fin: null, concepto: 'Mensual' }
    const id = st.addProgramada(input)
    const movs = () => app.useData.getState().datos.movimientos.filter((m) => m.programadaId === id).sort((a, b) => a.fecha.localeCompare(b.fecha))
    return { ...app, t1, t2, c1, f2, id, input, movs }
  }

  it('apunta sola un movimiento cada mes hasta hoy, que cuenta para el titular 2', async () => {
    const { movs, finance, t1, t2 } = await setup()
    expect(movs().map((m) => `${m.fecha}=${m.importe}`)).toEqual(['2026-07-05=150', '2026-08-05=150', '2026-09-05=150', '2026-10-05=150'])
    const f = finance()
    expect(f.byTitular.get(t2.id)!.totals.aportado).toBe(600)
    expect(f.byTitular.get(t1.id)!.totals.aportado).toBe(0)
    expect(f.byTitular.get(t1.id)!.enviadoTotal).toBe(600)
  })

  it('al volver a abrir la app apunta los meses que falten (y nunca duplica)', async () => {
    const storage = new MemoryStorage()
    const { movs } = await setup(storage)
    expect(movs()).toHaveLength(4)
    vi.setSystemTime(new Date('2027-01-20T09:00:00'))
    const again = await open(storage)
    const all = again.useData.getState().datos.movimientos.filter((m) => m.programadaId)
    expect(all.map((m) => m.fecha).sort()).toEqual(['2026-07-05', '2026-08-05', '2026-09-05', '2026-10-05', '2026-11-05', '2026-12-05', '2027-01-05'])
    again.useData.getState().aplicarProgramadas()
    expect(again.useData.getState().datos.movimientos.filter((m) => m.programadaId)).toHaveLength(7)
  })

  it('un mes borrado a mano no vuelve; los cambios se aplican salvo a lo editado a mano', async () => {
    const { useData, movs, id, input } = await setup()
    const st = useData.getState()
    const [jul, ago, sep] = movs()
    st.removeMovimiento(ago.id)
    st.aplicarProgramadas()
    expect(movs().map((m) => m.fecha)).toEqual(['2026-07-05', '2026-09-05', '2026-10-05'])

    st.updateMovimiento(sep.id, { fecha: sep.fecha, origen: sep.origen, destino: sep.destino, importe: 180, concepto: 'Septiembre' })
    st.updateProgramada(id, { ...input, importe: 250 })
    expect(movs().map((m) => `${m.fecha}=${m.importe}`)).toEqual(['2026-07-05=250', '2026-09-05=180', '2026-10-05=250'])

    // Cambiar el día al 20: octubre aún no ha llegado.
    st.updateProgramada(id, { ...input, importe: 250, inicio: '2026-07-20' })
    expect(movs().map((m) => m.fecha)).toEqual(['2026-07-20', '2026-09-05'])
    expect(movs()[0].id).toBe(jul.id)

    st.removeProgramada(id)
    expect(movs()).toHaveLength(0)
    expect(useData.getState().datos.programadas).toHaveLength(0)
  })
})

describe('datos de ejemplo', () => {
  it('van aparte de tus datos: Marta envía cada mes a Pablo y cuenta como inversión de Pablo', async () => {
    const { useData, finance } = await open(new MemoryStorage())
    useData.getState().loadDemo()
    let s = useData.getState()
    expect(s.verEjemplo).toBe(true)
    expect(s.datos.movimientos).toHaveLength(0)
    const f = finance()
    const [marta, pablo] = f.titulares
    expect([marta.titular.nombre, pablo.titular.nombre]).toEqual(['Marta', 'Pablo'])
    expect(pablo.recibidoTotal).toBeGreaterThan(2000)
    expect(pablo.totals.aportado).toBeCloseTo(pablo.recibidoTotal, 2)
    expect(marta.enviadoTotal).toBeCloseTo(pablo.recibidoTotal, 2)
    expect(marta.totals.patrimonio).toBeGreaterThan(20000)

    useData.getState().removeDemo()
    s = useData.getState()
    expect(s.ejemplo).toBeNull()
    expect(s.verEjemplo).toBe(false)
  })
})
