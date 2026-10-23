/**
 * Genera «Movimientos.xlsx»: la misma hoja que descarga la app en Ajustes, pero con datos de
 * ejemplo (una plantilla con los nombres de ejemplo y unos cuantos movimientos).
 *
 * Uso:
 *   npm install && node --experimental-strip-types scripts/generar-movimientos-xlsx.mjs
 *
 * Los nombres se cambian en PLANTILLA, aquí abajo.
 */

import { writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { generarExcelMovimientos } from '../src/lib/excelMovimientos.ts'

const aqui = dirname(fileURLToPath(import.meta.url))
const RAIZ = resolve(aqui, '..')

const HOY = '2026-10-22'

/**
 * Los mismos colores que la app: azul el primer titular, naranja el segundo. Todo lo que sale
 * aquí tiene dinero: lo que queda a cero no aparece en el Excel (ni la cuenta nómina, que es la
 * cuenta de fuera y en el Excel es simplemente «Exterior»).
 */
const PLANTILLA = {
  hoy: HOY,
  movimientos: [
    // 1.000 € entran desde fuera; 400 € salen al Fondo ahorro. En Cuenta Luis quedan 600 €.
    { fecha: '2026-10-01', de: 'Exterior', a: 'Cuenta Luis', importe: 1000 },
    { fecha: '2026-10-02', de: 'Cuenta Luis', a: 'Fondo indexado', importe: 400 },
    // Otras inversiones de Luis se financian con una aportación independiente de 620 €.
    { fecha: '2026-10-03', de: 'Exterior', a: 'Cuenta Luis', importe: 620 },
    { fecha: '2026-10-04', de: 'Cuenta Luis', a: 'Vanguard Global Stock Index', importe: 300 },
    { fecha: '2026-10-05', de: 'Cuenta Luis', a: 'Fidelity MSCI World Index', importe: 200 },
    { fecha: '2026-10-06', de: 'Cuenta Luis', a: 'Cartera indexada Metal', importe: 120 },
    { fecha: '2026-10-07', de: 'Exterior', a: 'iShares Developed World Index (IE) Acc EUR clase s', importe: 150 },
  ],
  // Siete filas libres: una a la vista y seis en reserva.
  libres: 7,
  titulares: [
    {
      nombre: 'Luis',
      color: '#2447B8',
      grupos: [
        {
          cuenta: 'Cuenta Luis',
          inversiones: [
            { nombre: 'Vanguard Global Stock Index', rentabilidad: null },
            { nombre: 'Fidelity MSCI World Index', rentabilidad: null },
            { nombre: 'Cartera indexada Metal', rentabilidad: null },
          ],
        },
      ],
    },
    {
      nombre: 'Fondo ahorro',
      color: '#EA580C',
      grupos: [
        {
          cuenta: null, // El «Fondo ahorro» no tiene cuenta: el dinero va directo a sus inversiones.
          inversiones: [
            { nombre: 'Fondo indexado', rentabilidad: null },
            { nombre: 'iShares Developed World Index (IE) Acc EUR clase s', rentabilidad: null },
          ],
        },
      ],
    },
  ],
}

const buffer = Buffer.from(await generarExcelMovimientos(PLANTILLA))
writeFileSync(resolve(RAIZ, 'Movimientos.xlsx'), buffer)
writeFileSync(resolve(RAIZ, 'public', 'Movimientos.xlsx'), buffer)
console.log('✅ Movimientos.xlsx  (y su copia en public/, para la web)')
