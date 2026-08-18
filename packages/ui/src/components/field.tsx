"use client"

import type { InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from "react"
import { forwardRef, useId } from "react"
import { type DecimalSeparator, sanitizeAmount } from "../lib/amount-input.ts"
import { cn } from "../lib/cn.ts"

/**
 * Campo de formulario: etiqueta, control, ayuda y error, atados entre sí.
 *
 * La atadura es el motivo de que esto sea un componente y no tres. Un `<label>` sin `htmlFor`, o un
 * error que el control no referencia con `aria-describedby`, deja a quien usa lector de pantalla
 * oyendo «cuadro de edición» sin saber cuál ni qué falló. Aquí no se puede olvidar porque los
 * identificadores los genera el componente.
 */

export interface FieldProps {
  label: string
  /** Texto de ayuda permanente, bajo el control. */
  hint?: string | undefined
  /** Mensaje de error. Su presencia marca el control como inválido. */
  error?: string | undefined
  required?: boolean | undefined
  className?: string | undefined
  children: (ids: FieldIds) => ReactNode
}

export interface FieldIds {
  id: string
  "aria-describedby": string | undefined
  "aria-invalid": boolean | undefined
  required: boolean | undefined
}

export function Field({ label, hint, error, required, className, children }: FieldProps) {
  const id = useId()
  const hintId = `${id}-hint`
  const errorId = `${id}-error`

  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(" ")

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={id} className="text-body2 font-semibold text-content">
        {label}
        {required ? (
          <span className="ml-1 text-danger" aria-hidden="true">
            *
          </span>
        ) : null}
      </label>

      {children({
        id,
        "aria-describedby": describedBy || undefined,
        "aria-invalid": error ? true : undefined,
        required: required || undefined,
      })}

      {hint ? (
        <p id={hintId} className="text-body3 text-content-faint">
          {hint}
        </p>
      ) : null}

      {/* `role="alert"` para que el error se anuncie al aparecer, no sólo al recorrer el formulario. */}
      {error ? (
        <p id={errorId} role="alert" className="text-body3 font-medium text-danger">
          {error}
        </p>
      ) : null}
    </div>
  )
}

// ─── Control de texto ────────────────────────────────────────────────────────

export type InputProps = InputHTMLAttributes<HTMLInputElement>

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, ...rest },
  ref,
) {
  return (
    <input
      ref={ref}
      className={cn(
        // `border-field`, no `border-line`: el borde de un control tiene que llegar a 3:1 porque es
        // lo que indica dónde se puede escribir. Ver la nota de contraste en `tokens.css`.
        "h-10 w-full rounded-sm border border-field bg-panel px-3",
        "text-body1 text-content placeholder:text-content-faint",
        "transition-colors duration-150",
        "hover:border-content-muted",
        "aria-invalid:border-danger",
        "disabled:cursor-not-allowed disabled:opacity-60",
        className,
      )}
      {...rest}
    />
  )
})

// ─── Texto largo ─────────────────────────────────────────────────────────────

export type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement>

/**
 * El mismo control, más alto y redimensionable en vertical.
 *
 * `resize-y` y no `resize`: en horizontal el usuario puede sacarlo de su columna y romper la
 * composición de la página, y no gana nada — el texto ya usa todo el ancho disponible.
 */
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { className, rows = 4, ...rest },
  ref,
) {
  return (
    <textarea
      ref={ref}
      rows={rows}
      className={cn(
        "w-full resize-y rounded-sm border border-field bg-panel px-3 py-2",
        "text-body1 text-content placeholder:text-content-faint",
        "transition-colors duration-150",
        "hover:border-content-muted",
        "aria-invalid:border-danger",
        "disabled:cursor-not-allowed disabled:opacity-60",
        className,
      )}
      {...rest}
    />
  )
})

// ─── Importes ────────────────────────────────────────────────────────────────

export interface AmountInputProps
  extends Omit<InputProps, "value" | "onChange" | "type" | "inputMode"> {
  /** Cadena decimal. **Nunca un número**: ver la nota de `lib/amount-input.ts`. */
  value: string
  onValueChange: (value: string) => void
  /** Para diferencias de precio, que pueden restar. */
  negative?: boolean | undefined
  /**
   * Cuál de los dos signos separa los decimales en el idioma en que se está sirviendo la página.
   *
   * Sin él se supone el punto. Importa más de lo que parece: con el supuesto equivocado, teclear
   * un importe agrupado sale con tres órdenes de magnitud de menos y sin aviso.
   */
  decimal?: DecimalSeparator | undefined
  /** Moneda o unidad, a la izquierda del control. */
  prefix?: string | undefined
}

/**
 * Campo de importe.
 *
 * `type="text"` y no `type="number"`: el numérico del navegador redondea, acepta notación
 * exponencial, cambia de valor con la rueda del ratón sin querer y devuelve un `number`, que es
 * justo lo que este sistema no puede tocar. `inputMode="decimal"` da el teclado numérico en el
 * teléfono, que es lo único que se quería del otro.
 */
export const AmountInput = forwardRef<HTMLInputElement, AmountInputProps>(function AmountInput(
  { value, onValueChange, negative, decimal, prefix, className, ...rest },
  ref,
) {
  const control = (
    <Input
      ref={ref}
      type="text"
      inputMode="decimal"
      autoComplete="off"
      value={value}
      onChange={(event) => onValueChange(sanitizeAmount(event.target.value, { negative, decimal }))}
      className={cn("text-right tabular-nums", prefix ? "rounded-l-none" : "", className)}
      {...rest}
    />
  )

  if (prefix === undefined) return control

  return (
    <div className="flex">
      <span
        className="inline-flex h-10 items-center rounded-l-sm border border-r-0 border-field bg-panel-sunken px-3 text-body2 text-content-muted"
        aria-hidden="true"
      >
        {prefix}
      </span>
      {control}
    </div>
  )
})
