import { forwardRef, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '../../lib/cn'

export const inputBase =
  'w-full rounded-xl border bg-white px-3.5 text-[15px] text-slate-900 outline-none transition placeholder:text-slate-400 ' +
  'focus:border-brand-500 focus:ring-4 focus:ring-brand-100 disabled:bg-slate-50 disabled:text-slate-500'

export function Field({
  label,
  htmlFor,
  hint,
  error,
  optional,
  children,
  className,
}: {
  label: ReactNode
  htmlFor?: string
  hint?: ReactNode
  error?: string | null
  optional?: boolean
  children: ReactNode
  className?: string
}) {
  return (
    <div className={className}>
      <label htmlFor={htmlFor} className="mb-1.5 flex items-baseline justify-between gap-2 text-sm font-medium text-slate-700">
        <span>{label}</span>
        {optional && <span className="text-xs font-normal text-slate-400">Opcional</span>}
      </label>
      {children}
      {error ? (
        <p className="mt-1.5 text-[13px] font-medium text-rose-600">{error}</p>
      ) : hint ? (
        <div className="mt-1.5 text-[13px] text-slate-500">{hint}</div>
      ) : null}
    </div>
  )
}

export const TextInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }>(
  function TextInput({ className, invalid, ...rest }, ref) {
    return (
      <input
        ref={ref}
        className={cn(inputBase, 'h-11', invalid ? 'border-rose-400' : 'border-slate-300', className)}
        {...rest}
      />
    )
  },
)

export function SelectInput({
  className,
  invalid,
  children,
  ...rest
}: SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean }) {
  return (
    <div className="relative">
      <select
        className={cn(inputBase, 'h-11 cursor-pointer appearance-none pr-10', invalid ? 'border-rose-400' : 'border-slate-300', className)}
        {...rest}
      >
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-slate-400" />
    </div>
  )
}

export function TextArea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(inputBase, 'min-h-20 border-slate-300 py-2.5', className)} {...rest} />
}

/** Campo numérico con sufijo (€ o %). Acepta coma o punto decimal. */
export const NumberInput = forwardRef<
  HTMLInputElement,
  Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> & { suffix?: string; invalid?: boolean; big?: boolean }
>(function NumberInput({ suffix, invalid, big, className, ...rest }, ref) {
  return (
    <div className="relative">
      <input
        ref={ref}
        inputMode="decimal"
        autoComplete="off"
        className={cn(
          inputBase,
          big ? 'h-14 text-2xl font-semibold tracking-tight' : 'h-11',
          suffix && (big ? 'pr-12' : 'pr-10'),
          'tabular-nums',
          invalid ? 'border-rose-400' : 'border-slate-300',
          className,
        )}
        {...rest}
      />
      {suffix && (
        <span
          className={cn(
            'pointer-events-none absolute top-1/2 -translate-y-1/2 font-semibold text-slate-400',
            big ? 'right-4 text-xl' : 'right-3.5 text-[15px]',
          )}
        >
          {suffix}
        </span>
      )}
    </div>
  )
})
