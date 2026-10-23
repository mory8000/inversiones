// La página Movimientos y Ajustes descargan EXACTAMENTE el mismo libro, generado a partir de
// los movimientos actuales de la app. El CSV filtrado es otra exportación, sin gráficos.
import type { FinanceData } from '../store/useFinance'
import { downloadFile } from './download'
import { entradaDesdeApp } from './excelDesdeApp'
import { generarExcelMovimientosMacro } from './excelMovimientosMacro'

const MIME_EXCEL = 'application/vnd.ms-excel.sheet.macroEnabled.12'

export async function crearExcelDeApp(fin: FinanceData): Promise<ArrayBuffer> {
  return generarExcelMovimientosMacro(entradaDesdeApp(fin, fin.today))
}

export async function descargarExcelMovimientos(fin: FinanceData): Promise<void> {
  const buffer = await crearExcelDeApp(fin)
  downloadFile(`movimientos-${fin.today}.xlsm`, new Blob([buffer], { type: MIME_EXCEL }), MIME_EXCEL)
}
