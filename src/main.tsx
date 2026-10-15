import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/inter'
import './index.css'
import App from './App'
import { registerSW } from 'virtual:pwa-register'

// Instala la app para uso sin conexión y la actualiza automáticamente.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  registerSW({ immediate: true })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
