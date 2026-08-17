import { cn } from "@tfv/ui"

/**
 * Marca.
 *
 * El oro es el del logotipo (`--color-brand`), no el de la rampa `gold`: son dos tonos distintos y
 * el tema anterior ya los mantenía separados a propósito.
 */
export function Logo({ className, showName = true }: { className?: string; showName?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <svg viewBox="0 0 24 24" className="size-6 shrink-0" fill="none" role="img" aria-label="TFV">
        {/* Carrete: la perforación de la película, que es de donde sale la identidad. */}
        <rect x="2" y="4" width="20" height="16" rx="3" className="fill-brand" />
        <rect x="5" y="7.5" width="3" height="3" rx="0.75" className="fill-ink-6" />
        <rect x="5" y="13.5" width="3" height="3" rx="0.75" className="fill-ink-6" />
        <rect x="16" y="7.5" width="3" height="3" rx="0.75" className="fill-ink-6" />
        <rect x="16" y="13.5" width="3" height="3" rx="0.75" className="fill-ink-6" />
        <rect x="10" y="7.5" width="4" height="9" rx="1" className="fill-ink-6" />
      </svg>
      {showName ? (
        <span className="text-title1 font-bold tracking-tight text-content">TFV</span>
      ) : null}
    </span>
  )
}
