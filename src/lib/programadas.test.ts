import { describe, expect, it } from 'vitest'
import type { Dataset } from '../types'
import { aplicarProgramadas, fechasDebidas, proximaFecha } from './programadas'

describe('fechas de una transferencia mensual', () => {
  it('el mismo día de cada mes; si el mes es más corto, el último día', () => {
    expect(fechasDebidas({ inicio: '2026-01-31', fin: null }, '2026-04-15').map((x) => x.fecha)).toEqual(['2026-01-31', '2026-02-28', '2026-03-31'])
    expect(fechasDebidas({ inicio: '2028-01-30', fin: null }, '2028-03-01').map((x) => x.fecha)).toEqual(['2028-01-30', '2028-02-29'])
  })

  it('respeta la fecha de fin y no apunta nada futuro', () => {
    expect(fechasDebidas({ inicio: '2026-01-10', fin: '2026-03-09' }, '2026-12-01').map((x) => x.mes)).toEqual(['2026-01', '2026-02'])
    expect(fechasDebidas({ inicio: '2026-11-01', fin: null }, '2026-10-15')).toEqual([])
    expect(fechasDebidas({ inicio: '2026-10-15', fin: null }, '2026-10-15').map((x) => x.fecha)).toEqual(['2026-10-15'])
  })

  it('calcula la próxima', () => {
    expect(proximaFecha({ inicio: '2026-01-31', fin: null }, '2026-02-10')).toBe('2026-02-28')
    expect(proximaFecha({ inicio: '2026-01-31', fin: null }, '2026-02-28')).toBe('2026-03-31')
    expect(proximaFecha({ inicio: '2026-12-01', fin: null }, '2026-10-15')).toBe('2026-12-01')
    expect(proximaFecha({ inicio: '2026-01-05', fin: '2026-10-20' }, '2026-10-15')).toBeNull()
  })
})

describe('apuntar las transferencias mensuales', () => {
  const base: Dataset = {
    titulares: [
      { id: 'T1', codigo: '', nombre: 'Ana', createdAt: '' },
      { id: 'T2', codigo: '', nombre: 'Luis', createdAt: '' },
    ],
    cuentas: [{ id: 'C1', titularId: 'T1', nombre: 'Nómina', entidad: '', iban: '', color: '#000', notas: '', externa: true, createdAt: '' }],
    productos: [{ id: 'F2', titularId: 'T2', tipo: 'fondo', nombre: 'Fondo', entidad: '', isin: '', notas: '', tae: null, vencimiento: null, valoraciones: [], createdAt: '' }],
    movimientos: [],
    programadas: [
      {
        id: 'P',
        origen: { kind: 'cuenta', id: 'C1' },
        destino: { kind: 'producto', id: 'F2' },
        importe: 100,
        inicio: '2026-08-01',
        fin: null,
        concepto: 'Mensual',
        excluidos: ['2026-09'],
        createdAt: '',
        updatedAt: '',
      },
    ],
  }

  it('crea los que faltan (saltando los excluidos) y es idempotente', () => {
    const once = aplicarProgramadas(base, '2026-10-15')
    expect(once.movimientos.map((m) => `${m.fecha}|${m.tipo}|${m.programadaMes}`)).toEqual(['2026-08-01|inversion|2026-08', '2026-10-01|inversion|2026-10'])
    expect(aplicarProgramadas(once, '2026-10-15')).toBe(once)
  })

  it('no hace nada si la cuenta o el producto ya no existen', () => {
    expect(aplicarProgramadas({ ...base, productos: [] }, '2026-10-15').movimientos).toHaveLength(0)
  })
})
