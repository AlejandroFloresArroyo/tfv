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
 * El primario es el **oro de marca** relleno, con tinta encima: 13.26:1. Es la primera vez en este
 * sistema que el oro hace trabajo de verdad en lugar de sobrevivir en el logotipo, y es lo que
 * hace que la acción principal se encuentre sin buscarla sobre un lienzo oscuro.
 *
 * Al pasar el ratón cambia el color y **nada más**: ni escala, ni se levanta, ni se desplaza.
 */
const VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-accent text-on-accent hover:bg-accent-hover",
  // El borde de un control tiene que verse: `edge-control` llega a 3:1, el borde vivo no.
  secondary: "border border-edge-control bg-panel text-content hover:bg-panel-hover",
  ghost: "bg-transparent text-content-muted hover:bg-panel-hover hover:text-content",
  // El relleno destructivo va aparte de la temperatura `alto`: una luz se mide contra el lienzo y
  // un relleno contra su propio texto. Son dos preguntas distintas.
  danger: "bg-danger-fill text-on-danger hover:brightness-110",
}

/**
 * Los tamaños salen de las dos calibraciones, no de una altura fija.
 *
 * En tacto `md` mide 44 px, que es el objetivo mínimo que una mano con guante acierta en una nave;
 * en escritorio con ratón baja a 34 y la tabla vuelve a caber. Es la respuesta directa a que el
 * dedo gane en tacto y la densidad en escritorio.
 */
const SIZES: Record<ButtonSize, string> = {
  sm: "h-[var(--control-h-sm)] px-3 gap-1.5 rounded-md text-body3",
  md: "h-[var(--control-h)] px-4 gap-2 rounded-lg text-button",
  lg: "h-[var(--control-h-lg)] px-6 gap-2 rounded-lg text-body1",
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
        // Sólo color. Nada de transformaciones: es la regla del mundo y también lo correcto en una
        // rejilla densa, donde un control que se levanta descoloca todo lo que tiene al lado.
        "transition-colors duration-200 ease-[--ease-out-soft]",
        // Deshabilitado sale del color de la variante y cae a neutro. Un primario en oro al 55%
        // se lee como un oro enfermo, no como un botón apagado, y eso enseña a dudar del color de
        // marca en el resto de la pantalla.
        "disabled:pointer-events-none disabled:border disabled:border-edge",
        "disabled:bg-panel-sunken disabled:text-content-faint disabled:shadow-none",
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
