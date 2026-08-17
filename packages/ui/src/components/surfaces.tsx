import type { HTMLAttributes, ReactNode } from "react"
import { cn } from "../lib/cn.ts"

/** Superficie elevada. Es la unidad de agrupación visual de todo el panel. */
export function Panel({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-md border border-line bg-panel", className)} {...rest} />
}

export function Separator({ className, ...rest }: HTMLAttributes<HTMLHRElement>) {
  return <hr className={cn("border-0 border-t border-line", className)} {...rest} />
}

export type BadgeTone = "neutral" | "accent" | "success" | "warning" | "danger"

const BADGE_TONES: Record<BadgeTone, string> = {
  neutral: "bg-panel-hover text-content-muted",
  accent: "bg-brand/20 text-gold-7 dark:text-gold-3",
  success: "bg-green-1 text-green-9 dark:bg-green-9/30 dark:text-green-2",
  warning: "bg-yellow-1 text-yellow-9 dark:bg-yellow-9/30 dark:text-yellow-2",
  danger: "bg-red-1 text-red-9 dark:bg-red-9/30 dark:text-red-2",
}

export function Badge({
  tone = "neutral",
  className,
  children,
}: {
  tone?: BadgeTone
  className?: string
  children: ReactNode
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-xs px-2 py-0.5 text-body3 font-semibold",
        BADGE_TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  )
}

/**
 * Marcador de contenido que aún no llegó.
 *
 * Con `aria-hidden`: para un lector de pantalla, describir cajas grises no es información. Lo que
 * anuncia la espera es el `role="status"` de quien lo envuelve.
 */
export function Skeleton({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      aria-hidden="true"
      className={cn("animate-pulse rounded-xs bg-panel-hover", className)}
      {...rest}
    />
  )
}

/**
 * Iniciales de una persona o empresa, como sustituto de imagen.
 *
 * Toma las iniciales de hasta dos palabras. No intenta ser listo con nombres compuestos: acierta en
 * el caso común y no estorba en el resto.
 */
export function Avatar({
  name,
  className,
  size = "md",
}: {
  name: string
  className?: string
  size?: "sm" | "md" | "lg"
}) {
  const initials =
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((word) => word[0]?.toUpperCase() ?? "")
      .join("") || "?"

  const sizes = { sm: "size-6 text-body3", md: "size-8 text-body2", lg: "size-12 text-body1" }

  return (
    <span
      aria-hidden="true"
      className={cn(
        "grid shrink-0 place-items-center rounded-full bg-accent font-semibold text-on-accent",
        sizes[size],
        className,
      )}
    >
      {initials}
    </span>
  )
}
