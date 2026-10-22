/** Diagrama de bandas para el Excel: se rasteriza a PNG porque Excel muestra las imágenes, pero
 * no siempre muestra las formas dibujadas a mano. Los datos se generan localmente, nunca se envían. */
export interface CaminoDinero {
  pasos: string[]
  importe: number
  seQueda: boolean
}

interface Banda { de: string; a: string; importe: number }
interface Nodo { id: string; nombre: string; valor: number; x: number; y: number; alto: number; color: string }

export const ANCHO_GRAFICO = 1500
const EJE = [320, 760, 1150]
const COLORES = ['#3B82F6', '#8555E9', '#18A598', '#E88830', '#6674E8', '#CC64A1']
const escapeXml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;')
const euros = (n: number) => `${new Intl.NumberFormat('es-ES', { maximumFractionDigits: 0 }).format(n)} €`

function nombresEnLineas(nombre: string, max = 33): string[] {
  if (nombre.length <= max) return [nombre]
  const palabras = nombre.split(/\s+/)
  const lineas: string[] = ['']
  for (const palabra of palabras) {
    const i = lineas.length - 1
    if (lineas[i] && (lineas[i] + ' ' + palabra).length > max) lineas.push(palabra)
    else lineas[i] = lineas[i] ? `${lineas[i]} ${palabra}` : palabra
  }
  if (lineas.length > 2) lineas[1] = lineas.slice(1).join(' ')
  return lineas.slice(0, 2).map((l) => l.length > max + 3 ? `${l.slice(0, max)}…` : l)
}

/** Convierte cada destino en dos tramos conservando los importes (y la rentabilidad). */
export function grafoDinero(
  caminos: CaminoDinero[],
  titulares: Map<string, string>,
  porcentajes: Map<string, number>,
) {
  const origen: Banda[] = []
  const final: Banda[] = []
  const sumar = (lista: Banda[], de: string, a: string, importe: number) => {
    if (importe <= 0.005) return
    const b = lista.find((x) => x.de === de && x.a === a)
    if (b) b.importe += importe
    else lista.push({ de, a, importe })
  }
  for (const camino of caminos) {
    if (camino.importe <= 0.005 || !camino.pasos.length) continue
    const medio = camino.pasos[camino.pasos.length - 1]
    const duenio = titulares.get(medio) ?? 'Mi dinero'
    const cuenta = camino.seQueda
    const anterior = camino.pasos.length >= 3 ? camino.pasos[camino.pasos.length - 2] : `Aportaciones · ${duenio}`
    sumar(origen, anterior, medio, camino.importe)
    if (cuenta) {
      sumar(final, medio, `Sigue en cuenta · ${duenio}`, camino.importe)
      continue
    }
    const rentabilidad = Math.max(-1, porcentajes.get(medio) ?? 0)
    const diferencia = camino.importe * rentabilidad
    if (diferencia > 0.005) sumar(origen, `Rentabilidad generada · ${duenio}`, medio, diferencia)
    sumar(final, medio, `Sigue invertido · ${duenio}`, camino.importe + Math.min(diferencia, 0) + Math.max(diferencia, 0))
    if (diferencia < -0.005) sumar(final, medio, `Pérdidas · ${duenio}`, -diferencia)
  }
  return { origen, final }
}

/** SVG autónomo: tres columnas, nodos y cintas curvas proporcionales al dinero, como la referencia. */
export function dibujarGraficoDinero(
  caminos: CaminoDinero[],
  titulares: Map<string, string>,
  porcentajes: Map<string, number>,
): { svg: string; alto: number } {
  const { origen, final } = grafoDinero(caminos, titulares, porcentajes)
  const etiquetas = [
    [...new Set(origen.map((e) => e.de))],
    [...new Set([...origen.map((e) => e.a), ...final.map((e) => e.de)])],
    [...new Set(final.map((e) => e.a))],
  ]
  const valores = [
    (id: string) => origen.filter((e) => e.de === id).reduce((a, b) => a + b.importe, 0),
    (id: string) => origen.filter((e) => e.a === id).reduce((a, b) => a + b.importe, 0),
    (id: string) => final.filter((e) => e.a === id).reduce((a, b) => a + b.importe, 0),
  ]
  etiquetas.forEach((items, col) => items.sort((a, b) => valores[col](b) - valores[col](a)))
  const maxN = Math.max(1, ...etiquetas.map((a) => a.length))
  const total = origen.reduce((acc, b) => acc + b.importe, 0)
  const espacio = Math.max(440, maxN * 112)
  const scale = total > 0 ? (espacio - Math.max(0, maxN - 1) * 26) / total : 1
  const margen = 150
  const padding = 46
  const columnas = etiquetas.map((items, col) => {
    const sizes = items.map((id) => Math.max(82, valores[col](id) * scale))
    const usado = sizes.reduce((a, b) => a + b, 0) + Math.max(0, items.length - 1) * 26
    let y = margen + Math.max(0, (Math.max(espacio, usado) - usado) / 2)
    return items.map((id, i) => {
      const n: Nodo = {
        id: `${col}:${id}`, nombre: id, valor: valores[col](id), x: EJE[col], y,
        alto: sizes[i],
        color: col === 0
          ? id.startsWith('Rentabilidad') ? '#10A878' : id.startsWith('Aportaciones') ? '#E96316' : '#6466F1'
          : col === 2 ? id.startsWith('Pérdidas') ? '#EF445C' : id.startsWith('Sigue en cuenta') ? '#148B92' : '#1D46B2'
            : COLORES[i % COLORES.length],
      }
      y += sizes[i] + 26
      return n
    })
  })
  const alto = Math.ceil(Math.max(...columnas.map((a) => a.length ? a[a.length - 1].y + a[a.length - 1].alto : margen + espacio)) + padding + 36)
  const nodos = columnas.flat()
  const nodo = (col: number, id: string) => columnas[col].find((n) => n.nombre === id)!
  const ribbon = (lista: Banda[], col: number, opacidad: number) => {
    const origenY = new Map<string, number>()
    const destinoY = new Map<string, number>()
    return lista.map((b) => {
      const n0 = nodo(col, b.de), n1 = nodo(col + 1, b.a)
      const grueso = Math.max(1.5, b.importe * scale)
      const s = origenY.get(n0.id) ?? n0.y + (n0.alto - n0.valor * scale) / 2
      const t = destinoY.get(n1.id) ?? n1.y + (n1.alto - n1.valor * scale) / 2
      origenY.set(n0.id, s + grueso)
      destinoY.set(n1.id, t + grueso)
      const x0 = n0.x + 18, x1 = n1.x, xm = (x0 + x1) / 2
      const d = `M ${x0} ${s} C ${xm} ${s}, ${xm} ${t}, ${x1} ${t} L ${x1} ${t + grueso} C ${xm} ${t + grueso}, ${xm} ${s + grueso}, ${x0} ${s + grueso} Z`
      return `<path d="${d}" fill="${n0.color}" opacity="${opacidad}"/>`
    }).join('')
  }
  const nombres = nodos.map((n) => {
    const col = Number(n.id[0])
    const lado = col === 0 ? n.x - 12 : n.x + 28
    const align = col === 0 ? 'end' : 'start'
    const lineas = nombresEnLineas(n.nombre)
    const y = n.y + n.alto / 2 - (lineas.length > 1 ? 27 : 10)
    const texto = lineas.map((l, i) => `<tspan x="${lado}" dy="${i ? 24 : 0}">${escapeXml(l)}</tspan>`).join('')
    return `<rect x="${n.x}" y="${n.y}" width="18" height="${n.alto}" rx="5" fill="${n.color}"/>
      <text x="${lado}" y="${y}" text-anchor="${align}" font-weight="700" font-size="18" fill="#16243C" paint-order="stroke" stroke="white" stroke-width="5" stroke-linejoin="round">${texto}</text>
      <text x="${lado}" y="${y + lineas.length * 24}" text-anchor="${align}" font-size="16" fill="#576980" paint-order="stroke" stroke="white" stroke-width="4">${escapeXml(euros(n.valor))}</text>`
  }).join('')
  const cuerpo = total
    ? `${ribbon(origen, 0, 0.32)}${ribbon(final, 1, 0.35)}${nombres}`
    : `<text x="750" y="330" text-anchor="middle" font-size="24" fill="#64748B">Todavía no hay dinero que representar.</text>`
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${ANCHO_GRAFICO} ${alto}" width="${ANCHO_GRAFICO}" height="${alto}">
    <rect width="100%" height="100%" fill="white"/>
    <style>text{font-family:Arial,Helvetica,sans-serif}</style>
    <text x="${EJE[0]}" y="73" text-anchor="middle" font-size="17" letter-spacing="2" font-weight="700" fill="#94A3B8">DE DÓNDE VIENE</text>
    <text x="${EJE[1]}" y="73" text-anchor="middle" font-size="17" letter-spacing="2" font-weight="700" fill="#94A3B8">DÓNDE ESTÁ</text>
    <text x="${EJE[2]}" y="73" text-anchor="middle" font-size="17" letter-spacing="2" font-weight="700" fill="#94A3B8">A DÓNDE VA</text>
    ${cuerpo}
    <text x="60" y="${alto - 25}" font-size="15" fill="#64748B">Cada banda es proporcional al importe. El gráfico refleja los datos al descargar el Excel.</text>
  </svg>`
  return { svg, alto }
}

/** En la app, el navegador usa canvas. En el generador Node, resvg local (sin red). */
export async function graficoPNG(svg: string): Promise<string> {
  if (typeof document !== 'undefined') {
    const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    try {
      const imagen = new Image()
      await new Promise<void>((resolve, reject) => {
        imagen.onload = () => resolve()
        imagen.onerror = () => reject(new Error('No se pudo dibujar el gráfico del dinero'))
        imagen.src = url
      })
      const canvas = document.createElement('canvas')
      canvas.width = imagen.naturalWidth
      canvas.height = imagen.naturalHeight
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('No se pudo crear el dibujo del gráfico')
      ctx.drawImage(imagen, 0, 0)
      return canvas.toDataURL('image/png')
    } finally {
      URL.revokeObjectURL(url)
    }
  }
  // El nombre variable evita incluir el módulo nativo de Node en el paquete de la web.
  const paquete = '@resvg/resvg-js'
  const { Resvg } = (await import(/* @vite-ignore */ paquete)) as typeof import('@resvg/resvg-js')
  const png = new Resvg(svg).render().asPng()
  return `data:image/png;base64,${Buffer.from(png).toString('base64')}`
}
