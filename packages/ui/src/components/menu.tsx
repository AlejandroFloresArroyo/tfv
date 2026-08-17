"use client"

import { Check } from "lucide-react"
import { DropdownMenu } from "radix-ui"
import type { ComponentPropsWithoutRef, ReactNode } from "react"
import { cn } from "../lib/cn.ts"

/**
 * Menú desplegable.
 *
 * Envuelve el primitivo de Radix en lugar de construirlo a mano. El comportamiento correcto de un
 * menú —recorrido con flechas, salto por letra inicial, cierre con `Escape`, devolución del foco al
 * disparador, colocación que no se sale de la ventana— son varios cientos de líneas de casos
 * límite, y hacerlo mal sólo se nota cuando alguien navega con teclado.
 *
 * Lo que se define aquí es únicamente el aspecto.
 */

export const Menu = DropdownMenu.Root
export const MenuTrigger = DropdownMenu.Trigger

export function MenuContent({
  className,
  align = "end",
  sideOffset = 6,
  children,
  ...rest
}: ComponentPropsWithoutRef<typeof DropdownMenu.Content>) {
  return (
    <DropdownMenu.Portal>
      <DropdownMenu.Content
        align={align}
        sideOffset={sideOffset}
        className={cn(
          "z-(--z-dialog) min-w-56 overflow-hidden rounded-sm border border-line bg-panel p-1",
          "shadow-lg shadow-black/10 dark:shadow-black/40",
          "data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95",
          className,
        )}
        {...rest}
      >
        {children}
      </DropdownMenu.Content>
    </DropdownMenu.Portal>
  )
}

export function MenuLabel({ children }: { children: ReactNode }) {
  return (
    <DropdownMenu.Label className="px-2.5 py-1.5 text-body3 font-semibold tracking-wide text-content-faint uppercase">
      {children}
    </DropdownMenu.Label>
  )
}

export function MenuSeparator() {
  return <DropdownMenu.Separator className="my-1 h-px bg-line" />
}

export function MenuItem({
  className,
  children,
  icon,
  ...rest
}: ComponentPropsWithoutRef<typeof DropdownMenu.Item> & { icon?: ReactNode }) {
  return (
    <DropdownMenu.Item
      className={cn(
        "flex cursor-pointer items-center gap-2.5 rounded-xs px-2.5 py-2 text-body2 text-content",
        "outline-hidden select-none",
        "data-highlighted:bg-panel-hover",
        "data-disabled:pointer-events-none data-disabled:opacity-50",
        className,
      )}
      {...rest}
    >
      {icon ? <span className="text-content-faint">{icon}</span> : null}
      <span className="min-w-0 flex-1 truncate">{children}</span>
    </DropdownMenu.Item>
  )
}

/** Opción de un grupo donde una está elegida: idioma, tema, empresa activa. */
export function MenuRadioItem({
  className,
  children,
  ...rest
}: ComponentPropsWithoutRef<typeof DropdownMenu.RadioItem>) {
  return (
    <DropdownMenu.RadioItem
      className={cn(
        "flex cursor-pointer items-center gap-2.5 rounded-xs px-2.5 py-2 text-body2 text-content",
        "outline-hidden select-none",
        "data-highlighted:bg-panel-hover",
        className,
      )}
      {...rest}
    >
      <span className="grid size-4 shrink-0 place-items-center">
        <DropdownMenu.ItemIndicator>
          <Check className="size-4" aria-hidden="true" />
        </DropdownMenu.ItemIndicator>
      </span>
      <span className="min-w-0 flex-1 truncate">{children}</span>
    </DropdownMenu.RadioItem>
  )
}

export const MenuRadioGroup = DropdownMenu.RadioGroup
