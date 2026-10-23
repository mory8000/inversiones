// Ensambla la version .xlsm sin exponer ni ejecutar codigo en el navegador.
// vbaProject.bin contiene solo el VBA de scripts/MovimientosAutomaticos.vba y ThisWorkbook.vba.
import type { EntradaExcel } from './excelMovimientos'
import { generarExcelMovimientos } from './excelMovimientos.ts'

async function vbaProject(): Promise<Uint8Array> {
  const url = new URL('./vbaProject.bin', import.meta.url)
  if (url.protocol === 'file:') {
    // El generador de la plantilla y los tests corren directamente en Node.
    const { readFile } = await import('node:fs/promises')
    return readFile(url)
  }
  const response = await fetch(url)
  if (!response.ok) throw new Error('No se pudo cargar el proyecto VBA del Excel')
  return new Uint8Array(await response.arrayBuffer())
}

export async function generarExcelMovimientosMacro(entrada: EntradaExcel): Promise<ArrayBuffer> {
  const buffer = await generarExcelMovimientos(entrada)
  const { default: JSZip } = await import('jszip')
  const zip = await JSZip.loadAsync(buffer)
  zip.file('xl/vbaProject.bin', await vbaProject())
  const rutaTipos = '[Content_Types].xml'
  const tipos = await zip.file(rutaTipos)!.async('string')
  zip.file(rutaTipos, tipos
    .replace('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml',
      'application/vnd.ms-excel.sheet.macroEnabled.main+xml')
    .replace('</Types>', '<Override PartName="/xl/vbaProject.bin" ContentType="application/vnd.ms-office.vbaProject"/></Types>'))
  const rutaRelaciones = 'xl/_rels/workbook.xml.rels'
  const relaciones = await zip.file(rutaRelaciones)!.async('string')
  const ids = [...relaciones.matchAll(/Id="rId(\d+)"/g)].map((match) => Number(match[1]))
  zip.file(rutaRelaciones, relaciones.replace('</Relationships>',
    `<Relationship Id="rId${Math.max(0, ...ids) + 1}" Type="http://schemas.microsoft.com/office/2006/relationships/vbaProject" Target="vbaProject.bin"/></Relationships>`))
  const libro = await zip.file('xl/workbook.xml')!.async('string')
  zip.file('xl/workbook.xml', libro.replace('<workbookPr ', '<workbookPr codeName="ThisWorkbook" '))
  for (const index of [1, 2]) {
    const path = `xl/worksheets/sheet${index}.xml`
    const hoja = await zip.file(path)!.async('string')
    zip.file(path, hoja.replace('<sheetPr>', `<sheetPr codeName="Sheet${index}">`))
  }
  return zip.generateAsync({ type: 'arraybuffer', compression: 'DEFLATE' })
}
