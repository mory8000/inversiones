// Movimientos y Ajustes descargan el mismo libro .xlsx sin macros, generado a partir de
// los movimientos actuales de la app. El CSV filtrado es otra exportación, sin gráficos.
import type { FinanceData } from '../store/useFinance'
import { downloadFile } from './download'
import { entradaDesdeApp } from './excelDesdeApp'
import { generarExcelMovimientos } from './excelMovimientos'

const MIME_EXCEL = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

export async function crearExcelDeApp(fin: FinanceData): Promise<ArrayBuffer> {
  return generarExcelMovimientos(entradaDesdeApp(fin, fin.today))
}

export async function descargarExcelMovimientos(fin: FinanceData): Promise<void> {
  const buffer = await crearExcelDeApp(fin)
  downloadFile(`movimientos-${fin.today}.xlsx`, new Blob([buffer], { type: MIME_EXCEL }), MIME_EXCEL)
}
