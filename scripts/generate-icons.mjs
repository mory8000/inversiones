// Genera los iconos PNG de la app a partir del logo SVG.
// Uso (solo hace falta si cambias el logo):
//   npm install --no-save sharp && node scripts/generate-icons.mjs
import sharp from 'sharp'
import { readFile } from 'node:fs/promises'

const svg = await readFile(new URL('../public/favicon.svg', import.meta.url))

// Versión "maskable": fondo a sangre y logo reducido dentro de la zona segura.
const maskable = Buffer.from(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#1F3D96"/><stop offset="1" stop-color="#0B1736"/>
    </linearGradient>
    <linearGradient id="ln" x1="0" y1="1" x2="1" y2="0">
      <stop offset="0" stop-color="#34D399"/><stop offset="1" stop-color="#6EE7F9"/>
    </linearGradient>
  </defs>
  <rect width="64" height="64" fill="url(#bg)"/>
  <g transform="translate(12.8 12.8) scale(0.6)">
    <path d="M14 45 L26 32.5 L34.5 39 L48 24" fill="none" stroke="url(#ln)" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M39.5 22.5 H49.5 V32.5" fill="none" stroke="url(#ln)" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>
  </g>
</svg>`)

const out = (name) => new URL(`../public/${name}`, import.meta.url).pathname

await sharp(svg, { density: 600 }).resize(192, 192).png().toFile(out('pwa-192.png'))
await sharp(svg, { density: 600 }).resize(512, 512).png().toFile(out('pwa-512.png'))
await sharp(svg, { density: 600 }).resize(180, 180).flatten({ background: '#0B1736' }).png().toFile(out('apple-touch-icon.png'))
await sharp(maskable, { density: 600 }).resize(512, 512).png().toFile(out('pwa-maskable-512.png'))
console.log('Iconos generados en /public')
