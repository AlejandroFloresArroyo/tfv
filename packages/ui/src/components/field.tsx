"use client"

import type { InputHTMLAttributes, ReactNode } from "react"
import { forwardRef, useId } from "react"
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
