"use client"

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
          "z-(--z-dialog) min-w-56 overflow-hidden rounded-xl border border-edge bg-panel-raised p-1",
          "shadow-[0_12px_32px_-8px_rgb(0_0_0/0.28)] dark:shadow-[0_12px_32px_-8px_rgb(0_0_0/0.7)]",
          "data-[state=open]:enter-fade",
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
    <DropdownMenu.Label className="px-3 pt-2.5 pb-1.5 legend text-content-faint">
      {children}
    </DropdownMenu.Label>
  )
}

export function MenuSeparator() {
  return <DropdownMenu.Separator className="border-edge border-t" />
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
        "flex cursor-pointer items-center gap-2.5 rounded-lg px-3 text-body2 text-content",
        "h-[var(--control-h)] outline-hidden select-none",
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
        "flex cursor-pointer items-center gap-2.5 rounded-lg px-3 text-body2 text-content",
        "h-[var(--control-h)] outline-hidden select-none",
        "data-highlighted:bg-panel-hover",
        className,
      )}
      {...rest}
    >
      {/* La opción elegida lleva el punto del oro de marca, que es la misma señal que dice
          «activo» en el resto del sistema. Repetir una sola señal es lo que la hace legible sin
          que nadie tenga que aprenderse una leyenda. */}
      <span className="relative grid size-4 shrink-0 place-items-center">
        <span className="size-1.5 rounded-full bg-edge-control" aria-hidden="true" />
        <DropdownMenu.ItemIndicator className="absolute inset-0 grid place-items-center">
          <span className="size-2 rounded-full bg-accent" aria-hidden="true" />
        </DropdownMenu.ItemIndicator>
      </span>
      <span className="min-w-0 flex-1 truncate">{children}</span>
    </DropdownMenu.RadioItem>
  )
}

export const MenuRadioGroup = DropdownMenu.RadioGroup
