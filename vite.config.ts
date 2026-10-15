import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// Política de seguridad (CSP) de la app publicada: el navegador solo le deja cargar
// sus propios archivos y le impide conectarse a cualquier otro servidor, así que los
// datos guardados en el dispositivo no pueden enviarse a ningún sitio.
// (Solo en el build: el servidor de desarrollo necesita scripts en línea y websockets.)
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "manifest-src 'self'",
  "worker-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ')

function contentSecurityPolicy(): Plugin {
  return {
    name: 'mis-inversiones:csp',
    apply: 'build',
    transformIndexHtml(html) {
      const charset = /<meta charset="[^"]*"\s*\/?>/i
      if (!charset.test(html)) throw new Error('index.html: falta <meta charset> para colocar la CSP')
      // Justo después del charset, antes de cualquier script o estilo.
      return html.replace(
        charset,
        (m) => `${m}\n    <meta http-equiv="Content-Security-Policy" content="${CONTENT_SECURITY_POLICY}" />`,
      )
    },
  }
}

// `base: './'` permite publicar la app en cualquier ruta (p. ej. GitHub Pages
// en /inversiones/) sin tocar nada. La navegación interna usa rutas con "#".
export default defineConfig({
  base: './',
  plugins: [
    react(),
    tailwindcss(),
    contentSecurityPolicy(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Mis Inversiones',
        short_name: 'Inversiones',
        description:
          'Controla tus depósitos, fondos y carteras: todos los movimientos, de dónde viene y a dónde va tu dinero.',
        lang: 'es',
        theme_color: '#0b1736',
        background_color: '#f3f5f9',
        display: 'standalone',
        start_url: './',
        scope: './',
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        // Solo se guardan sin conexión las fuentes con caracteres latinos (español).
        globIgnores: ['**/inter-{cyrillic,cyrillic-ext,greek,greek-ext,vietnamese}-*.woff2'],
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  server: { host: '0.0.0.0', port: 5173, allowedHosts: true },
  preview: { host: '0.0.0.0', port: 4173, allowedHosts: true },
})
