"use client"

import { X } from "lucide-react"
import { Dialog as Primitive } from "radix-ui"
import type { ComponentPropsWithoutRef, ReactNode } from "react"
import { cn } from "../lib/cn.ts"

/**
 * Cajón lateral: un diálogo anclado al borde izquierdo.
 *
 * Envuelve el primitivo de Radix por las mismas razones que el diálogo: la trampa de foco, el
 * cierre con `Escape`, el foco devuelto al disparador y la página inerte detrás no se improvisan,
 * y hacerlos mal no se ve.
 *
 * El deslizamiento de entrada es **cambio de estado explícito**, no hover: la regla del mundo —al
 * pasar el ratón sólo cambia el color— queda intacta. Con movimiento reducido, la regla global lo
 * colapsa a un fotograma.
 */

export const Drawer = Primitive.Root
export const DrawerTrigger = Primitive.Trigger

export interface DrawerContentProps extends ComponentPropsWithoutRef<typeof Primitive.Content> {
  /** Nombre accesible del cajón. Sin él, un lector de pantalla anuncia «diálogo» y nada más. */
  label: string
  /** Etiqueta del botón de cierre. Obligatoria: el sistema de diseño no habla ningún idioma. */
  closeLabel: string
  /** La identidad de arriba: quién es este cajón. */
  header?: ReactNode | undefined
}

export function DrawerContent({
  label,
  closeLabel,
  header,
  className,
  children,
  ...rest
}: DrawerContentProps) {
  return (
    <Primitive.Portal>
      <Primitive.Overlay className="fixed inset-0 z-(--z-overlay) bg-overlay" />

      <Primitive.Content
        aria-label={label}
        className={cn(
          "fixed inset-y-0 left-0 z-(--z-dialog) flex w-[19rem] max-w-[85vw] flex-col",
          "border-edge border-r bg-panel-raised",
          "shadow-[0_24px_64px_-16px_rgb(0_0_0/0.4)] dark:shadow-[0_24px_64px_-16px_rgb(0_0_0/0.8)]",
          "data-[state=open]:enter-slide-left",
          className,
        )}
        {...rest}
      >
        {/* El canto de luz de las tarjetas, en el filo por el que entra el cajón. */}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 right-0 w-px bg-gradient-to-b from-transparent via-edge-control to-transparent"
        />

        <div className="flex items-start justify-between gap-2 border-edge border-b p-4">
          <div className="min-w-0 flex-1">{header}</div>
          <Primitive.Close
            aria-label={closeLabel}
            className="grid size-9 shrink-0 place-items-center rounded-lg text-content-faint transition-colors hover:bg-panel-hover hover:text-content"
          >
            <X className="size-4" aria-hidden="true" />
          </Primitive.Close>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-3">{children}</div>
      </Primitive.Content>
    </Primitive.Portal>
  )
}
