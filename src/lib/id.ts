export function uid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  return `id-${Math.random().toString(36).slice(2, 10)}-${Date.now().toString(36)}`
}

export function nowStamp(): string {
  return new Date().toISOString()
}
