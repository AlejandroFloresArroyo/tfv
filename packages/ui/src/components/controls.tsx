"use client"

import { Check, ChevronDown, Minus } from "lucide-react"
import { Checkbox as CheckboxPrimitive, Switch as SwitchPrimitive } from "radix-ui"
import type { ComponentPropsWithoutRef, SelectHTMLAttributes } from "react"
import { forwardRef, useId } from "react"
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
            "h-[var(--control-h)] w-full appearance-none rule-field bg-panel pr-9 pl-3",
            "text-body1 text-content",
            "transition-colors duration-150 ease-[--ease-out-soft]",
            "hover:border-content-muted",
            "aria-invalid:border-[var(--marca-alto)]",
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
export function Checkbox({ label, hint, className, id: given, ...rest }: CheckboxProps) {
  /**
   * El identificador lo genera el componente si no se lo dan.
   *
   * Sin él, el `<label>` se queda sin `htmlFor`: pulsarlo no marca la casilla y el control pierde
   * su nombre accesible. Es un fallo que **no se ve** —la etiqueta se pinta igual— y que sólo
   * aparece al intentar marcarla con teclado o al buscarla por su nombre.
   *
   * Es el mismo argumento que hace de `Field` un componente y no tres: la atadura no se puede
   * dejar a que quien lo use se acuerde.
   */
  const generated = useId()
  const id = given ?? generated

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
  const hintId = hint ? `${id}-hint` : undefined

  const control = (
    <CheckboxPrimitive.Root
      id={id}
      {...(hintId ? { "aria-describedby": hintId } : {})}
      className={cn(
        // Cuadrada y sin radio, como todas las marcas del sistema. El tamaño sube a 20 px porque
        // en tacto una casilla de 18 con guantes se falla, y aquí el tacto es la calibración de
        // partida; el área sensible la da el `<label>`, que ya está atado.
        "grid size-5 shrink-0 place-items-center rule-field bg-panel",
        "transition-colors duration-150 ease-[--ease-out-soft]",
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

export interface SwitchProps
  extends Omit<ComponentPropsWithoutRef<typeof SwitchPrimitive.Root>, "required"> {
  label?: string
  /**
   * El primitivo lo declara `boolean` a secas, y `Field` entrega `boolean | undefined`.
   *
   * Con `exactOptionalPropertyTypes` eso no compila, así que un interruptor dentro de un campo no
   * se podía escribir — y escribirlo fuera es lo que deja la etiqueta sin atar al control.
   */
  required?: boolean | undefined
}

/**
 * Interruptor.
 *
 * Se distingue de la casilla por **cuándo surte efecto**: un interruptor aplica al instante, una
 * casilla espera al envío del formulario. Usar el aspecto equivocado hace que la gente pulse
 * «Guardar» buscando un botón que no existe, o que crea que no guardó cuando ya lo hizo.
 */
export function Switch({ label, className, id: given, required, ...rest }: SwitchProps) {
  // Como en la casilla: sin identificador la etiqueta no queda atada al control, y eso no se ve.
  const generated = useId()
  const id = given ?? generated

  const control = (
    <SwitchPrimitive.Root
      id={id}
      {...(required === undefined ? {} : { required })}
      className={cn(
        // Una vía de dos posiciones, cuadrada. La píldora con disco del sistema anterior era la
        // única forma redonda que quedaba en pantalla, y en este mundo no hay ninguna.
        "relative h-6 w-11 shrink-0 rule-field bg-panel-sunken",
        // El bloque no ocupa media vía exacta: deja un canal visible alrededor. Sin ese canal los
        // dos tonos se leen como dos cuadros pegados y no como una pieza dentro de una guía, que
        // es justo la duda que tiene quien abre la aplicación por primera vez.
        "transition-colors duration-150 ease-[--ease-out-soft]",
        "data-[state=checked]:border-accent data-[state=checked]:bg-accent",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...rest}
    >
      <SwitchPrimitive.Thumb
        className={cn(
          // Un solo eje y sin rebote: el bloque llega a su posición y se queda. Un interruptor que
          // se pasa de tope y vuelve es la firma del software de consumo.
          "absolute inset-y-0.5 left-0.5 block w-[calc(50%-0.125rem)] bg-content",
          "transition-[left] duration-150 ease-[--ease-out-soft]",
          "data-[state=checked]:left-1/2 data-[state=checked]:bg-on-accent",
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
