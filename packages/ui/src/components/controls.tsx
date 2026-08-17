"use client"

import { Check, ChevronDown, Minus } from "lucide-react"
import { Checkbox as CheckboxPrimitive, Switch as SwitchPrimitive } from "radix-ui"
import type { ComponentPropsWithoutRef, SelectHTMLAttributes } from "react"
import { forwardRef } from "react"
import { cn } from "../lib/cn.ts"

/**
 * Selección.
 *
 * Es el `<select>` del navegador, no una lista construida a mano. En un teléfono eso significa la
 * rueda nativa del sistema, que es la que la gente sabe usar; y con teclado ya trae el salto por
 * letra inicial y el recorrido con flechas sin que nadie lo escriba.
 *
 * Un desplegable propio hace falta cuando las opciones llevan iconos, descripciones o búsqueda.
 * Ninguna de las de aquí las lleva.
 */
export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  function Select({ className, children, ...rest }, ref) {
    return (
      <div className="relative">
        <select
          ref={ref}
          className={cn(
            "h-10 w-full appearance-none rounded-sm border border-field bg-panel pr-9 pl-3",
            "text-body1 text-content",
            "transition-colors duration-150",
            "hover:border-content-muted",
            "aria-invalid:border-danger",
            "disabled:cursor-not-allowed disabled:opacity-60",
            className,
          )}
          {...rest}
        >
          {children}
        </select>

        <ChevronDown
          className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-content-faint"
          aria-hidden="true"
        />
      </div>
    )
  },
)

// ─── Casilla ─────────────────────────────────────────────────────────────────

export interface CheckboxProps
  extends Omit<ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root>, "children"> {
  label?: string
  /** Texto secundario bajo la etiqueta. */
  hint?: string
}

/**
 * Casilla, con estado intermedio.
 *
 * El intermedio no es adorno: es lo que necesita una casilla que gobierna un grupo parcialmente
 * marcado —«todos los permisos de almacenes»— y sin él sólo quedan dos estados para representar
 * tres situaciones.
 */
export function Checkbox({ label, hint, className, id, ...rest }: CheckboxProps) {
  /**
   * La ayuda va como **descripción**, no dentro de la etiqueta.
   *
   * Si vive en el `<label>`, pasa a formar parte del nombre accesible del control: la casilla que
   * gobierna un grupo se llamaría «companies.users 0 de 8» y **su nombre cambiaría al marcarla**.
   * Un lector de pantalla anunciaría un nombre distinto para el mismo control cada vez que se
   * vuelve a él, y ninguna herramienta podría localizarlo por su nombre.
   *
   * El nombre es la identidad; el recuento es estado, y el estado se describe aparte.
   */
  const hintId = hint && id ? `${id}-hint` : undefined

  const control = (
    <CheckboxPrimitive.Root
      id={id}
      {...(hintId ? { "aria-describedby": hintId } : {})}
      className={cn(
        "grid size-4.5 shrink-0 place-items-center rounded-xs border border-field bg-panel",
        "transition-colors duration-150",
        "hover:border-content-muted",
        "data-[state=checked]:border-accent data-[state=checked]:bg-accent",
        "data-[state=indeterminate]:border-accent data-[state=indeterminate]:bg-accent",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...rest}
    >
      <CheckboxPrimitive.Indicator className="text-on-accent">
        {rest.checked === "indeterminate" ? (
          <Minus className="size-3" strokeWidth={3} aria-hidden="true" />
        ) : (
          <Check className="size-3" strokeWidth={3} aria-hidden="true" />
        )}
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  )

  if (!label) return control

  return (
    <div className="flex items-start gap-2.5">
      <span className="mt-0.5">{control}</span>
      <div className="min-w-0">
        <label
          htmlFor={id}
          className="block cursor-pointer text-body2 font-medium text-content select-none"
        >
          {label}
        </label>
        {hint ? (
          <span id={hintId} className="block text-body3 text-content-faint">
            {hint}
          </span>
        ) : null}
      </div>
    </div>
  )
}

// ─── Interruptor ─────────────────────────────────────────────────────────────

export interface SwitchProps extends ComponentPropsWithoutRef<typeof SwitchPrimitive.Root> {
  label?: string
}

/**
 * Interruptor.
 *
 * Se distingue de la casilla por **cuándo surte efecto**: un interruptor aplica al instante, una
 * casilla espera al envío del formulario. Usar el aspecto equivocado hace que la gente pulse
 * «Guardar» buscando un botón que no existe, o que crea que no guardó cuando ya lo hizo.
 */
export function Switch({ label, className, id, ...rest }: SwitchProps) {
  const control = (
    <SwitchPrimitive.Root
      id={id}
      className={cn(
        "relative h-5.5 w-9.5 shrink-0 rounded-xl border border-transparent bg-line-strong",
        "transition-colors duration-150",
        "data-[state=checked]:bg-accent",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...rest}
    >
      <SwitchPrimitive.Thumb
        className={cn(
          "block size-4.5 rounded-full bg-panel shadow-sm",
          "translate-x-0.5 transition-transform duration-150 ease-[--ease-out-soft]",
          "data-[state=checked]:translate-x-4.5",
        )}
      />
    </SwitchPrimitive.Root>
  )

  if (!label) return control

  return (
    <div className="flex items-center gap-2.5">
      {control}
      <label
        htmlFor={id}
        className="cursor-pointer text-body2 font-medium text-content select-none"
      >
        {label}
      </label>
    </div>
  )
}
