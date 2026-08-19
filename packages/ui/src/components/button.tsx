"use client"

import { Slot } from "radix-ui"
import type { ButtonHTMLAttributes, ReactNode } from "react"
import { forwardRef } from "react"
import { cn } from "../lib/cn.ts"
import { Spinner } from "./spinner.tsx"

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger"
export type ButtonSize = "sm" | "md" | "lg"

const VARIANTS: Record<ButtonVariant, string> = {
  // El primario es el contrario del fondo: así lo definía el tema anterior con
  // `primaryColor: "foreground"`, y es lo que da el aspecto de la aplicación.
  primary: "bg-accent text-on-accent hover:bg-accent-hover",
  // Borde de control, no separador: el secundario es un control y su límite tiene que verse.
  secondary:
    "bg-panel text-content border border-field hover:bg-panel-hover hover:border-content-muted",
  ghost: "bg-transparent text-content-muted hover:bg-panel-hover hover:text-content",
  // Blanco sobre `red.8` da 4.51:1; sobre `red.7`, 3.84 — por debajo del mínimo para texto.
  danger: "bg-red-8 text-white hover:bg-red-9",
}

const SIZES: Record<ButtonSize, string> = {
  sm: "h-8 px-3 gap-1.5 text-body3",
  md: "h-10 px-4 gap-2 text-body2",
  lg: "h-12 px-6 gap-2 text-body1",
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  /**
   * Mientras está en curso, el botón queda inservible y lo anuncia.
   *
   * No es sólo cosmético: es lo que impide el envío doble, que en un formulario de cobro significa
   * cobrar dos veces.
   */
  loading?: boolean
  /** Ocupa todo el ancho disponible. */
  block?: boolean
  /** Renderiza sobre el hijo en lugar de sobre un `<button>`, para enlaces con aspecto de botón. */
  asChild?: boolean
  children?: ReactNode
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = "primary",
    size = "md",
    loading = false,
    block = false,
    asChild = false,
    className,
    disabled,
    children,
    type,
    ...rest
  },
  ref,
) {
  const Component = asChild ? Slot.Root : "button"

  return (
    <Component
      ref={ref}
      // Un `<button>` sin `type` dentro de un formulario lo envía. Es la causa de la mitad de los
      // envíos accidentales, y no hay razón para no fijarlo aquí.
      type={asChild ? undefined : (type ?? "button")}
      disabled={asChild ? undefined : disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        "inline-flex items-center justify-center rounded-sm font-semibold whitespace-nowrap",
        "transition-colors duration-150 ease-[--ease-out-soft]",
        "disabled:pointer-events-none disabled:opacity-50",
        VARIANTS[variant],
        SIZES[size],
        block && "w-full",
        className,
      )}
      {...rest}
    >
      {/*
        Con `asChild` va el hijo **solo**: `Slot` exige exactamente uno, y la ranura del indicador
        de espera —aunque esté vacía— cuenta como un segundo. Con los dos, `Slot` lanza y se lleva
        por delante la página entera; así es como una dirección inexistente respondía `500` en vez
        de `404`.

        No pierde nada: `asChild` existe para los enlaces con aspecto de botón, y un enlace no
        tiene envío en curso que anunciar.
      */}
      {asChild ? (
        children
      ) : (
        <>
          {loading ? <Spinner className="size-4" /> : null}
          {children}
        </>
      )}
    </Component>
  )
})
