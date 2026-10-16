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
    // El ejemplo (ficticio) se vuelve a crear con las cuentas nuevas.
    expect(s.ejemplo?.titulares.map((t) => t.nombre)).toEqual(['Marta', 'Fondo ahorro'])
    expect(s.verEjemplo).toBe(true)

    useData.getState().setVerEjemplo(false)
    const f = finance()
    expect(f.byTitular.get('t2')!.totals.patrimonio).toBe(300)
    expect(f.byTitular.get('t1')!.totals.patrimonio).toBeGreaterThan(20000)

    expect(saved(storage).version).toBe(5)
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

  it('una instalación nueva empieza con dos titulares, vacíos, y el principal con su cuenta «MyInvestor»', async () => {
    const { useData } = await open(new MemoryStorage())
    const s = useData.getState()
    expect(s.datos.titulares.map((t) => t.nombre)).toEqual(['Titular 1', 'Titular 2'])
    expect(s.datos.movimientos).toHaveLength(0)
    expect(s.datos.cuentas).toHaveLength(1)
    expect(s.datos.cuentas[0]).toMatchObject({ nombre: 'MyInvestor', externa: false, titularId: s.datos.titulares[0].id })
    expect(s.ejemplo).toBeNull()
  })

  it('los cambios se guardan y sobreviven a una recarga', async () => {
    const storage = new MemoryStorage()
    let app = await open(storage)
    const [t1, t2] = app.useData.getState().datos.titulares
    const st = app.useData.getState()
    const c = st.addCuenta({ titularId: t1.id, nombre: 'Nómina', entidad: '', iban: '', color: '#0EA5E9', notas: '', externa: true })
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
    expect(v1?.version).toBe(5)
  })
})

describe('entre titulares', () => {
  it('lo que el titular 1 envía al titular 2 cuenta como inversión solo del titular 2', async () => {
    const { useData, finance } = await open(new MemoryStorage())
    const [t1, t2] = useData.getState().datos.titulares
    const st = useData.getState()
    const c1 = st.addCuenta({ titularId: t1.id, nombre: 'Nómina', entidad: '', iban: '', color: '#0EA5E9', notas: '', externa: true })
    const f1 = st.addProducto({ titularId: t1.id, tipo: 'fondo', nombre: 'Fondo T1', entidad: '', isin: '', notas: '', tae: null, vencimiento: null })
    const f2 = st.addProducto({ titularId: t2.id, tipo: 'fondo', nombre: 'Fondo T2', entidad: '', isin: '', notas: '', tae: null, vencimiento: null })
    st.addMovimiento({ fecha: '2026-09-01', origen: { kind: 'cuenta', id: c1 }, destino: { kind: 'producto', id: f1 }, importe: 700, concepto: '' })
    st.addMovimiento({ fecha: '2026-09-02', origen: { kind: 'cuenta', id: c1 }, destino: { kind: 'producto', id: f2 }, importe: 200, concepto: '' })

    const f = finance()
    const a = f.byTitular.get(t1.id)!
    const b = f.byTitular.get(t2.id)!
    expect(a.totals).toMatchObject({ patrimonio: 700, aportado: 700 })
    expect(b.totals).toMatchObject({ patrimonio: 200, aportado: 200 })
    expect(b.recibidoTotal).toBe(200)
    expect(b.recibido).toEqual([{ titularId: t1.id, importe: 200 }])
    // T1 es el principal: lo que sale de su cuenta hacia T2 es un mero paso que no deja constancia
    // en lo suyo (ni en lo enviado ni en sus movimientos). Sí sale en lo de T2.
    expect(a.enviadoTotal).toBe(0)
    expect(a.ws.movimientos.map((m) => m.importe)).toEqual([700])
    expect(b.ws.movimientos.map((m) => m.importe)).toEqual([200])
    expect(f.accounts.get(c1)).toMatchObject({ enviado: 700, enviadoOtros: 0, dePaso: 200, numMovimientos: 1 })
  })

  it('borrar un titular quita sus cosas y lo que se movía con él; «hacer principal» lo pone primero', async () => {
    const { useData } = await open(new MemoryStorage())
    const [t1, t2] = useData.getState().datos.titulares
    const st = useData.getState()
    const c1 = st.addCuenta({ titularId: t1.id, nombre: 'Nómina', entidad: '', iban: '', color: '#0EA5E9', notas: '', externa: true })
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
    // Quedan «MyInvestor» y «Nómina», las cuentas del titular 1.
    expect(s.cuentas.map((c) => c.nombre)).toEqual(['MyInvestor', 'Nómina'])
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
    const c1 = st.addCuenta({ titularId: t1.id, nombre: 'Nómina', entidad: '', iban: '', color: '#0EA5E9', notas: '', externa: true })
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
    // Sale de una cuenta del principal: pasa de paso, sin dejar constancia en lo suyo.
    expect(f.byTitular.get(t1.id)!.enviadoTotal).toBe(0)
    expect(f.byTitular.get(t1.id)!.ws.movimientos).toHaveLength(0)
    expect(f.byTitular.get(t2.id)!.ws.movimientos).toHaveLength(4)
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

describe('poner los valores de hoy', () => {
  /** Dos fondos de Luis y uno del «Fondo ahorro», con su dinero invertido. */
  async function setup() {
    const app = await open(new MemoryStorage())
    const st = app.useData.getState()
    const [t1, t2] = st.datos.titulares
    const my = st.datos.cuentas[0].id
    const f1 = st.addProducto({ titularId: t1.id, tipo: 'fondo', nombre: 'Fondo A', entidad: '', isin: '', notas: '', tae: null, vencimiento: null })
    const f2 = st.addProducto({ titularId: t1.id, tipo: 'cartera', nombre: 'Cartera B', entidad: '', isin: '', notas: '', tae: null, vencimiento: null })
    const f3 = st.addProducto({ titularId: t2.id, tipo: 'fondo', nombre: 'Fondo ahorro', entidad: '', isin: '', notas: '', tae: null, vencimiento: null })
    const banco = st.addCuenta({ titularId: t1.id, nombre: 'Banco', entidad: '', iban: '', color: '#000', notas: '', externa: true })
    const bancoAhorro = st.addCuenta({ titularId: t2.id, nombre: 'Banco ahorro', entidad: '', iban: '', color: '#000', notas: '', externa: true })
    st.addMovimiento({ fecha: '2026-01-04', origen: { kind: 'cuenta', id: banco }, destino: { kind: 'cuenta', id: my }, importe: 5000, concepto: 'Aportación' })
    st.addMovimiento({ fecha: '2026-01-05', origen: { kind: 'cuenta', id: my }, destino: { kind: 'producto', id: f1 }, importe: 1000, concepto: '' })
    st.addMovimiento({ fecha: '2026-01-05', origen: { kind: 'cuenta', id: my }, destino: { kind: 'producto', id: f2 }, importe: 2000, concepto: '' })
    st.addMovimiento({ fecha: '2026-02-05', origen: { kind: 'cuenta', id: bancoAhorro }, destino: { kind: 'producto', id: f3 }, importe: 500, concepto: '' })
    return { ...app, t1, t2, my, f1, f2, f3 }
  }

  it('pone de una vez el valor de cada inversión y las tarjetas cuadran con esos valores', async () => {
    const { useData, finance, t1, t2, f1, f2, f3 } = await setup()
    useData.getState().setValores('2026-10-15', [
      { productoId: f1, valor: 1100 },
      { productoId: f2, valor: 1800.5 },
      { productoId: f3, valor: 9011.1 },
    ])
    const f = finance()
    expect(f.positions.get(f1)!.saldo).toBe(1100)
    expect(f.positions.get(f2)!.saldo).toBe(1800.5)
    expect(f.positions.get(f3)!.saldo).toBe(9011.1)
    // Cada producto guarda su valor de mercado con la fecha de hoy.
    const p1 = useData.getState().datos.productos.find((p) => p.id === f1)!
    expect(p1.valoraciones).toHaveLength(1)
    expect(p1.valoraciones[0]).toMatchObject({ fecha: '2026-10-15', modo: 'valor', valor: 1100 })
    // Tarjetas: sus inversiones + lo que queda en su cuenta (sin invertir).
    expect(f.byTitular.get(t1.id)!.totals.patrimonio).toBeCloseTo(1100 + 1800.5 + 2000, 2)
    expect(f.byTitular.get(t2.id)!.totals.patrimonio).toBeCloseTo(9011.1, 2)
  })

  it('si se vuelve a guardar el mismo día, se cambia el valor (no se apila otro); otro día sí se apila', async () => {
    const { useData, finance, f1 } = await setup()
    useData.getState().setValores('2026-10-15', [{ productoId: f1, valor: 1100 }])
    useData.getState().setValores('2026-10-15', [{ productoId: f1, valor: 1200 }])
    const vals = () => useData.getState().datos.productos.find((p) => p.id === f1)!.valoraciones
    expect(vals()).toHaveLength(1)
    expect(vals()[0].valor).toBe(1200)
    expect(finance().positions.get(f1)!.saldo).toBe(1200)
    useData.getState().setValores('2026-10-16', [{ productoId: f1, valor: 1300 }])
    expect(vals()).toHaveLength(2)
    // El saldo se calcula con el valor más reciente.
    const fin = await import('./useFinance')
    expect(fin.computeFinance(useData.getState().datos, '2026-10-16').positions.get(f1)!.saldo).toBe(1300)
  })

  it('se puede deshacer de una vez', async () => {
    const { useData, finance, f1, f2, my } = await setup()
    const antes = finance().byTitular.get(useData.getState().datos.titulares[0].id)!.totals.patrimonio
    await import('./deshacer')
    const { conDeshacer } = await import('./data')
    conDeshacer('Valores de hoy', () =>
      useData.getState().setValores('2026-10-15', [
        { productoId: f1, valor: 1100 },
        { productoId: f2, valor: 1800 },
      ]),
    )
    expect(finance().positions.get(f1)!.saldo).toBe(1100)
    expect(useData.getState().deshacer()).toBe('Valores de hoy')
    const f = finance()
    expect(f.positions.get(f1)!.saldo).toBe(1000)
    expect(f.positions.get(f2)!.saldo).toBe(2000)
    expect(f.byTitular.get(useData.getState().datos.titulares[0].id)!.totals.patrimonio).toBeCloseTo(antes, 6)
    expect(f.accounts.get(my)!.saldo).toBe(2000)
  })
})

describe('datos de ejemplo', () => {
  it('van aparte de tus datos: Marta envía cada mes al «Fondo ahorro» y cuenta solo para él', async () => {
    const { useData, finance } = await open(new MemoryStorage())
    useData.getState().loadDemo()
    let s = useData.getState()
    expect(s.verEjemplo).toBe(true)
    expect(s.datos.movimientos).toHaveLength(0)
    const f = finance()
    const [marta, pablo] = f.titulares
    expect([marta.titular.nombre, pablo.titular.nombre]).toEqual(['Marta', 'Fondo ahorro'])
    expect(pablo.recibidoTotal).toBeGreaterThan(2000)
    expect(pablo.totals.aportado).toBeCloseTo(pablo.recibidoTotal, 2)
    // Lo que va al «Fondo ahorro» pasa por el MyInvestor de Marta sin dejar constancia en lo suyo.
    expect(marta.enviadoTotal).toBe(0)
    expect(marta.ws.movimientos.some((m) => pablo.ws.movimientos.includes(m))).toBe(false)
    expect(marta.totals.patrimonio).toBeGreaterThan(20000)
    // Marta tiene su MyInvestor con saldo, que nunca se queda en negativo (ni contando lo que pasa de paso).
    const my = s.ejemplo!.cuentas.find((c) => c.nombre === 'MyInvestor' && c.titularId === marta.titular.id)!
    expect(my.externa).toBe(false)
    expect(marta.totals.efectivo).toBeGreaterThan(0)
    // Todo lo que recibe el «Fondo ahorro» pasa por el MyInvestor de Marta de paso: no baja su saldo.
    expect(f.accounts.get(my.id)!.dePaso).toBeCloseTo(pablo.recibidoTotal, 2)
    expect(marta.totals.efectivo).toBeCloseTo(f.accounts.get(my.id)!.entradas - f.accounts.get(my.id)!.salidas, 2)
    let saldo = 0
    for (const m of [...s.ejemplo!.movimientos].sort((x, y) => x.fecha.localeCompare(y.fecha) || x.createdAt.localeCompare(y.createdAt))) {
      if (m.destino.kind === 'cuenta' && m.destino.id === my.id) saldo += m.importe
      if (m.origen.kind === 'cuenta' && m.origen.id === my.id) saldo -= m.importe
      expect(saldo).toBeGreaterThanOrEqual(0)
    }
    expect(s.ejemplo!.programadas[0].origen).toEqual({ kind: 'cuenta', id: my.id })

    useData.getState().removeDemo()
    s = useData.getState()
    expect(s.ejemplo).toBeNull()
    expect(s.verEjemplo).toBe(false)
  })
})

describe('cuenta principal «MyInvestor» y cuentas externas (versión 4)', () => {
  const titulares = [
    { id: 't1', codigo: '', nombre: 'Luis', createdAt: '' },
    { id: 't2', codigo: '', nombre: 'Fondo ahorro', createdAt: '' },
  ]
  const cuenta = (id: string, titularId: string, nombre: string) => ({ id, titularId, nombre, entidad: '', iban: '', color: '#000', notas: '', createdAt: '' })
  const fondo = (id: string, titularId: string, nombre: string) => ({
    id,
    titularId,
    tipo: 'fondo',
    nombre,
    entidad: '',
    isin: '',
    notas: '',
    tae: null,
    vencimiento: null,
    valoraciones: [],
    createdAt: '',
  })
  const v3 = (datos: object) => legacy(3, { datos: { titulares, movimientos: [], programadas: [], productos: [], ...datos }, ejemplo: null, verEjemplo: false, hideAmounts: false })

  it('«Cuenta principal» pasa a llamarse «MyInvestor» y a llevar saldo; lo que va a «Fondo ahorro» pasa de paso y cuenta solo para el otro titular', async () => {
    const storage = new MemoryStorage()
    storage.setItem(
      'mis-inversiones',
      v3({
        cuentas: [cuenta('c1', 't1', 'Cuenta principal')],
        productos: [fondo('f2', 't2', 'Fondo ahorro')],
        programadas: [
          {
            id: 'p1',
            origen: { kind: 'cuenta', id: 'c1' },
            destino: { kind: 'producto', id: 'f2' },
            importe: 150,
            inicio: '2026-07-05',
            fin: null,
            concepto: '',
            excluidos: [],
            createdAt: '',
            updatedAt: '',
          },
        ],
      }),
    )
    const { useData, finance } = await open(storage)
    let s = useData.getState()
    expect(s.datos.cuentas).toEqual([expect.objectContaining({ id: 'c1', nombre: 'MyInvestor', externa: false })])
    expect(s.datos.programadas[0].origen).toEqual({ kind: 'cuenta', id: 'c1' })
    expect(s.datos.movimientos).toHaveLength(4)

    let f = finance()
    const luis = () => f.byTitular.get('t1')!
    const ahorro = () => f.byTitular.get('t2')!
    expect(ahorro().totals.patrimonio).toBe(600)
    expect(ahorro().totals.aportadoTotal).toBe(600)
    // Los 600 € (4 meses, también los ya pasados) pasan por MyInvestor camino del «Fondo ahorro»:
    // salen de verdad de su saldo (el saldo es el real), pero no dejan constancia en sus
    // movimientos ni cuentan como inversión suya.
    expect(luis().enviadoTotal).toBe(0)
    expect(luis().ws.movimientos).toHaveLength(0)
    expect(f.accounts.get('c1')).toMatchObject({ saldo: -600, salidas: 600, dePaso: 600, numMovimientos: 0 })
    expect(luis().totals).toMatchObject({ efectivo: -600, patrimonio: -600, aportadoTotal: -600 })

    // Aportación desde una cuenta externa a MyInvestor.
    const st = useData.getState()
    const bbva = st.addCuenta({ titularId: 't1', nombre: 'BBVA', entidad: '', iban: '', color: '#000', notas: '', externa: true })
    st.addMovimiento({ fecha: '2026-10-10', origen: { kind: 'cuenta', id: bbva }, destino: { kind: 'cuenta', id: 'c1' }, importe: 1000, concepto: 'Aportación' })
    f = finance()
    expect(f.accounts.get('c1')).toMatchObject({ saldo: 400, aportaciones: 1000, dePaso: 600 })
    expect(luis().totals).toMatchObject({ efectivo: 400, patrimonio: 400, aportadoTotal: 400, capital: 0 })
    expect(ahorro().totals.patrimonio).toBe(600)
    expect(saved(storage).version).toBe(5)
    s = useData.getState()
    expect(s.datos.cuentas.map((c) => [c.nombre, c.externa])).toEqual([
      ['MyInvestor', false],
      ['BBVA', true],
    ])
  })

  it('si no hay una cuenta así, se crea «MyInvestor» (la primera) y las demás quedan como externas', async () => {
    const storage = new MemoryStorage()
    storage.setItem('mis-inversiones', v3({ cuentas: [cuenta('c1', 't1', 'Nómina'), cuenta('c2', 't2', 'Cuenta de Fondo ahorro')] }))
    const { useData } = await open(storage)
    const s = useData.getState()
    expect(s.datos.cuentas.map((c) => [c.nombre, c.titularId, c.externa])).toEqual([
      ['MyInvestor', 't1', false],
      ['Nómina', 't1', true],
      ['Cuenta de Fondo ahorro', 't2', true],
    ])
  })

  it('una cuenta que ya se llama MyInvestor pasa a llevar saldo, sin crear otra', async () => {
    const storage = new MemoryStorage()
    storage.setItem('mis-inversiones', v3({ cuentas: [cuenta('c1', 't1', 'Nómina'), cuenta('c9', 't1', ' myInvestor ')] }))
    const { useData } = await open(storage)
    const s = useData.getState()
    expect(s.datos.cuentas.map((c) => [c.id, c.externa])).toEqual([
      ['c1', true],
      ['c9', false],
    ])
  })

  it('con datos de la versión 4 no se vuelve a crear si se borró', async () => {
    const storage = new MemoryStorage()
    storage.setItem('mis-inversiones', legacy(4, { datos: { titulares, cuentas: [], productos: [], movimientos: [], programadas: [] }, ejemplo: null, verEjemplo: false, hideAmounts: false }))
    const { useData } = await open(storage)
    expect(useData.getState().datos.cuentas).toHaveLength(0)
    // Se puede crear con un botón (y no se duplica).
    const id = useData.getState().crearCuentaPrincipal('t1')
    expect(useData.getState().crearCuentaPrincipal('t1')).toBe(id)
    expect(useData.getState().datos.cuentas).toEqual([expect.objectContaining({ id, nombre: 'MyInvestor', externa: false, titularId: 't1' })])
  })

  it('lo que llega a una cuenta con saldo de otro titular cuenta para él; a una externa, todavía no. Para el principal es dinero de paso', async () => {
    const { useData, finance } = await open(new MemoryStorage())
    const st = useData.getState()
    const [t1, t2] = st.datos.titulares
    const my = st.datos.cuentas[0].id
    const base = { entidad: '', iban: '', color: '#000', notas: '' }
    const bbva = st.addCuenta({ ...base, titularId: t1.id, nombre: 'BBVA', externa: true })
    const suya = st.addCuenta({ ...base, titularId: t2.id, nombre: 'Cuenta de T2', externa: false })
    const banco = st.addCuenta({ ...base, titularId: t2.id, nombre: 'Banco de T2', externa: true })
    const C = (id: string) => ({ kind: 'cuenta' as const, id })
    st.addMovimiento({ fecha: '2026-09-01', origen: C(bbva), destino: C(my), importe: 1000, concepto: '' })
    st.addMovimiento({ fecha: '2026-09-02', origen: C(my), destino: C(suya), importe: 300, concepto: '' })
    st.addMovimiento({ fecha: '2026-09-03', origen: C(my), destino: C(banco), importe: 100, concepto: '' })
    const f = finance()
    const a = f.byTitular.get(t1.id)!
    const b = f.byTitular.get(t2.id)!
    // Los 400 € que van al titular 2 salen de MyInvestor (saldo real) sin dejar constancia en sus
    // movimientos, y no cuentan como inversión suya (ni en su patrimonio ni en lo aportado).
    expect(f.accounts.get(my)).toMatchObject({ saldo: 600, dePaso: 400, numMovimientos: 1 })
    expect(a.totals).toMatchObject({ efectivo: 600, patrimonio: 600, aportadoTotal: 600 })
    expect(a.enviadoTotal).toBe(0)
    expect(b.totals).toMatchObject({ efectivo: 300, patrimonio: 300, aportadoTotal: 300 })
    expect(b.recibido).toEqual([{ titularId: t1.id, importe: 300 }])
    expect(b.recibidoEnExternas).toBe(100)
  })

  it('el orden de las inversiones se guarda; las que no están en la lista no se mueven', async () => {
    const storage = new MemoryStorage()
    let app = await open(storage)
    const st = app.useData.getState()
    const t1 = st.datos.titulares[0].id
    const nuevo = (nombre: string) => st.addProducto({ titularId: t1, tipo: 'fondo', nombre, entidad: '', isin: '', notas: '', tae: null, vencimiento: null })
    const a = nuevo('A')
    const b = nuevo('B')
    const c = nuevo('C')
    st.reorderProductos([c, a])
    expect(app.useData.getState().datos.productos.map((p) => p.nombre)).toEqual(['C', 'B', 'A'])
    st.reorderProductos([b, c, a])
    app = await open(storage)
    expect(app.useData.getState().datos.productos.map((p) => p.id)).toEqual([b, c, a])
  })

  it('borrar los datos deja los titulares y vuelve a crear «MyInvestor»', async () => {
    const { useData } = await open(new MemoryStorage())
    const st = useData.getState()
    const [t1] = st.datos.titulares
    st.addCuenta({ titularId: t1.id, nombre: 'BBVA', entidad: '', iban: '', color: '#000', notas: '', externa: true })
    st.addProducto({ titularId: t1.id, tipo: 'fondo', nombre: 'F', entidad: '', isin: '', notas: '', tae: null, vencimiento: null })
    st.clearData()
    const s = useData.getState().datos
    expect(s.titulares).toHaveLength(2)
    expect(s.productos).toHaveLength(0)
    expect(s.cuentas).toEqual([expect.objectContaining({ nombre: 'MyInvestor', externa: false, titularId: t1.id })])
  })
})

describe('versión 5: interés que cambia', () => {
  it('se cargan bien los datos que guardó el TOTAL de Inicio (que ya no existe): su marca `fueraDelTotal` se ignora', async () => {
    const storage = new MemoryStorage()
    const fondo = (id: string, titularId: string, nombre: string, extra: object = {}) => ({
      id,
      titularId,
      tipo: 'fondo',
      nombre,
      entidad: '',
      isin: '',
      notas: '',
      tae: null,
      vencimiento: null,
      valoraciones: [],
      createdAt: '',
      ...extra,
    })
    storage.setItem(
      'mis-inversiones',
      legacy(5, {
        datos: {
          titulares: [
            { id: 't1', codigo: '', nombre: 'Luis principal', createdAt: '' },
            { id: 't2', codigo: '', nombre: 'Fondo ahorro', fueraDelTotal: true, createdAt: '' },
          ],
          cuentas: [
            { id: 'c1', titularId: 't1', nombre: 'MyInvestor', entidad: '', iban: '', color: '#000', notas: '', externa: false, createdAt: '' },
            { id: 'c2', titularId: 't2', nombre: 'Cuenta Fondo-Ahorro', entidad: '', iban: '', color: '#000', notas: '', externa: false, fueraDelTotal: true, createdAt: '' },
            { id: 'c3', titularId: 't1', nombre: 'Cuenta ahorro', entidad: '', iban: '', color: '#000', notas: '', externa: true, createdAt: '' },
          ],
          productos: [
            fondo('p1', 't1', 'Fondo de ahorro', { fueraDelTotal: true }),
            fondo('p2', 't1', 'Vanguard'),
            {
              ...fondo('p3', 't1', 'Depósito'),
              tipo: 'deposito',
              tae: 2,
              cambiosTae: [{ id: 'x', desde: '2026-05-01', tae: 1.5, createdAt: '' }, { desde: 'mal', tae: 3 }, { desde: '2026-06-01', tae: 'no' }],
            },
          ],
          movimientos: [],
          programadas: [],
        },
        ejemplo: null,
        verEjemplo: false,
        hideAmounts: false,
      }),
    )
    const { useData } = await open(storage)
    const d = useData.getState().datos
    const conMarca = (xs: object[]) => xs.filter((x) => 'fueraDelTotal' in x).length
    expect([conMarca(d.titulares), conMarca(d.cuentas), conMarca(d.productos)]).toEqual([0, 0, 0])
    expect(d.titulares.map((t) => t.nombre)).toEqual(['Luis principal', 'Fondo ahorro'])
    expect(d.productos.map((p) => p.nombre)).toEqual(['Fondo de ahorro', 'Vanguard', 'Depósito'])
    // Solo los cambios de interés válidos.
    expect(d.productos[2].cambiosTae).toEqual([{ id: 'x', desde: '2026-05-01', tae: 1.5, createdAt: '' }])

    // Al guardar el siguiente cambio, la marca ya no se guarda.
    useData.getState().updateTitular('t1', { nombre: 'Luis' })
    const guardado = saved(storage).state.datos
    expect(saved(storage).version).toBe(5)
    expect(JSON.stringify(guardado)).not.toContain('fueraDelTotal')
    expect(guardado.titulares.map((t: { nombre: string }) => t.nombre)).toEqual(['Luis', 'Fondo ahorro'])
  })

  it('cambiar el interés de un depósito desde una fecha (o corregir el inicial)', async () => {
    const { useData, finance } = await open(new MemoryStorage())
    const st = useData.getState()
    const [t1] = st.datos.titulares
    const my = st.datos.cuentas[0].id
    const ext = st.addCuenta({ titularId: t1.id, nombre: 'BBVA', entidad: '', iban: '', color: '#000', notas: '', externa: true })
    const dep = st.addProducto({ titularId: t1.id, tipo: 'deposito', nombre: 'Depósito', entidad: '', isin: '', notas: '', tae: 3, vencimiento: null })
    st.addMovimiento({ fecha: '2026-01-01', origen: { kind: 'cuenta', id: ext }, destino: { kind: 'cuenta', id: my }, importe: 10000, concepto: '' })
    st.addMovimiento({ fecha: '2026-01-01', origen: { kind: 'cuenta', id: my }, destino: { kind: 'producto', id: dep }, importe: 10000, concepto: '' })
    st.cambiarTae(dep, '2026-07-01', 2)
    st.cambiarTae(dep, '2026-07-01', 2.2) // mismo día: sustituye
    let p = useData.getState().datos.productos.find((x) => x.id === dep)!
    expect(p.cambiosTae?.map((c) => [c.desde, c.tae])).toEqual([['2026-07-01', 2.2]])
    expect(finance().positions.get(dep)!.deposito).toMatchObject({ tae: 2.2, taeDesde: '2026-07-01' })
    st.cambiarTae(dep, null, 3.5)
    p = useData.getState().datos.productos.find((x) => x.id === dep)!
    expect(p.tae).toBe(3.5)
    st.removeCambioTae(dep, p.cambiosTae![0].id)
    p = useData.getState().datos.productos.find((x) => x.id === dep)!
    expect(p.cambiosTae).toBeUndefined()
    expect(finance().positions.get(dep)!.deposito?.tae).toBe(3.5)
  })
})

describe('deshacer y rehacer', () => {
  it('deshace el último cambio y lo puede volver a hacer', async () => {
    const { useData, finance } = await open(new MemoryStorage())
    const st = useData.getState()
    const [t1] = st.datos.titulares
    const my = st.datos.cuentas[0].id
    const ext = st.addCuenta({ titularId: t1.id, nombre: 'BBVA', entidad: '', iban: '', color: '#000', notas: '', externa: true })
    const m = st.addMovimiento({ fecha: '2026-10-01', origen: { kind: 'cuenta', id: ext }, destino: { kind: 'cuenta', id: my }, importe: 1000, concepto: 'Aportación' })
    st.updateMovimiento(m, { fecha: '2026-10-01', origen: { kind: 'cuenta', id: ext }, destino: { kind: 'cuenta', id: my }, importe: 1500, concepto: 'Aportación' })
    expect(finance().accounts.get(my)!.saldo).toBe(1500)

    expect(st.deshacer()).toBe('Movimiento cambiado')
    expect(finance().accounts.get(my)!.saldo).toBe(1000)
    expect(st.deshacer()).toBe('Nuevo movimiento')
    expect(useData.getState().datos.movimientos).toHaveLength(0)
    expect(st.rehacer()).toBe('Nuevo movimiento')
    expect(useData.getState().datos.movimientos.map((x) => [x.id, x.importe])).toEqual([[m, 1000]])
    expect(st.rehacer()).toBe('Movimiento cambiado')
    expect(finance().accounts.get(my)!.saldo).toBe(1500)
    expect(st.rehacer()).toBeNull()

    // Borrar se deshace (y vuelve igual que estaba).
    const antes = useData.getState().datos.movimientos[0]
    st.removeMovimiento(m)
    expect(useData.getState().datos.movimientos).toHaveLength(0)
    expect(st.deshacer()).toBe('Movimiento borrado')
    expect(useData.getState().datos.movimientos[0]).toEqual(antes)
    // Un cambio nuevo hace que ya no se pueda rehacer lo deshecho.
    st.addMovimiento({ fecha: '2026-10-02', origen: { kind: 'cuenta', id: ext }, destino: { kind: 'cuenta', id: my }, importe: 5, concepto: '' })
    expect(st.rehacer()).toBeNull()
  })

  it('varios cambios de una vez se deshacen juntos, con su nombre; el historial sobrevive a cerrar la app', async () => {
    const storage = new MemoryStorage()
    let app = await open(storage)
    const st = app.useData.getState()
    const [t1] = st.datos.titulares
    const my = st.datos.cuentas[0].id
    app.conDeshacer('Añadir dinero: 2.000,00 € a «MyInvestor»', () => {
      const ext = st.addCuenta({ titularId: t1.id, nombre: 'Cuenta externa', entidad: '', iban: '', color: '#000', notas: '', externa: true })
      st.addMovimiento({ fecha: '2026-10-01', origen: { kind: 'cuenta', id: ext }, destino: { kind: 'cuenta', id: my }, importe: 2000, concepto: '' })
    })
    expect(app.useData.getState().datos.cuentas).toHaveLength(2)
    expect(JSON.parse(storage.getItem('mis-inversiones-deshacer')!).pasos).toHaveLength(1)

    app = await open(storage)
    expect(app.useData.getState().deshacer()).toBe('Añadir dinero: 2.000,00 € a «MyInvestor»')
    const d = app.useData.getState().datos
    expect(d.cuentas.map((c) => c.nombre)).toEqual(['MyInvestor'])
    expect(d.movimientos).toHaveLength(0)
    expect(storage.getItem('mis-inversiones-deshacer')).toBeNull()
  })

  it('al hacer un cambio sale un aviso corto, sin botón «Deshacer» (para eso está el de arriba)', async () => {
    vi.stubGlobal('window', { setTimeout: () => 0, clearTimeout: () => undefined })
    const app = await open(new MemoryStorage())
    const { accion, deshacer, rehacer } = await import('./deshacer')
    const { useUI } = await import('./ui')
    const ultimo = () => useUI.getState().toasts.at(-1)
    accion('Nuevo titular «Tercero»', () => app.useData.getState().addTitular({ codigo: '', nombre: 'Tercero' }), 'Titular creado')
    expect(ultimo()).toMatchObject({ message: 'Titular creado', kind: 'success' })
    expect(ultimo()!.action).toBeUndefined()
    expect(app.useData.getState().datos.titulares).toHaveLength(3)
    // Se deshace con el botón de arriba; su aviso deja «Rehacer» por si acaso.
    deshacer()
    expect(app.useData.getState().datos.titulares).toHaveLength(2)
    expect(ultimo()).toMatchObject({ message: 'Deshecho: Nuevo titular «Tercero»', action: { label: 'Rehacer' } })
    rehacer()
    expect(app.useData.getState().datos.titulares).toHaveLength(3)
    expect(ultimo()!.message).toBe('Rehecho: Nuevo titular «Tercero»')
    expect(ultimo()!.action).toBeUndefined()
    expect(useUI.getState().toasts.some((t) => t.action?.label === 'Deshacer')).toBe(false)
  })

  it('los pasos del antiguo TOTAL de Inicio (que ya no existe) no se deshacen: se saltan', async () => {
    const storage = new MemoryStorage()
    let app = await open(storage)
    app.useData.getState().addTitular({ codigo: '', nombre: 'Tercero' })
    const h = JSON.parse(storage.getItem('mis-inversiones-deshacer')!)
    const [paso] = h.pasos
    const t2 = app.useData.getState().datos.titulares[1]
    const total = { ...paso, id: 'viejo', etiqueta: 'Dejar «Fondo ahorro» fuera del TOTAL', parche: { titulares: { antes: { [t2.id]: t2 } } } }
    storage.setItem('mis-inversiones-deshacer', JSON.stringify({ ...h, pasos: [paso, total] }))
    app = await open(storage)
    expect(app.useData.getState().deshacer()).toBe('Nuevo titular «Tercero»')
    expect(app.useData.getState().datos.titulares).toHaveLength(2)
    expect(app.useData.getState().deshacer()).toBeNull()
  })

  it('un historial de otra versión de la app no se usa; «Borrar todo» lo borra', async () => {
    const storage = new MemoryStorage()
    let app = await open(storage)
    app.useData.getState().addTitular({ codigo: '', nombre: 'Tercero' })
    const h = JSON.parse(storage.getItem('mis-inversiones-deshacer')!)
    storage.setItem('mis-inversiones-deshacer', JSON.stringify({ ...h, version: 1 }))
    app = await open(storage)
    expect(app.useData.getState().deshacer()).toBeNull()
    app.useData.getState().addTitular({ codigo: '', nombre: 'Cuarto' })
    expect(storage.getItem('mis-inversiones-deshacer')).not.toBeNull()
    app.useData.getState().resetAll()
    expect(storage.getItem('mis-inversiones-deshacer')).toBeNull()
    expect(app.useData.getState().deshacer()).toBeNull()
  })

  it('deshacer una transferencia mensual quita también los meses que se apuntaron solos', async () => {
    const { useData } = await open(new MemoryStorage())
    const st = useData.getState()
    const [t1, t2] = st.datos.titulares
    const my = st.datos.cuentas[0].id
    const f2 = st.addProducto({ titularId: t2.id, tipo: 'fondo', nombre: 'Fondo de T2', entidad: '', isin: '', notas: '', tae: null, vencimiento: null })
    expect(t1).toBeTruthy()
    st.addProgramada({ origen: { kind: 'cuenta', id: my }, destino: { kind: 'producto', id: f2 }, importe: 150, inicio: '2026-07-05', fin: null, concepto: '' })
    expect(useData.getState().datos.movimientos).toHaveLength(4)
    // Un mes que se apunta solo después (no es un cambio del usuario: no va al historial).
    const p = useData.getState().datos.programadas[0]
    useData.setState((s) => ({
      datos: {
        ...s.datos,
        movimientos: [
          ...s.datos.movimientos,
          { ...s.datos.movimientos[0], id: 'auto-nov', fecha: '2026-11-05', programadaId: p.id, programadaMes: '2026-11' },
        ],
      },
    }))
    expect(st.deshacer()).toBe('Transferencia mensual programada')
    const d = useData.getState().datos
    expect(d.programadas).toHaveLength(0)
    expect(d.movimientos).toHaveLength(0)
    expect(d.productos).toHaveLength(1)
  })

  it('al ordenar, los movimientos seguidos se deshacen de una vez; cada dato (tuyo o ejemplo) tiene su historial', async () => {
    const { useData } = await open(new MemoryStorage())
    const st = useData.getState()
    const t1 = st.datos.titulares[0].id
    const nuevo = (nombre: string) => st.addProducto({ titularId: t1, tipo: 'fondo', nombre, entidad: '', isin: '', notas: '', tae: null, vencimiento: null })
    const [a, b, c] = [nuevo('A'), nuevo('B'), nuevo('C')]
    st.reorderProductos([b, a, c])
    st.reorderProductos([b, c, a])
    st.reorderProductos([c, b, a])
    expect(useData.getState().datos.productos.map((p) => p.nombre)).toEqual(['C', 'B', 'A'])
    expect(st.deshacer()).toBe('Orden de las inversiones')
    expect(useData.getState().datos.productos.map((p) => p.nombre)).toEqual(['A', 'B', 'C'])

    st.loadDemo()
    expect(st.deshacer()).toBeNull() // en el ejemplo aún no se ha cambiado nada
    st.updateTitular('demo-t-2', { nombre: 'Ahorro' })
    expect(useData.getState().ejemplo!.titulares[1].nombre).toBe('Ahorro')
    expect(st.deshacer()).toBe('Cambio en los datos del titular')
    expect(useData.getState().ejemplo!.titulares[1].nombre).toBe('Fondo ahorro')
    st.setVerEjemplo(false)
    expect(st.deshacer()).toBe('Nueva inversión «C»')
  })
})
