import { cn } from "../lib/cn.ts"

export interface SpinnerProps {
  className?: string
  /** Texto para lectores de pantalla. Sin él, un indicador de espera es invisible. */
  label?: string
}

export function Spinner({ className, label }: SpinnerProps) {
  return (
    <span
      role="status"
      aria-live="polite"
      className={cn("inline-block size-4 shrink-0", className)}
    >
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className="size-full animate-spin">
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.5" opacity="0.25" />
        <path
          d="M21 12a9 9 0 0 0-9-9"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
        />
      </svg>
      {label ? <span className="sr-only">{label}</span> : null}
    </span>
  )
}
