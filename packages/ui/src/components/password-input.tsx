"use client"

import { Eye, EyeOff } from "lucide-react"
import { forwardRef, useState } from "react"
import { cn } from "../lib/cn.ts"
import { Input, type InputProps } from "./field.tsx"

export interface PasswordInputProps extends Omit<InputProps, "type"> {
  /** Etiqueta del botón cuando la contraseña está oculta. */
  showLabel: string
  /** Etiqueta del botón cuando está visible. */
  hideLabel: string
}

/**
 * Contraseña con conmutador de visibilidad.
 *
 * Poder verla no es un capricho: teclear a ciegas una contraseña larga en un teléfono es la razón
 * principal por la que la gente elige contraseñas cortas.
 */
export const PasswordInput = forwardRef<HTMLInputElement, PasswordInputProps>(
  function PasswordInput({ className, showLabel, hideLabel, ...rest }, ref) {
    const [visible, setVisible] = useState(false)
    const Icon = visible ? EyeOff : Eye

    return (
      <div className="relative">
        <Input
          ref={ref}
          type={visible ? "text" : "password"}
          className={cn("pr-11", className)}
          {...rest}
        />
        <button
          type="button"
          onClick={() => setVisible((current) => !current)}
          aria-label={visible ? hideLabel : showLabel}
          aria-pressed={visible}
          className={cn(
            "absolute inset-y-0 right-0 grid w-11 place-items-center rounded-r-sm",
            "text-content-faint transition-colors hover:text-content",
          )}
        >
          <Icon className="size-4" aria-hidden="true" />
        </button>
      </div>
    )
  },
)
