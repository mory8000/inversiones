/**
 * Genera «Movimientos.xlsx»: la misma hoja que descarga la app en Ajustes, pero vacía
 * (una plantilla con los nombres de ejemplo y sin movimientos).
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

/** Los mismos colores que la app: azul el primer titular, naranja el segundo. */
const PLANTILLA = {
  hoy: HOY,
  movimientos: [],
  // Una sola fila amarilla a la vista: al rellenarla sale la siguiente (hay 15).
  libres: 15,
  titulares: [
    {
      nombre: 'Marta',
      color: '#2447B8',
      grupos: [
        {
          cuenta: 'Cuenta Myinvestor',
          inversiones: [
            { nombre: 'Vanguard Global Stock Index', rentabilidad: null },
            { nombre: 'Fidelity MSCI World Index', rentabilidad: null },
            { nombre: 'Cartera indexada Metal', rentabilidad: null },
            { nombre: 'Depósito 12 meses', rentabilidad: null },
            { nombre: 'Plan de pensiones indexado global', rentabilidad: null },
          ],
        },
        // La cuenta nómina no sale: es la cuenta exterior, y en el Excel ese dinero es «Exterior».
        { cuenta: 'Cuenta ahorro · ING', inversiones: [] },
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
