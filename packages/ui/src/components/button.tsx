"use client"

import { Slot } from "radix-ui"
import type { ButtonHTMLAttributes, ReactNode } from "react"
import { forwardRef } from "react"
import { cn } from "../lib/cn.ts"
import { Spinner } from "./spinner.tsx"

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger"
export type ButtonSize = "sm" | "md" | "lg"

/**
 * Botón.
 *
 * Sin esquina redondeada y sin relleno tintado en los secundarios: el límite de un control se
 * afirma con filete, igual que en el resto del sistema.
 *
 * El primario es la inversión de la tinta —negro sobre claro, claro sobre negro— y se conserva del
 * sistema anterior porque es correcto: es la señal más fuerte disponible sin gastar un color que
 * la escalera semántica necesita para significar algo.
 */
const VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-accent text-on-accent hover:bg-accent-hover",
  // El borde de un control tiene que verse: `rule-field` es un píxel de CSS completo, no un filete
  // de medio píxel. Ver la nota del motor de rayado en `tokens.css`.
  secondary: "rule-field bg-panel text-content hover:bg-panel-hover",
  ghost: "bg-transparent text-content-muted hover:bg-panel-hover hover:text-content",
  // La destructiva usa el relleno destructivo, no la marca `alto`: una marca se mide contra el
  // lienzo y un relleno contra su propio texto. Blanco sobre la marca en tema oscuro da 3.01:1.
  danger: "bg-danger-fill text-on-danger hover:brightness-90",
}

/**
 * Los tamaños salen de las dos calibraciones, no de una altura fija.
 *
 * En tacto `md` mide 44 px, que es el objetivo mínimo que una mano con guante acierta en una nave;
 * en escritorio con ratón baja a 34 y la tabla vuelve a caber. Es la respuesta directa a que el
 * dedo gane en tacto y la densidad en escritorio.
 */
const SIZES: Record<ButtonSize, string> = {
  sm: "h-[var(--control-h-sm)] px-2.5 gap-1.5 text-body3",
  md: "h-[var(--control-h)] px-4 gap-2 text-button",
  lg: "h-[var(--control-h-lg)] px-6 gap-2 text-body1",
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
        "inline-flex items-center justify-center font-semibold whitespace-nowrap",
        // Un solo eje, amortiguado y sin rebote. El rebote es la firma del software de consumo.
        "transition-colors duration-150 ease-[--ease-out-soft]",
        "disabled:pointer-events-none disabled:opacity-55",
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
