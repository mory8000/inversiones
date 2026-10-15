// Permite instalar la app (PWA) desde Ajustes en navegadores compatibles.

import { useEffect, useReducer } from 'react'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

let deferred: BeforeInstallPromptEvent | null = null
const listeners = new Set<() => void>()

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    deferred = e as BeforeInstallPromptEvent
    listeners.forEach((l) => l())
  })
  window.addEventListener('appinstalled', () => {
    deferred = null
    listeners.forEach((l) => l())
  })
}

export function isStandalone(): boolean {
  return window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true
}

/** Devuelve una función para instalar la app, o `null` si el navegador no lo permite. */
export function useInstallPrompt(): (() => Promise<void>) | null {
  const [, force] = useReducer((x: number) => x + 1, 0)
  useEffect(() => {
    listeners.add(force)
    return () => {
      listeners.delete(force)
    }
  }, [])
  if (!deferred) return null
  return async () => {
    const ev = deferred
    if (!ev) return
    await ev.prompt()
    await ev.userChoice.catch(() => null)
    deferred = null
    force()
  }
}
