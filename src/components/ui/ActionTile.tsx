import type { LucideIcon } from 'lucide-react'

/** Botón grande de una acción en una ventana («Aportar», «Añadir dinero»…), con su explicación. */
export function ActionTile({
  icon: Icon,
  label,
  text,
  color,
  soft,
  onClick,
  disabled,
}: {
  icon: LucideIcon
  label: string
  text: string
  color: string
  soft: string
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex min-h-[4.5rem] min-w-0 flex-col items-start gap-2 rounded-2xl border border-slate-200 bg-white p-3 text-left transition-colors hover:border-slate-300 hover:bg-slate-50 active:bg-slate-100 disabled:opacity-45 sm:flex-row sm:gap-3"
    >
      <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-xl" style={{ backgroundColor: soft, color }}>
        <Icon className="size-[18px]" strokeWidth={2.4} />
      </span>
      <span className="min-w-0">
        <span className="block text-[15px] leading-snug font-semibold text-slate-900">{label}</span>
        <span className="block text-xs leading-snug text-slate-500">{text}</span>
      </span>
    </button>
  )
}
